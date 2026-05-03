/** Production pr402 facilitator (Solana Mainnet). */
export const PR402_FACILITATOR_URL_PRODUCTION = 'https://agent.pay402.me';

/** Preview pr402 facilitator (Solana Devnet). */
export const PR402_FACILITATOR_URL_PREVIEW = 'https://preview.agent.pay402.me';

const CAPABILITIES_SUFFIX = /\/api\/v1\/facilitator\/capabilities\/?$/;

/** Strip `…/capabilities` and trailing slashes; `capabilitiesUrl` may be absent. */
export function facilitatorBaseUrl(
    capabilitiesUrl: string | undefined | null,
    fallbackBaseUrl: string,
): string {
    const raw = (capabilitiesUrl?.trim() || fallbackBaseUrl.trim());
    return raw.replace(CAPABILITIES_SUFFIX, '').replace(/\/$/, '');
}

export function isExactRailScheme(scheme: unknown): boolean {
    return scheme === 'exact' || scheme === 'v2:solana:exact';
}

export function pickExactAcceptLine<T extends { scheme?: unknown }>(
    accepts: T[] | undefined,
): T | undefined {
    return accepts?.find((a) => isExactRailScheme(a.scheme));
}

/**
 * pr402 accepts `v2:solana:exact` on `POST …/build-exact-payment-tx`, but the canonical
 * request form is `exact` (and `verifyBodyTemplate` always uses wire `exact`).
 */
export function canonicalAcceptedForBuild<T extends { scheme?: unknown }>(accepted: T): T {
    if (accepted?.scheme === 'v2:solana:exact') {
        return { ...accepted, scheme: 'exact' };
    }
    return accepted;
}
