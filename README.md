# caveopen

[![OpenCode](https://img.shields.io/badge/OpenCode-plugin-8b5cf6?logo=opencode&logoColor=white)](https://opencode.ai/docs/plugins)
[![Made with Cowork](https://img.shields.io/badge/Made%20with-Cowork-D97706?logo=claude&logoColor=white)](https://claude.ai)
[![npm version](https://img.shields.io/npm/v/caveopen?logo=npm&logoColor=white)](https://www.npmjs.com/package/caveopen)
[![CI](https://img.shields.io/github/actions/workflow/status/eXodes/caveopen/ci.yml?label=CI&logo=github&logoColor=white)](https://github.com/eXodes/caveopen/actions)
[![NPM License](https://img.shields.io/npm/l/caveopen?color=red&logo=license)](https://github.com/eXodes/caveopen/blob/main/LICENSE)

**caveopen** is an [OpenCode](https://opencode.ai) plugin that brings the [caveman ecosystem](https://github.com/JuliusBrussee/caveman) to OpenCode users. It ports three Claude Code tools — **[caveman](https://github.com/JuliusBrussee/caveman)**, **[cavekit](https://github.com/JuliusBrussee/cavekit)**, and **[cavemem](https://github.com/JuliusBrussee/cavemem)** — into a single TypeScript plugin that integrates natively with OpenCode's hook system.

> [!NOTE]
> This is an unofficial community port. For the original Claude Code versions, see the upstream repositories linked above.

## Install

```bash
npx caveopen init
```

The CLI patches your `opencode.json`, copies skills, commands, and agents into the right locations, and registers the plugin.

```
✓ registered  plugin caveopen → global:config plugin
✓ configured  mcp cavemem → global:config mcp
✓ added  skills caveman → global:skills caveman
  ... (15 skills total)
✓ added  commands /caveman → global:commands /caveman
  ... (13 commands total)
✓ added  agents cavecrew-builder → global:agents cavecrew-builder
  ... (3 agents total)

caveopen configured
  Modes:  caveman, cavekit, cavemem
  Config: ~/.config/opencode/opencode.json
  Run:    opencode
```

**Options**

```bash
npx caveopen init --project          # install to .opencode/ instead of ~/.config/opencode/
npx caveopen init --modes caveman    # install specific modules only
npx caveopen init --dry-run          # preview without writing anything
```

## Modules

### caveman — token-compressed output

A port of [caveman](https://github.com/JuliusBrussee/caveman) that injects the caveman compression ruleset directly into OpenCode's system prompt on every session. The model drops filler phrases, articles, pleasantries, and hedging while preserving all technical content, code blocks, and exact error messages — no per-session setup required.

**~75% fewer output tokens. Full technical accuracy.**

<table>
<tr>
<td width="50%">

**Without caveman**

> "Sure! I'd be happy to help you with that. The issue you're experiencing is most likely caused by your authentication middleware not properly validating the token expiry. Let me take a look and suggest a fix."

</td>
<td width="50%">

**With caveman**

> "Bug in auth middleware. Token expiry check use `<` not `<=`. Fix:"

</td>
</tr>
</table>

Caveman mode persists across turns and supports multiple compression levels (`lite`, `full`, `ultra`). Token savings accumulate in `~/.caveman/.caveman-history.jsonl` and are viewable with `/caveman-stats`.

### cavekit — spec-driven development

A port of [cavekit v4](https://github.com/JuliusBrussee/cavekit) that adds spec-driven development (SDD) to OpenCode. The `/ck:init` command bootstraps a project by copying `FORMAT.md` — the canonical encoding reference that all `ck:` skills read from. All skills are included and work the same as the upstream versions.

Skills read `SPEC.md` directly from disk on demand. No ambient spec context is injected into the system prompt — that approach caused the model to hallucinate connections between open tasks and unrelated prompts.

### cavemem — persistent session memory

A port of [cavemem](https://github.com/JuliusBrussee/cavemem) that bridges its SQLite memory store into OpenCode's plugin lifecycle. On each new session, prior-session summaries for the same working directory are fetched and injected into the system prompt. Tool calls and turn output are observed and stored as the session progresses, building a memory that carries context forward across sessions. Each session's directory comes from the SDK session object — subagent sessions get their own directory correctly, not the plugin process cwd.

> [!NOTE]
> Requires [cavemem](https://github.com/JuliusBrussee/cavemem) to be installed separately. The other two modules work without it. When cavemem is absent, this module silently no-ops.

The store lives at `~/.cavemem/memory.db`.

---

## Commands

### caveman

| Command                             | Description                                               |
| ----------------------------------- | --------------------------------------------------------- |
| `/caveman [lite\|full\|ultra\|off]` | Activate or change caveman mode (default: `full`)         |
| `/caveman-stats`                    | Lifetime token-savings stats for the current session      |
| `/caveman-commit`                   | Generate a caveman-compressed conventional commit message |
| `/caveman-review`                   | Ultra-compressed code review — one line per finding       |
| `/caveman-compress <file>`          | Compress a CLAUDE.md or memory file in-place              |
| `/caveman-help`                     | Quick-reference for all caveman commands                  |

### cavekit

| Command                                            | Description                                   |
| -------------------------------------------------- | --------------------------------------------- |
| `/ck:init`                                         | Copy/overwrite `FORMAT.md` to project root    |
| `/ck:spec [idea\|from-code\|amend §X.n\|bug: ...]` | Create or amend `SPEC.md`                     |
| `/ck:build [§T.n\|--next\|--all]`                  | Implement spec tasks with a validation loop   |
| `/ck:check [§V\|§I\|§T\|--all]`                    | Drift-detect `SPEC.md` vs. code (read-only)   |
| `/ck:grill [<idea>\|--brutal\|--light]`            | Sharpen idea before spec via Q&A              |
| `/ck:research <question>`                          | Gather external knowledge → §R                |
| `/ck:review [§T.n\|--all]`                         | Adversarial spec review, go/no-go gate        |
| `/ck:deepen [<module>\|--pick]`                    | Design-improvement pass, shrink one interface |

### cavecrew agents

Three compressed-output subagents available inside OpenCode sessions:

| Agent                   | Role                                                                  |
| ----------------------- | --------------------------------------------------------------------- |
| `cavecrew-investigator` | Read-only code locator — returns `file:line` table for symbol lookups |
| `cavecrew-builder`      | Surgical 1–2 file edit — typos, single-function rewrites, renames     |
| `cavecrew-reviewer`     | Diff reviewer — one-line findings, severity-tagged, no scope creep    |

---

## Configuration

### Opt into specific modules

```json
{
  "plugin": [["caveopen", { "modes": ["caveman", "cavekit"] }]]
}
```

`modes` accepts an array of `caveman`, `cavekit`, and `cavemem`. Default is all three. The CLI flag `--modes caveman,cavekit` accepts a comma-separated string and converts it to array form automatically.

### cavemem options

```json
{
  "plugin": [["caveopen", { "cavemem": { "skipPriorContext": true } }]]
}
```

| Option             | Type    | Default | Description                                                                                                        |
| ------------------ | ------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| `skipPriorContext` | boolean | `false` | Skip injecting prior-session summaries into the system prompt. Observations are still written to the memory store. |

`skipPriorContext` is a workaround for a known upstream bug in cavemem ≤ 0.2.1 where prior-session context is not scoped to the current working directory and leaks across unrelated projects ([cavemem#39](https://github.com/JuliusBrussee/cavemem/issues/39)). Setting it to `true` disables injection until a fixed version of cavemem is installed.

### Override agent models

```json
{
  "agents": {
    "cavecrew-builder": { "model": "anthropic/claude-haiku-4-20250514" }
  }
}
```

### Default caveman mode

Caveman defaults to `full` on every new session. Change the level at any time with `/caveman <level>`, or deactivate with `/caveman off`.

---

## How it works

Each module registers TypeScript hooks into OpenCode's plugin lifecycle. Same-key handlers chain (`a → b`), output mutations accumulate. The `experimental.chat.system.transform` hook is a special case — caveman and cavemem are merged into a single handler at composition time:

```
CaveOpenPlugin
  ├── caveman    → chat.message, command.execute.before, event
  ├── cavekit    → command.execute.before, config
  ├── cavemem    → chat.message, tool.execute.after, event
  └── [combined] → experimental.chat.system.transform
                   ruleset (caveman) + priorContext (cavemem) → one system[] push
```

OpenCode concatenates all instructions (agent prompt, AGENTS.md, `config.instructions`) into `system[0]` before any transform runs. CaveOpen appends after that block using `push` — never `unshift` — so the host instructions always occupy the highest-priority cache slot. Merging caveman and cavemem into a single `push` keeps both within `applyCaching()`'s 2-slot window:

```
system[0]  OpenCode instructions                  ← cached (largest block)
system[1]  caveman ruleset + cavemem priorContext ← cached (merged into one slot)
```

If `opencode-claude-auth` is loaded, its identity `unshift` takes `system[0]` and shifts instructions to `system[1]` — both remain cached, CaveOpen additions fall to `system[2]` (accepted miss).

Modules excluded via `modes` option are omitted entirely — their content providers are never added to the combined transform, so they have zero per-turn cost.

---

## Use modules separately

Each module is available via a subpath import. Use this when you want only one module, or to compose them manually into your own plugin:

```ts
import { CavemanPlugin } from "caveopen/caveman";
import { CavekitPlugin } from "caveopen/cavekit";
import { CavememPlugin } from "caveopen/cavemem";

// hook factories for manual composition
import { cavemanHooks } from "caveopen/caveman";
import { cavekitHooks } from "caveopen/cavekit";
import { caveMemHooks } from "caveopen/cavemem";
```

---

## Related

- [caveman](https://github.com/JuliusBrussee/caveman) — original Claude Code skill
- [cavekit](https://github.com/JuliusBrussee/cavekit) — original Claude Code plugin
- [cavemem](https://github.com/JuliusBrussee/cavemem) — original Claude Code memory tool
- [OpenCode plugin docs](https://opencode.ai/docs/plugins)
