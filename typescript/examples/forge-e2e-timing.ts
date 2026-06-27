#!/usr/bin/env npx ts-node
/**
 * Agent-style E2E: browse preview Forge, buy a listing, download with per-step timings.
 *
 *   BUYER_KEYPAIR_PATH=../../demo-wallets/buyer-keypair.json \
 *   FORGE_API_BASE=https://preview.forge.http402.trade \
 *   FACILITATOR_BASE=https://preview.ipay.sh/api/v1/facilitator \
 *   npx ts-node examples/forge-e2e-timing.ts
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import * as https from 'https';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import {
  forgeGetListing,
  forgeSearch,
  sha256Hex,
} from '../src/forge-client';
import { buildExactPaymentProofJsonString } from '../src/pr402-exact-flow';
import { PR402_FACILITATOR_URL_PREVIEW } from '../src/pr402-defaults';

const WEB_BASE = (process.env.FORGE_WEB_BASE ?? 'https://preview.http402.trade').replace(
  /\/$/,
  '',
);
const FORGE_API_BASE = (process.env.FORGE_API_BASE ?? 'https://preview.forge.http402.trade').replace(
  /\/$/,
  '',
);
const FACILITATOR_BASE = (
  process.env.FACILITATOR_BASE ?? 'https://preview.ipay.sh/api/v1/facilitator'
).replace(/\/$/, '');
const LISTING_QUERY = process.env.LISTING_QUERY ?? 'Another audio with preview';
const LISTING_ID_ENV = process.env.LISTING_ID?.trim();

type Step = { name: string; ms: number; detail?: string };

function facilitatorOriginForBuild(
  requirements: PaymentRequiredQuote,
  envFallback: string,
): string {
  const fromQuote = requirements.extensions?.pr402FacilitatorUrl?.trim();
  const raw = (fromQuote || envFallback || PR402_FACILITATOR_URL_PREVIEW).replace(/\/$/, '');
  return raw.replace(/\/api\/v1\/facilitator\/?$/, '');
}



function loadKeypair(): Keypair {
  const path =
    process.env.BUYER_KEYPAIR_PATH?.trim() ??
    process.env.BUYER_SECRET_KEY?.trim();
  if (!path) throw new Error('Set BUYER_KEYPAIR_PATH or BUYER_SECRET_KEY');
  const raw = path.startsWith('[')
    ? path
    : readFileSync(path.startsWith('/') ? path : `${process.cwd()}/${path}`, 'utf8');
  if (raw.trim().startsWith('[')) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]));
  }
  return Keypair.fromSecretKey(bs58.decode(raw.trim()));
}

async function timed<T>(
  name: string,
  fn: () => Promise<T>,
  detail?: (result: T) => string,
): Promise<{ result: T; step: Step }> {
  const start = performance.now();
  const result = await fn();
  const ms = Math.round(performance.now() - start);
  return { result, step: { name, ms, detail: detail?.(result) } };
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

type PaymentRequiredQuote = {
  accepts: Array<Record<string, unknown>>;
  resource?: unknown;
  extensions?: { pr402FacilitatorUrl?: string };
};


function httpsGetBuffer(
  url: string,
  headers: Record<string, string> = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'GET',
        headers,
      },
      (res) => {
        if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) {
          reject(new Error(`HTTPS GET ${url} HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function httpsPaidDownload(
  url: string,
  paymentSignature: string,
): Promise<{
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  headersMs: number;
  bodyMs: number;
}> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const wall = performance.now();
    let headersMs = 0;
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'GET',
        headers: { 'PAYMENT-SIGNATURE': paymentSignature },
      },
      (res) => {
        headersMs = Math.round(performance.now() - wall);
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          const bodyMs = Math.round(performance.now() - wall - headersMs);
          resolve({
            status: res.statusCode ?? 0,
            headers: { ...res.headers },
            body: Buffer.concat(chunks),
            headersMs,
            bodyMs,
          });
        });
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function fetch402Requirements(url: string): Promise<PaymentRequiredQuote> {
  const res = await fetch(url);
  if (res.status === 402) {
    const hdr =
      res.headers.get('payment-required') ??
      res.headers.get('Payment-Required');
    if (hdr) {
      return JSON.parse(Buffer.from(hdr, 'base64').toString('utf8')) as PaymentRequiredQuote;
    }
    const body = (await res.json()) as PaymentRequiredQuote;
    if (!body.accepts?.length) throw new Error('402 JSON missing accepts[]');
    return body;
  }
  if (res.ok) throw new Error('Already paid — unexpected 200 on quote');
  throw new Error(`quote HTTP ${res.status}`);
}

async function main() {
  const payer = loadKeypair();
  const buyer = payer.publicKey.toBase58();
  const steps: Step[] = [];
  const wallStart = performance.now();

  console.log('=== Forge agent E2E timing ===');
  console.log(`buyer: ${buyer}`);
  console.log(`web: ${WEB_BASE}`);
  console.log(`api: ${FORGE_API_BASE}`);
  console.log('');

  const browse = await timed('1_browse_web_forge', async () => {
    const res = await fetch(`${WEB_BASE}/forge`, { redirect: 'follow' });
    if (!res.ok) throw new Error(`web browse HTTP ${res.status}`);
    return res.status;
  });
  steps.push({ ...browse.step, detail: `HTTP ${browse.result}` });

  const search = await timed('2_agent_search_listings', async () =>
    forgeSearch({ forgeApiBase: FORGE_API_BASE, q: LISTING_QUERY, limit: 5 }),
  );
  steps.push({
    ...search.step,
    detail: `${search.result.total} hit(s) for q="${LISTING_QUERY}"`,
  });

  const listingId =
    LISTING_ID_ENV ??
    search.result.items.find((i) =>
      i.title.toLowerCase().includes('another audio'),
    )?.id ??
    search.result.items[0]?.id;
  if (!listingId) throw new Error('Listing not found');

  const detail = await timed('3_fetch_listing_detail', () =>
    forgeGetListing({ forgeApiBase: FORGE_API_BASE, listingId }),
  );
  steps.push({
    ...detail.step,
    detail: `${detail.result.title} · ${(detail.result.byteSize / 1_048_576).toFixed(2)} MiB · ${detail.result.priceMicroUsdc / 1e6} USDC`,
  });

  const preview = await timed('4_fetch_preview', async () => {
    const buf = await httpsGetBuffer(detail.result.previewUrl);
    return buf.length;
  });
  steps.push({ ...preview.step, detail: `${preview.result} preview bytes` });

  const downloadUrl = `${FORGE_API_BASE}/api/v1/listings/${listingId}/download`;
  const quote = await timed('5_download_quote_402', () =>
    fetch402Requirements(downloadUrl),
  );
  steps.push({ ...quote.step, detail: '402 quote (JSON body)' });

  const proofStep = await timed('6_facilitator_build_and_sign', () =>
    buildExactPaymentProofJsonString({
      payer,
      requirements: quote.result,
      defaultFacilitatorBaseUrl: facilitatorOriginForBuild(
        quote.result,
        FACILITATOR_BASE,
      ),
    }),
  );
  steps.push(proofStep.step);

  const paid = await httpsPaidDownload(downloadUrl, proofStep.result);
  steps.push({
    name: '7_paid_request_to_headers',
    ms: paid.headersMs,
    detail: `HTTP ${paid.status}`,
  });

  if (paid.status < 200 || paid.status >= 300) {
    throw new Error(
      `paid download HTTP ${paid.status}: ${paid.body.toString('utf8').slice(0, 300)}`,
    );
  }

  const bytes = paid.body;
  const bodyMs = paid.bodyMs;
  const saleIdRaw = paid.headers['x-forge-sale-id'];
  const saleId = (Array.isArray(saleIdRaw) ? saleIdRaw[0] : saleIdRaw) ?? '(none)';
  steps.push({
    name: '8_download_body',
    ms: bodyMs,
    detail: `${bytes.length} bytes (${(bytes.length / 1_048_576).toFixed(2)} MiB)`,
  });

  const verifyStart = performance.now();
  const hash = sha256Hex(bytes);
  const expected = detail.result.contentHash?.toLowerCase();
  const verifyOk = !expected || hash === expected;
  steps.push({
    name: '9_verify_sha256',
    ms: Math.round(performance.now() - verifyStart),
    detail: verifyOk ? 'ok' : `mismatch expected=${expected} got=${hash}`,
  });

  const totalMs = Math.round(performance.now() - wallStart);
  const payToHeaders = steps.find((s) => s.name === '7_paid_request_to_headers')!.ms;
  const bodyOnly = steps.find((s) => s.name === '8_download_body')!.ms;

  console.log('Step                          Duration  Detail');
  console.log('────────────────────────────────────────────────────────────');
  for (const s of steps) {
    console.log(
      `${s.name.padEnd(28)} ${fmtMs(s.ms).padStart(8)}  ${s.detail ?? ''}`,
    );
  }
  console.log('────────────────────────────────────────────────────────────');
  console.log(`${'TOTAL'.padEnd(28)} ${fmtMs(totalMs).padStart(8)}`);
  console.log('');
  console.log(`listing_id: ${listingId}`);
  console.log(`sale_id: ${saleId}`);
  const ct = paid.headers['content-type'];
  console.log(`content_type: ${Array.isArray(ct) ? ct[0] : ct ?? ''}`);
  console.log(`sha256: ${hash}`);
  console.log('');
  console.log('Breakdown (paid flow):');
  console.log(`  facilitator build+sign: ${fmtMs(proofStep.step.ms)}`);
  console.log(`  API settle → headers:   ${fmtMs(payToHeaders)} (verify+settle+stream start)`);
  console.log(`  body transfer:          ${fmtMs(bodyOnly)} (nginx/VPS/R2)`);
  console.log(
    `  payment+download total: ${fmtMs(proofStep.step.ms + payToHeaders + bodyOnly)}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
