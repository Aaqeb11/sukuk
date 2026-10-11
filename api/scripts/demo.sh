#!/usr/bin/env bash
# The terminal half of the demo video.
#
# Walks the issuance path one beat at a time: a failing asset refused with no
# key created, a passing asset screened, keyed inside Vault, signed there and
# issued on devnet, then proof the key cannot be exported and an audit trail
# of every signature. Press Enter to advance each step.
#
# Prerequisites (two other terminals, started before you hit record):
#   1. vault server -dev -dev-root-token-id=dev-only-token
#      then once: VAULT_ADDR=http://127.0.0.1:8200 vault secrets enable transit
#   2. cd api && bun run start:dev
#
# Run from api/:  bash scripts/demo.sh
set -uo pipefail

cd "$(dirname "$0")/.."

API=${API:-http://localhost:3001}
export VAULT_ADDR=${VAULT_ADDR:-http://127.0.0.1:8200}
export VAULT_TOKEN=${VAULT_TOKEN:-dev-only-token}
TEMPLATE=ijara-real-estate-v1
CLUSTER=${SOLANA_CLUSTER:-devnet}

# AST-001 is already issued on devnet, and the Sukuk PDA is derived from the
# asset id, so re-issuing it would be rejected as a duplicate. Same asset
# document, fresh id per run.
DEMO_ID=${DEMO_ID:-AST-001-$(date +%H%M%S)}

bold=$'\e[1m'; dim=$'\e[2m'; gold=$'\e[33m'; green=$'\e[32m'; red=$'\e[31m'; reset=$'\e[0m'

step() {
  printf '\n%s━━ %s%s\n' "$gold$bold" "$1" "$reset"
  [[ -n "${2:-}" ]] && printf '%s%s%s\n' "$dim" "$2" "$reset"
  read -r -p "$dim  ↵ $reset" _
}
show() { printf '%s$ %s%s\n' "$green" "$1" "$reset"; }

issue() { # $1 = asset json
  curl -s -X POST "$API/sukuk/issue" -H 'Content-Type: application/json' \
    -d "$(jq -n --argjson asset "$1" --arg t "$TEMPLATE" \
          '{templateId: $t, totalUnits: 1000, asset: $asset}')"
}

# ---------------------------------------------------------------------------
clear
printf '%sSukuk — issuance with custody-held keys%s\n' "$bold" "$reset"
printf '%sAPI %s · Vault %s · Solana %s%s\n' "$dim" "$API" "$VAULT_ADDR" "$CLUSTER" "$reset"

step "0 · Everything is up" "Custody is backed by Vault Transit, and it's reachable."
show "curl $API/custody/health"
curl -s "$API/custody/health" | jq

# ---------------------------------------------------------------------------
step "1 · A failing asset is refused" "AST-003: mixed-use block, conventional-bank tenant, 18% impure income."
show "curl -X POST $API/sukuk/issue  (AST-003)"
issue "$(cat fixtures/ast-003.json)" | jq '{
  status: "422 — refused at \(.stage)",
  message,
  failed: [.screening.results[] | select(.passed | not) | {condition: .description, why: .reason}]
}'

step "  …and no key was ever created for it" "The key only exists if the asset passed. No pass, no key, nothing on-chain."
show "vault list transit/keys"
vault list transit/keys 2>/dev/null || echo "(no keys yet)"
if vault list -format=json transit/keys 2>/dev/null | jq -e 'index("issuer-AST-003")' >/dev/null; then
  printf '%sissuer-AST-003 exists — unexpected%s\n' "$red" "$reset"
else
  printf '%s✓ no issuer-AST-003 key%s\n' "$green" "$reset"
fi

# ---------------------------------------------------------------------------
step "2 · A passing asset is issued" "Screen → create key in Vault → build → sign inside Vault → submit to devnet. ($DEMO_ID)"
show "curl -X POST $API/sukuk/issue  ($DEMO_ID)"
RESULT=$(issue "$(jq --arg id "$DEMO_ID" '.asset_id = $id' fixtures/ast-001.json)")
echo "$RESULT" | jq '{
  assetId,
  screening: {passed: "\(.screening.conditionsEvaluated) of \(.screening.conditionsEvaluated) conditions", template: "\(.screening.templateId) v\(.screening.templateVersion)", hash: .screening.hash},
  custody,
  chain
}'

SIG=$(echo "$RESULT" | jq -r '.chain.signature // empty')
HANDLE=$(echo "$RESULT" | jq -r '.custody.handle // empty')
if [[ -z "$SIG" ]]; then
  printf '%sIssuance did not return a signature — response above.%s\n' "$red" "$reset"
  exit 1
fi
printf '\n%sExplorer:%s https://explorer.solana.com/tx/%s?cluster=%s\n' "$bold" "$reset" "$SIG" "$CLUSTER"

# ---------------------------------------------------------------------------
step "3 · The key that signed it lives in Vault" "ed25519, and exportable: false."
show "vault read transit/keys/$HANDLE"
vault read -format=json "transit/keys/$HANDLE" | jq '.data | {name, type, exportable, allow_plaintext_backup, latest_version}'

step "  …and it cannot be taken out" "Ask Vault to export the private key. It refuses."
show "vault read transit/export/signing-key/$HANDLE"
vault read "transit/export/signing-key/$HANDLE" 2>&1 | sed 's/^/  /' | head -8

# ---------------------------------------------------------------------------
step "4 · Every key and every signature is audited" "The signing reason carries the screening hash: this signature, for this asset, because this screening passed."
show "curl $API/custody/audit?limit=5"
curl -s "$API/custody/audit?limit=5" | jq '[.[] | {timestamp, operation, handle, reason, messageDigest}]'

# ---------------------------------------------------------------------------
step "5 · Read it back from the chain" "Straight from the SukukAsset account, not a local cache."
show "curl $API/sukuk/$DEMO_ID"
curl -s "$API/sukuk/$DEMO_ID" | jq '{assetId, account: (.account | {authority, mint, totalUnits, unitsIssued, unitsOutstanding, periodsElapsed, isClosed})}'

printf '\n%sThe authority on-chain is the Vault key. Its private half has never existed outside Vault.%s\n\n' "$bold" "$reset"
