import { createHash } from 'crypto';
import type { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { createPay402Fetch } from './fetch-with-payment';
import { PR402_FACILITATOR_URL_PREVIEW } from './pr402-defaults';

/** @deprecated Use `@http402/forge-client` from http402-forge-cli for new integrations. */

export type ForgeFeedbackOutcome =
  | 'as_described'
  | 'hash_mismatch'
  | 'corrupt'
  | 'misleading'
  | 'other';

export interface ForgeListing {
  id: string;
  sellerWallet: string;
  title: string;
  description: string;
  category: string;
  priceMicroUsdc: number;
  contentType: string;
  byteSize: number;
  agentFriendly: boolean;
  deliveryScheme: string;
  previewUrl: string;
  previewContentType: string;
  tags?: string[];
  license?: string;
  contentHash?: string;
  qualityScore?: number;
  verifiedFeedbackCount?: number;
  createdAt: string;
}

export interface ForgeListResponse {
  items: ForgeListing[];
  total: number;
}

export interface ForgeBuyResult {
  bytes: Buffer;
  contentType: string | null;
  saleId?: string;
  verify?: 'ok' | 'hash_mismatch' | 'no_hash';
}

export interface ForgeClientOptions {
  forgeApiBase: string;
  facilitatorBase?: string;
  fetchFn?: typeof fetch;
}

function parseListing(raw: Record<string, unknown>): ForgeListing {
  return {
    id: String(raw.id ?? ''),
    sellerWallet: String(raw.sellerWallet ?? raw.seller_wallet ?? ''),
    title: String(raw.title ?? ''),
    description: String(raw.description ?? ''),
    category: String(raw.category ?? ''),
    priceMicroUsdc: Number(raw.priceMicroUsdc ?? raw.price_micro_usdc ?? 0),
    contentType: String(raw.contentType ?? raw.content_type ?? ''),
    byteSize: Number(raw.byteSize ?? raw.byte_size ?? 0),
    agentFriendly: Boolean(raw.agentFriendly ?? raw.agent_friendly),
    deliveryScheme: String(raw.deliveryScheme ?? raw.delivery_scheme ?? ''),
    previewUrl: String(raw.previewUrl ?? raw.preview_url ?? ''),
    previewContentType: String(
      raw.previewContentType ?? raw.preview_content_type ?? '',
    ),
    tags: Array.isArray(raw.tags) ? (raw.tags as unknown[]).map(String) : [],
    license: raw.license ? String(raw.license) : undefined,
    contentHash: raw.contentHash
      ? String(raw.contentHash)
      : raw.content_hash
        ? String(raw.content_hash)
        : undefined,
    qualityScore:
      raw.qualityScore != null || raw.quality_score != null
        ? Number(raw.qualityScore ?? raw.quality_score)
        : undefined,
    verifiedFeedbackCount:
      raw.verifiedFeedbackCount != null || raw.verified_feedback_count != null
        ? Number(raw.verifiedFeedbackCount ?? raw.verified_feedback_count)
        : undefined,
    createdAt: String(raw.createdAt ?? raw.created_at ?? ''),
  };
}

export function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function verifyListingContent(
  listing: Pick<ForgeListing, 'contentHash'>,
  bytes: Buffer,
): 'ok' | 'hash_mismatch' | 'no_hash' {
  if (!listing.contentHash) return 'no_hash';
  return sha256Hex(bytes) === listing.contentHash.toLowerCase()
    ? 'ok'
    : 'hash_mismatch';
}

function signForgeChallenge(keypair: Keypair, message: string): string {
  const messageBytes = new TextEncoder().encode(message);
  const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
  return Buffer.from(signature).toString('base64');
}

export async function forgeGetListing(
  options: ForgeClientOptions & { listingId: string },
): Promise<ForgeListing> {
  const base = options.forgeApiBase.replace(/\/$/, '');
  const fetchFn = options.fetchFn ?? fetch;
  const res = await fetchFn(`${base}/api/v1/listings/${options.listingId}`);
  if (!res.ok) throw new Error(`forge get listing HTTP ${res.status}`);
  return parseListing((await res.json()) as Record<string, unknown>);
}

export async function forgeSearch(
  options: ForgeClientOptions & {
    q?: string;
    category?: string;
    sellerWallet?: string;
    agentFriendly?: boolean;
    sort?: string;
    limit?: number;
    offset?: number;
  },
): Promise<ForgeListResponse> {
  const base = options.forgeApiBase.replace(/\/$/, '');
  const params = new URLSearchParams();
  if (options.q) params.set('q', options.q);
  if (options.category) params.set('category', options.category);
  if (options.sellerWallet) params.set('seller_wallet', options.sellerWallet);
  if (options.agentFriendly != null) {
    params.set('agent_friendly', options.agentFriendly ? 'true' : 'false');
  }
  if (options.sort) params.set('sort', options.sort);
  if (options.limit != null) params.set('limit', String(options.limit));
  if (options.offset != null) params.set('offset', String(options.offset));

  const fetchFn = options.fetchFn ?? fetch;
  const res = await fetchFn(`${base}/api/v1/listings?${params}`);
  if (!res.ok) throw new Error(`forge list HTTP ${res.status}`);
  const data = (await res.json()) as {
    items: Record<string, unknown>[];
    total: number;
  };
  return {
    total: data.total,
    items: data.items.map(parseListing),
  };
}

export async function forgeSaleFeedback(
  options: ForgeClientOptions & {
    saleId: string;
    buyerWallet: string;
    outcome: ForgeFeedbackOutcome;
    score?: number;
    note?: string;
    buyerKeypair?: Keypair;
    buyerChallenge?: string;
    buyerSignature?: string;
    fetchFn?: typeof fetch;
  },
): Promise<void> {
  const base = options.forgeApiBase.replace(/\/$/, '');
  const fetchFn = options.fetchFn ?? fetch;

  let buyerChallenge = options.buyerChallenge;
  let buyerSignature = options.buyerSignature;

  if (options.buyerKeypair) {
    const q = new URLSearchParams({
      buyer_wallet: options.buyerWallet,
      sale_id: options.saleId,
    });
    const challengeRes = await fetchFn(
      `${base}/api/v1/buyer/feedback-challenge?${q}`,
      { cache: 'no-store' },
    );
    if (!challengeRes.ok) {
      throw new Error(`forge feedback challenge HTTP ${challengeRes.status}`);
    }
    const challengeJson = (await challengeRes.json()) as { message?: string };
    buyerChallenge = String(challengeJson.message ?? '');
    buyerSignature = signForgeChallenge(options.buyerKeypair, buyerChallenge);
  }

  if (!buyerChallenge || !buyerSignature) {
    throw new Error(
      'forgeSaleFeedback requires buyerKeypair or buyerChallenge + buyerSignature',
    );
  }

  const res = await fetchFn(`${base}/api/v1/sales/${options.saleId}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      buyer_wallet: options.buyerWallet,
      buyer_challenge: buyerChallenge,
      buyer_signature: buyerSignature,
      outcome: options.outcome,
      score: options.score,
      note: options.note,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`forge sale feedback HTTP ${res.status}: ${text.slice(0, 240)}`);
  }
}

export async function forgeBuy(
  options: ForgeClientOptions & {
    listingId: string;
    pay402Fetch: typeof fetch;
    outputPath?: string;
    listing?: Pick<ForgeListing, 'contentHash'>;
    autoFeedback?: boolean;
    buyerWallet?: string;
    buyerKeypair?: Keypair;
  },
): Promise<ForgeBuyResult> {
  const base = options.forgeApiBase.replace(/\/$/, '');
  const url = `${base}/api/v1/listings/${options.listingId}/download`;
  const res = await options.pay402Fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`forge buy HTTP ${res.status}: ${text.slice(0, 240)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type');
  const saleId = res.headers.get('x-forge-sale-id') ?? undefined;
  if (options.outputPath) {
    const fs = await import('fs/promises');
    await fs.writeFile(options.outputPath, buf);
  }

  const listing =
    options.listing ??
    (options.autoFeedback
      ? await forgeGetListing({
          forgeApiBase: options.forgeApiBase,
          fetchFn: options.fetchFn,
          listingId: options.listingId,
        })
      : undefined);

  const verify = listing ? verifyListingContent(listing, buf) : undefined;

  if (
    options.autoFeedback &&
    verify === 'hash_mismatch' &&
    saleId &&
    options.buyerKeypair &&
    options.buyerWallet
  ) {
    await forgeSaleFeedback({
      forgeApiBase: options.forgeApiBase,
      fetchFn: options.fetchFn,
      saleId,
      buyerWallet: options.buyerWallet,
      buyerKeypair: options.buyerKeypair,
      outcome: 'hash_mismatch',
    });
  }

  return { bytes: buf, contentType, saleId, verify };
}

export function createForgePayFetch(
  payer: Keypair,
  facilitatorBase?: string,
  fetchFn: typeof fetch = fetch,
): typeof fetch {
  return createPay402Fetch(fetchFn, {
    payer,
    defaultFacilitatorBaseUrl:
      facilitatorBase ?? PR402_FACILITATOR_URL_PREVIEW,
  });
}
