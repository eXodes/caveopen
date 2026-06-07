# CaveOpen — Initial Plan

Port of `caveman`, `cavekit v4`, and `cavemem` for OpenCode's native extension model.
Distributed as a single npm package (`caveopen`) with per-tool opt-in via config.

> **Source verified** against live plugins in `~/.config/opencode/plugins/` and
> `anomalyco/opencode` (`dev` branch). All hook names, event types, and property
> shapes are confirmed from working code.

---

## What this is

A single installable npm plugin that brings the Caveman ecosystem to OpenCode. Each tool maps to OpenCode primitives (skills, commands, plugins) — no Claude Code dependency, no skill-file-only approach.

## What this is NOT

- A Claude Code plugin
- A raw SKILL.md drop-in
- A port of v3.x (the Hunt lifecycle, frozen at `v3.1.0`)
- A port of `caveman-code` or `cavegemma` (out of scope)

---

## Install

```sh
# global via install.sh (peer deps + config merge)
curl -fsSL https://raw.githubusercontent.com/exodes/caveopen/main/install.sh | bash

# or manually add to opencode.json
```

```json
{
  "plugin": [
    ["caveopen", { "mode": "caveman" }]
  ]
}
```

### Modes

| Mode | Includes |
|---|---|
| `"all"` (default) | caveman + cavekit + cavemem |
| `"caveman"` | caveman only |
| `"cavekit"` | cavekit only |
| `"cavemem"` | cavemem only |

Unknown mode → warn and fall back to `"all"`.

### Peer deps

`install.sh` installs peer deps before wiring:

```sh
npm install -g cavemem   # only if mode includes cavemem
```

No bundling. Peer deps declared in `package.json#peerDependencies`.

---

## OpenCode Extension Model (reference)

| Primitive    | Location                             | Purpose                                              |
| ------------ | ------------------------------------ | ---------------------------------------------------- |
| **Skills**   | `.opencode/skills/<name>/SKILL.md`   | On-demand agent instructions via `skill` tool        |
| **Commands** | `.opencode/commands/<name>.md`       | Slash-command templates                              |
| **Plugins**  | npm `"plugin"` array                 | JS/TS hooks into session/tool events + custom tools  |
| **Config**   | `opencode.json`                      | MCP servers, plugin options                          |

---

## Package Structure

```
caveopen/
├── src/
│   ├── index.ts                          # plugin entry — reads mode, merges hooks
│   ├── caveman.ts                        # caveman module
│   ├── cavekit.ts                        # cavekit module
│   └── cavemem.ts                        # cavemem module
├── assets/
│   ├── skills/
│   │   ├── caveman/SKILL.md              # compression ruleset
│   │   ├── ck-spec/SKILL.md             # spec mutator skill
│   │   ├── ck-build/SKILL.md            # plan-execute skill
│   │   ├── ck-check/SKILL.md            # drift report skill
│   │   ├── ck-caveman/SKILL.md          # encoding utility (cavekit-scoped)
│   │   └── ck-backprop/SKILL.md         # bug → §B + §V protocol
│   ├── commands/
│   │   ├── caveman.md                   # /caveman [lite|full|ultra|wenyan]
│   │   ├── caveman-commit.md            # /caveman-commit
│   │   ├── caveman-review.md            # /caveman-review
│   │   ├── caveman-compress.md          # /caveman-compress <file>
│   │   ├── ck:spec.md                   # /ck:spec [bug: | amend §X.n | from-code | <idea>]
│   │   ├── ck:build.md                  # /ck:build [§T.n | --all | --next]
│   │   └── ck:check.md                  # /ck:check [§V | §I | §T | --all]
│   └── FORMAT.md                        # SPEC.md schema — bundled, injected at runtime
├── package.json
└── tsconfig.json
```

Skills and command assets are bundled inside the npm package. `install.sh` copies them to `~/.config/opencode/` (global) or `.opencode/` (project).

---

## Hook Reference (confirmed from live code)

