#!/bin/bash

# x402-buyer-starter: Bash Agent (Pure CLI Edition)
# Simple is Best, yet Elegant!
# USAGE: ./buy_fortune.sh
#
# Facilitator URL comes from the 402 challenge. Typical preview:
#   https://preview.agent.pay402.me/api/v1/facilitator

set -e

# Configuration
AETHERVANE_URL="https://preview.aethervane.hashspace.me"
BUYER_KEYPAIR="../demo-wallets/buyer-keypair.json"
RPC_URL="https://api.devnet.solana.com"
# Fallback when accepts[].extra.capabilitiesUrl is missing (preview devnet by default).
DEFAULT_PR402="${PR402_FACILITATOR_URL:-https://preview.agent.pay402.me}"
DEFAULT_PR402="${DEFAULT_PR402%/}"

# Visuals
GOLD='\033[0;33m'
BLUE='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}--- X402 BASH BUYER AGENT ---${NC}"
echo -e "Target: AetherVane Agentic Fortune Teller\n"

FORTUNE_INPUTS=(
  "{\"request_id\":\"demo-bash-$(date +%s)-1\",\"fortune\":{\"query_type\":\"liuyao\",\"value\":\"8,7,9,7,8,6\"}}"
  "{\"request_id\":\"demo-bash-$(date +%s)-2\",\"fortune\":{\"query_type\":\"number\",\"value\":\"386\"}}"
  "{\"request_id\":\"demo-bash-$(date +%s)-3\",\"fortune\":{\"query_type\":\"name\",\"value\":\"Satoshi Nakamoto\"}}"
  "{\"request_id\":\"demo-bash-$(date +%s)-4\",\"fortune\":{\"query_type\":\"daily\"}}"
)

for INPUT_JSON in "${FORTUNE_INPUTS[@]}"; do
  echo -e "${BLUE}----------------------------------------${NC}"
  echo -e "${BLUE}Input:${NC} $INPUT_JSON"

  # Step 1: Initial Discovery (Anticipate 402)
  echo -e "${GOLD}[1/5] Discovering Service Requirements...${NC}"
  RES=$(curl -s -i -X POST "$AETHERVANE_URL/api/v1/fortune" \
      -H "Content-Type: application/json" \
      -d "$INPUT_JSON")

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
  ACCEPT_LINE=$(echo "$DECODED_HDR" | jq -c '.accepts[] | select(.scheme == "exact" or .scheme == "v2:solana:exact")' | head -n 1)
  MINT=$(echo "$ACCEPT_LINE" | jq -r '.asset')
  AMOUNT=$(echo "$ACCEPT_LINE" | jq -r '.amount')
  CAP_URL=$(echo "$ACCEPT_LINE" | jq -r '.extra.capabilitiesUrl // empty')
  if [ -z "$CAP_URL" ] || [ "$CAP_URL" = "null" ]; then
    FACILITATOR="$DEFAULT_PR402"
  else
    FACILITATOR=$(echo "$CAP_URL" | sed 's|/api/v1/facilitator/capabilities||')
  fi
  RESOURCE=$(echo "$DECODED_HDR" | jq -c '.resource')
  # pr402 build accepts v2:solana:exact alias; canonical request uses wire `exact`.
  BUILD_ACCEPT=$(echo "$ACCEPT_LINE" | jq -c 'if .scheme == "v2:solana:exact" then . + {"scheme":"exact"} else . end')
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

  # Step 4: Local Signing (via tiny Node script)
  echo -e "${GOLD}[4/5] Signing transaction locally via Node.js...${NC}"
  SIGNED_TX=$(node --no-deprecation sign.js "$BUYER_KEYPAIR" "$UNSIGNED_TX_B64")
  FINAL_PROOF=$(echo "$VERIFY_TEMPLATE" | jq -c --arg tx "$SIGNED_TX" '.paymentPayload.payload.transaction = $tx')

  # Step 5: Settle & Submit
  echo -e "\n${GOLD}[5/5] Submitting Payment Proof (Raw JSON)...${NC}"
  FINAL_RES=$(curl -s -X POST "$AETHERVANE_URL/api/v1/fortune" \
      -H "Content-Type: application/json" \
      -H "PAYMENT-SIGNATURE: $FINAL_PROOF" \
      -d "$INPUT_JSON")

  if ! echo "$FINAL_RES" | jq -e . >/dev/null 2>&1; then
      echo -e "${RED}Error: service response is not JSON${NC}"
      echo "$FINAL_RES"
      exit 1
  fi

  if echo "$FINAL_RES" | jq -e 'has("error") and .error != null' >/dev/null 2>&1; then
      echo -e "${RED}Divination Failed (see .error in body).${NC}"
      echo "$FINAL_RES" | jq .
      exit 1
  fi

  echo -e "${GREEN}Divination Successful!${NC}"
  echo "$FINAL_RES" | jq .
done
