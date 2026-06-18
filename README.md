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
✓ registered   caveopen → opencode.json
✓ configured   cavemem MCP → opencode.json
✓ added        13 skills
✓ added        12 commands
✓ added        3 agents
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

A port of [cavekit v4](https://github.com/JuliusBrussee/cavekit) that adds spec-driven development (SDD) to OpenCode. The `/ck:init` command bootstraps a project by copying `FORMAT.md` — the canonical encoding reference that `/ck:spec`, `/ck:build`, and `/ck:check` all read from. All three skills are included and work the same as the upstream Claude Code versions.

Skills read `SPEC.md` directly from disk on demand. No ambient spec context is injected into the system prompt — that approach caused the model to hallucinate connections between open tasks and unrelated prompts.

### cavemem — persistent session memory

A port of [cavemem](https://github.com/JuliusBrussee/cavemem) that bridges its SQLite memory store into OpenCode's plugin lifecycle. On each new session, prior-session summaries for the same working directory are fetched and injected into the system prompt. Tool calls and turn output are observed and stored as the session progresses, building a memory that carries context forward across sessions.

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

| Command                                            | Description                                         |
| -------------------------------------------------- | --------------------------------------------------- |
| `/ck:init`                                         | Copy `FORMAT.md` to project root (or global config) |
| `/ck:spec [idea\|from-code\|amend §X.n\|bug: ...]` | Create or amend `SPEC.md`                           |
| `/ck:build [§T.n\|--next\|--all]`                  | Implement spec tasks with a validation loop         |
| `/ck:check [§V\|§I\|§T\|--all]`                    | Drift-detect `SPEC.md` vs. code (read-only)         |
| `/ck:audit [--trim]`                               | Full codebase audit against spec                    |
| `/ck:eval [§T.n\|--diff]`                          | Evaluate spec coverage and quality                  |

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

Each module registers TypeScript hooks into OpenCode's plugin lifecycle. The three modules compose cleanly — same-key handlers chain (`a → b`), output mutations accumulate:

```
CaveOpenPlugin
  ├── caveman  → experimental.chat.system.transform, chat.message, command.execute.before, event
  ├── cavekit  → command.execute.before, config
  └── cavemem  → experimental.chat.system.transform, chat.message, tool.execute.after, event
```

System prompt injections land in `system[0]`/`system[1]` — the slots that OpenCode's `applyCaching()` always marks for prompt caching on Anthropic models. The caveman ruleset and cavemem context are loaded once per session and served from cache on every subsequent turn.

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