| Hook | Fires when | Used by |
|---|---|---|
| `experimental.chat.system.transform` | Before every LLM call — append to `output.system[]` | caveman (rules), cavekit (FORMAT.md), cavemem (tool hint) |
| `experimental.session.compacting` | Before context compaction — append to `output.context[]` | cavekit (re-inject FORMAT.md) |
| `tui.prompt.append` | Before prompt sent to model — return `{ append: string }` | caveman (reinforcement line) |
| `tool.execute.after` | After any tool completes | cavemem (post-tool-use hook) |
| `event` | Every bus event — filter by `event.type` | caveman (token tracking), cavemem (lifecycle) |

**Confirmed event types** (from live cavemem plugin):

| `event.type` | `event.properties` shape |
|---|---|
| `session.created` | `{ info: { id, directory } }` |
| `session.idle` | `{ sessionID }` |
| `session.deleted` | `{ info: { id } }` |
| `message.updated` | `{ info: { id, sessionID, role, summary: { body }, time: { completed }, tokens: { output, input, cache: { read } } } }` |
| `message.part.updated` | `{ part: { type, sessionID, messageID, text }, delta }` |
| `command.executed` | `{ sessionID, name, arguments }` |

> **`$` (Bun shell)** on `PluginInput` is `undefined` on Node.js runtimes. Use `execSync` from `child_process` everywhere. Confirmed by live cavemem code.

> **`session.created` top-level hook key** exists in `Hooks` but does not fire reliably (not in typed interface). Use the `event` hook with `event.type === "session.created"` as the reliable path. Confirmed by both live caveman and cavekit comments.

> **`tui.prompt.append`** is undocumented and not in the typed `Hooks` interface. Cast the returned hooks object `as any`. Confirmed working in live caveman plugin.

---

## Plugin Entry (`src/index.ts`)

Bare `Plugin` function export — this is what the live plugins use. The v1 `{ id, server }` format is only needed for dual server+TUI plugins.

```ts
import type { Plugin, PluginInput, PluginOptions, Hooks } from "@opencode-ai/plugin"
import { caveman } from "./caveman"
import { cavekit } from "./cavekit"
import { cavemem } from "./cavemem"

type Mode = "all" | "caveman" | "cavekit" | "cavemem"

interface CaveopenOptions extends PluginOptions {
  mode?: Mode
}

const CaveopenPlugin: Plugin = async (input: PluginInput, options: CaveopenOptions = {}) => {
  const mode = (options.mode ?? "all") as Mode
  const hooks: Hooks = {}

  if (mode === "all" || mode === "caveman") Object.assign(hooks, await caveman(input))
  if (mode === "all" || mode === "cavekit") Object.assign(hooks, await cavekit(input))
  if (mode === "all" || mode === "cavemem") Object.assign(hooks, await cavemem(input))

  return hooks as any // tui.prompt.append not in typed Hooks
}

export default CaveopenPlugin
```

---

## Per-Module Design

### caveman (`src/caveman.ts`)

Three distinct concerns, three hooks:

**1. `experimental.chat.system.transform` — always-on ruleset injection**

Fires before every LLM call. Appends the caveman SKILL.md ruleset to the system prompt. Always-on, no flag file, no trigger required.

**2. `tui.prompt.append` — per-prompt reinforcement + mode management**

Fires before each user prompt. Parses the prompt for slash commands and natural-language toggles (activate/deactivate caveman, mode change). When caveman is active, appends a one-line reinforcement to the prompt so the model can't drift mid-session. Returns `{ append: string }` or `undefined`.

**3. `event` hook — token tracking**

Listens for `message.updated` with `role === "assistant"` and `time.completed` set. Reads `tokens.output` and estimates tokens saved based on per-mode compression ratios. Writes a JSONL entry to `~/.config/caveman/.caveman-history.jsonl`.

