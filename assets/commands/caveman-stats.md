---
description: Show caveman lifetime token-savings stats
---
Show caveman stats — total tokens saved, sessions, average compression ratio, estimated USD saved.

Read the lifetime history log at `~/.caveman/.caveman-history.jsonl`.

Each line is a JSON entry:
```json
{ "ts": <epoch_ms>, "session_id": "<id>", "mode": "<mode>|null", "output_tokens": <n>, "est_saved_tokens": <n> }
```

Aggregate using the **latest entry per unique `session_id`** (multiple `/caveman-stats` runs in one session emit multiple lines; use only the most recent per session).

Output a short table:

```
Caveman Stats — Lifetime
──────────────────────────────────
Sessions:              <n>
──────────────────────────────────
Output tokens:         <total>
Est. tokens saved:     <total> (~<avg_ratio>%)
──────────────────────────────────
```

If `est_saved_tokens` is 0 for all entries (mode was not active), omit the savings line and note caveman was inactive.

If the file does not exist or is empty, output:
```
No sessions logged yet. Use /caveman to activate, then run /caveman-stats to start tracking.
```
