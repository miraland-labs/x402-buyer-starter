# @pr402/buyer-typescript

TypeScript payment rail for **X402** and **pr402** (`exact` scheme). Sign Solana transactions, build `PAYMENT-SIGNATURE` proofs, and wrap `fetch` for one-shot 402 retry — without marketplace or Forge APIs.

For **http402 Forge** (listings, buy, publish, vault), use [`@http402/forge-client`](https://www.npmjs.com/package/@http402/forge-client) instead.

## Install

```bash
npm install @pr402/buyer-typescript
```

Requires **Node.js 18+** (global `fetch`) or pass a compatible `fetch` to the helpers that accept it.

## Subpath imports

| Import | Purpose |
| :--- | :--- |
| `@pr402/buyer-typescript` | Main entry — defaults, exact flow, `createPay402Fetch`, `X402Client` |
| `@pr402/buyer-typescript/fetch-with-payment` | `createPay402Fetch` only |
| `@pr402/buyer-typescript/pr402-defaults` | Facilitator URLs and `accepts[]` helpers |
| `@pr402/buyer-typescript/pr402-exact-flow` | `buildExactPaymentProofJsonString` and types |

CommonJS and ESM consumers are supported via `require` and `import` export conditions.

## Quick start

### One-click `fetch` wrapper

```typescript
import {
  createPay402Fetch,
  PR402_FACILITATOR_URL_PREVIEW,
} from '@pr402/buyer-typescript';
import { Keypair } from '@solana/web3.js';

const payer = Keypair.fromSecretKey(/* your secret key bytes */);
const payFetch = createPay402Fetch(fetch, {
  payer,
  defaultFacilitatorBaseUrl:
    process.env.PR402_FACILITATOR_URL ?? PR402_FACILITATOR_URL_PREVIEW,
});

const res = await payFetch('https://preview.example.com/api/resource', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ /* ... */ }),
});
```

### High-level client

```typescript
import { X402Client, PR402_FACILITATOR_URL_PREVIEW } from '@pr402/buyer-typescript';
import { Keypair } from '@solana/web3.js';

const client = new X402Client({
  payer: Keypair.fromSecretKey(/* ... */),
  defaultFacilitatorBaseUrl: PR402_FACILITATOR_URL_PREVIEW,
});

const data = await client.buy('https://preview.example.com/api/resource', {
  query_type: 'daily',
});
```

## Facilitator URLs

| Environment | Default |
| :--- | :--- |
| Preview (Devnet) | `https://preview.ipay.sh` |
| Production (Mainnet) | `https://ipay.sh` |

Override with `PR402_FACILITATOR_URL` or pass `defaultFacilitatorBaseUrl` in client options.

## Source repo

Developed in the [x402-buyer-starter](https://github.com/miraland-labs/x402-buyer-starter) monorepo under `typescript/`. Demos and Forge examples live there; this npm package ships **payment artifacts only**.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
