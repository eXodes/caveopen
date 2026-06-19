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
| `/ck:check [§V\|§I\|§T\|--all]`                    | Drift-detect SPEC.md vs code (read-only) |
| `/ck:audit [--trim]`                               | Full codebase audit against spec         |
| `/ck:eval [§T.n\|--diff]`                          | Evaluate spec coverage and quality       |

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

| Hook                                      | Trigger                | What it does                                                                                                                 |
| ----------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `command.execute.before`                  | `/ck:init` command     | Copies `FORMAT.md` to `process.cwd()`; skips if already present; injects result text into output parts as an ignored part   |
| `experimental.chat.messages.transform`    | Every user message     | If last message is `/ck:init`, empties `output.messages` to suppress LLM inference (output already handled by hook above)   |
| `config`                                  | Plugin load            | Registers `/ck:init` as a named slash command in the TUI command palette                                                     |

> **No system prompt injection.** Skills (`/ck:spec`, `/ck:build`, `/ck:check`) read `SPEC.md` directly from disk. Passive injection of spec context was removed — it caused hallucination on unrelated prompts.

### cavemem

Cavemem delegates to the **`cavemem` CLI** via `cavemem hook run <name>`. Each hook spawns the CLI, writes a JSON payload to stdin, and reads structured output from stdout. Requires `cavemem` installed separately — all hooks silently no-op if the CLI is absent.

| Hook                                 | Trigger              | What it does                                                                                                                                                            |
| ------------------------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `experimental.chat.system.transform` | Every LLM call       | Reads cached prior-session context for this session ID; unshifts it into `output.system[]`                                                                              |
| `chat.message`                       | User submits message | Ensures session is initialized (eager init guard), then fires `cavemem hook run user-prompt-submit` with session ID + prompt text (write-only; no output mutation)      |
| `tool.execute.after`                 | Any tool completes   | Ensures session is initialized (eager init guard for subagent sessions), then fires `cavemem hook run post-tool-use` with tool name, input, and output                  |
| `event` (`session.created`)          | New session opened   | Fires `cavemem hook run session-start` with session ID + session directory; caches returned prior-session context string for system prompt inject                       |
| `event` (`session.idle`)             | Session goes idle    | Fetches last assistant message via SDK; fires `cavemem hook run stop` with that text as `last_assistant_message`                                                        |
| `event` (`session.deleted`)          | Session deleted      | Fires `cavemem hook run session-end`; evicts session from in-process context cache                                                                                      |

### Hook composition

```
CaveOpenPlugin
  ├── cavemanHooks(ctx)  → system.transform, chat.message, command.execute.before, event
  ├── caveMemHooks(ctx)  → system.transform, chat.message, tool.execute.after, event
  └── cavekitHooks(ctx)  → messages.transform, command.execute.before, config

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
│       └── README.md               this file
├── skills/
│   ├── caveman/SKILL.md
│   ├── caveman-commit/SKILL.md
│   ├── caveman-compress/SKILL.md
│   ├── caveman-help/SKILL.md
│   ├── caveman-review/SKILL.md
│   ├── cavecrew/SKILL.md
│   ├── spec/SKILL.md
│   ├── build/SKILL.md
│   ├── check/SKILL.md
│   ├── audit/SKILL.md
│   ├── eval/SKILL.md
│   ├── backprop/SKILL.md
│   └── cavekit/SKILL.md
├── commands/
│   ├── caveman.md
│   ├── caveman-commit.md
│   ├── caveman-compress.md
│   ├── caveman-help.md
│   ├── caveman-review.md
│   ├── caveman-stats.md
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
