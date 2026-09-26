# Beat sheet — 3:35 target

Rules for this recording:

- **Small and concrete for the first three minutes. One sentence of
  implication at the end. Then stop talking.** If the big claim opens the
  video it sounds like a keynote. If the judge arrives at it themselves after
  watching one claim get refused, it lands as their own thought.
- **Click Approve exactly ONCE.** Bug #508: the buttons stay enabled while
  the approval turn runs, and a double click cancels the turn it just
  approved. This sits directly under the centrepiece.
- Run `./preflight.sh` immediately before recording. Do not skip it.
- Terminal commands are pre-typed in history, not typed live.

---

## 0:00–0:20 — The restaurant

Camera on. No screen yet.

> "When you order at a restaurant, the waiter reads the order back to you.
> You say yes. That's so you get what you agreed to, not what he remembers
> on the second trip to the kitchen.
>
> Software never needed that."

## 0:20–0:40 — Why it never mattered

> "A computer retrying a payment sends the identical thing every time. So we
> built approval as a yes-or-no button, and for thirty years that was fine.
>
> An agent doesn't replay. It re-derives. It can come back with a different
> number, holding your approval, and genuinely believe it's the same request."

State the data boundary once, plainly, and move on:

> "Everything here is synthetic. The amount mirrors a real denial. Every
> name and record is fabricated."

## 0:40–1:05 — The harness, not a wrapper

Screen on. TrueForge agent config.

Show: the local MCP connector, three discovered tool schemas, sandbox on,
iteration limit 12, and `submit_claim` marked as the only shielded tool.

> "This runs on TrueForge. Three tools. Only one of them moves money, and
> that's the only one that's shielded."

## 1:05–1:40 — The agent does the work

Fresh session. Type only:

> `Recover synthetic claim CLM-75377.`

Show Code Mode running Python in the sandbox, the MCP read, and the
server-minted operation id and hash coming back.

> "It reads the claim, works out the correction in the sandbox, and prepares
> it. Preparing can't move money. The operation id is minted by the payer —
> the model can't invent one."

## 1:40–2:15 — The yes

The approval card pauses the turn.

Point at `operation_id`, `claim_id`, `amount`. Read the amount aloud.
**Click Approve once.** Let it resume. Show the receipt.

> "That's the waiter reading it back. TrueForge pauses the agent and shows
> me the exact arguments. That pause is the only reason any of this works —
> without it there's no moment to bind anything to."

## 2:15–3:00 — The retry

Same session, second turn:

> `Assume that acknowledgement was lost. Safely retry the same operation.`

Approve once. Show `replay: true` and the identical receipt. Then the
terminal:

```
sqlite3 ledger.sqlite "SELECT * FROM ledger;"
```

> "One row. Not two. Same receipt."

Then the refusal — the moment the whole thing turns on:

> "And if it comes back with a different number, holding the same approval:"

Show `payload_hash_mismatch`.

> "Refused. The approval fit one payload."

## 3:00–3:20 — The boundary, stated plainly

> "TrueForge's approval is allow or deny on a pending call. It is not
> cryptographically bound to the arguments, and I'm not claiming it is. The
> harness gives me the pause and shows the human the real arguments. The
> payer records what was approved and checks it at commit time."

Show the test summary already on screen — do not live-run a suite.

## 3:20–3:35 — One sentence, then stop

> "We built every approval system for software that couldn't change its
> mind. That assumption just expired.
>
> A yes should mean yes to *this*."

End. Do not add anything after this line.

---

## If something breaks mid-take

Stop, `./reset-demo.sh`, `./preflight.sh`, start over. A clean 3:35 beats a
salvaged 4:30. Never record over a dirty ledger — "exactly one row" is the
entire proof.
