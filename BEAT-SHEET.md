# Beat sheet — 3:30 target

Structure: **think / decide / remember.** TrueForge does the first two. The
third is what this repo adds.

Rules for this recording:

- **Do not claim the agent can reuse an old approval.** It cannot. TrueForge
  pauses on every shielded call, including retries — verified live, two
  attempts produced two separate pauses. Claiming otherwise gets the video
  dismissed by the one audience that matters.
- **Click Approve exactly ONCE per pause.** Bug #508.
- `./preflight.sh` immediately before recording. All 9 must pass.
- `./reset-demo.sh` between every take.
- Terminal commands pre-typed in history, not typed live.

---

## 0:00–0:20 — Open on the sandbox

Screen already up, Code Mode visible with Python running.

> "That's an agent writing Python, in a sandbox, to work out what a denied
> insurance claim should be resubmitted for. It's not answering a question.
> It's doing a job.
>
> An agent doing a job with money needs three things: it has to think, a
> human has to decide, and something has to remember what was decided."

Say the data boundary once:

> "All synthetic. The amount mirrors a real denial; every record is fabricated."

## 0:20–0:50 — Think

Show the agent config: local MCP connector, three tools, sandbox on,
`submit_claim` marked as the only shielded one.

> "Three tools. It can read a claim. It can prepare a correction — that mints
> an operation id on the server and fingerprints the exact payload. And it can
> submit, which is the only one that writes, and the only one shielded."

## 0:50–1:30 — The agent works

Fresh session. Paste:

```
Recover synthetic claim CLM-75377.
```

Show: MCP read, Python in the sandbox, `prepare_resubmission` returning the
operation id and hash.

> "It reads the claim through MCP, computes in the sandbox, and prepares the
> correction. Preparing cannot move money. And it doesn't choose its own
> operation id — the payer mints that."

## 1:30–2:05 — Decide

The approval card pauses the turn. Point at `operation_id`, `claim_id`,
`amount`. Read the amount aloud. **Click Approve once.** Show the receipt.

> "This is the waiter reading the order back. TrueForge stops the agent before
> the write and shows me exactly what it's about to do. That pause is the
> whole reason any of this is possible."

## 2:05–2:45 — Remember, part one

Paste:

```
Assume that acknowledgement was lost. Safely retry the same operation.
```

**Note out loud that it pauses again** — this is a feature, not a gap:

> "It asks again. TrueForge doesn't hand out a reusable permission — every
> write gets its own pause, including this retry."

**Approve once.** Show `replay: true`, the same receipt, then:

```bash
sqlite3 ledger.sqlite "SELECT claim_id, amount, receipt_id FROM ledger;"
```

> "One row. Not two. Same receipt. I approved twice — and I had no way of
> knowing the second card was the same operation I'd already settled. The
> payer knew."

## 2:45–3:05 — Remember, part two (the moment)

```bash
./tests/e2e.sh
```

Point at `PASS: rejected tampered payload`.

> "And if the retry comes back with a different number — because the model
> re-derived it — I get another card that looks just like the last one. I say
> yes again. The payer refuses it, because the fingerprint doesn't match what
> I approved the first time.
>
> Every one of those approvals was correct on its own. Nothing compared them.
> That's the gap."

## 3:05–3:20 — The boundary, stated plainly

> "TrueForge's approval is allow or deny on one specific pending call. It is
> not cryptographically bound to the arguments, and I'm not claiming it is.
> The harness gives me the pause, the sandbox, and the trace. The payer
> records what was approved and checks it at commit."

## 3:20–3:30 — Close, then stop

> "An approval that only says yes stops being enough the moment the thing
> asking can change its mind.
>
> A yes should mean yes to *this*."

End. Nothing after this line.

---

## If something breaks mid-take

Stop. `./reset-demo.sh`, `./preflight.sh`, start over. A clean 3:30 beats a
salvaged 4:30, and you have time for several takes.
