#!/usr/bin/env bash
# Run this IMMEDIATELY BEFORE recording. Every check is one that has a
# silent failure mode on camera.
#
# The review called silent MCP discovery failure the single most likely
# way to lose: if port 9123 is dead, the agent sees no tools and the
# skills panel is blank. That looks like nothing happening, not like an
# error, and it is unrecoverable mid-take.

set -uo pipefail

PASS=0; FAIL=0
ok()   { echo "  OK   $1"; PASS=$((PASS+1)); }
bad()  { echo "  FAIL $1"; FAIL=$((FAIL+1)); }

echo "== preflight =="

# 1. Mock payer reachable
if curl -sf -m 3 http://localhost:9123/health >/dev/null 2>&1; then
  ok "mock payer on :9123"
else
  bad "mock payer NOT reachable - run: node server/mcp-server.mjs"
fi

# 2. MCP endpoint actually lists the three tools. A live HTTP server that
#    has stopped serving tools is the nastiest version of this failure.
TOOLS=$(curl -s -m 5 http://localhost:9123/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' 2>/dev/null)

for t in get_claim prepare_resubmission submit_claim; do
  if echo "$TOOLS" | grep -q "\"$t\""; then ok "tool: $t"; else bad "tool MISSING: $t"; fi
done

# 3. TrueForge up
if curl -sf -m 3 http://localhost:8790/api/v1/capabilities >/dev/null 2>&1; then
  ok "TrueForge on :8790"
else
  bad "TrueForge NOT reachable - run: npx @truefoundry/trueforge@latest"
fi

# 4. Sandbox enabled (a scored capability; silently off = a beat disappears)
if curl -s -m 3 http://localhost:8790/api/v1/capabilities 2>/dev/null | grep -q '"sandbox":{"enabled":true}'; then
  ok "sandbox enabled"
else
  bad "sandbox NOT enabled"
fi

# 5. TrueForge can see our connector
if curl -sf -m 5 http://localhost:8790/api/v1/mcp-servers/two-key-claims/tools >/dev/null 2>&1; then
  ok "connector registered in TrueForge"
else
  bad "connector NOT registered - see AGENT-SETUP.md step 1"
fi

# 6. Tests green
if npm test >/dev/null 2>&1; then ok "unit tests pass"; else bad "unit tests FAILING"; fi

# 7. Clean ledger. Recording over a dirty ledger ruins the punchline,
#    because "exactly one row" is the whole proof.
ROWS=$(node -e "
try {
  const D=require('better-sqlite3');
  const db=new D('./ledger.sqlite',{readonly:true});
  console.log(db.prepare('SELECT COUNT(*) n FROM ledger').get().n);
  db.close();
} catch(e) { console.log('0'); }
" 2>/dev/null)
if [ "$ROWS" = "0" ]; then
  ok "ledger is clean (0 rows)"
else
  bad "ledger has $ROWS row(s) - run: ./reset-demo.sh"
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "ALL $PASS CHECKS PASSED - safe to record"
  exit 0
else
  echo "$FAIL CHECK(S) FAILED - DO NOT RECORD YET"
  exit 1
fi
