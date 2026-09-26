# Agent setup in TrueForge

The exact config to paste, so this is reproducible and not reconstructed
from memory at 3 PM.

## 1. Register the MCP server

Start the mock payer first:

```bash
cd two-key
node server/mcp-server.mjs     # http://localhost:9123/mcp
```

Then register it with TrueForge (no tunnel needed in local mode):

```bash
curl -s http://localhost:8790/api/v1/settings/mcp-servers \
  -H 'Content-Type: application/json' \
  -d '{"manifest":{"type":"remote","name":"two-key-claims",
       "url":"http://localhost:9123/mcp",
       "description":"Claims read + corrected-resubmission proposal"}}'
```

Verify both tools are discovered:

```bash
curl -s http://localhost:8790/api/v1/mcp-servers/two-key-claims/tools
```

## 2. Agent config

The approval line is the one that matters. `submit_claim` is the write, so
it is the shielded tool.

```json
{
  "name": "two-key-claims",
  "enable_tools": ["@all"],
  "require_approval_for_tools": ["submit_claim"]
}
```

In the UI: pick the tools, click the shield icon on `submit_claim`.
The counter should read "2 selected · 1 need approval".

## 3. Runtime config

| Setting | Value | Why |
|---|---|---|
| `sandbox` | **on** | The correction is computed in the sandbox. This is a scored capability and it must be visible. |
| `context_management.compaction` | **off** | Issue #447: ~1 in 3 long turns die, correlated with compaction. The demo turn is short; we do not need it. |
| `iteration_limit` | 20 | Default is 100. A short leash keeps the turn short and the trace readable. |
| `large_tool_response` | on (default) | Harmless here, responses are small. |
| `ask_user_questions` | off | Keeps the demo turn deterministic. |
| `dynamic_sub_agents` | off unless used deliberately | Do not enable a capability we do not show. |

## 4. The task prompt

Give the agent the job, not the steps. The point is that the harness does
the work, so do not hand-hold it through the tool calls.

```
Claim CLM-75377 was denied with code A8 (ungroupable DRG). Read the claim,
work out the corrected resubmission amount in the sandbox, showing your
arithmetic, then submit the correction for approval.
```

## 5. Demo hygiene — read before recording

- **Click Approve exactly ONCE.** Issue #508: the UI leaves the approval
  buttons enabled while the approval turn is running, and a double click
  cancels the turn it just approved. This sits directly under the centerpiece
  of the demo.
- **Do not upgrade TrueForge today.** Pinned to 0.2.0. Two open PRs (#815,
  #807) change the approval lifecycle.
- Connectors and skills cannot be fully deleted (#494/#498). Name things
  correctly the first time.
- Keep the turn short. See compaction note above.