```ts
// src/caveman.ts (sketch)
import type { Plugin, Hooks } from "@opencode-ai/plugin"
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { appendFileSync } from "node:fs"

const here = dirname(fileURLToPath(import.meta.url))
const RULES = readFileSync(join(here, "../assets/skills/caveman/SKILL.md"), "utf8")

const COMPRESSION: Record<string, number> = {
  lite: 0.41, full: 0.44, ultra: 0.04,
  "wenyan-lite": 0.35, "wenyan-full": 0.65, "wenyan-ultra": 0.8,
}

export const caveman: Plugin = async (_input) => {
  let reinforcementInjected = false

  return {
    "experimental.chat.system.transform": async (_in, output) => {
      output.system.push(RULES)
    },

    "tui.prompt.append": async (input: { prompt?: string; text?: string } | undefined) => {
      const promptText = (input?.prompt || input?.text || "").trim()
      const change = parseModeChange(promptText)
      if (change) applyModeChange(change)

      const mode = readActiveMode()
      if (mode && !reinforcementInjected) {
        reinforcementInjected = true
        return { append: `CAVEMAN MODE ACTIVE (${mode}). Drop articles/filler/pleasantries/hedging.` }
      }
      return undefined
    },

    event: async ({ event }) => {
      if (event.type === "session.created") {
        reinforcementInjected = false
        return
      }
      if (event.type !== "message.updated") return
      const msg = event.properties?.info as any
      if (!msg || msg.role !== "assistant" || !msg.time?.completed) return

      const mode = readActiveMode()
      const outTokens = msg.tokens?.output ?? 0
      const ratio = mode ? (COMPRESSION[mode] ?? null) : null
      const estSaved = ratio !== null ? Math.round(outTokens / (1 - ratio)) - outTokens : 0

      appendFileSync(histPath, JSON.stringify({
        ts: Date.now(), session_id: msg.sessionID, mode,
        output_tokens: outTokens, est_saved_tokens: estSaved,
      }) + "\n")
    },
  } as any
}
```

**Skills registered:** `caveman`

**Commands registered:** `/caveman`, `/caveman-commit`, `/caveman-review`, `/caveman-compress`

> `caveman-*` commands use hyphens — behavior-instruction commands, not namespace-scoped tool commands like `/ck:*`.

**Statusline badge:** Deferred post-MVP. Requires a separate TUI plugin entry in `tui.json` with a Solid.js/opentui slot component (same mechanism as `opencode-quota` Compact status line). Not a server-side hook.

---

### cavekit (`src/cavekit.ts`)

> **Targets cavekit v4.** Three commands, five skills, no sub-agents, no CLI binary. SPEC.md is the sole state file.

**v4 command surface:**

| Command | Job | Key args |
|---|---|---|
| `/ck:spec` | Create / amend / backprop `SPEC.md`. Sole mutator. | `bug: <desc>` · `amend §X.n` · `from-code` · `<idea>` |
| `/ck:build` | Plan → execute against spec. Auto-backprops on failure. | `§T.n` · `--next` · `--all` |
| `/ck:check` | Read-only drift report. Lists §V / §I / §T violations. | `§V` · `§I` · `§T` · `--all` |

**v4 skill surface (all prefixed `ck-`):**

| Skill | Role |
|---|---|
| `ck-spec` | Mirrors `/ck:spec` as skill trigger |
| `ck-build` | Mirrors `/ck:build` |
| `ck-check` | Mirrors `/ck:check` |
| `ck-caveman` | Encoding utility for spec writing (cavekit-scoped) |
| `ck-backprop` | Bug → §B + §V six-step protocol |

**Two hooks:**

**1. `experimental.chat.system.transform` — inject FORMAT.md**

Injects FORMAT.md into the system prompt. Uses system prompt injection for stable provider prefix-cache keys across turns.

**2. `/ck:init` — two-layer implementation**

`/ck:init` has no command file. The plugin handles it via both:
- `command.execute.before` — intercepts the slash command directly, copies FORMAT.md to project root
- `tool` key in hooks — registers `ck_init` as an agent-callable tool so the LLM can invoke it autonomously

```ts
// src/cavekit.ts (sketch)
import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { copyFileSync, readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))

function readFormat() {
  return readFileSync(join(here, "../assets/FORMAT.md"), "utf8")
}

function copyFormat(directory: string) {
  const src = join(here, "../assets/FORMAT.md")
  const dest = join(directory, "FORMAT.md")
  copyFileSync(src, dest)
  return `FORMAT.md written to ${dest}`
}

export const cavekit: Plugin = async (input) => {
  return {
    "experimental.chat.system.transform": async (_in, output) => {
      output.system.push(`<cavekit-format>\n${readFormat()}\n</cavekit-format>`)
    },

    "command.execute.before": async ({ command }, output) => {
      if (command !== "ck:init") return
      output.parts = [{ type: "text", text: copyFormat(input.directory) }]
    },

    tool: {
      ck_init: tool({
        description: "Copy FORMAT.md (SPEC.md schema) to the project root. Run once per project.",
        args: {},
        async execute(_, ctx) {
          return copyFormat(ctx.directory)
        },
      }),
    },
  } as any
}
```

