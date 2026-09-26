#!/usr/bin/env bash
# End-to-end proof over the real MCP + HTTP surface, not just unit tests.
# Run with the server already up: node server/mcp-server.mjs
#
# This is the rehearsal script. If this passes, the demo works.

set -euo pipefail
BASE="http://localhost:9123"

mcp() {
  curl -s -m 5 "$BASE/mcp" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d "$1"
}

propose() {
  local amount="$1"
  mcp "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"prepare_resubmission\",\"arguments\":{\"claim_id\":\"CLM-75377\",\"amount\":$amount}}}" \
    | grep -o '"operation_id\\":\\"[a-f0-9-]*' | sed 's/.*\\":\\"//'
}

# Commit through the SHIELDED MCP tool, which is the path TrueForge actually
# drives. The HTTP /commit endpoint still exists for scripted tests, but the
# demo path is this one.
submit_via_mcp() {
  local op="$1" amount="$2"
  mcp "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"submit_claim\",\"arguments\":{\"operation_id\":\"$op\",\"claim_id\":\"CLM-75377\",\"amount\":$amount}}}"
}

post() {
  curl -s -m 5 -X POST "$BASE/$1" -H "Content-Type: application/json" -d "$2"
}

pass() { echo "  PASS: $1"; }
fail() { echo "  FAIL: $1"; exit 1; }

echo "== 1. happy path: prepare -> shielded submit -> one row =="
OP=$(propose 75377)
R=$(submit_via_mcp "$OP" 75377)
echo "$R" | grep -q '"ok\\":true' && pass "committed via shielded MCP tool" || fail "commit rejected: $R"
echo "$R" | grep -q '"replay\\":false' && pass "first commit, not a replay" || fail "unexpected replay: $R"

echo "== 2. lost-ack retry: same op, same payload -> replays, no second row =="
R2=$(submit_via_mcp "$OP" 75377)
echo "$R2" | grep -q '"replay\\":true' && pass "replayed original receipt" || fail "did not replay: $R2"
RCPT1=$(echo "$R"  | grep -o 'RCPT-[A-Z0-9]*' | head -1)
RCPT2=$(echo "$R2" | grep -o 'RCPT-[A-Z0-9]*' | head -1)
[ "$RCPT1" = "$RCPT2" ] && pass "same receipt id: $RCPT1" || fail "receipt changed: $RCPT1 vs $RCPT2"

echo "== 3. tampered amount after approval -> rejected =="
OP2=$(propose 75377)
R3=$(submit_via_mcp "$OP2" 99999)
echo "$R3" | grep -q 'payload_hash_mismatch' && pass "rejected tampered payload" || fail "tamper accepted: $R3"

echo "== 4. denied operation cannot commit =="
OP3=$(propose 75377)
post deny "{\"operation_id\":\"$OP3\",\"reason\":\"amount looks wrong\"}" > /dev/null
R4=$(post commit "{\"operation_id\":\"$OP3\",\"payload\":{\"claim_id\":\"CLM-75377\",\"amount\":75377}}")
echo "$R4" | grep -q 'cannot_submit_from_status_denied' && pass "denied op blocked" || fail "denied op committed: $R4"

echo
echo "== ledger state: these four scenarios wrote exactly ONE row =="
# Scoped to the operations THIS run created, not to the whole table. A global
# count would fail whenever the ledger already holds a row from a live demo,
# which says nothing about whether these scenarios behaved correctly.
node -e "
const Database = require('better-sqlite3');
const db = new Database('./ledger.sqlite', { readonly: true });
const mine = ['$OP', '$OP2', '$OP3'];
const q = mine.map(() => '?').join(',');
const rows = db.prepare('SELECT operation_id, claim_id, amount, receipt_id FROM ledger WHERE operation_id IN (' + q + ')').all(...mine);
const ops  = db.prepare('SELECT status, COUNT(*) n FROM operations WHERE operation_id IN (' + q + ') GROUP BY status').all(...mine);
const total = db.prepare('SELECT COUNT(*) n FROM ledger').get().n;
console.log('  operations by status:', JSON.stringify(ops));
console.log('  rows written by these scenarios:', rows.length, '(ledger holds', total, 'in total)');
rows.forEach(r => console.log('   ', JSON.stringify(r)));
if (rows.length !== 1) { console.error('  FAIL: expected 1 row from these scenarios, got ' + rows.length); process.exit(1); }
if (rows[0].operation_id !== '$OP') { console.error('  FAIL: the committed row is not the happy-path operation'); process.exit(1); }
console.log('  PASS: three operations attempted, exactly one row written');
db.close();
"
echo
echo "ALL SCENARIOS PASSED"
