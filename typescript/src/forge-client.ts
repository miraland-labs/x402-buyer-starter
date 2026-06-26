import { createPay402Fetch } from './fetch-with-payment';
import { PR402_FACILITATOR_URL_PREVIEW } from './pr402-defaults';

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
  tags?: string[];
  license?: string;
  contentHash?: string;
  createdAt: string;
}

export interface ForgeListResponse {
  items: ForgeListing[];
  total: number;
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
    tags: Array.isArray(raw.tags) ? (raw.tags as unknown[]).map(String) : [],
    license: raw.license ? String(raw.license) : undefined,
    contentHash: raw.contentHash
      ? String(raw.contentHash)
      : raw.content_hash
        ? String(raw.content_hash)
        : undefined,
    createdAt: String(raw.createdAt ?? raw.created_at ?? ''),
  };
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

export async function forgeBuy(
  options: ForgeClientOptions & {
    listingId: string;
    pay402Fetch: typeof fetch;
    outputPath?: string;
  },
): Promise<{ bytes: Buffer; contentType: string | null }> {
  const base = options.forgeApiBase.replace(/\/$/, '');
  const url = `${base}/api/v1/listings/${options.listingId}/download`;
  const res = await options.pay402Fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`forge buy HTTP ${res.status}: ${text.slice(0, 240)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type');
  if (options.outputPath) {
    const fs = await import('fs/promises');
    await fs.writeFile(options.outputPath, buf);
  }
  return { bytes: buf, contentType };
}

export function createForgePayFetch(
  payer: import('@solana/web3.js').Keypair,
  facilitatorBase?: string,
  fetchFn: typeof fetch = fetch,
): typeof fetch {
  return createPay402Fetch(fetchFn, {
    payer,
    defaultFacilitatorBaseUrl:
      facilitatorBase ?? PR402_FACILITATOR_URL_PREVIEW,
  });
}
