# caveopen — installed quick-ref

Installed by `npx caveopen init`. This file lives at `~/.config/opencode/plugins/caveopen/README.md` (global) or `.opencode/plugins/caveopen/README.md` (project).

---

## Commands

### caveman module

| Command                                       | Description                                      |
| --------------------------------------------- | ------------------------------------------------ |
| `/caveman [lite\|full\|ultra\|wenyan-*\|off]` | Activate/deactivate caveman mode (default: full) |
| `/caveman-stats`                              | Show lifetime token-savings stats                |
| `/caveman-commit`                             | Generate caveman-compressed commit message       |
| `/caveman-review`                             | Ultra-compressed code review comments            |
| `/caveman-compress`                           | Compress a memory/CLAUDE.md file in-place        |
| `/caveman-help`                               | Quick-reference card for all caveman commands    |

### cavekit module

| Command                                            | Description                              |
| -------------------------------------------------- | ---------------------------------------- |
| `/ck:init`                                         | Copy FORMAT.md to project root           |
| `/ck:spec [idea\|from-code\|amend §X.n\|bug: ...]` | Create or amend SPEC.md                  |
| `/ck:build [§T.n\|--next\|--all]`                  | Implement spec tasks                     |
| `/ck:check`                                        | Drift-detect SPEC.md vs code (read-only) |
| `/ck:audit`                                        | Full codebase audit against spec         |
| `/ck:eval`                                         | Evaluate spec coverage and quality       |

---

## Hooks

`caveopen` registers OpenCode hooks via three modules composed in order: **caveman → cavemem → cavekit**. Same-key handlers chain (a→b); mutations accumulate. `tool` sub-maps shallow-merge. `auth`/`provider`/`config`: last-write-wins.

### caveman

| Hook                                 | Trigger                   | What it does                                                                                                                                                                                                                        |
| ------------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `experimental.chat.system.transform` | Every main-agent LLM call | Reads mode flag from disk; if active, unshifts ruleset into `output.system[]`                                                                                                                                                       |
| `chat.message`                       | User submits a message    | Parses `/caveman [lite\|full\|ultra\|wenyan-*\|off]` and natural-language phrases; writes mode flag to disk; appends per-turn reminder nudge to `output.parts` when mode is active (skipped for `commit`/`review`/`compress` modes) |
| `command.execute.before`             | `/caveman-stats` command  | Fetches live session token counts via client API; formats stats. Accepts `--all` (lifetime history) and `--since Nd` (last N days) flags; pushes text part into output                                                              |
| `event` (`session.created`)          | New session opened        | Reads `defaultMode` from config; writes mode flag if none set and default is not `off`                                                                                                                                              |
| `event` (`session.idle`)             | Session goes idle         | Fetches session token counts; computes estimated saved tokens/USD; appends JSONL row to `~/.caveman/.caveman-history.jsonl`; writes statusline suffix                                                                               |
| `event` (`tui.prompt.append`)        | TUI prompts for status    | Appends `[CAVEMAN:MODE] <stats-suffix>` badge via `tui.appendPrompt`; no-ops in headless                                                                                                                                            |

### cavekit

| Hook                                 | Trigger                   | What it does                                                                                                    |
| ------------------------------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `command.execute.before`             | `/ck:init` command        | Copies `FORMAT.md` to `process.cwd()`; skips if already present; injects result text into output parts          |
| `experimental.chat.system.transform` | Every main-agent LLM call | Reads cached SPEC.md summary for session; pushes it into `output.system[]`                                      |
| `event` (`session.created`)          | New session opened        | Reads `SPEC.md` from cwd; extracts compact summary; stores in per-session cache                                 |
| `event` (`file.watcher.updated`)     | File change detected      | If changed path ends with `SPEC.md`, marks all active sessions dirty — cache refreshes on next system transform |

### cavemem

Cavemem uses an **embedded SQLite store** (via `getStore()`) — no external CLI or MCP server required. The store lives at `~/.cavemem/memory.db`.

