# caveopen

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![OpenCode](https://img.shields.io/badge/OpenCode-plugin-8b5cf6)](https://opencode.ai/docs/plugins)
[![Made with Cowork](https://img.shields.io/badge/Made%20with-Cowork-D97706?logo=anthropic&logoColor=white)](https://claude.ai)

An [OpenCode](https://opencode.ai) plugin that ports [caveman](https://github.com/JuliusBrussee/caveman), [cavekit v4](https://github.com/JuliusBrussee/cavekit), and [cavemem](https://github.com/JuliusBrussee/cavemem) to OpenCode's native extension model — no Claude Code dependency required.

## What's included

Three composable modules, each opt-in:

**caveman** — Token-efficient communication mode. Activates via `/caveman [lite|full|ultra|wenyan-*]` or natural language. Injects compression rules into every LLM call and tracks per-session token savings to `~/.caveman/.caveman-history.jsonl`.

**cavekit** — Spec-Driven Development for OpenCode. Provides `/ck:spec`, `/ck:build`, `/ck:check`, `/ck:init`, `/ck:audit`, and `/ck:eval` commands backed by a single `SPEC.md` file. Uses `FORMAT.md` as the encoding schema for caveman-compressed specs.

**cavemem** — Persistent memory via the [cavemem](https://github.com/JuliusBrussee/cavemem) CLI. Bridges OpenCode's session lifecycle (`session.created`, `message.updated`, `session.idle`, `session.deleted`) to cavemem's hook runner so the model has durable memory across sessions.

## Installation

### npx (recommended)

```bash
npx caveopen init                         # global (~/.config/opencode/)
npx caveopen init --project               # project-local (.opencode/)
npx caveopen init --modes caveman,cavekit # install subset only
```


> [!NOTE]
> The `cavemem` module requires **both** the [cavemem CLI](https://github.com/JuliusBrussee/cavemem) (`npm install -g cavemem`) **and** the cavemem MCP server registered in `opencode.json` (the installer adds it automatically). The CLI drives session lifecycle hooks; the MCP server (`npx cavemem mcp`) is what registers the `search`, `timeline`, and `get_observations` tools the model uses. If the MCP server is not configured, the model is not told about the tools. If the CLI is not found at runtime, lifecycle hooks are disabled with a single warning — the rest of the plugin continues normally.

## Configuration

After `npx caveopen init`, your `opencode.json` will contain:

```json
{
  "plugin": ["caveopen"],
  "mcp": {
    "cavemem": {
      "type": "local",
      "command": ["npx", "cavemem", "mcp"]
    }
  }
}
```

To limit which modules are active, pass a `modes` option:

```json
{
  "plugin": [["caveopen", { "modes": "caveman" }]]
}
```

`modes` is a comma-separated string. Valid values: `caveman`, `cavekit`, `cavemem`. Omit or leave empty to activate all three.

## Usage

### caveman

| Command                                           | Effect                                                      |
| ------------------------------------------------- | ----------------------------------------------------------- |
| `/caveman`                                        | Activate full compression mode                              |
| `/caveman lite\|full\|ultra`                      | Activate specific intensity                                 |
| `/caveman wenyan-lite\|wenyan-full\|wenyan-ultra` | Activate Wenyan-style encoding                              |
| `/caveman off`                                    | Deactivate                                                  |
| `/caveman-stats`                                  | Show aggregate token savings across all recorded sessions   |
| `/caveman-commit`                                 | Generate a terse Conventional Commits message               |
| `/caveman-compress <file>`                        | Rewrite a memory file (AGENTS.md, etc.) in caveman encoding |
| `/caveman-review [file\|ref]`                     | Emit one-line-per-finding code review comments              |

Natural language also works: `enable caveman`, `use caveman ultra`, `turn off caveman`.

Mode is in-process only. For cross-session persistence, re-issue `/caveman <mode>` at session start.

Token savings are tracked per-session to `~/.caveman/.caveman-history.jsonl`. `/caveman-stats` aggregates the latest entry per session and reports total output tokens and estimated saved tokens.

### cavekit

Initialize a project before writing a spec:

```
/ck:init
```

This copies `FORMAT.md` (the SPEC.md encoding schema) to the project root.

| Command                   | Effect                                                           |
| ------------------------- | ---------------------------------------------------------------- |
| `/ck:init`                | Copy `FORMAT.md` to project root                                 |
| `/ck:spec <idea>`         | Create or amend `SPEC.md`                                        |
| `/ck:build`               | Implement next task from `SPEC.md`                               |
| `/ck:check`               | Drift check — diff spec against current code                     |
| `/ck:audit`               | Classify §V invariants as COMPUTATIONAL / INFERENTIAL / DEAD     |
| `/ck:eval [§T.n\|--diff]` | Grade completed build output against §V + §T acceptance criteria |

### cavemem

No manual commands needed. The plugin automatically calls cavemem hooks at the right points in the session lifecycle:

| Hook                 | When                                                                              |
| -------------------- | --------------------------------------------------------------------------------- |
| `session-start`      | First real user message (deferred from `session.created` to avoid phantom writes) |
| `user-prompt-submit` | Each user message                                                                 |
| `stop`               | Each completed assistant turn                                                     |
| `session-end`        | Session idle or deleted (only if `session-start` fired)                           |

### cavecrew agents

The cavecrew subagents (`cavecrew-investigator`, `cavecrew-builder`, `cavecrew-reviewer`) ship without a `model:` in their frontmatter. OpenCode uses the default model unless you override it per-agent in `opencode.json`:

```json
{
  "agents": {
    "cavecrew-investigator": { "model": "anthropic/claude-haiku-4-5-20251001" },
    "cavecrew-builder":      { "model": "anthropic/claude-haiku-4-5-20251001" },
    "cavecrew-reviewer":     { "model": "anthropic/claude-haiku-4-5-20251001" }
  }
}
```

Point to any model string your OpenCode install supports. Using a fast/cheap model for investigator and reviewer is recommended — their output is caveman-compressed and the tasks are read-only or bounded-edit.

## Development

```bash
bun install       # or npm install
bun run build     # tsc → dist/
bun run test      # compile + run node:test suite
bun run typecheck # type-check only
```

The plugin source lives in `src/`. Assets (skills, commands, `FORMAT.md`) live in `assets/` and are shipped in the npm package. The `.opencode/` directory at the repo root is a working installation used for local development.

## Related

- [caveman](https://github.com/JuliusBrussee/caveman) — original Claude Code plugin
- [cavekit](https://github.com/JuliusBrussee/cavekit) — Spec-Driven Development for Claude Code
- [cavemem](https://github.com/JuliusBrussee/cavemem) — persistent memory for AI coding agents
- [OpenCode](https://github.com/anomalyco/opencode) — open-source AI coding agent
- [OpenCode plugin docs](https://opencode.ai/docs/plugins)
