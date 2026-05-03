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
        console.log('\x1b[36m>>> DEMO 0: createPay402Fetch — one category smoke test <<<\x1b[0m');
        const payFetch = createPay402Fetch(fetch, {
            payer: client.getPayer(),
            defaultFacilitatorBaseUrl: facilitatorUrl,
        });
        const wrappedInput = {
            request_id: `demo-fetch-${Date.now()}`,
            fortune: { query_type: 'daily' as const },
        };
        const res = await payFetch(
            'https://preview.aethervane.hashspace.me/api/v1/fortune',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(wrappedInput),
            },
        );
        const data = (await res.json()) as {
            fortune?: { luck_level: number; luck_enum: string; engine: string };
        };
        const fortune = data.fortune;
        if (!fortune || !res.ok) {
            console.error('Demo 0 failed', res.status, data);
        } else {
            console.log('\x1b[32m[RESULT] fetch wrapper OK\x1b[0m');
            console.log(`Luck Level: ${fortune.luck_level}/5 (${fortune.luck_enum})`);
            console.log(`Engine: ${fortune.engine}\n`);
        }
    } catch (e) {
        console.error('Demo 0 Failed.', e);
    }

    // --- Example 1: AetherVane (all categories) ---
    try {
        console.log('\x1b[36m>>> DEMO 1: AETHERVANE DIVINATION (ALL CATEGORIES) <<<\x1b[0m');
        const fortuneInputs = [
            { query_type: 'liuyao', value: '8,7,9,7,8,6' },
            { query_type: 'number', value: '386' },
            { query_type: 'name', value: 'Satoshi Nakamoto' },
            { query_type: 'daily' },
        ];

        for (const input of fortuneInputs) {
            const wrappedInput = {
                request_id: `demo-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                fortune: input,
            };
            console.log(`\x1b[33m[INPUT]\x1b[0m ${JSON.stringify(wrappedInput)}`);
            const fortuneRes = await client.buy(
                'https://preview.aethervane.hashspace.me/api/v1/fortune',
                wrappedInput,
            );
            const fortune = (fortuneRes as { fortune?: unknown }).fortune ?? fortuneRes;
            console.log('\x1b[32m[RESULT] Divination Successful!\x1b[0m');
            const f = fortune as {
                luck_level: number;
                luck_enum: string;
                engine: string;
                description: string;
            };
            console.log(`Luck Level: ${f.luck_level}/5 (${f.luck_enum})`);
            console.log(`Engine: ${f.engine}`);
            console.log(`Reading: ${f.description}\n`);
        }
    } catch (e) {
        console.error('Demo 1 Failed.', e);
    }

    // --- Example 2: SPL balance ---
    try {
        console.log('\x1b[36m>>> DEMO 2: SPL TOKEN BALANCE VERIFICATION <<<\x1b[0m');
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
        console.error('Demo 2 Failed.', e);
    }
}

main().catch(console.error);
