#!/bin/bash

# x402-buyer-starter: Bash Agent (SPL Balance Edition)
# Simple is Best, yet Elegant!
# USAGE: ./buy_balance.sh
#
# The facilitator URL is taken from the 402 challenge (`accepts[].extra.capabilitiesUrl`).
# Typical preview deployment: https://preview.agent.pay402.me/api/v1/facilitator
# (capabilities URL adds `/capabilities`).

set -e

# Configuration
URL="https://preview.spl-token.signer-payer.me/api/v1/check-balance"
BUYER_KEYPAIR="../demo-wallets/buyer-keypair.json"
MINT="4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" # DEVNET USDC
DEFAULT_PR402="${PR402_FACILITATOR_URL:-https://preview.agent.pay402.me}"
DEFAULT_PR402="${DEFAULT_PR402%/}"

# Visuals
GOLD='\033[0;33m'
BLUE='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}--- X402 BASH BUYER AGENT ---${NC}"
echo -e "Target: SPL Token Balance Verification Service\n"

# Step 1: Initial Discovery
echo -e "${GOLD}[1/5] Discovering Service Requirements...${NC}"
PAYER_PUBKEY=$(solana-keygen pubkey "$BUYER_KEYPAIR")
# We check the balance of our own wallet by default
RES=$(curl -s -i "$URL?wallet=$PAYER_PUBKEY&spl-token=$MINT")

HTTP_CODE=$(echo "$RES" | head -n 1 | cut -d' ' -f2)

if [ "$HTTP_CODE" != "402" ]; then
    echo -e "${RED}Error: Expected 402, got $HTTP_CODE${NC}"
    exit 1
fi

RAW_HDR=$(echo "$RES" | grep -i "Payment-Required:" | cut -d' ' -f2- | tr -d '\r')

# Step 2: Parse
echo -e "${GOLD}[2/5] Parsing X402 Challenge...${NC}"
DECODED_HDR=$(echo "$RAW_HDR" | base64 -d)
ACCEPT_LINE=$(echo "$DECODED_HDR" | jq -c '.accepts[] | select(.scheme == "exact" or .scheme == "v2:solana:exact")' | head -n 1)

CAP_URL=$(echo "$ACCEPT_LINE" | jq -r '.extra.capabilitiesUrl // empty')
if [ -z "$CAP_URL" ] || [ "$CAP_URL" = "null" ]; then
  FACILITATOR="$DEFAULT_PR402"
else
  FACILITATOR=$(echo "$CAP_URL" | sed 's|/api/v1/facilitator/capabilities||')
fi
RESOURCE=$(echo "$DECODED_HDR" | jq -c '.resource')
BUILD_ACCEPT=$(echo "$ACCEPT_LINE" | jq -c 'if .scheme == "v2:solana:exact" then . + {"scheme":"exact"} else . end')

# Step 3: Build
echo -e "${GOLD}[3/5] Building Payment Transaction...${NC}"

BUILD_RES=$(curl -s -X POST "$FACILITATOR/api/v1/facilitator/build-exact-payment-tx" \
    -H "Content-Type: application/json" \
    -d "{
        \"payer\": \"$PAYER_PUBKEY\",
        \"accepted\": $BUILD_ACCEPT,
        \"resource\": $RESOURCE
    }")

if ! echo "$BUILD_RES" | jq -e . >/dev/null 2>&1; then
    echo -e "${RED}Error: facilitator build response is not JSON${NC}"
    echo "$BUILD_RES"
    exit 1
fi

BUILD_ERR=$(echo "$BUILD_RES" | jq -r '.error // .message // empty')
if [ -n "$BUILD_ERR" ]; then
    echo -e "${RED}Error: facilitator build-exact-payment-tx failed${NC}"
    echo "$BUILD_RES" | jq .
    exit 1
fi

UNSIGNED_TX_B64=$(echo "$BUILD_RES" | jq -r '.transaction // empty')
if [ -z "$UNSIGNED_TX_B64" ] || [ "$UNSIGNED_TX_B64" = "null" ]; then
    echo -e "${RED}Error: facilitator response missing .transaction${NC}"
    echo "$BUILD_RES" | jq .
    exit 1
fi

VERIFY_TEMPLATE=$(echo "$BUILD_RES" | jq -c '.verifyBodyTemplate')

# Step 4: Sign
echo -e "${GOLD}[4/5] Signing transaction locally via Node.js...${NC}"
# --no-deprecation: hide Node DEP0040 (punycode) noise from @solana/web3.js transitive deps
SIGNED_TX=$(node --no-deprecation sign.js "$BUYER_KEYPAIR" "$UNSIGNED_TX_B64")

# Repackage (Raw JSON Optimization)
FINAL_PROOF=$(echo "$VERIFY_TEMPLATE" | jq -c --arg tx "$SIGNED_TX" '.paymentPayload.payload.transaction = $tx')

# Step 5: Settle
echo -e "${GOLD}[5/5] Submitting Payment Proof (Raw JSON)...${NC}"
FINAL_RES=$(curl -s -G "$URL" \
    --data-urlencode "wallet=$PAYER_PUBKEY" \
    --data-urlencode "spl-token=$MINT" \
    -H "PAYMENT-SIGNATURE: $FINAL_PROOF")

echo -e "${BLUE}Raw Response:${NC}"
echo "$FINAL_RES"

if ! echo "$FINAL_RES" | jq -e . >/dev/null 2>&1; then
    echo -e "${RED}Error: service response is not JSON${NC}"
    exit 1
fi

# x402-style bodies often include top-level "error" (string) on verify/settle failure
if echo "$FINAL_RES" | jq -e 'has("error") and .error != null' >/dev/null 2>&1; then
    echo -e "${RED}Payment verification or settlement failed (see .error above).${NC}"
    echo -e "${GREEN}Parsed body:${NC}"
    echo "$FINAL_RES" | jq .
    exit 1
fi

echo -e "${GREEN}Balance Check Result:${NC}"
echo "$FINAL_RES" | jq .
