# AGENTS.md

This file is for AI agents (Cursor, Claude Code, etc.), not human developers.
Philosophy: **Simple is Best, yet Elegant.** Make the smallest change that solves
the task; do not refactor, abstract, or add features that were not asked for.

`x402-buyer-starter` is a **reference** buyer agent in three languages. It demonstrates
the discover → pay → consume loop against a pr402 facilitator. It is meant to be read
and copied, not grown into a framework.

## Topology

- `bash/`        — `./buy_fortune.sh`, `./buy_balance.sh` (uses `sign.js` for signing).
- `typescript/`  — Node ≥ 18 (global `fetch`), `npm start`, `npm run build` → `dist/`.
- `python/`      — `pip install -r requirements.txt`, `python index.py`.

No root-level build. Each directory is self-contained.

## Hard boundaries (do not cross without explicit human approval)

- **Keep the three languages in lockstep.** Same demo flow, same env var names, same
  request/response handling. Change one language → change all three, or none.
- **Do not "clean up" the wire quirks — they are deliberate:**
  - Normalize `v2:solana:exact` → `exact` on `build-exact-payment-tx`.
  - **Never** send legacy `buyerPaysTransactionFees` on the `exact` rail (pr402 sponsors
    Solana fees); sign at `payerSignatureIndex`.
  - Buyer sends `PAYMENT-SIGNATURE`; server replies `PAYMENT-RESPONSE`. Keep both.
- **Authoritative payment terms = the live HTTP 402** (`Payment-Required` header).
  Manifests/capabilities are advisory hints only.
- **Facilitator host comes from `PR402_FACILITATOR_URL`** (defaults baked per language). Don't hardcode.
- **Never commit real keypairs.** `demo-wallets/` holds the bundled Devnet demo wallet only.
- **No new dependencies** (`package.json`, `requirements.txt`) unless asked.

## Verify before claiming done (fix, don't suppress)

```bash
cd typescript && npm install && npm run build
cd python     && python -m pip install -r requirements.txt && python -c "import x402_client"
cd bash       && bash -n buy_fortune.sh && bash -n buy_balance.sh && node --check sign.js
```
