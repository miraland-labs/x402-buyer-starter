import asyncio
import json
import base64
import httpx
from solders.keypair import Keypair
from solders.transaction import VersionedTransaction
from solders.message import to_bytes_versioned

from pr402_defaults import (
    canonical_accepted_for_build,
    facilitator_base_url,
    is_exact_rail_scheme,
)


class X402Client:
    """Buyer-side x402 v2 client for pr402 `exact` rail (build → sign → PAYMENT-SIGNATURE)."""

    def __init__(self, _rpc_url: str, keypair_path: str, default_facilitator_base_url: str):
        self.default_facilitator = default_facilitator_base_url.rstrip("/")
        with open(keypair_path, "r") as f:
            secret = bytes(json.load(f))
            self.payer = Keypair.from_bytes(secret)

    async def buy(self, url: str, body: dict | None = None, method: str = "POST") -> dict:
        print(f"\033[36m[X402] Attempting to access: {url}\033[0m")
        req_method = (method or "POST").upper()

        async with httpx.AsyncClient(timeout=30.0) as client:
            if req_method == "GET":
                if body and len(body.keys()) > 0:
                    res = await client.get(url, params=body)
                else:
                    res = await client.get(url)
            else:
                res = await client.post(url, json=body or {})

            if res.status_code == 200:
                return res.json()

            if res.status_code != 402:
                raise Exception(f"Expected 402, got {res.status_code}: {res.text}")

            print("\033[33m[X402] Received 402 Challenge. Settling payment...\033[0m")
            raw_hdr = res.headers.get("Payment-Required")
            if not raw_hdr:
                raise Exception("Missing 'Payment-Required' header in 402 response.")

            requirements = json.loads(base64.b64decode(raw_hdr))

            accepted = next(
                (
                    a
                    for a in requirements.get("accepts", [])
                    if is_exact_rail_scheme(a.get("scheme"))
                ),
                None,
            )
            if not accepted:
                raise Exception("No supported exact rail in accepts[].")

            extra = accepted.get("extra") or {}
            cap_url = extra.get("capabilitiesUrl") if isinstance(extra, dict) else None
            facilitator_url = facilitator_base_url(
                str(cap_url) if cap_url else None,
                self.default_facilitator,
            )
            build_accepted = canonical_accepted_for_build(accepted)

            build_req = {
                "payer": str(self.payer.pubkey()),
                "accepted": build_accepted,
                "resource": requirements.get("resource"),
            }

            print("\033[33m[X402] Signing transaction locally...\033[0m")
            build_res = await client.post(
                f"{facilitator_url}/api/v1/facilitator/build-exact-payment-tx",
                json=build_req,
            )
            if build_res.status_code != 200:
                raise Exception(f"Facilitator build failed: {build_res.text}")

            build_data = build_res.json()

            tx_bytes = base64.b64decode(build_data["transaction"])
            vtx = VersionedTransaction.from_bytes(tx_bytes)

            required = vtx.message.header.num_required_signatures
            payer_index = None
            for i, key in enumerate(vtx.message.account_keys[:required]):
                if str(key) == str(self.payer.pubkey()):
                    payer_index = i
                    break
            if payer_index is None:
                raise Exception("payer pubkey not found among required signer slots")

            message_bytes = to_bytes_versioned(vtx.message)
            payer_sig = self.payer.sign_message(message_bytes)
            signatures = list(vtx.signatures)
            signatures[payer_index] = payer_sig
            vtx = VersionedTransaction.populate(vtx.message, signatures)

            signed_tx_b64 = base64.b64encode(bytes(vtx)).decode("utf-8")
            verify_body = build_data["verifyBodyTemplate"]
            verify_body["paymentPayload"]["payload"]["transaction"] = signed_tx_b64

            final_proof = json.dumps(verify_body)

            print("\033[33m[X402] Final submission with payment proof (Raw JSON)...\033[0m")
            if req_method == "GET":
                if body and len(body.keys()) > 0:
                    final_res = await client.get(
                        url, params=body, headers={"PAYMENT-SIGNATURE": final_proof}
                    )
                else:
                    final_res = await client.get(url, headers={"PAYMENT-SIGNATURE": final_proof})
            else:
                final_res = await client.post(
                    url, json=body or {}, headers={"PAYMENT-SIGNATURE": final_proof}
                )

            if final_res.status_code != 200:
                raise Exception(f"Final submission failed: {final_res.text}")

            return final_res.json()