**SPEC.md format (fixed sections):**

```
§G GOAL          — one-line goal, caveman encoded
§C CONSTRAINTS   — non-negotiable bullets
§I INTERFACES    — external surfaces (cmd/api/file/env)
§V INVARIANTS    — numbered, testable, each ! MUST hold
§T TASKS         — pipe table: id|status|task|cites  (status: x/~/.)
§B BUGS          — pipe table: id|date|cause|fix (backprop log)
```

Caveman symbols (`→`, `∀`, `!`, `⊥`, `≤`, etc.) are first-class in spec bodies.

---

### cavemem (`src/cavemem.ts`)

**Phantom session problem (V57 solution):**

`session.created` fires even when the user opens and immediately exits OpenCode with no messages. Writing to cavemem on session-start produces empty/garbage entries.

**Solution:** defer `session-start` until the first `message.updated` event with `role === "user"`. Track which sessions have been started in a `Set`. On `session.idle` / `session.deleted`, only process sessions that were actually started.

**Hook structure:**

**1. `experimental.chat.system.transform` — inject tool availability hint**

Tells the model it has cavemem tools available. Static string, no CLI call needed (the MCP server handles actual tool execution).

**2. `tool.execute.after` — post-tool-use hook**

Records tool calls to cavemem after each tool execution.

**3. `event` hook — full session lifecycle**

| Event | Action |
|---|---|
| `session.created` | Track session ID in `activeSessions` set — no cavemem write yet |
| `message.updated` (role=user) | First user message → call `session-start`, then `user-prompt-submit` |
| `message.updated` (role=assistant, completed) | Call `stop` with turn text buffer |
| `session.idle` / `session.deleted` | Flush turn buffer, call `session-end`, clean up sets |
| `message.part.updated` | Buffer streaming text per messageID |
| `command.executed` | Call `post-tool-use` |

```ts
// src/cavemem.ts (sketch)
import type { Plugin } from "@opencode-ai/plugin"
import type { Event } from "@opencode-ai/sdk"
import { execSync } from "node:child_process"
import { appendFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"

function runHook(name: string, data: Record<string, unknown>) {
  const json = JSON.stringify(data)
  execSync(`printf '%s' ${shellEsc(json)} | cavemem hook run ${name} --ide opencode 2>&1`,
    { encoding: "utf8", timeout: 10_000 })
}

export const cavemem: Plugin = async ({ directory }) => {
  const activeSessions = new Set<string>()
  const startedSessions = new Set<string>()
  const messageTexts = new Map<string, { sessionID: string; text: string }>()

  return {
    "experimental.chat.system.transform": async (_in, output) => {
      output.system.push(
        "You have cavemem memory tools (search, timeline, get_observations). Use them when past context would help."
      )
    },

    "tool.execute.after": async (input, output) => {
      if (!input.sessionID) return
      runHook("post-tool-use", {
        session_id: input.sessionID,
        tool_name: input.tool,
        tool_input: String(input.args).slice(0, 500),
        tool_response: output.output.slice(0, 2000),
      })
    },

    event: async ({ event }: { event: Event }) => {
      const type = (event as any).type as string

      if (type === "session.created") {
        const info = (event.properties as any).info
        activeSessions.add(info.id)
        return
      }

      if (type === "message.updated") {
        const info = (event.properties as any).info
        if (!info?.sessionID || !info?.id) return

        if (info.role === "user" && info.summary?.body?.trim()) {
          if (!startedSessions.has(info.sessionID)) {
            startedSessions.add(info.sessionID)
            runHook("session-start", { session_id: info.sessionID, ide: "opencode", cwd: directory })
          }
          runHook("user-prompt-submit", { session_id: info.sessionID, prompt: info.summary.body.trim() })
          messageTexts.delete(info.id)
          return
        }

        if (info.role === "assistant" && info.time?.completed) {
          const entry = messageTexts.get(info.id)
          if (entry?.text.trim()) {
            runHook("stop", { session_id: info.sessionID, turn_summary: entry.text.trim() })
          }
          messageTexts.delete(info.id)
        }
        return
      }

      if (type === "session.idle" || type === "session.deleted") {
        const sid = type === "session.idle"
          ? (event.properties as any).sessionID
          : (event.properties as any).info?.id
        if (!sid) return
        for (const [mid, entry] of messageTexts) {
          if (entry.sessionID === sid && entry.text.trim()) {
            runHook("stop", { session_id: sid, turn_summary: entry.text.trim() })
            messageTexts.delete(mid)
          }
        }
        if (startedSessions.has(sid)) runHook("session-end", { session_id: sid })
        activeSessions.delete(sid)
        startedSessions.delete(sid)
        return
      }

      if (type === "message.part.updated") {
        const part = (event.properties as any).part
        if (part?.type === "text" && part.sessionID && part.messageID) {
          const existing = messageTexts.get(part.messageID)
          const delta = (event.properties as any).delta || part.text || ""
          if (existing) existing.text += delta
          else messageTexts.set(part.messageID, { sessionID: part.sessionID, text: delta })
        }
        return
      }
    },
  }
}
```

