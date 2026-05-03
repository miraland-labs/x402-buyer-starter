# x402-buyer-starter

**Simple is Best, Yet Elegant!**

A high-fidelity starter project for **Buyer Agents** (MCP, OpenClaw, AutoGPT) in the X402 ecosystem. This project demonstrates how to programmatically discover, pay for, and consume professional services on Solana (Devnet in the bundled demos; use production facilitator URLs for Mainnet).

## 📁 Languages

| Language | Path | Best For... |
| :--- | :--- | :--- |
| **Bash** | `bash/` | DevOps, CLI tools, minimalists. |
| **TypeScript** | `typescript/` | Web agents, fetch wrapper, reusable SDK entrypoints. |
| **Python** | `python/` | AI Agents, LLM-driven loops. |

## pr402 facilitator URLs

| Environment | Base URL |
|-------------|----------|
| **Production** (Solana Mainnet) | `https://agent.pay402.me` |
| **Preview** (Solana Devnet) | `https://preview.agent.pay402.me` |

Set **`PR402_FACILITATOR_URL`** (Bash, TypeScript via `.env`, Python via `.env`) to override the default preview URL when you work against Mainnet or a self-hosted pr402 fork.

## 🚀 One-Line Acquisition

The `X402Client` entry point wraps HTTP + 402 handling + local signing:

```typescript
const fortune = await client.buy("https://preview.aethervane.hashspace.me/api/v1/fortune", {
    query_type: "liuyao",
    value: "8,7,9,7,8,6"
});
```

### One-click `fetch` wrapper (TypeScript)

For agents that already use `fetch`, **`createPay402Fetch`** retries once with a **`PAYMENT-SIGNATURE`** after a **402** + **`Payment-Required`** header:

```typescript
import { createPay402Fetch, PR402_FACILITATOR_URL_PREVIEW } from './index';
import { Keypair } from '@solana/web3.js';
import * as fs from 'fs';

const payer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync('demo-wallets/buyer-keypair.json', 'utf-8')))
);
const payFetch = createPay402Fetch(fetch, {
  payer,
  defaultFacilitatorBaseUrl: process.env.PR402_FACILITATOR_URL ?? PR402_FACILITATOR_URL_PREVIEW,
});

const res = await payFetch('https://preview.aethervane.hashspace.me/api/v1/fortune', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ request_id: 'r1', fortune: { query_type: 'daily' } }),
});
const json = await res.json();
```

Import paths when developing **inside this repo**: `import { … } from './src/index'` or compile from `dist/`. **Requires Node 18+** (global `fetch`) or provide a compatible `fetch` as the first argument.

## 🛠️ Usage

### 1. Setup Your identity

Copy your Solana keypair (JSON) to `demo-wallets/buyer-keypair.json`.

> Note: For the preview, a demo wallet is already provided at `demo-wallets/buyer-keypair.json`.

### 2. Run the Demos

#### Bash

```bash
cd bash
npm install
./buy_fortune.sh
```

Optional: `export PR402_FACILITATOR_URL=https://agent.pay402.me` for mainnet.

#### TypeScript

```bash
cd typescript
npm install
npm start   # runs src/run-demos.ts (X402Client + createPay402Fetch smoke test)
npm run build  # emits dist/ + .d.ts for SDK-style imports
```

Optional `.env`: `PR402_FACILITATOR_URL`, `SOLANA_RPC_URL` (reserved / future use).

#### Python

```bash
cd python
pip install -r requirements.txt
python index.py
```

Use `PR402_FACILITATOR_URL` in `.env` for Mainnet.

## 🧪 Fortune Category Test Vectors

The buyer demos now purchase all AetherVane fortune categories in one run. These are the exact test inputs used and the response shape observed in live preview runs.

| Category (`query_type`) | Input payload | Observed response summary |
| :--- | :--- | :--- |
| `liuyao` | `{"query_type":"liuyao","value":"8,7,9,7,8,6"}` | `luck_level=3`, `luck_enum=NEUTRAL_FLOW`, `engine=LiuYao_Coin_Method` |
| `number` | `{"query_type":"number","value":"386"}` | `luck_level=4`, `luck_enum=STEADY_RISE`, `engine=Meihua_Yi_Shu` |
| `name` | `{"query_type":"name","value":"Satoshi Nakamoto"}` | `luck_level=5`, `luck_enum=SUPREME_ASCENT`, `engine=Onomancy_81` |
| `daily` | `{"query_type":"daily"}` | `luck_level=4`, `luck_enum=STEADY_RISE`, `engine=Almanac_Daily` |

All categories return JSON with core fields like `luck_level`, `luck_enum`, `risk_multiplier`, `recommended_action`, `engine`, and `description`.
For `daily`, output is deterministic for the same UTC date, but expected to change when the date changes.

## 🔍 Key Concepts for Agents

1. **The 402 Challenge**: Any unpaid request to an X402-protected URL returns `HTTP 402 Payment Required`.
2. **Discovery**: The `Payment-Required` header contains the metadata needed to pay: `payTo`, `amount`, and often `capabilitiesUrl` for the facilitator’s **`/api/v1/facilitator/capabilities`**.
3. **Facilitation**: Buyers call **`POST …/build-exact-payment-tx`** on pr402 with **`payer`**, **`accepted`**, **`resource`** (optional **`skipSourceBalanceCheck`**, **`autoWrapSol`**). Do **not** send legacy **`buyerPaysTransactionFees`** on this rail — pr402 sponsors Solana fees for **exact**; sign at **`payerSignatureIndex`**.

### Scheme: `exact` vs `v2:solana:exact`

Sellers often publish **`v2:solana:exact`** in **`accepts[]`** (alias for the UniversalSettle rail). pr402 accepts **either** alias on **`build-exact-payment-tx`**, but the **canonical** request form is wire **`exact`**. This starter normalizes **`v2:solana:exact` → `exact`** on the build request so it matches current pr402 OpenAPI guidance; **`verifyBodyTemplate`** from pr402 already uses **`exact`** everywhere.

4. **Local Signing**: The agent signs the transaction locally and sends the proof back to the resource with **`PAYMENT-SIGNATURE`**.

### Preview facilitator (pr402)

Live challenges often point at **capabilities** under:

`https://preview.agent.pay402.me/api/v1/facilitator/capabilities`

Bash scripts read `accepts[].extra.capabilitiesUrl` when present; otherwise they fall back to **`PR402_FACILITATOR_URL`** or the preview default.

**Same-origin docs (alignment with pr402):**

- **`/agent-integration.md`** — human runbook.
- **`/agent-payTo-semantics.json`** — machine-readable `payTo` + **`paymentMintAllowlist`**.
- If **`POST …/build-exact-payment-tx`** returns **400** with “not supported … Approved assets”, the facilitator’s mint allowlist excludes your **`accepted.asset`** — pick an allowlisted rail or ask the seller to fix **`accepts[]`**.

### Bash demos: success vs failure

- Scripts use **`set -e`** and treat a JSON body with a top-level **`error`** field as **failure** → **non-zero exit**, even when HTTP status is 200.
- **`build-exact-payment-tx`** responses must include a non-empty **`transaction`**; otherwise the script exits with an error.
- **`sign.js`**: if Node prints **DEP0040 (punycode)**, it comes from transitive deps; demos run `node --no-deprecation sign.js` to suppress that noise.

---
Part of the **x402 Agentic Protocol** ecosystem.
© 2026 Miraland Labs • Powering the Machine Economy.
