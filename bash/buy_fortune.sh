#!/bin/bash

# x402-buyer-starter: Bash Agent (Pure CLI Edition)
# Simple is Best, yet Elegant!
# USAGE: ./buy_fortune.sh

set -e

# Configuration
AETHERVANE_URL="https://preview.aethervane.signer-payer.me"
BUYER_KEYPAIR="../demo-wallets/buyer-keypair.json"
RPC_URL="https://api.devnet.solana.com"

# Visuals
GOLD='\033[0;33m'
BLUE='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}--- X402 BASH BUYER AGENT ---${NC}"
echo -e "Target: AetherVane Agentic Fortune Teller\n"

# Step 1: Initial Discovery (Anticipate 402)
echo -e "${GOLD}[1/5] Discovering Service Requirements...${NC}"
RES=$(curl -s -i -X POST "$AETHERVANE_URL/api/v1/fortune" \
    -H "Content-Type: application/json" \
    -d '{ "query_type": "liuyao", "value": "8,7,9,7,8,6" }')

HTTP_CODE=$(echo "$RES" | head -n 1 | cut -d' ' -f2)

if [ "$HTTP_CODE" != "402" ]; then
    echo -e "${RED}Error: Expected 402, got $HTTP_CODE${NC}"
    echo "$RES" | sed -n '/{/,/}/p'
    exit 1
fi

# Extract Payment-Required header
RAW_HDR=$(echo "$RES" | grep -i "Payment-Required:" | cut -d' ' -f2- | tr -d '\r')

# Step 2: Parse Requirements (Decode Base64 JSON)
echo -e "${GOLD}[2/5] Parsing X402 Challenge...${NC}"
DECODED_HDR=$(echo "$RAW_HDR" | base64 -d)

# Choice: Pick first support line (Exact/UniversalSettle)
ACCEPT_LINE=$(echo "$DECODED_HDR" | jq -c '.accepts[] | select(.scheme == "exact" or .scheme == "v2:solana:exact")' | head -n 1)

MINT=$(echo "$ACCEPT_LINE" | jq -r '.asset')
AMOUNT=$(echo "$ACCEPT_LINE" | jq -r '.amount')
FACILITATOR=$(echo "$ACCEPT_LINE" | jq -r '.extra.capabilitiesUrl' | sed 's|/api/v1/facilitator/capabilities||')
RESOURCE=$(echo "$DECODED_HDR" | jq -c '.resource')

echo -e "  Asset: $MINT"
echo -e "  Amount: $AMOUNT units"
echo -e "  Facilitator: $FACILITATOR"

# Step 3: Build Payment Transaction via Facilitator
echo -e "\n${GOLD}[3/5] Building Payment Transaction via Facilitator...${NC}"
PAYER_PUBKEY=$(solana-keygen pubkey "$BUYER_KEYPAIR")

BUILD_RES=$(curl -s -X POST "$FACILITATOR/api/v1/facilitator/build-exact-payment-tx" \
    -H "Content-Type: application/json" \
    -d "{
        \"payer\": \"$PAYER_PUBKEY\",
        \"accepted\": $ACCEPT_LINE,
        \"resource\": $RESOURCE,
        \"buyerPaysTransactionFees\": true
    }")

UNSIGNED_TX_B64=$(echo "$BUILD_RES" | jq -r '.transaction')
VERIFY_TEMPLATE=$(echo "$BUILD_RES" | jq -c '.verifyBodyTemplate')

# Step 4: Local Signing (via tiny Node script)
echo -e "${GOLD}[4/5] Signing transaction locally via Node.js...${NC}"

# We use the separate sign.js which uses @solana/web3.js
SIGNED_TX=$(node sign.js "$BUYER_KEYPAIR" "$UNSIGNED_TX_B64")

# Repackage the verify body (Raw JSON - RESOLVED Paradox)
# We take the template and inject the signature (COMPACT JSON is required for headers!)
FINAL_PROOF=$(echo "$VERIFY_TEMPLATE" | jq -c --arg tx "$SIGNED_TX" '.paymentPayload.payload.transaction = $tx')

# Step 5: Settle & Submit
echo -e "\n${GOLD}[5/5] Submitting Payment Proof (Raw JSON)...${NC}"
FINAL_RES=$(curl -s -X POST "$AETHERVANE_URL/api/v1/fortune" \
    -H "Content-Type: application/json" \
    -H "X-PAYMENT: $FINAL_PROOF" \
    -d '{ "query_type": "liuyao", "value": "8,7,9,7,8,6" }')

# Best Practice: Check both HTTP code and JSON body for nested errors
IS_ERROR=$(echo "$FINAL_RES" | jq -r '.error // empty')

if [ -n "$IS_ERROR" ]; then
    echo -e "${RED}Divination Failed!${NC}"
    echo -e "${RED}Reason: $IS_ERROR${NC}"
    echo "$FINAL_RES" | jq .
    exit 1
else
    echo -e "${GREEN}Divination Successful!${NC}"
    echo "$FINAL_RES" | jq .
fi
