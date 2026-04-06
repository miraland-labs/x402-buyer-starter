import { X402Client } from './x402-client';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * X402 Buyer Starter Index: Demonstrates high-fidelity acquisition of paid services.
 * 1. AetherVane Agentic Fortune Teller
 * 2. SPL-Token Balance Check
 */

async function main() {
    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
    const facilitatorUrl = "https://preview.agent.pay402.me";
    const keypairPath = "../demo-wallets/buyer-keypair.json";

    const client = new X402Client(rpcUrl, keypairPath, facilitatorUrl);

    console.log("\x1b[32m=== X402 BUYER STARTER: AGENTIC ACQUISITION ===\x1b[0m\n");

    // --- Example 1: Buying a Fortune ---
    try {
        console.log("\x1b[36m>>> DEMO 1: AETHERVANE DIVINATION <<<\x1b[0m");
        const fortune = await client.buy<any>(
            "https://preview.aethervane.signer-payer.me/api/v1/fortune",
            { query_type: "liuyao", value: "8,7,9,7,8,6" }
        );
        console.log("\x1b[32m[RESULT] Divination Successful!\x1b[0m");
        console.log(`Luck Level: ${fortune.luck_level}/5 (${fortune.luck_enum})`);
        console.log(`Engine: ${fortune.engine}`);
        console.log(`Reading: ${fortune.description}\n`);
    } catch (e) {
        console.error("Demo 1 Failed.");
    }

    // --- Example 2: Checking SPL Balance ---
    try {
        console.log("\x1b[36m>>> DEMO 2: SPL TOKEN BALANCE VERIFICATION <<<\x1b[0m");
        const usdcMint = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"; // Devnet USDC
        const walletToCheck = "buyA5hR1Z9KtHQRBTmLkjsFfjAabDwdZtrRC6edqxAJ"; // demo buyer wallet

        const balanceRes = await client.buy<any>(
            `https://preview.spl-token.signer-payer.me/api/v1/check-balance?wallet=${walletToCheck}&spl-token=${usdcMint}`,
            {}, // GET request semantics
            "GET"
        );
        console.log("\x1b[32m[RESULT] Balance Checked!\x1b[0m");
        console.log(`Token: ${balanceRes.token}`);
        console.log(`Balance UI: ${balanceRes.balance_ui}`);
        console.log(`Verified: ${balanceRes.balance_met ? 'YES' : 'NO'}\n`);
    } catch (e) {
        console.error("Demo 2 Failed.");
    }
}

main().catch(console.error);
