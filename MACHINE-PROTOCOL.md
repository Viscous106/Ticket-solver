# Machine protocol

Written 2026-09-19 after TrueForge was killed five times in one morning. None
of it was a bug in TrueForge. All of it was the machine.

## The 60-second check, before any demo or recording

```bash
# 1. Is anything pegged? Load should be under ~10.
uptime

# 2. Real free RAM. Under 1000 MB is danger.
vm_stat | awk '/Pages free/{gsub(/\./,"",$3); printf "free: %.0f MB\n", $3*16384/1048576}'

# 3. Anything stuck at ~100% CPU for hours?
ps aux | sort -nrk 3 | head -5

# 4. Reclaim what the OS is hoarding.
sudo purge
```

If load is high, find what is pegged before doing anything else. A stuck
process starves everything and the symptom looks like "the app is buggy."

## What actually went wrong today, so it is recognisable next time

**Four Cursor extension hosts pegged at 100% CPU.** Two had been running that
way for 16 days, one for 8 days. Load average was 82. They used almost no
memory, so looking at memory hid them completely. `kill` was ignored;
`kill -9` worked. Load went 82 to 2.

**Long uptime with heavy swap.** 25 days, 73 million swapouts. The machine had
been paging to disk continuously for weeks.

**The killer pattern: allocation spikes, not steady use.** TrueForge never died
while idle. It died when it *allocated*: on a write, on an MCP session open,
and most importantly on **sandbox spawn** (Python + bash). With ~400 MB free
and 8 GB stuck "inactive", macOS could not satisfy the burst and jetsam killed
the process that asked.

**A `free: 1600 MB` reading is not reassuring** when `inactive` is 8 GB. The
OS is holding memory it has not released. `sudo purge` is what forces it.

## How to tell a kill from a crash

- `zsh: killed` in the terminal, and **no crash report** in
  `~/Library/Logs/DiagnosticReports/` → the OS killed it. Memory.
- A stack trace, or a `.ips` file appearing → the process actually crashed.
  Different problem, read the trace.

A clean log that just *stops* mid-normal-operation is a kill, not a crash.

## Rules for a demo day

1. **Reboot the night before** if uptime is over a week. Five minutes then
   beats an hour of debugging on the day.
2. **Close everything unrelated before you start**, not after it breaks.
   Today's offenders: Cursor, ChatGPT, Docker, Slack, Notion, Spotify,
   Preview, a forgotten `next-server` dev server (798 MB), and 121 Chrome
   processes (6.5 GB).
3. **Run the long-lived server in your OWN terminal.** Anything launched from
   an agent tool call can be reaped when that call's process group is cleaned
   up.
4. **Do not let an agent poll a fragile server.** Each poll is small; under
   pressure it is what tips it over. Check it yourself, once, before each take.
5. **Know which feature allocates.** Here it was the sandbox, which is both
   the biggest spike and a scored capability. That is the thing most likely to
   die mid-take.

## Recovery, in order of cheapness

```bash
# free the biggest consumers first
ps -axo rss,pid,comm | sort -nr | head -10

# a dev server you forgot about is usually the top one
kill <pid>

# force the OS to release inactive pages
sudo purge

# only if the above does not get you above ~2 GB free
sudo reboot
```
