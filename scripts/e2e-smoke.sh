#!/usr/bin/env bash
# Usage: SERVER_URL=http://localhost:3000 AUTH_TOKEN=secret bash scripts/e2e-smoke.sh
set -euo pipefail

SERVER="${SERVER_URL:-http://localhost:3000}"
TOKEN="${AUTH_TOKEN:-}"

echo "==> Testing $SERVER"

# Health check
health=$(curl -sf "$SERVER/health")
echo "Health: $health"

# Save item
item=$(curl -sf -X POST "$SERVER/items" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"url":"https://example.com/e2e-test","title":"E2E Test Item"}')
echo "Created: $item"
ITEM_ID=$(echo "$item" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Item ID: $ITEM_ID"

# Pull and verify item appears
pull=$(curl -sf "$SERVER/sync/pull?cursor=0" -H "Authorization: Bearer $TOKEN")

if echo "$pull" | python3 -c "import sys,json; data=json.load(sys.stdin); found=any(c['id']=='$ITEM_ID' for c in data['changes']); exit(0 if found else 1)"; then
  echo "PASS: item found in pull response"
else
  echo "FAIL: item NOT found in pull response"
  exit 1
fi

# Archive via PATCH and verify via pull
curl -sf -X PATCH "$SERVER/items/$ITEM_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"status":"archived"}' > /dev/null

pull2=$(curl -sf "$SERVER/sync/pull?cursor=0" -H "Authorization: Bearer $TOKEN")
status=$(echo "$pull2" | python3 -c "
import sys, json
data = json.load(sys.stdin)
item = next((c for c in data['changes'] if c['id'] == '$ITEM_ID'), None)
print(item['status'] if item else 'NOT_FOUND')
")
if [ "$status" = "archived" ]; then
  echo "PASS: item archived successfully"
else
  echo "FAIL: expected archived, got $status"
  exit 1
fi

echo "==> All smoke tests passed"
