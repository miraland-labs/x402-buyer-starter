#!/usr/bin/env npx ts-node
/**
 * CLI: browse Forge listings and buy via x402.
 *
 *   FORGE_API_BASE=http://127.0.0.1:8092 \
 *   FACILITATOR_BASE=https://preview.ipay.sh/api/v1/facilitator \
 *   BUYER_SECRET_KEY='[1,2,...]' \
 *   npx ts-node examples/forge-buy.ts --list
 *
 *   ... --buy {listing-uuid}
 */
import 'dotenv/config';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import {
  createForgePayFetch,
  forgeBuy,
  forgeSearch,
} from '../src/forge-client';

function loadKeypair(): Keypair {
  const raw = process.env.BUYER_SECRET_KEY?.trim();
  if (!raw) throw new Error('BUYER_SECRET_KEY required (base58 or JSON byte array)');
  if (raw.startsWith('[')) {
    const arr = JSON.parse(raw) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }
  return Keypair.fromSecretKey(bs58.decode(raw));
}

function envBase(name: string, fallback: string): string {
  return (process.env[name] ?? fallback).replace(/\/$/, '');
}

async function main() {
  const args = process.argv.slice(2);
  const listMode = args.includes('--list');
  const buyIdx = args.indexOf('--buy');
  const buyId = buyIdx >= 0 ? args[buyIdx + 1] : undefined;

  const forgeApiBase = envBase('FORGE_API_BASE', 'http://127.0.0.1:8092');
  const facilitatorBase = envBase(
    'FACILITATOR_BASE',
    'https://preview.ipay.sh/api/v1/facilitator',
  );

  if (listMode) {
    const { items, total } = await forgeSearch({
      forgeApiBase,
      sort: 'trending',
      limit: 20,
    });
    console.log(`Found ${total} listings (showing ${items.length}):\n`);
    for (const item of items) {
      console.log(
        `${item.id}  ${(item.priceMicroUsdc / 1e6).toFixed(2)} USDC  [${item.category}] ${item.title}`,
      );
    }
    return;
  }

  if (buyId) {
    const payer = loadKeypair();
    const pay402Fetch = createForgePayFetch(payer, facilitatorBase);
    console.log(`Buying ${buyId} as ${payer.publicKey.toBase58()}…`);
    const { bytes, contentType } = await forgeBuy({
      forgeApiBase,
      listingId: buyId,
      pay402Fetch,
      outputPath: `forge-${buyId.slice(0, 8)}.bin`,
    });
    console.log(
      `Saved forge-${buyId.slice(0, 8)}.bin (${bytes.length} bytes, ${contentType ?? 'unknown type'})`,
    );
    return;
  }

  console.error('Usage: forge-buy.ts --list | --buy {listing-id}');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
