#!/usr/bin/env node
/**
 * Minimal MCP server for Forge marketplace integration.
 *
 * Env:
 *   FORGE_API_BASE — Forge API root (e.g. http://127.0.0.1:8092)
 *   FACILITATOR_BASE — pr402 facilitator base URL
 *   BUYER_SECRET_KEY — base58 or JSON byte array Solana keypair
 */
import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import {
  createPay402Fetch,
  forgeBuy,
  forgeSearch,
} from 'x402-buyer-typescript';

function env(name: string, fallback?: string): string {
  const v = process.env[name]?.trim();
  if (v) return v.replace(/\/$/, '');
  if (fallback) return fallback;
  throw new Error(`${name} is required`);
}

function loadKeypair(): Keypair | null {
  const raw = process.env.BUYER_SECRET_KEY?.trim();
  if (!raw) return null;
  if (raw.startsWith('[')) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]));
  }
  return Keypair.fromSecretKey(bs58.decode(raw));
}

const forgeApiBase = env('FORGE_API_BASE', 'http://127.0.0.1:8092');
const facilitatorBase = env(
  'FACILITATOR_BASE',
  'https://preview.ipay.sh/api/v1/facilitator',
);
const payer = loadKeypair();
const pay402Fetch = payer
  ? createPay402Fetch(fetch, { payer, defaultFacilitatorBaseUrl: facilitatorBase })
  : null;

const server = new Server(
  { name: 'forge-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'forge_list',
      description: 'Search Forge listings (GET /api/v1/listings)',
      inputSchema: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          category: { type: 'string' },
          seller_wallet: { type: 'string' },
          agent_friendly: { type: 'boolean' },
          sort: { type: 'string', enum: ['trending', 'newest', 'price_asc', 'price_desc'] },
          limit: { type: 'number' },
          offset: { type: 'number' },
        },
      },
    },
    {
      name: 'forge_preview',
      description: 'Fetch preview metadata (HEAD/GET) for a listing',
      inputSchema: {
        type: 'object',
        properties: {
          listing_id: { type: 'string' },
        },
        required: ['listing_id'],
      },
    },
    {
      name: 'forge_purchase',
      description: 'Purchase and download a listing via x402 (requires BUYER_SECRET_KEY)',
      inputSchema: {
        type: 'object',
        properties: {
          listing_id: { type: 'string' },
        },
        required: ['listing_id'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  if (name === 'forge_list') {
    const result = await forgeSearch({
      forgeApiBase,
      q: a.q ? String(a.q) : undefined,
      category: a.category ? String(a.category) : undefined,
      sellerWallet: a.seller_wallet ? String(a.seller_wallet) : undefined,
      agentFriendly:
        typeof a.agent_friendly === 'boolean' ? a.agent_friendly : undefined,
      sort: a.sort ? String(a.sort) : 'trending',
      limit: typeof a.limit === 'number' ? a.limit : undefined,
      offset: typeof a.offset === 'number' ? a.offset : undefined,
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }

  if (name === 'forge_preview') {
    const id = String(a.listing_id ?? '');
    const url = `${forgeApiBase}/api/v1/listings/${id}/preview`;
    const head = await fetch(url, { method: 'HEAD' });
    let contentType = head.headers.get('content-type');
    let contentLength = head.headers.get('content-length');
    let acceptRanges = head.headers.get('accept-ranges');
    if (!head.ok) {
      const get = await fetch(url);
      contentType = get.headers.get('content-type');
      contentLength = get.headers.get('content-length');
      acceptRanges = get.headers.get('accept-ranges');
      if (!get.ok) {
        return {
          content: [{ type: 'text', text: `preview failed: HTTP ${get.status}` }],
          isError: true,
        };
      }
    }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              listing_id: id,
              preview_url: url,
              content_type: contentType,
              content_length: contentLength,
              accept_ranges: acceptRanges,
              streamed: Boolean(
                contentType?.startsWith('video/') ||
                  contentType?.startsWith('audio/') ||
                  contentType?.startsWith('image/'),
              ),
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  if (name === 'forge_purchase') {
    if (!pay402Fetch) {
      return {
        content: [{ type: 'text', text: 'BUYER_SECRET_KEY not configured' }],
        isError: true,
      };
    }
    const id = String(a.listing_id ?? '');
    const { bytes, contentType } = await forgeBuy({
      forgeApiBase,
      listingId: id,
      pay402Fetch,
    });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              listing_id: id,
              bytes: bytes.length,
              content_type: contentType,
              note: 'Binary saved in memory only; write to disk in your agent if needed',
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  return {
    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    isError: true,
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
