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
| `/ck:init`                                         | Copy/overwrite FORMAT.md to project root |
| `/ck:spec [idea\|from-code\|amend §X.n\|bug: ...]` | Create or amend SPEC.md                  |
| `/ck:build [§T.n\|--next\|--all]`                  | Implement spec tasks                     |
| `/ck:check [§V\|§I\|§T\|--all]`                    | Drift-detect SPEC.md vs code (read-only) |
| `/ck:grill [<idea>\|--brutal\|--light]`            | Sharpen idea before spec via Q&A         |
| `/ck:research <question>`                          | Gather external knowledge → §R           |
| `/ck:review [§T.n\|--all]`                         | Adversarial spec review, go/no-go gate   |
| `/ck:deepen [<module>\|--pick]`                    | Design-improvement pass, shrink one interface |

---

## Hooks

`caveopen` registers OpenCode hooks via three modules composed in order: **caveman → cavemem → cavekit**. Same-key handlers chain (a→b); mutations accumulate. `tool` sub-maps shallow-merge. `auth`/`provider`/`config`: last-write-wins.

### caveman

| Hook                                 | Trigger                   | What it does                                                                                                                                                                                                                        |
| ------------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat.message`                       | User submits a message    | Parses `/caveman [lite\|full\|ultra\|wenyan-*\|off]` and natural-language activation/deactivation phrases; writes or removes mode flag on disk; no output mutation (ruleset injected via system transform on every inference instead) |
| `command.execute.before`             | `/caveman-stats` command  | Fetches live session token counts via client API; formats stats. Accepts `--all` (lifetime history) and `--since Nd` (last N days) flags; pushes text part into output                                                              |
| `event` (`session.created`)          | New session opened        | Reads `defaultMode` from config; writes mode flag if none set and default is not `off`                                                                                                                                              |
| `event` (`session.idle`)             | Session goes idle         | Fetches session token counts; computes estimated saved tokens/USD; appends JSONL row to `~/.caveman/.caveman-history.jsonl`; writes statusline suffix                                                                               |
| `event` (`tui.prompt.append`)        | TUI prompts for status    | Appends `[CAVEMAN:MODE] <stats-suffix>` badge via `tui.appendPrompt`; no-ops in headless                                                                                                                                            |

> **`experimental.chat.system.transform`** — caveman's individual handler is still registered by `cavemanHooks()` but is replaced inside `CaveOpenPlugin` by a single `combinedSystemTransform`. `getCavemanSystemRuleset()` is passed as a provider; it merges with cavemem's priorContext into one `system[]` push. The standalone `CavemanPlugin` (subpath import) still uses its own transform.

### cavekit

| Hook                                      | Trigger                | What it does                                                                                                                                                                   |
| ----------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `command.execute.before`                  | `/ck:init` command     | Copies (overwrites) `FORMAT.md` to `process.cwd()`; always replaces — ensures stale files update on plugin upgrade; replaces `output.parts` with an `ignored` result part + `synthetic` no-reply part to suppress LLM inference |
| `config`                                  | Plugin load            | Registers `/ck:init` as a named slash command in the TUI command palette                                                                                                       |

> **No system prompt injection.** Skills (`/ck:spec`, `/ck:build`, `/ck:check`) read `SPEC.md` directly from disk. Passive injection of spec context was removed — it caused hallucination on unrelated prompts.

### cavemem

Cavemem delegates to the **`cavemem` CLI** via `cavemem hook run <name>`. Each hook spawns the CLI, writes a JSON payload to stdin, and reads structured output from stdout. Requires `cavemem` installed separately — all hooks silently no-op if the CLI is absent.

| Hook                                 | Trigger              | What it does                                                                                                                                                            |
| ------------------------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat.message`                       | User submits message | Ensures session is initialized (eager init guard), then fires `cavemem hook run user-prompt-submit` with session ID + prompt text (write-only; no output mutation)      |
| `tool.execute.after`                 | Any tool completes   | Ensures session is initialized (eager init guard for subagent sessions), then fires `cavemem hook run post-tool-use` with tool name, input, and output                  |
| `event` (`session.created`)          | New session opened   | Fires `cavemem hook run session-start` with session ID + session directory; caches returned prior-session context string for system prompt inject                       |
| `event` (`session.idle`)             | Session goes idle    | Fetches last assistant message via SDK; fires `cavemem hook run stop` with that text as `last_assistant_message`                                                        |
| `event` (`session.deleted`)          | Session deleted      | Fires `cavemem hook run session-end`; evicts session from in-process context cache                                                                                      |

> **`experimental.chat.system.transform`** — cavemem's individual handler is still registered by `caveMemHooks()` but is replaced inside `CaveOpenPlugin` by `combinedSystemTransform`. `getCavememSystemPriorContext()` is passed as a provider; when `skipPriorContext: true` it returns `null` and no content is pushed. The standalone `CavememPlugin` (subpath import) still uses its own transform.

### Hook composition

```
CaveOpenPlugin
  ├── cavemanHooks(ctx)  → chat.message, command.execute.before, event
  ├── caveMemHooks(ctx)  → chat.message, tool.execute.after, event
  ├── cavekitHooks(ctx)  → command.execute.before, config
  └── combinedSystemTransform([cavemanProvider, cavememProvider])
        → experimental.chat.system.transform  (replaces individual handlers post-merge)

mergeHooks rules:
  same key (non-tool): chain a → b (both fire, output mutations accumulate)
  "tool":              shallow-merge sub-maps
  "auth"|"provider"|"config": last-write-wins (b)
```

`experimental.chat.system.transform` is post-assigned after `mergeHooks` to replace the chained individual handlers with a single combined one. The provider array is built conditionally in `caveopen.ts` — only active modules contribute a provider, so inactive modules have zero per-turn cost.

Modules excluded by `modes` option are omitted from `hookSets` entirely. Hook handlers are non-fatal by default — errors in `a` are caught and logged; `b` still runs.

**System prompt slot ordering** — OpenCode concatenates all instructions into `system[0]` before transforms run. The combined transform uses a single `push` (not `unshift`) so host instructions always hold the highest-priority cache slot. `applyCaching()` marks `system[0..1]`:

```
system[0]  host instructions                          ✅ cached
system[1]  caveman ruleset + cavemem priorContext     ✅ cached (merged into one push)
```

With `opencode-claude-auth` loaded (uses `unshift` for identity): identity→`[0]`, instructions→`[1]`, caveopen→`[2]` (uncached but accepted — auth + instructions take priority).

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
│   ├── backprop/SKILL.md
│   ├── grill/SKILL.md
│   ├── research/SKILL.md
│   ├── review/SKILL.md
│   ├── deepen/SKILL.md
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
│   ├── ck:grill.md
│   ├── ck:research.md
│   ├── ck:review.md
│   └── ck:deepen.md
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

cavemem options:

```json
{
  "plugin": [["caveopen", { "cavemem": { "skipPriorContext": true } }]]
}
```

| Option             | Type    | Default | Description                                                                                                                                                |
| ------------------ | ------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skipPriorContext` | boolean | `false` | Skip injecting prior-session summaries into the system prompt. Observations are still written to the store. Workaround for cavemem ≤ 0.2.1 cross-project leak ([cavemem#39](https://github.com/JuliusBrussee/cavemem/issues/39)). |

---

## Links

- Plugin docs: https://opencode.ai/docs/plugins
- caveopen repo: https://github.com/eXodes/caveopen
- caveman: https://github.com/JuliusBrussee/caveman
- cavekit: https://github.com/JuliusBrussee/cavekit
- cavemem: https://github.com/JuliusBrussee/cavemem
