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

`caveopen` registers OpenCode hooks via three modules composed in order: **caveman → cavekit → cavemem**. Same-key handlers chain (a→b); mutations accumulate. `tool` sub-maps shallow-merge. `auth`/`provider`/`config`: last-write-wins.

### caveman

| Hook                                 | Trigger                          | What it does                                                                                                                                                                              |
| ------------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `command.execute.before`             | `/caveman-stats` command         | Reads `~/.caveman/.caveman-history.jsonl`, injects aggregate token-savings stats into session via `noReply` prompt                                                                        |
| `experimental.provider.small_model`  | OpenCode selects aux/small model | Captures model ID — used to gate system transform (skip title-gen, compaction calls)                                                                                                      |
| `experimental.chat.system.transform` | Every main-agent LLM call        | Pushes `SKILL.md` ruleset into `output.system[]`. If mode active, appends activation nudge. Skipped for aux model calls (V58/V60). Static bytes → Anthropic prompt-cache prefix preserved |
| `chat.message`                       | User submits a message           | Parses `/caveman [mode\|off]` and natural-language equivalents; updates per-session `activeMode` map                                                                                      |
| `event` (`session.created`)          | New session opened               | Clears `activeMode` entry for that session ID                                                                                                                                             |
| `event` (`message.updated`)          | Assistant message completed      | Reads output token count; computes estimated saved tokens from compression ratio; appends JSONL row to `~/.caveman/.caveman-history.jsonl`                                                |

### cavekit

| Hook                     | Trigger                    | What it does                                                              |
| ------------------------ | -------------------------- | ------------------------------------------------------------------------- |
| `command.execute.before` | `/ck:init` command         | Copies `FORMAT.md` to project root; injects result as synthetic text part |

### cavemem

| Hook                                         | Trigger                         | What it does                                                                                                               |
| -------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `experimental.chat.system.transform`         | Every main-agent LLM call       | Pushes static note about cavemem memory tools into `output.system[]` — only if MCP server is configured in `opencode.json` |
| `tool.execute.after`                         | Any tool completes              | Buffers `{tool_name, tool_input, tool_response}` per session; does not flush yet                                           |
| `event` (`session.created`)                  | New session opened              | Registers session ID; defers cavemem `session-start` until first real user message                                         |
| `event` (`message.updated` — user)           | First real user message         | Calls `cavemem hook run session-start`; then `user-prompt-submit` on every subsequent user message                         |
| `event` (`message.updated` — assistant)      | Assistant message completed     | Calls `cavemem hook run stop` with turn summary text                                                                       |
| `event` (`session.idle` / `session.deleted`) | Session goes idle or is deleted | Flushes buffered tool observations via `post-tool-use`; calls `session-end`                                                |
| `event` (`message.part.updated`)             | Streaming text part updated     | Accumulates latest full assistant text per message ID (replace, not append)                                                |
| `dispose`                                    | Plugin teardown                 | Removes `exit`/`SIGTERM`/`SIGINT` signal handlers                                                                          |

### Hook composition

```
CaveopenPlugin
  ├── caveman(input)   → Partial<Hooks>  ─┐
  ├── cavekit(input)   → Partial<Hooks>  ─┤ composeHooks(a, b)
  └── cavemem(input)   → Partial<Hooks>  ─┘

composeHooks rules:
  same key (non-tool): chain a → b (both fire, output mutations accumulate)
  "tool":              shallow-merge sub-maps
  "auth"|"provider"|"config": last-write-wins (b)
```

Hook handlers are non-fatal by default — errors in `a` are caught and logged; `b` still runs.

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
  "plugin": [["caveopen", { "modes": "caveman,cavekit" }]]
}
```

Modes: `caveman` | `cavekit` | `cavemem` (default: all three)

---

## Links

- Plugin docs: https://opencode.ai/docs/plugins
- caveopen repo: https://github.com/eXodes/caveopen
- caveman: https://github.com/JuliusBrussee/caveman
- cavekit: https://github.com/JuliusBrussee/cavekit
- cavemem: https://github.com/JuliusBrussee/cavemem
