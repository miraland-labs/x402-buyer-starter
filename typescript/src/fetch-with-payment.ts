import { Keypair } from '@solana/web3.js';
import { PR402_FACILITATOR_URL_PREVIEW } from './pr402-defaults';
import { buildExactPaymentProofJsonString } from './pr402-exact-flow';

export type CreatePay402FetchOptions = {
    payer: Keypair;
    /**
     * Base URL of the pr402 deployment (no `/api/...` path).
     * Defaults to preview devnet — use `PR402_FACILITATOR_URL_PRODUCTION` for mainnet resources.
     */
    defaultFacilitatorBaseUrl?: string;
};

/**
 * One-shot `fetch` wrapper for x402 `exact` / pr402: on **402** with a `Payment-Required`
 * header, builds a proof via pr402 and retries the **same** request with `PAYMENT-SIGNATURE`.
 *
 * The first request is cloned so the body can be replayed on retry (streams supported per Fetch spec).
 */
export function createPay402Fetch(
    baseFetch: typeof fetch,
    options: CreatePay402FetchOptions,
): typeof fetch {
    const defaultBase =
        options.defaultFacilitatorBaseUrl ?? PR402_FACILITATOR_URL_PREVIEW;
    const { payer } = options;

    return async function pay402Fetch(
        input: RequestInfo | URL,
        init?: RequestInit,
    ): Promise<Response> {
        const original = new Request(input, init);
        const first = await baseFetch(original.clone());

        if (first.status !== 402) {
            return first;
        }

        const rawHdr =
            first.headers.get('payment-required') ??
            first.headers.get('Payment-Required');
        if (!rawHdr) {
            return first;
        }

        let requirements: { accepts: Array<Record<string, unknown>>; resource?: unknown };
        try {
            requirements = JSON.parse(
                Buffer.from(rawHdr, 'base64').toString('utf8'),
            ) as typeof requirements;
        } catch {
            return first;
        }

        const proof = await buildExactPaymentProofJsonString({
            payer,
            requirements,
            defaultFacilitatorBaseUrl: defaultBase,
            fetchFn: baseFetch,
        });

        const headers = new Headers(original.headers);
        headers.set('PAYMENT-SIGNATURE', proof);
        const retry = new Request(original, { headers });
        return baseFetch(retry);
    };
}
