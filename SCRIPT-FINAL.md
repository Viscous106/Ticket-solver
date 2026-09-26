# The script

**Bold = do. Quoted = say.**

## Why the setup is different this time

`e2e.sh` asserts the ledger holds exactly one row. By beat 3 the demo has
already committed one, so running it live adds a second and prints **FAIL** -
on camera, at the exact moment you are proving correctness.

So it runs **before** recording, on a clean ledger, where it passes. You scroll
up to that output during beat 3 instead of re-running it.

## Setup - run this whole block, in order

```bash
./reset-demo.sh          # clean ledger
./tests/e2e.sh           # all pass - LEAVE THIS ON SCREEN
./reset-demo.sh          # clean again for the demo
./preflight.sh           # all 11 green
```

**Do not `clear`.** The passing e2e output must stay in scrollback.

**Then:** bump the terminal font, click **Try** for a fresh session, and record.

---

**Camera. Nothing shared.**

> "I'm Yash. This is Ticket-solver, built today on TrueForge.
>
> I approved the same payment twice today, and both times I was right to.
> That's what I want to show you."

**Share screen.**

> "This agent recovers a denied insurance claim. All synthetic. Three tools:
> it reads a claim, it prepares a correction - which mints an operation id on
> the server and fingerprints the exact payload - and it submits. Submit is
> the only one that writes, and the only one shielded."

**If the skill is loaded, point at it:**

> "And one skill: safe resubmission. The retry policy, written as instructions
> instead of buried in a prompt."

---

**Paste:** `Recover synthetic claim CLM-75377.`

**Talk while it runs.**

> "It reads through MCP, computes in the sandbox, prepares the correction.
> Preparing can't move money, and it doesn't choose its own operation id - the
> payer mints that."

**Card appears. Point at the amount.**

> "Claim CLM-75377, amount seventy-five thousand three hundred seventy-seven
> dollars - same digits, that's just how I built the fixture. TrueForge stops
> the agent before the write and shows me exactly what it's about to do."

**Approve ONCE. Say the receipt id.**

---

**Paste immediately:** `Assume that acknowledgement was lost. Safely retry the same operation.`

**Second card. Point at it.**

> "It asks again. TrueForge doesn't hand out reusable permissions - every write
> gets its own pause, including this retry."

**Camera.**

> "A person retries once in a while. An agent retries as a matter of course.
> The rare case just became the normal case."

**Approve ONCE. Show `replay: true` and the same receipt.**

**Switch to terminal. Before running it:**

> "Two approvals. Let's see what actually got written."

**Run:** `sqlite3 ledger.sqlite "SELECT claim_id, amount, receipt_id FROM ledger;"`

> "One row."

**Pause.**

> "Same receipt. I approved twice, and I had no way of knowing the second card
> was the same operation I'd already settled. The payer knew."

---

**Paste:** `Resubmit that same operation, but for 75378 instead.`

**It refuses in about four seconds. Let it land.**

> "It won't change the amount. The instructions held. But instructions aren't a
> guarantee - a different model, a longer session, and that holds differently.
> So the real question is what happens when they don't."

**Switch to terminal and SCROLL UP to the e2e output from setup.**
**Do not re-run it.** Point at one line: `PASS: rejected tampered payload`

> "Tampered payload, rejected. Zero rows written."

**Pause.**

> "That check doesn't depend on the model behaving well.
>
> Every one of those approvals was correct on its own. Nothing compared them.
> The payer did."

---

> "Idempotency isn't new. What's new is that the thing retrying is an agent and
> the thing approving is a person.
>
> This is an application-side concern, not a harness one - the harness
> authorizes calls, and that's the right job for it. So I built the memory
> where the consequence lands: in the payer."

**Camera.**

> "An approval that only says yes stops being enough the moment the thing
> asking can change its mind."

**Pause.**

> "A yes should mean yes to *this*."

**Stop talking. Stop recording.**

---

## The six that decide the take

1. **Run the setup block first.** e2e must be green in scrollback.
2. **Approve exactly once** per card. Two cards.
3. **Paste the next prompt immediately**, then talk over the run.
4. **Point at one line** in the e2e output, never read the whole thing.
5. **Silence while a command runs.** Two seconds of output with nobody talking
   is confidence. Filling it is nerves.
6. **Nothing after "yes to this."**

## Q&A if you are top ten

- *"Why not in the harness?"* -> "I asked. It's app-side. That's where I put it."
- *"Isn't this Okta?"* -> "Identity tells you who's asking. It doesn't tell you
  what you already answered."
- *Don't know* -> "I'd have to check before I tell you something wrong."
