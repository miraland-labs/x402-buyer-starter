import { Keypair, VersionedTransaction } from '@solana/web3.js';
import {
    canonicalAcceptedForBuild,
    facilitatorBaseUrl,
    pickExactAcceptLine,
} from './pr402-defaults';

export type PaymentRequiredBody = {
    accepts: Array<Record<string, unknown>>;
    resource?: unknown;
};

function getFetch(): typeof fetch {
    if (typeof globalThis.fetch !== 'function') {
        throw new Error('global fetch is required (Node.js 18+) or pass fetchFn');
    }
    return globalThis.fetch.bind(globalThis);
}

/**
 * Full exact-rail flow: `build-exact-payment-tx` → sign at payer → JSON string for `PAYMENT-SIGNATURE`.
 * Matches pr402 OpenAPI / `sdk/facilitator-build-tx.ts` paths.
 */
export async function buildExactPaymentProofJsonString(args: {
    payer: Keypair;
    requirements: PaymentRequiredBody;
    defaultFacilitatorBaseUrl: string;
    fetchFn?: typeof fetch;
}): Promise<string> {
    const acceptLine = pickExactAcceptLine(args.requirements.accepts);
    if (!acceptLine) {
        throw new Error(
            "No supported exact rail in accepts[] (need scheme 'exact' or alias 'v2:solana:exact').",
        );
    }

    const extra = acceptLine.extra;
    const capUrl =
        extra && typeof extra === 'object' && extra !== null && 'capabilitiesUrl' in extra
            ? String((extra as { capabilitiesUrl?: string }).capabilitiesUrl ?? '')
            : '';

    const base = facilitatorBaseUrl(capUrl || null, args.defaultFacilitatorBaseUrl);
    const accepted = canonicalAcceptedForBuild(acceptLine);
    const fetchFn = args.fetchFn ?? getFetch();

    const buildUrl = `${base}/api/v1/facilitator/build-exact-payment-tx`;
    const res = await fetchFn(buildUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            payer: args.payer.publicKey.toBase58(),
            accepted,
            resource: args.requirements.resource,
        }),
    });

    const text = await res.text();
    if (!res.ok) {
        throw new Error(`build-exact-payment-tx HTTP ${res.status}: ${text}`);
    }

    let buildData: {
        transaction: string;
        verifyBodyTemplate: {
            paymentPayload: { payload: { transaction?: string } };
        };
    };
    try {
        buildData = JSON.parse(text) as typeof buildData;
    } catch {
        throw new Error(`build-exact-payment-tx: invalid JSON: ${text.slice(0, 240)}`);
    }

    const txBytes = Buffer.from(buildData.transaction, 'base64');
    const vtx = VersionedTransaction.deserialize(txBytes);
    vtx.sign([args.payer]);

    const signedTxBase64 = Buffer.from(vtx.serialize()).toString('base64');
    const verifyBody = buildData.verifyBodyTemplate as {
        paymentPayload: { payload: { transaction: string } };
    };
    verifyBody.paymentPayload.payload.transaction = signedTxBase64;

    return JSON.stringify(verifyBody);
}
