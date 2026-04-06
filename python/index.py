import asyncio
import os
from x402_client import X402Client
from dotenv import load_dotenv

load_dotenv()

async def main():
    rpc_url = os.getenv("SOLANA_RPC_URL", "https://api.devnet.solana.com")
    facilitator_url = "https://preview.agent.pay402.me"
    keypair_path = "../demo-wallets/buyer-keypair.json"

    client = X402Client(rpc_url, keypair_path, facilitator_url)

    print("\033[32m=== X402 BUYER STARTER: PYTHON AGENT ACQUISITION ===\033[0m\n")

    # --- Example 1: Buying a Fortune ---
    try:
        print("\033[36m>>> DEMO 1: AETHERVANE DIVINATION <<<\033[0m")
        fortune = await client.buy(
            "https://preview.aethervane.signer-payer.me/api/v1/fortune",
            {"query_type": "liuyao", "value": "8,7,9,7,8,6"}
        )
        print("\033[32m[RESULT] Divination Successful!\033[0m")
        print(f"Luck Level: {fortune['luck_level']}/5 ({fortune['luck_enum']})")
        print(f"Reading: {fortune['description']}\n")
    except Exception as e:
        print(f"Demo 1 Failed: {e}")

    # --- Example 2: Checking SPL Balance ---
    try:
        print("\033[36m>>> DEMO 2: SPL TOKEN BALANCE VERIFICATION <<<\033[0m")
        usdc_mint = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
        wallet_to_check = "buyA5hR1Z9KtHQRBTmLkjsFfjAabDwdZtrRC6edqxAJ"
        
        balance_res = await client.buy(
            f"https://preview.spl-token.signer-payer.me/api/v1/check-balance?wallet={wallet_to_check}&spl-token={usdc_mint}",
            {},
            "GET"
        )
        print("\033[32m[RESULT] Balance Checked!\033[0m")
        print(f"Token: {balance_res['token']}")
        print(f"Balance UI: {balance_res['balance_ui']}")
        print(f"Verified: {'YES' if balance_res['balance_met'] else 'NO'}\n")
    except Exception as e:
        print(f"Demo 2 Failed: {e}")

if __name__ == "__main__":
    asyncio.run(main())
