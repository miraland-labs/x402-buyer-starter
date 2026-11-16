import * as dotenv from 'dotenv';
import { X402Client } from './x402-client';
import { createPay402Fetch } from './fetch-with-payment';
import { PR402_FACILITATOR_URL_PREVIEW } from './pr402-defaults';

dotenv.config();

async function main() {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const facilitatorUrl =
        process.env.PR402_FACILITATOR_URL || PR402_FACILITATOR_URL_PREVIEW;
    const keypairPath = '../../demo-wallets/buyer-keypair.json';

    const client = new X402Client(rpcUrl, keypairPath, facilitatorUrl);

    console.log('\x1b[32m=== X402 BUYER STARTER: AGENTIC ACQUISITION ===\x1b[0m\n');

    // --- Example 0: global fetch wrapper (402 → pay → retry) ---
    try {
        console.log('\x1b[36m>>> DEMO 0: createPay402Fetch — SPL balance <<<\x1b[0m');
        const payFetch = createPay402Fetch(fetch, {
            payer: client.getPayer(),
            defaultFacilitatorBaseUrl: facilitatorUrl,
        });
        const balanceUrl =
            'https://preview.spl-token.signer-payer.me/api/v1/check-balance?wallet=buyA5hR1Z9KtHQRBTmLkjsFfjAabDwdZtrRC6edqxAJ&spl-token=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
        const res = await payFetch(balanceUrl);
        const data = (await res.json()) as {
            token?: string;
            balance_ui?: string;
        };
        if (!res.ok || data.balance_ui == null) {
            console.error('Demo 0 failed', res.status, data);
        } else {
            console.log('\x1b[32m[RESULT] fetch wrapper OK\x1b[0m');
            console.log(`Token: ${data.token}`);
            console.log(`Balance UI: ${data.balance_ui}\n`);
        }
    } catch (e) {
        console.error('Demo 0 Failed.', e);
    }

    // --- Example 1: SPL balance ---
    try {
        console.log('\x1b[36m>>> DEMO 1: SPL TOKEN BALANCE VERIFICATION <<<\x1b[0m');
        const usdcMint = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
        const walletToCheck = 'buyA5hR1Z9KtHQRBTmLkjsFfjAabDwdZtrRC6edqxAJ';

        const balanceRes = await client.buy(
            `https://preview.spl-token.signer-payer.me/api/v1/check-balance?wallet=${walletToCheck}&spl-token=${usdcMint}`,
            {},
            'GET',
        );
        console.log('\x1b[32m[RESULT] Balance Checked!\x1b[0m');
        const b = balanceRes as { token: string; balance_ui: string; balance_met: boolean };
        console.log(`Token: ${b.token}`);
        console.log(`Balance UI: ${b.balance_ui}`);
        console.log(`Verified: ${b.balance_met ? 'YES' : 'NO'}\n`);
    } catch (e) {
        console.error('Demo 1 Failed.', e);
    }
}

main().catch(console.error);
