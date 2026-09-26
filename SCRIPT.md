# The script — do this, say that

One file, in order. **Bold** is what you do. Quoted is what you say.
Everything runs in about 35 seconds of machine time, so the pace is yours.

## Before you hit record

**Run:** `./reset-demo.sh && ./preflight.sh` — all 11 green.
**Click Try** on the agent page for a fresh session. Never a pasted session URL.
**Pre-type in terminal history:** the sqlite query and `./tests/e2e.sh`.
**Put the three prompts in a text file** to paste. Do not type them on camera.

---

**Camera on you. Nothing shared yet.**

> "I approved the same payment twice today, and both times I was right to.
> That's the thing I want to show you."

**Share the screen. The agent page.**

> "That's an agent writing Python in a sandbox to work out what a denied
> insurance claim should be resubmitted for. It's not answering a question,
> it's doing a job.
>
> An agent doing a job with money needs three things. It has to think, a
> human has to decide, and something has to remember what was decided."
>
> "All synthetic. The amount mirrors a real denial, every record is
> fabricated."

**Show the config: connector, three tools, sandbox on, shield on `submit_claim`.**

> "Three tools. It can read a claim. It can prepare a correction, which mints
> an operation id on the server and fingerprints the exact payload. And it can
> submit, which is the only one that writes, and the only one shielded."

---

**Paste:** `Recover synthetic claim CLM-75377.`

**It runs about fifteen seconds. Talk over it — do not go silent.**

> "It reads the claim through MCP, computes in the sandbox, prepares the
> correction. Preparing can't move money. And it doesn't choose its own
> operation id — the payer mints that."

**The approval card appears. Point at `operation_id`, `claim_id`, `amount`.**

> "This is the waiter reading the order back."

**Read the amount out loud: seventy-five thousand, three hundred and seventy-seven.**

> "TrueForge stops the agent before the write and shows me exactly what it's
> about to do. That pause is the whole reason any of this is possible."

**Click Approve ONCE.** (Bug #508 — a double-click cancels the turn.)

**The receipt appears. Say the id out loud.**

> "RCPT-4DE2513D."

---

**Paste:** `Assume that acknowledgement was lost. Safely retry the same operation.`

**A second card appears. Stop. Point at it.**

> "It asks again. TrueForge doesn't hand out a reusable permission — every
> write gets its own pause, including this retry."

**Look at the camera, not the screen.**

> "And this is the part that matters now. A person retries once in a while.
> An agent retries as a matter of course — that's what makes it robust. So the
> rare case just became the normal case."

**Click Approve ONCE. Show `replay: true` and the receipt.**

> "Same receipt. RCPT-4DE2513D."

**Run:** `sqlite3 ledger.sqlite "SELECT claim_id, amount, receipt_id FROM ledger;"`

> "One row. Not two."

**Pause.**

> "I approved twice — and I had no way of knowing the second card was the same
> operation I'd already settled. The payer knew."

---

**Paste:** `Resubmit that same operation, but for 75378 instead.`

**It refuses in about four seconds, with no tool call. Let it land. This is not a failed take.**

> "I just asked it to change the amount. It won't. The instructions say never
> re-derive on a retry, and they held.
>
> But instructions are not a guarantee. A different model, a longer session, a
> reworded prompt, and that holds differently. So the real question is what
> happens when they don't."

**Run:** `./tests/e2e.sh` — **point at `PASS: rejected tampered payload`.**

> "The payer re-fingerprints the payload at commit. Different number, different
> fingerprint, refused, zero rows written. That check doesn't depend on the
> model behaving well.
>
> Every one of those approvals was correct on its own. Nothing compared them.
> The payer did."

---

**Still on screen, or back to camera — either works.**

> "Idempotency isn't new. Stripe has had it for a decade. What's new is that
> the thing retrying is an agent and the thing approving is a person.
>
> This is an application-side concern, not a harness one. The harness
> authorizes calls, and that's the right job for it. So I built the memory
> where the consequence lands — in the payer.
>
> TrueForge gives me the pause, the sandbox, and the trace. The payer records
> what was approved and checks it at commit."

**Camera.**

> "An approval that only says yes stops being enough the moment the thing
> asking can change its mind."

**Pause.**

> "A yes should mean yes to *this*."

**Stop talking. Stop the recording.** No thanks, no sign-off, nothing after
that line.

---

## The five that decide the take

1. **Approve exactly once** per card.
2. **Say both receipt ids out loud** — the proof should be audio as well as pixels.
3. **Narrate over the fifteen-second run.** Dead air is the one thing you cannot fix later.
4. **Three lines go to camera, not screen:** the opening, the "agent retries by default" line, and the close.
5. **Add nothing after "yes to this."**

## If something breaks mid-take

Stop. `./reset-demo.sh`, `./preflight.sh`, start over. A clean four minutes
beats a salvaged four forty-five, and you have time for several takes.

## Q&A, if you are top ten

- *"Why not in the harness?"* → "I asked. It's app-side. That's where I put it."
- *"Isn't this what Okta is doing?"* → "Identity tells you who's asking. It
  doesn't tell you what you already answered."
- *Anything you don't know* → "I'd have to check — that lives in the payer and
  I'd want to look before I tell you something wrong."
