# Ticket-solver

When you order at a restaurant, the waiter reads the order back. You say yes.
That is so you get what you agreed to, not what he remembers on the second
trip to the kitchen.

Software never needed that. A computer retrying a payment sends the identical
bytes every time. **An agent does not replay. It re-derives** — and can come
back with a different number, entirely sincere that it is the same request.

TrueForge handles the first half of this properly: every call to a shielded
tool pauses, including the retry. Two attempts means two pauses. The harness
does not hand out a reusable permission.

What no approval UI can do is remember. Each yes is judged on its own. A
human approving a stream of near-identical pauses has no way to see that this
operation was already settled, or that the amount moved between the first
pause and the second. **The approvals are individually correct and
collectively blind.**

So the yes has to carry what it approved. Not *yes, go ahead*. **Yes — to
this.**

An agent may prepare a $75,377 claim correction on its own. It may not commit
one on its own. Committing takes two things: a human decision, and a payload
that still matches what that human was shown.

Built on [TrueForge](https://github.com/truefoundry/trueforge) for the
TrueFoundry Agent Harness Hackathon, 2026-09-19.

**All data here is synthetic.** The amount mirrors a real denial, but every
name, record, and identifier in this repository is fabricated. There is no
patient data of any kind.

## The problem

An idempotency key solves the classic retry: same key, same request, one
effect. Stripe shipped that in 2015. It rests on an assumption nobody writes
down, because for thirty years it was free:

> **A retry is a replay of the same request.**

That held because the thing retrying was deterministic code. Same inputs in,
same bytes out.

An LLM retrying is not a replay. It is a re-derivation. The model may produce
different arguments and still believe it is doing the same task. So an
idempotency key keyed on the operation alone will happily commit the *wrong
payload* under the *right key*.

Nothing is broken here. The assumption was quietly invalidated by a new kind
of client.

### What TrueForge already does, and what it cannot

To be precise, because this is the part that is easy to overstate:

TrueForge's approval references **one specific pending tool call**. It is not
a permission the agent keeps. A retry is a new tool call, so it raises its own
`tool.approval_required` and pauses again. Verified in a live session: two
submit attempts produced two separate pauses with different tool call ids.

So the agent cannot smuggle a changed payload past an old approval. The
harness is doing its job.

What the harness cannot do is **relate one approval to another**. Each
decision is allow or deny on the call in front of you, and it records only
that the call was permitted — not what it contained, and not whether the same
operation was already approved and settled a minute ago. Every yes is correct
in isolation. Nothing compares them.

That is the gap this repository closes, and it is a narrower claim than
"approval is broken." Approval here binds two things that must both hold:

1. an `operation_id` the model cannot mint (server-generated), and
2. a SHA-256 hash of the exact payload that was prepared.

Approval authorizes **one payload**. A retry carrying different arguments
fails the hash check even though the operation id is correct.

### Before and after

```
before                                   after
------                                   -----
agent: prepare $75,377                   agent: prepare $75,377
human: APPROVE  (pause 1)                human: APPROVE  (pause 1)
        -> committed, receipt R1                 -> committed, receipt R1

[acknowledgement lost]                   [acknowledgement lost]

agent: retry                             agent: retry
human: APPROVE  (pause 2, looks          human: APPROVE  (pause 2, same)
        identical, no memory of R1)
        -> SECOND ledger row                     -> payer sees the operation
                                                    already settled
                                                 -> replays R1, ONE row

agent: retry, re-derived as $95,000      agent: retry, re-derived as $95,000
human: APPROVE  (pause 3 - a tired       human: APPROVE  (pause 3 - same
        reviewer sees another                     tired reviewer, same click)
        near-identical card)                   -> hash mismatch, REFUSED
        -> PAYS $95,000
```

TrueForge raises all three pauses in both columns. The difference is whether
anything downstream remembers what the earlier ones decided.

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

The shield is on the tool that writes.

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

Written out because a demo that overstates itself is worse than a smaller one
that does not.

- **The payer is a mock.** It has no adjudication logic. The fixture supplies
  the corrected amount; the agent does not derive it from clinical rules, and
  nothing here is a production claims engine.
- **The ledger is local SQLite.** Committing writes a row. No money moves.
- **TrueForge does pause every shielded call, including retries.** It does not
  hand out reusable permissions, and this repo does not claim it does. What it
  does not do is relate one approval to another — that is the gap being closed.
- **TrueForge's approval is not cryptographically bound to arguments.** The
  binding is enforced here, in the payer, at commit time. That placement is
  deliberate rather than a workaround: relating one approval to another is an
  application-side concern, confirmed as such by TrueFoundry before this was
  recorded. The harness authorizes calls, which is the right job for it. The
  memory belongs where the consequence lands.
- **The HTTP endpoints are unauthenticated and the MCP handler records its own
  approval.** Anything that can reach the port can call them. In production
  the payer would authenticate its caller and accept an approval only from the
  harness. That is not built here.
- Nothing in this repository constitutes medical, billing, or legal advice.

## Licence

MIT.
