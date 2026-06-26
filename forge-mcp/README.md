# forge-mcp

Minimal [Model Context Protocol](https://modelcontextprotocol.io) server for the http402 Forge marketplace.

## Tools

| Tool | Description |
|------|-------------|
| `forge_list` | `GET /api/v1/listings` with optional filters and `sort=trending` |
| `forge_preview` | Preview metadata (content-type, length, streaming hint) |
| `forge_purchase` | Full x402 download flow via pr402 (`BUYER_SECRET_KEY` required) |

## Setup

```bash
cd ../typescript && npm install && npm run build
cd ../forge-mcp && npm install && npm run build
```

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `FORGE_API_BASE` | yes | Forge API root, e.g. `http://127.0.0.1:8092` |
| `FACILITATOR_BASE` | yes | pr402 facilitator, e.g. `https://preview.ipay.sh/api/v1/facilitator` |
| `BUYER_SECRET_KEY` | for purchase | Base58 or JSON byte array Solana secret key |

## Cursor / Claude Desktop

```json
{
  "mcpServers": {
    "forge": {
      "command": "node",
      "args": ["/path/to/x402-buyer-starter/forge-mcp/dist/index.js"],
      "env": {
        "FORGE_API_BASE": "http://127.0.0.1:8092",
        "FACILITATOR_BASE": "https://preview.ipay.sh/api/v1/facilitator",
        "BUYER_SECRET_KEY": "..."
      }
    }
  }
}
```

## Run

```bash
npm start
```

Uses stdio transport (stdin/stdout).
