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
 *   ... --buy {listing-uuid} --verify
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
  const verifyMode = args.includes('--verify');
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
      const quality =
        item.verifiedFeedbackCount != null && item.verifiedFeedbackCount > 0
          ? `  quality=${item.qualityScore ?? '—'} (${item.verifiedFeedbackCount})`
          : '';
      console.log(
        `${item.id}  ${(item.priceMicroUsdc / 1e6).toFixed(2)} USDC  [${item.category}] ${item.title}${quality}`,
      );
    }
    return;
  }

  if (buyId) {
    const payer = loadKeypair();
    const pay402Fetch = createForgePayFetch(payer, facilitatorBase);
    const buyerWallet = payer.publicKey.toBase58();
    console.log(`Buying ${buyId} as ${buyerWallet}…`);
    const { bytes, contentType, saleId, verify } = await forgeBuy({
      forgeApiBase,
      listingId: buyId,
      pay402Fetch,
      outputPath: `forge-${buyId.slice(0, 8)}.bin`,
      autoFeedback: verifyMode,
      buyerWallet: verifyMode ? buyerWallet : undefined,
      buyerKeypair: verifyMode ? payer : undefined,
    });
    console.log(
      `Saved forge-${buyId.slice(0, 8)}.bin (${bytes.length} bytes, ${contentType ?? 'unknown type'})`,
    );
    if (verifyMode) {
      console.log(`Sale id: ${saleId ?? '(none — legacy download)'}`);
      console.log(`Content verify: ${verify ?? 'skipped'}`);
      if (verify === 'hash_mismatch' && saleId) {
        console.log('Submitted sale feedback: hash_mismatch');
      }
    }
    return;
  }

  console.error('Usage: forge-buy.ts --list | --buy {listing-id} [--verify]');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
