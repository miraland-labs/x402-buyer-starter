/**
 * discover-and-pay — search pr402 resources, probe 402, then pay with @pr402/client.
 *
 *   FACILITATOR_URL=https://preview.ipay.sh \
 *   PR402_PAYER_KEYPAIR_JSON=./payer.json \
 *   npx tsx examples/discover-and-pay.ts "wallet risk"
 */

import { readFileSync } from 'node:fs';
import { Keypair } from '@solana/web3.js';
import { X402AgentClient } from '@pr402/client';
import { searchResources, probeResource } from '@pr402/discovery';

async function main() {
  const q = process.argv[2] || 'premium';
  const facilitator = (process.env.FACILITATOR_URL || 'https://preview.ipay.sh').replace(
    /\/$/,
    ''
  );
  const kpPath = process.env.PR402_PAYER_KEYPAIR_JSON;
  if (!kpPath) throw new Error('Set PR402_PAYER_KEYPAIR_JSON');

  const hits = await searchResources(facilitator, { q, limit: 5 });
  if (!hits.entries.length) {
    console.log('No resources found for', q);
    return;
  }
  const pick = hits.entries[0];
  console.log('Picked:', pick.title, pick.resourceUrl);

  const probe = await probeResource(pick.resourceUrl, pick.httpMethod || 'GET');
  console.log('Probe:', probe);
  if (!probe.ok) process.exit(1);

  const parsed = JSON.parse(readFileSync(kpPath, 'utf8')) as number[];
  const wallet = Keypair.fromSecretKey(Uint8Array.from(parsed));
  const client = new X402AgentClient(wallet);
  const asset = probe.acceptsSummary?.asset;
  if (!asset) throw new Error('Probe did not surface asset mint');
  const res = await client.fetchWithAutoPay(pick.resourceUrl, asset);
  console.log('Paid response', res.status, await res.text());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
