# Run the demo

Everything here has been executed and works. This is a script to follow, not
a plan to figure out.

## Before every take

```bash
./reset-demo.sh     # clean ledger, payer restarted
./preflight.sh      # must print ALL CHECKS PASSED
```

Open TrueForge at http://localhost:8790, go to the `Ticket-solver` agent, start
a **new session**.

Two browser tabs, nothing else. One terminal, font size up.

---

## What you type, in order

**Turn 1** — paste exactly:

```
Recover synthetic claim CLM-75377.
```

The agent will: list tools, read the claim through MCP inside the sandbox,
compute in Python, call `prepare_resubmission`, then call `submit_claim` and
**stop**.

An approval card appears showing `operation_id`, `claim_id`, `amount`.

→ **Click Approve ONCE.** Do not click twice. Bug #508 cancels the turn.

It resumes and returns `RCPT-…`.

**Turn 2** — paste exactly:

```
Assume that acknowledgement was lost. Safely retry the same operation.
```

It pauses again. → **Click Approve ONCE.**

Result: `"replay": true` and **the same receipt id as turn 1**.

**Then, in the terminal:**

```bash
sqlite3 ledger.sqlite "SELECT claim_id, amount, receipt_id FROM ledger;"
```

One row. Say "one row, not two."

**Then show the refusal** (pre-typed, run it live):

```bash
./tests/e2e.sh
```

Point at `PASS: rejected tampered payload`.

---

## What you say, beat by beat

Full wording is in [BEAT-SHEET.md](./BEAT-SHEET.md). The short form:

| Time | Beat | The line |
|---|---|---|
| 0:00 | Restaurant | "The waiter reads the order back. You say yes." |
| 0:20 | Why it never mattered | "Software retrying sends the identical thing. An agent re-derives." |
| 0:40 | The harness | "Three tools. Only one moves money. That's the only one shielded." |
| 1:05 | Agent works | "Reads the claim, computes in the sandbox, prepares it. Preparing can't move money." |
| 1:40 | The yes | "That pause is the only reason this works." (Approve once) |
| 2:15 | The retry | "One row. Not two. Same receipt." |
| 2:45 | The refusal | "Different number, same approval. Refused." |
| 3:00 | The boundary | "TrueForge's approval isn't bound to arguments. I'm not claiming it is." |
| 3:20 | Close | "A yes should mean yes to *this*." Stop. |

---

## Known rough edges, and what to say if they happen

**The agent takes a detour in the sandbox.** It sometimes inspects tool
schemas before calling them. Harmless. If it happens, say "it's checking the
tool contract first" and move on. Do not restart for this.

**A turn dies silently** (issue #447, ~1 in 3 on long turns). Compaction is
off and the turns are short, so this is unlikely. If it happens: stop the
take, `./reset-demo.sh`, start over. Do not try to salvage it.

**Approval buttons stay enabled after clicking.** Known UI bug. Click once,
wait, do not click again.

**The payer died.** `./preflight.sh` catches this before you record. If it
happens mid-take, stop and reset.

---

## The rule

A clean 3:30 beats a salvaged 4:30. If a take goes wrong in the first minute,
stop and start over — it costs three minutes. If it goes wrong at 2:30, still
stop. You have time for several takes.
