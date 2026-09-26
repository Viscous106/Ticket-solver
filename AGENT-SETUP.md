# Agent setup in TrueForge

The exact config to paste, so this is reproducible and not reconstructed
from memory at 3 PM.

## 1. Register the MCP server

Start the mock payer first:

```bash
cd Ticket-solver
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

## 6. Linear agent (`ticket-solver-linear`)

A second agent. `ticket-solver` above is left exactly as it is.

**Start TrueForge so it can reach the local payer.** TrueForge 0.2.x blocks
outbound calls to `localhost` by default (`Outbound URL blocked for host
"localhost"`). Allow only that host, rather than turning the guard off:

```bash
OUTBOUND_URL_ALLOWED_HOSTS='["localhost"]' npx @truefoundry/trueforge@0.2.1 --port 8790
```

**Connector.** Settings → Connectors → Linear (`https://mcp.linear.app/mcp`),
named `linear`. OAuth via the in-chat Connect button, or header auth with a
Linear API key **scoped to the Claims Demo team**. The key lives only in
TrueForge.

**Linear.** Team `Claims Demo`, label `claims`, one ticket per rehearsal:
`CLM-75377 denied — A8 ungroupable DRG`, description
`Synthetic claim CLM-75377 was denied with code A8 (ungroupable DRG). Please resubmit the correction.`

**Create.** The prompt and both skills are assembled by a script (skills are
inlined because the repo is private):

```bash
node agents/build-linear-agent.mjs | curl -s -X POST \
  http://localhost:8790/api/v1/agents -H 'Content-Type: application/json' -d @-
```

A `409` means the name already exists. Names cannot be reused; inspect it
with `GET /api/v1/agents?agent_name=ticket-solver-linear` instead of
retrying.

**Tools.** Six of Linear's 68, plus the three claims tools. Everything else
from Linear is not loaded.

| Tool | Approval |
|---|---|
| `list_issues`, `get_issue`, `list_comments`, `list_issue_statuses` | no |
| `save_comment`, `save_issue` | **yes** |
| `get_claim`, `prepare_resubmission` | no |
| `submit_claim` | **yes** |

Linear annotates `save_comment` and `save_issue` as destructive, so the
default `@destructive` policy would gate them anyway. They are named
explicitly so the policy does not depend on the server's annotations.

Check: the UI reads **9 selected · 3 need approval**.

**Task prompt.**

```
Work the oldest open claims ticket in Linear.
```

Expect three pauses on the happy path: `submit_claim`, `save_comment`,
`save_issue`. Click Approve once each.
