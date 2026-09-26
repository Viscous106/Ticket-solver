# Plan — finish early

Written 11:43. Submission closes 4:00. **Target: submitted by 2:30.**

The buffer is the point. A demo submitted at 2:30 can be improved until 4:00
from a position of safety. A demo still being built at 3:45 cannot.

## Status

| Piece | State |
|---|---|
| Ledger, payload binding, three-tool split | done, 4 tests pass |
| MCP server, TrueForge connector registered | done, 3 tools discovered |
| OpenAI provider | connected |
| Agent `Ticket-solver` configured | done |
| **Full loop through TrueForge** | **proven: sandbox ran, approval paused, one row committed** |
| Preflight + reset scripts | done, verified |
| Private repo, README, beat sheet | pushed |
| Rehearsals | 0 |
| Recording | not started |
| Repo public | not yet (gated) |

All four scored capabilities have fired in one real turn: MCP, sandbox
(Code Mode), approval workflow, persistent session.

## Timeline

**11:45–12:15 — prove the retry beat.** The commit path works. The lost-ack
retry and the refused-tamper beats have passed at the HTTP level but not yet
through the agent in a live session. This is the centrepiece of the video, so
it has to be seen working before anything else happens.

**12:15–12:35 — adversarial repo read (Codex, read-only, background).**
Does the README claim anything the code does not do? Any secret, absolute
path, or real identifier? Fix whatever it finds. Rehearse during.

**12:35–1:15 — rehearsal one and two.** Full run to the beat sheet with a
timer. Not recording. Expect the first to be bad; that is what it is for.
Reset the ledger between every run.

**1:15–1:45 — record.** Preflight first, no exceptions. Record one complete
take. Watch it back immediately: legible, audible, all beats visible, no
secrets on screen. Re-record once if needed. Use the shorter valid take.

**1:45–2:05 — submission package.** Flip the repo public (confirm first),
final README pass, upload video, fill the HackerSquad fields.

**2:05–2:30 — submit.** Verify repo and video both open in an incognito
window. Submit.

**2:30–4:00 — optional only.** Everything past this point is upside. Only
touch it if the core is submitted and safe:
- Killer-question drill with Codex, rehearse the answers (highest value if
  top 10 is reached, since that round is live)
- A better take of the video
- Nothing that changes code

## Cut list — do not build these

- Subagents. The job has no parallel branch; three independent reviews
  reached the same conclusion.
- Any custom UI or dashboard. TrueForge's native trace is the evidence.
- The deny branch live in the video. It stays a deterministic test.
- Any upgrade of TrueForge. Pinned to 0.2.0.
- Any refactor after the demo path works.

## Rules that do not bend

- `./preflight.sh` before every recording attempt. It catches the silent MCP
  failure that is the single most likely way to lose.
- `./reset-demo.sh` between every run. "Exactly one ledger row" is the proof;
  a dirty ledger destroys it.
- Click Approve exactly ONCE. Bug #508.
- Stop talking after the closing line.
