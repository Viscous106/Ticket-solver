#!/usr/bin/env bash
# Reset to a clean state between takes. "Exactly one ledger row" is the
# proof the whole demo rests on, so recording over a dirty ledger destroys
# the punchline.

set -euo pipefail
cd "$(dirname "$0")"

# Stop the payer if it is running
if lsof -ti :9123 >/dev/null 2>&1; then
  lsof -ti :9123 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

rm -f ledger.sqlite ledger.sqlite-wal ledger.sqlite-shm

nohup node server/mcp-server.mjs > /tmp/two-key-mcp.log 2>&1 &
disown
sleep 1

if curl -sf -m 3 http://localhost:9123/health >/dev/null 2>&1; then
  echo "reset: clean ledger, payer up on :9123"
else
  echo "reset: FAILED to start payer - check /tmp/two-key-mcp.log"
  exit 1
fi
