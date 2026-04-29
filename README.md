# x402-buyer-starter

**Simple is Best, Yet Elegant!**

A high-fidelity starter project for **Buyer Agents** (MCP, OpenClaw, AutoGPT) in the X402 ecosystem. This project demonstrates how to programmatically discover, pay for, and consume professional services on Solana Devnet.

## 📁 Languages

| Language | Path | Best For... |
| :--- | :--- | :--- |
| **Bash** | `bash/` | DevOps, CLI tools, minimalists. |
| **TypeScript** | `typescript/` | Web agents, high-fidelity SDKs. |
| **Python** | `python/` | AI Agents, LLM-driven loops. |

## 🚀 One-Line Acquisition

The core philosophy of this starter is to reduce the complexity of on-chain settlement to a single function call:

```typescript
// Example: AetherVane Fortune
const fortune = await client.buy("https://preview.aethervane.hashspace.me/api/v1/fortune", {
    query_type: "liuyao",
    value: "8,7,9,7,8,6"
});
```

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

#### TypeScript
```bash
cd typescript
npm install
npm start
```

#### Python
```bash
cd python
pip install -r requirements.txt
python index.py
```

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

1.  **The 402 Challenge**: Any unpaid request to an X402-protected URL returns `HTTP 402 Payment Required`.
2.  **Discovery**: The `Payment-Required` header contains the metadata needed to pay: `payTo`, `amount`, and `capabilitiesUrl` (the Facilitator).
3.  **Facilitation**: Agents send the 402 requirements to the **Facilitator API** to receive an unsigned transaction shell (e.g. **`POST .../build-exact-payment-tx`** for the `exact` rail). Request body is **`payer`**, **`accepted`**, **`resource`** (optional **`skipSourceBalanceCheck`**, **`autoWrapSol`**). Do **not** send legacy **`buyerPaysTransactionFees`** on build-exact — pr402 uses facilitator-paid Solana fees for that rail; sign at **`payerSignatureIndex`** from the response. **`accepted.scheme`** may be **`exact`** or **`v2:solana:exact`**; the facilitator’s **`verifyBodyTemplate`** normalizes to **`exact`** for **`/verify`** / **`/settle`** bodies.
4.  **Local Signing**: The agent signs the transaction locally and sends the proof back to the service.

### Preview facilitator (pr402)

Live challenges often point at **capabilities** under a deployment such as:

`https://preview.agent.pay402.me/api/v1/facilitator/capabilities`

The bash scripts **do not hard-code** that host: they read `accepts[].extra.capabilitiesUrl` from the 402 payload and derive the facilitator base path from it.

**Same-origin docs (alignment with current pr402):**

- **`/agent-integration.md`** — human runbook (golden path, `payTo`, allowlist).
- **`/agent-payTo-semantics.json`** — machine-readable `payTo` + **`paymentMintAllowlist`** (also linked as **`agentManifest.payToSemantics`** inside **`/capabilities`**).
- If **`POST .../build-exact-payment-tx`** returns **400** with “not supported … Approved assets”, the facilitator’s **`PR402_ALLOWED_PAYMENT_MINTS`** excludes the mint in your **`accepted.asset`** — pick an allowlisted rail or ask the seller to fix **`accepts[]`**.

### Bash demos: success vs failure

- Scripts use **`set -e`** and treat a JSON body with a top-level **`error`** field (verify/settle failure) as **failure** → **non-zero exit**, even when HTTP status is 200.
- **`build-exact-payment-tx`** responses must include a non-empty **`transaction`**; otherwise the script exits with an error.
- **`sign.js`**: if Node prints **DEP0040 (punycode)**, it comes from transitive deps; demos run `node --no-deprecation sign.js` to suppress that noise.

---
Part of the **x402 Agentic Protocol** ecosystem.
© 2026 Miraland Labs • Powering the Machine Economy.
