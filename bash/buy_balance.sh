#!/bin/bash

# x402-buyer-starter: Bash Agent (SPL Balance Edition)
# Simple is Best, yet Elegant!
# USAGE: ./buy_balance.sh

set -e

# Configuration
URL="https://preview.spl-token.signer-payer.me/api/v1/check-balance"
BUYER_KEYPAIR="../demo-wallets/buyer-keypair.json"
MINT="4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" # DEVNET USDC

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

FACILITATOR=$(echo "$ACCEPT_LINE" | jq -r '.extra.capabilitiesUrl' | sed 's|/api/v1/facilitator/capabilities||')
RESOURCE=$(echo "$DECODED_HDR" | jq -c '.resource')

# Step 3: Build
echo -e "${GOLD}[3/5] Building Payment Transaction...${NC}"

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

# Step 4: Sign
echo -e "${GOLD}[4/5] Signing transaction locally via Node.js...${NC}"
SIGNED_TX=$(node sign.js "$BUYER_KEYPAIR" "$UNSIGNED_TX_B64")

# Repackage (Raw JSON Optimization)
FINAL_PROOF=$(echo "$VERIFY_TEMPLATE" | jq -c --arg tx "$SIGNED_TX" '.paymentPayload.payload.transaction = $tx')

# Step 5: Settle
echo -e "${GOLD}[5/5] Submitting Payment Proof (Raw JSON)...${NC}"
FINAL_RES=$(curl -s -G "$URL" \
    --data-urlencode "wallet=$PAYER_PUBKEY" \
    --data-urlencode "spl-token=$MINT" \
    -H "X-PAYMENT: $FINAL_PROOF")

echo -e "${BLUE}Raw Response:${NC}"
echo "$FINAL_RES"
echo -e "${GREEN}Balance Check Result:${NC}"
echo "$FINAL_RES" | jq .
