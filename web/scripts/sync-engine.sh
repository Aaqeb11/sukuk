#!/usr/bin/env bash
# Copies the screening engine from api/ into web/lib/engine so the site runs
# the same code the API runs.
#
#   bash scripts/sync-engine.sh          copy
#   bash scripts/sync-engine.sh --check  fail if web/ has drifted from api/
#
# One transformation is applied, and only one: relative import specifiers lose
# their ".js" suffix ("./operators.js" -> "./operators"). The API compiles under
# NodeNext, which requires the suffix; Turbopack resolves the bare path instead.
# --check applies the same transformation before comparing, so any other
# difference — a changed operator, a changed condition — fails the check.
set -euo pipefail

cd "$(dirname "$0")/.."

API=../api
ENGINE=lib/engine

# Strip ".js" from relative imports only: from './x.js' / from "../y.js"
strip_js() { sed -E "s#(from ['\"]\.{1,2}/[^'\"]*)\.js(['\"])#\1\2#g" "$1"; }

TS_FILES=(
  "src/compliance/evaluator.ts:compliance/evaluator.ts"
  "src/compliance/operators.ts:compliance/operators.ts"
  "src/compliance/field-path.ts:compliance/field-path.ts"
  "src/assets/asset.types.ts:assets/asset.types.ts"
  "src/templates/template.types.ts:templates/template.types.ts"
)
DATA_FILES=(
  "src/templates/ijara-real-estate-v1.json:templates/ijara-real-estate-v1.json"
  "fixtures/ast-001.json:fixtures/ast-001.json"
  "fixtures/ast-002.json:fixtures/ast-002.json"
  "fixtures/ast-003.json:fixtures/ast-003.json"
)

if [[ "${1:-}" == "--check" ]]; then
  status=0
  for pair in "${TS_FILES[@]}"; do
    src="$API/${pair%%:*}"; dst="$ENGINE/${pair##*:}"
    if ! diff -q <(strip_js "$src") "$dst" >/dev/null; then
      echo "DRIFT: $dst differs from $src"; status=1
    fi
  done
  for pair in "${DATA_FILES[@]}"; do
    src="$API/${pair%%:*}"; dst="$ENGINE/${pair##*:}"
    if ! diff -q "$src" "$dst" >/dev/null; then
      echo "DRIFT: $dst differs from $src"; status=1
    fi
  done
  [[ $status -eq 0 ]] && echo "engine in sync with api/ — run 'bun run sync:engine' if not"
  exit $status
fi

mkdir -p "$ENGINE"/{compliance,assets,templates,fixtures}
for pair in "${TS_FILES[@]}"; do
  strip_js "$API/${pair%%:*}" > "$ENGINE/${pair##*:}"
done
for pair in "${DATA_FILES[@]}"; do
  cp "$API/${pair%%:*}" "$ENGINE/${pair##*:}"
done
echo "synced engine from api/ into $ENGINE"
