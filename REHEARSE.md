# Rehearsal kit

Four runs. Each one has a different job. Do not skip to recording.

Before every single run:

```bash
./reset-demo.sh && ./preflight.sh
```

If preflight is not all green, fix that first. Never rehearse on a dirty
ledger — "one row" is the whole proof and you want to see it land cleanly
every time.

---

## Run 1 — silent (DONE)

Watch it. Learn the rhythm. No talking.

You did this. The loop works: sandbox ran, pause appeared, approve once
committed, retry replayed the same receipt, one row.

## Run 2 — words, no timer

Say the lines out loud while it runs. Clumsy is fine. The only goal is to
find the places where you do not know what to say, so you can fix them
before they cost you a take.

**Expect dead air** while the agent works (roughly 0:50-1:30 and again on
the retry). That is the hardest part of the whole video. Fill it with the
lines marked FILL below — do not narrate what is on screen, the judge can
see it.

## Run 3 — with a timer

Target 3:30. Under 4:00 is required.

If you are over, cut from the middle (the config walkthrough), never from
the ending. The last twenty seconds are the whole point.

## Run 4 — dress rehearsal

Exactly as you will record it. Screen shared, camera on, mic on, notifications
off. Do not actually record. If this run is clean, record immediately after
while it is still in your hands.

---

# The script

Times are targets, not marks to hit exactly.

## 0:00-0:20 — Open cold on the sandbox

Have Code Mode already visible on screen. Do not start with a slide or a face.

> "That's an agent writing Python, in a sandbox, working out what a denied
> insurance claim should be resubmitted for. It isn't answering a question.
> It's doing a job.
>
> An agent doing a job with money needs three things: it has to think, a
> human has to decide, and something has to remember what was decided."

Then, once, plainly:

> "All the data here is synthetic."

## 0:20-0:50 — The harness

Show the agent config. Point at the three tools and the shield.

> "This is TrueForge. Three tools over MCP. It can read a claim. It can
> prepare a correction — that mints an operation id on the server and
> fingerprints the exact payload. And it can submit, which is the only one
> that writes, and the only one shielded."

## 0:50-1:30 — Think

Fresh session, paste:

```
Recover synthetic claim CLM-75377.
```

**FILL while it works:**

> "It's reading the claim through MCP, then computing in the sandbox. Notice
> it doesn't pick its own operation id — the payer mints that, so the model
> can't invent one."

## 1:30-2:05 — Decide

Approval card appears. Point at `operation_id`, `claim_id`, `amount`.
Read the amount out loud. **Click Approve ONCE.**

> "This is the waiter reading your order back. TrueForge stops the agent
> before the write and shows me exactly what it's about to do. That pause is
> the only reason anything else here is possible."

Receipt comes back. Say the receipt id out loud — you will need it in forty
seconds.

## 2:05-2:45 — Remember, part one

Paste:

```
Assume that acknowledgement was lost. Safely retry the same operation.
```

It pauses again. **Name that as a feature before anyone can read it as a bug:**

> "It asks again. TrueForge doesn't hand out a reusable permission — every
> write gets its own pause, including this retry."

**Approve ONCE.** Then:

```bash
sqlite3 ledger.sqlite "SELECT claim_id, amount, receipt_id FROM ledger;"
```

> "One row. Not two. Same receipt.
>
> I approved twice. And I had no way of knowing that second card was an
> operation I'd already settled. The payer knew."

## 2:45-3:05 — The moment

```bash
./tests/e2e.sh
```

Point at `PASS: rejected tampered payload`.

> "And if the retry comes back with a different number, because the model
> re-derived it, I get another card that looks just like the last one. I say
> yes again. The payer refuses it, because the fingerprint doesn't match what
> I approved the first time.
>
> Every one of those approvals was correct on its own. Nothing compared them.
> That's the gap."

## 3:05-3:20 — The boundary

Say this plainly. It is what makes everything else credible.

> "TrueForge's approval is allow or deny on one specific pending call. It is
> not cryptographically bound to the arguments, and I'm not claiming it is.
> The harness gives me the pause, the sandbox, and the trace. The payer
> records what was approved and checks it at commit."

## 3:20-3:30 — Close, then stop talking

> "An approval that only says yes stops being enough the moment the thing
> asking can change its mind.
>
> A yes should mean yes to *this*."

**Stop. Do not add anything.** The instinct to keep talking after the last
line is what turns a 3:30 into a 4:30.

---

# Delivery notes

**Slow down on three lines only:** the restaurant line, "one row, not two,"
and the final line. Everything else can move.

**Do not apologise for the mock payer.** State it once in the boundary beat
and move on. Hedging reads as weakness; one clear sentence reads as rigour.

**Do not double-click Approve.** Bug #508 cancels the turn it just approved.
Click, then take your hand off the mouse.

**If the agent takes a detour** (it sometimes inspects a tool schema first),
say "it's checking the tool contract" and carry on. Do not restart for this.

**If a take goes wrong in the first minute,** stop and restart. It costs
three minutes. If it goes wrong at 2:30, still stop — you have time.

---

# Recording setup

- Browser text enlarged so a judge on a laptop can read the approval card
- Terminal font up, light background if your theme is dark and low contrast
- Notifications off (Do Not Disturb)
- Close every window except TrueForge and one terminal
- Camera and mic on — the organiser asked for it
- Commands already in shell history so you press Up, not type

Record with QuickTime (Cmd+Shift+5) or Google Meet. QuickTime is easier to
retake.