**MCP wiring** — `install.sh` merges cavemem MCP into `~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "cavemem": {
      "type": "local",
      "command": ["npx", "caveman-shrink", "cavemem", "mcp"]
    }
  }
}
```

Agents get `search`, `timeline`, `get_observations` tools natively mid-session.

---

## install.sh responsibilities

1. `npm install -g caveopen` (or from repo during dev)
2. If mode includes `cavemem`: `npm install -g cavemem` (peer dep)
3. Write default `~/.config/opencode/opencode.json` plugin entry if not present
4. Merge MCP entry for cavemem if mode includes it
5. Copy skills + commands to `~/.config/opencode/` for global access

Per-project: `--project` flag writes to `.opencode/` instead and updates local `opencode.json`.

---

## Feasibility — Verified Against Live Code

All hooks confirmed from `~/.config/opencode/plugins/{caveman,cavekit,cavemem}/` and `anomalyco/opencode` `dev` branch.

| Item | Status | Notes |
|---|---|---|
| `experimental.chat.system.transform` | ✅ Confirmed | Used by all three modules |
| `experimental.session.compacting` | ✅ Confirmed | cavekit re-injects FORMAT.md |
| `tui.prompt.append` | ✅ Confirmed | Undocumented; cast `as any`; returns `{ append: string }` |
| `tool.execute.after` | ✅ Confirmed | cavemem post-tool-use hook |
| `event` hook + event type strings | ✅ Confirmed | Full property shapes documented above |
| `session.created` top-level key | ⚠️ Unreliable | Not in typed interface; use `event` hook instead |
| Bare `Plugin` function export | ✅ Confirmed | All live plugins use this; v1 `{ id, server }` not needed |
| `execSync` over `$` | ✅ Confirmed | `$` is undefined on Node.js; cavemem explicitly uses `execSync` |
| Skills + command assets (static markdown) | ✅ Confirmed | Fully compatible |
| npm plugin tuple `["caveopen", { mode }]` | ✅ Confirmed | `PluginOptions` in `Plugin` type |
| No `/ck:init` needed | ✅ Confirmed | FORMAT.md injected from package assets at runtime |
| Statusline badge (TUI slot) | 🔜 Post-MVP | Requires separate `tui.json` plugin + Solid.js component |

---

## What doesn't port

| Feature | Reason |
|---|---|
| v3.x Hunt lifecycle | Frozen at v3.1.0. Separate product. |
| Sub-agents (ck:drafter, etc.) | v4 removes all sub-agents |
| cavekit Go CLI + team features | v4 removes the binary |
| Command safety gate | v4 has no parallel dispatch |
| Statusline badge (MVP) | Requires TUI plugin + opentui slot; deferred post-MVP |
| caveman-code | Separate product |
| cavegemma | Finetuned model |
| SOUL.md pattern | OpenClaw-specific |
