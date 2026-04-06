import asyncio
import json
import base64
import httpx
from solders.keypair import Keypair
from solders.transaction import VersionedTransaction
from base58 import b58encode, b58decode
import os

class X402Client:
    """
    X402 Python Client: High-fidelity, async settlement for AI agents.
    """
    def __init__(self, rpc_url: str, keypair_path: str, default_facilitator: str):
        self.rpc_url = rpc_url
        self.default_facilitator = default_facilitator
        with open(keypair_path, 'r') as f:
            secret = bytes(json.load(f))
            self.payer = Keypair.from_bytes(secret)

    async def buy(self, url: str, body: dict = None) -> dict:
        print(f"\033[36m[X402] Attempting to access: {url}\033[0m")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            # 1. Initial Attempt
            res = await client.post(url, json=body or {})
            
            if res.status_code == 200:
                return res.json()
                
            if res.status_code != 402:
                raise Exception(f"Expected 402, got {res.status_code}: {res.text}")

            # 2. Handle 402 Payment Required
            print("\033[33m[X402] Received 402 Challenge. Settling payment...\033[0m")
            raw_hdr = res.headers.get('Payment-Required')
            if not raw_hdr:
                raise Exception("Missing 'Payment-Required' header in 402 response.")

            # Decode Base64 JSON requirements
            requirements = json.loads(base64.b64decode(raw_hdr))
            
            # Find matching 'exact' scheme
            accepted = next((a for a in requirements.get('accepts', []) 
                           if a.get('scheme') in ['exact', 'v2:solana:exact']), None)
            
            if not accepted:
                raise Exception("No supported 'exact' payment schemes found.")

            # 3. Negotiate with Facilitator
            facilitator_url = accepted.get('extra', {}).get('capabilitiesUrl', self.default_facilitator)
            facilitator_url = facilitator_url.replace('/api/v1/facilitator/capabilities', '')

            build_req = {
                "payer": str(self.payer.pubkey()),
                "accepted": accepted,
                "resource": requirements.get('resource')
            }

            build_res = await client.post(f"{facilitator_url}/api/v1/facilitator/build-exact-payment-tx", json=build_req)
            if build_res.status_code != 200:
                raise Exception(f"Facilitator build failed: {build_res.text}")
            
            build_data = build_res.json()

            # 4. Cryptographic Local Signing (using solders)
            print("\033[33m[X402] Signing transaction locally...\033[0m")
            tx_bytes = base64.b64decode(build_data['transaction'])
            vtx = VersionedTransaction.from_bytes(tx_bytes)
            
            # Sign the versioned transaction
            vtx = VersionedTransaction(vtx.message, [self.payer]) # Simple re-composition with signature

            # 5. Repackage and Finalize
            signed_tx_b64 = base64.b64encode(bytes(vtx)).decode('utf-8')
            verify_body = build_data['verifyBodyTemplate']
            verify_body['paymentPayload']['payload']['transaction'] = signed_tx_b64

            # RESOLVED: "Double Base64 Paradox"
            # We use raw JSON string here. X402 servers (pr402-client) support both raw JSON 
            # and Base64-encoded JSON. Raw JSON is ~33% smaller and easier for agents to debug.
            final_proof = json.dumps(verify_body)

            # 6. Authorized Retry
            print("\033[33m[X402] Final submission with payment proof (Raw JSON)...\033[0m")
            final_res = await client.post(url, json=body or {}, headers={"X-PAYMENT": final_proof})
            
            if final_res.status_code != 200:
                raise Exception(f"Final submission failed: {final_res.text}")
                
            return final_res.json()
