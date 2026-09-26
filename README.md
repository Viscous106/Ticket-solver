# Two-Key

An agent may prepare a $75,377 claim correction on its own. It may not commit
one on its own. Committing takes two keys: a human decision, and a payload
that still matches what was prepared.

Built on [TrueForge](https://github.com/truefoundry/trueforge) for the
TrueFoundry Agent Harness Hackathon, 2026-09-19.

**All data here is synthetic.** The amount mirrors a real denial, but every
name, record, and identifier in this repository is fabricated. There is no
patient data of any kind.

## The problem

An idempotency key solves the classic retry: same key, same request, one
effect. Stripe shipped that in 2015.

Agents break the assumption underneath it. When a human client retries, it
replays the same bytes. **When an agent retries, the model regenerates its
arguments** — and may produce a different amount. An idempotency key keyed on
the operation alone will happily commit the wrong payload under the right key.

So the second key binds two things that must both hold:

1. an `operation_id` the model cannot mint (server-generated), and
2. a SHA-256 hash of the exact payload that was prepared.

Approval authorizes **one payload**. A retry carrying different arguments
fails the hash check even though the operation id is correct.

## What TrueForge does, and what this repo does

Stated plainly, because the boundary is the interesting part.

**TrueForge supplies:** the agent loop, MCP tool discovery and invocation,
sandboxed Python execution, the pause before a shielded tool runs, the human
allow/deny decision, session persistence across turns, and the event trace.

**This repo supplies:** the argument invariant.

TrueForge 0.2.0's approval decision is only `{"status":"allow"}` or
`{"status":"deny","reason":"..."}` against a pending tool call. It is **not**
cryptographically bound to argument values. The reviewer does see the full
arguments, but the decision carries none of them. So the payload binding is
enforced in the payer endpoint, not in the harness.

That is not a workaround. The harness pausing the agent and showing a human
the exact arguments is the only reason a second key can exist at all —
without that pause there is no moment to bind anything to.

## Tools

| Tool | Writes? | Shielded |
|---|---|---|
| `get_claim` | no | no |
| `prepare_resubmission` | no — mints `operation_id` + hash | no |
| `submit_claim` | **yes — commits to the ledger** | **yes** |

The shield is on the tool that moves money.

## Behaviour

| Scenario | Result |
|---|---|
| Prepare → approve → submit | one ledger row, receipt returned |
| Denied operation → submit | rejected, zero rows |
| Lost acknowledgement → identical retry | **one row**, original receipt replayed |
| Amount changed after approval | rejected, `payload_hash_mismatch`, zero rows |

Ledger rows are immutable: `UPDATE` and `DELETE` triggers reject mutation.

## Run it

Requires Node 22.14+.

```bash
npm install
npm test                      # four deterministic scenarios
node server/mcp-server.mjs    # payer + MCP on http://localhost:9123/mcp
```

In another terminal:

```bash
npx @truefoundry/trueforge@latest   # http://localhost:8790
```

Register the connector (no tunnel needed — both run locally):

```bash
curl -s http://localhost:8790/api/v1/settings/mcp-servers \
  -H 'Content-Type: application/json' \
  -d '{"manifest":{"type":"remote","name":"two-key-claims",
       "url":"http://localhost:9123/mcp",
       "description":"Claims read + corrected-resubmission"}}'
```

Then configure one agent with `require_approval_for_tools: ["submit_claim"]`.
Full settings, including which runtime toggles matter and why, are in
[AGENT-SETUP.md](./AGENT-SETUP.md).

Ask the agent:

> Recover synthetic claim CLM-75377.

### Verifying end to end

```bash
./preflight.sh        # payer, tools, TrueForge, sandbox, connector, tests, clean ledger
./tests/e2e.sh        # all four scenarios over real MCP + HTTP
./reset-demo.sh       # clean ledger between runs
```

## Honest boundaries

- The payer is a mock. It has no adjudication logic and makes no claim to be
  a production claims engine.
- TrueForge 0.2.0 does not bind approvals to argument values. This repo does
  not imply otherwise.
- In production the payer would also authenticate its caller. It does not here.
- Nothing in this repository constitutes medical, billing, or legal advice.

## Licence

MIT.