| Hook                                 | Trigger              | What it does                                                                                                                  |
| ------------------------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `experimental.chat.system.transform` | Every LLM call       | Reads cached prior-session context for this session ID; unshifts it into `output.system[]` (up to 3 prior sessions, same cwd) |
| `chat.message`                       | User submits message | Records user prompt as `user_prompt` observation in store; enqueues embedding (best-effort, no embedder wired by default)     |
| `tool.execute.after`                 | Any tool completes   | Records `tool_name + input + output` (truncated to 4000 chars) as `tool_use` observation in store                             |
| `event` (`session.created`)          | New session opened   | Starts session in store; fetches summaries from up to 3 prior sessions in same cwd; caches as system context                  |
| `event` (`session.idle`)             | Session goes idle    | Fetches last assistant message text; stores as `turn`-scope summary in store                                                  |
| `event` (`session.deleted`)          | Session deleted      | Collapses all `turn` summaries (up to 20) into a `session`-scope summary; ends session; clears session cache                  |
| `dispose`                            | Plugin teardown      | Closes the SQLite store                                                                                                       |

### Hook composition

```
CaveOpenPlugin
  ├── cavemanHooks(ctx)  → Hooks  ─┐
  ├── caveMemHooks(ctx)  → Hooks  ─┤ mergeHooks(...hookSets)
  └── cavekitHooks(ctx)  → Hooks  ─┘

mergeHooks rules:
  same key (non-tool): chain a → b (both fire, output mutations accumulate)
  "tool":              shallow-merge sub-maps
  "auth"|"provider"|"config": last-write-wins (b)
```

Modules excluded by `modes` option are omitted from `hookSets` entirely. Hook handlers are non-fatal by default — errors in `a` are caught and logged; `b` still runs.

---

## Agents

| Agent                   | Role                                                                 |
| ----------------------- | -------------------------------------------------------------------- |
| `cavecrew-investigator` | Read-only code locator — find file:line for symbols, callers, usages |
| `cavecrew-builder`      | Surgical 1–2 file edit — typos, single-function rewrites, renames    |
| `cavecrew-reviewer`     | Diff/branch reviewer — one-line findings, severity-tagged, no praise |

Override model per-agent in `opencode.json`:

```json
{
  "agents": {
    "cavecrew-builder": { "model": "anthropic/claude-haiku-4-20250514" }
  }
}
```

---

## Installed files

```
~/.config/opencode/                 (global) or .opencode/ (project)
├── plugins/
│   └── caveopen/
│       ├── FORMAT.md               cavekit spec format reference
│       └── README.md               this file
├── skills/
│   ├── caveman/SKILL.md
│   ├── caveman-commit/SKILL.md
│   ├── caveman-compress/SKILL.md
│   ├── caveman-help/SKILL.md
│   ├── caveman-review/SKILL.md
│   ├── cavecrew/SKILL.md
│   ├── ck-spec/SKILL.md
│   ├── ck-build/SKILL.md
│   ├── ck-check/SKILL.md
│   ├── ck-audit/SKILL.md
│   ├── ck-eval/SKILL.md
│   ├── ck-backprop/SKILL.md
│   └── ck-caveman/SKILL.md
├── commands/
│   ├── caveman.md
│   ├── caveman-commit.md
│   ├── caveman-compress.md
│   ├── caveman-help.md
│   ├── caveman-review.md
│   ├── caveman-stats.md
│   ├── ck:init.md
│   ├── ck:spec.md
│   ├── ck:build.md
│   ├── ck:check.md
│   ├── ck:audit.md
│   └── ck:eval.md
└── agents/
    ├── cavecrew-investigator.agent.md
    ├── cavecrew-builder.agent.md
    └── cavecrew-reviewer.agent.md
```

---

## Config

`opencode.json` after `npx caveopen init`:

```json
{
  "plugin": ["caveopen"],
  "mcp": {
    "cavemem": { "type": "local", "command": ["npx", "cavemem", "mcp"] }
  }
}
```

Opt into specific modules only:

```json
{
  "plugin": [["caveopen", { "modes": ["caveman", "cavekit"] }]]
}
```

Modes: `caveman` | `cavekit` | `cavemem` (default: all three, as an array)

---

## Links

- Plugin docs: https://opencode.ai/docs/plugins
- caveopen repo: https://github.com/eXodes/caveopen
- caveman: https://github.com/JuliusBrussee/caveman
- cavekit: https://github.com/JuliusBrussee/cavekit
- cavemem: https://github.com/JuliusBrussee/cavemem
