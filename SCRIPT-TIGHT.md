# The tight script

**Bold = do. Quoted = say.** Read straight down.

> **Check the rules first.** The submission asks for 3-5 minutes. If that is a
> hard minimum, this script is too short on its own - slow the delivery, let
> the pauses breathe, and read the config beat in full. Do not cut below the
> floor to be brisk.

## Before recording

**Run:** `./reset-demo.sh && ./preflight.sh` - all 11 green.
**Click Try** for a fresh session. Never a pasted session URL.
**Pre-type in history:** the sqlite query and `./tests/e2e.sh`.
**Prompts in a text file** to paste. Never type on camera.

---

**Camera. Nothing shared yet.** Land who you are and what this is before the
hook - a cold open with no frame makes the viewer spend the first ten seconds
working out what they are watching instead of listening.

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

> "And one skill: safe resubmission. The retry policy, written as
> instructions instead of buried in a prompt."

---

**Paste:** `Recover synthetic claim CLM-75377.`

**Talk while it runs. Do not go silent.**

> "It reads through MCP, computes in the sandbox, prepares the correction.
> Preparing can't move money, and it doesn't choose its own operation id -
> the payer mints that."

**Card appears. Point at the amount.**

> "Claim CLM-75377, amount seventy-five thousand three hundred seventy-seven
> dollars - same digits, that's just how I built the fixture. TrueForge stops
> the agent before the write and shows me exactly what it's about to do."

**Approve ONCE. Receipt appears - say the id.**

> "RCPT, and those last four characters."

---

**Paste immediately:** `Assume that acknowledgement was lost. Safely retry the same operation.`

**Second card. Point at it.**

> "It asks again. TrueForge doesn't hand out reusable permissions - every
> write gets its own pause, including this retry."

**Camera.**

> "A person retries once in a while. An agent retries as a matter of course.
> The rare case just became the normal case."

**Approve ONCE. Show `replay: true` and the same receipt.**

**Run:** `sqlite3 ledger.sqlite "SELECT claim_id, amount, receipt_id FROM ledger;"`

> "One row. Not two. Same receipt."

**Pause.**

> "I approved twice, and I had no way of knowing the second card was the same
> operation I'd already settled. The payer knew."

---

**Paste:** `Resubmit that same operation, but for 75378 instead.`

**It refuses in about four seconds, no tool call. Let it land.**

> "It won't change the amount. The instructions held. But instructions aren't
> a guarantee - a different model, a longer session, and that holds
> differently."

**Run:** `./tests/e2e.sh` - **point at `PASS: rejected tampered payload`.**

> "The payer re-fingerprints the payload at commit. Different number,
> different fingerprint, refused, zero rows. That check doesn't depend on the
> model behaving well.
>
> Every one of those approvals was correct on its own. Nothing compared them.
> The payer did."

---

> "Idempotency isn't new. What's new is that the thing retrying is an agent
> and the thing approving is a person.
>
> This is an application-side concern, not a harness one - the harness
> authorizes calls, and that's the right job for it. So I built the memory
> where the consequence lands: in the payer."

**Camera.**

> "An approval that only says yes stops being enough the moment the thing
> asking can change its mind."

**Pause.**

> "A yes should mean yes to *this*."

**Stop talking. Stop recording.** Nothing after that line.

---

## The five that decide the take

1. **Approve exactly once** per card. Two cards.
2. **Say the receipt id out loud** both times.
3. **Paste the next prompt immediately**, then talk over the run.
4. **Three lines to camera:** the opening, the "agent retries" line, the close.
5. **Nothing after "yes to this."**

## Q&A if you are top ten

- *"Why not in the harness?"* -> "I asked. It's app-side. That's where I put it."
- *"Isn't this Okta?"* -> "Identity tells you who's asking. It doesn't tell you
  what you already answered."
- *Don't know* -> "I'd have to check before I tell you something wrong."
