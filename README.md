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
const fortune = await client.buy("https://preview.aethervane.signer-payer.me/api/v1/fortune", {
    query_type: "liuyao",
    value: "8,7,9,7,8,6"
});
```

## 🛠️ Usage

### 1. Setup Your identity
Copy your Solana keypair (JSON) to `buyer-keypair.json` in this folder.
> Note: For the preview, we've provided a demo wallet `buyer-keypair.json`.

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

## 🔍 Key Concepts for Agents

1.  **The 402 Challenge**: Any unpaid request to an X402-protected URL returns `HTTP 402 Payment Required`.
2.  **Discovery**: The `Payment-Required` header contains the metadata needed to pay: `payTo`, `amount`, and `capabilitiesUrl` (the Facilitator).
3.  **Facilitation**: Agents send the 402 requirements to the **Facilitator API** to receive an unsigned transaction shell.
4.  **Local Signing**: The agent signs the transaction locally and sends the proof back to the service.

---
Part of the **x402 Agentic Protocol** ecosystem.
© 2026 Miraland Labs • Powering the Machine Economy.
