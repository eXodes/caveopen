# CAVEMAN_HOOKS.md — OpenCode Hook Plan

Port of [caveman](https://github.com/JuliusBrussee/caveman) Claude Code hooks to OpenCode plugin system.

---

## Source Mapping

Claude Code fires shell scripts at lifecycle points. OpenCode plugins register TypeScript hooks returned from an async factory function. Every caveman behavior has a direct OpenCode equivalent.

| Claude Code hook                             | Trigger                             | OpenCode equivalent                                                  |
| -------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------- |
| `caveman-activate.js` (SessionStart)         | New session start                   | `experimental.chat.system.transform` + `session.created` event       |
| `caveman-mode-tracker.js` (UserPromptSubmit) | Every user message                  | `chat.message` hook                                                  |
| `/caveman-stats` command intercept           | UserPromptSubmit detects prefix     | `command.execute.before` hook                                        |
| Stats write + statusline suffix              | During `/caveman-stats`             | `session.idle` event → write `~/.caveman/.caveman-history.jsonl`     |
| `caveman-statusline.sh`                      | Shell subcommand in `settings.json` | TUI plugin: toast on mode change + `tui.prompt.append` compact badge |

---

## State Files

Caveman uses `$CLAUDE_CONFIG_DIR/` for all state. CaveOpen uses `~/.caveman/` — isolated, never conflicts with OpenCode internals.

```
~/.caveman/
  .caveman-active            # current mode string ("full" | "lite" | "ultra" | "off")
  .caveman-history.jsonl     # lifetime session snapshots (replaces reading Claude JSONL)
  .caveman-statusline-suffix # prerendered badge string for status display
```

**Why separate dir:** OpenCode has no `$OPENCODE_CONFIG_DIR` equivalent for plugins to write freely. `~/.caveman/` is predictable, user-owned, and portable.

---

## Hook 1 — Session Activation (`session.created`)

**Claude Code source:** `caveman-activate.js`

**What it does:**

1. Reads configured default mode
2. Writes `.caveman-active` flag
3. Emits full caveman ruleset as hidden context
4. Nudges statusline setup if not configured

**OpenCode implementation:**

```ts
// Hook A: inject caveman rules into EVERY session's system prompt (cached)
"experimental.chat.system.transform": async (input, output) => {
  const mode = readModeFlag();
  if (!mode || mode === "off") return;

  const modeLabel = mode === "wenyan" ? "wenyan-full" : mode;
  const rules = buildRuleset(modeLabel); // reads SKILL.md, filters to active level
  output.system.unshift(rules);          // prepend so it lands in system[0] → cached
},
```

```ts
// Hook B: write the active flag on session creation
event: async ({ event }) => {
  if (event.type !== "session.created") return;
  const mode = readConfig().defaultMode ?? "full";
  if (mode === "off") { removeModeFlag(); return; }
  writeModeFlag(mode);
},
```

**Caching note:** `experimental.chat.system.transform` runs before every inference call. The injected string lands in `system[0]` which `applyCaching()` always marks for caching (first 2 system messages). Full ruleset loads once, hits cache on every subsequent turn. No per-session re-injection cost.

**SKILL.md source:** Plugin reads `path.join(__dirname, "../skills/caveman/SKILL.md")` at runtime — same pattern as original. Edits to the skill propagate automatically, no hardcoded duplication.

---

## Hook 2 — Per-Turn Mode Tracking (`chat.message`)

**Claude Code source:** `caveman-mode-tracker.js` (UserPromptSubmit section)

**What it does:**

1. Detects natural language activation ("activate caveman", "less tokens", "be brief")
2. Syncs flag file when mode changes
3. Injects compact per-turn reminder so caveman stays in model attention

**OpenCode implementation:**

```ts
"chat.message": async (input, output) => {
  const text = extractText(output.message); // pull plain text from message parts
  const prompt = text.toLowerCase().trim();

  // Natural language activation
  if (isActivationPhrase(prompt) && !isDeactivationPhrase(prompt)) {
    const mode = readConfig().defaultMode ?? "full";
    if (mode !== "off") writeModeFlag(mode);
  }

  // Natural language deactivation
  if (isDeactivationPhrase(prompt)) {
    removeModeFlag();
    return;
  }

  // Mode switch: /caveman lite|full|ultra
  const modeSwitch = parseModeCommand(prompt);
  if (modeSwitch !== null) {
    modeSwitch === "off" ? removeModeFlag() : writeModeFlag(modeSwitch);
    return;
  }

  // Per-turn reinforcement: keep caveman in model attention on every turn
  const activeMode = readModeFlag();
  if (activeMode && !INDEPENDENT_MODES.has(activeMode)) {
    output.parts.push({
      type: "text",
      text: `CAVEMAN MODE ACTIVE (${activeMode}). Drop articles/filler/pleasantries/hedging. Fragments OK. Code/commits/security: write normal.`,
    });
  }
},
```

**Why per-turn reminder:** OpenCode context may compact. System prompt gets pruned before user messages. A short reinforcement string (< 30 tokens) in `output.parts` keeps caveman in the model's attention window without re-loading the full ruleset. Matches caveman's original design exactly.

**Independent modes** (`commit`, `review`, `compress`): skip reinforcement — they have their own skill behavior.

---

## Hook 3 — Command Interception (`command.execute.before`)

**Claude Code source:** `caveman-mode-tracker.js` (`/caveman-stats` intercept block)

**What it does:**

- `/caveman-stats`: blocks the user's prompt, runs stats script, returns output as context

**OpenCode implementation:**

```ts
"command.execute.before": async (input, output) => {
  if (input.command !== "caveman-stats") return;

  // Read current session stats via SDK
  const session = await client.session.get({ path: { id: input.sessionID } });
  const tokens = session.data?.info?.tokens;

  const mode = readModeFlag();
  const statsText = formatStats({ tokens, mode, sessionID: input.sessionID });

  // Append stats as context — model sees it as pre-injected context, not AI output
  output.parts.push({ type: "text", text: statsText });
},
```

**Note:** Claude Code's `/caveman-stats` uses `decision: "block"` + `reason` to return output without triggering the model. OpenCode's `command.execute.before` mutates `output.parts` to prepend context before the command runs — same effect.

---

## Hook 4 — History Persistence (`session.idle`)

**Claude Code source:** `caveman-stats.js` (history write section)

**The problem:** Claude Code reads token usage directly from session JSONL at `~/.claude/projects/`. OpenCode has no equivalent filesystem exposure — sessions are stored in a SQLite database (`opencode.db`).

**Solution:** Write our own history on every `session.idle` event using token data from the OpenCode SDK.

```ts
event: async ({ event }) => {
  if (event.type !== "session.idle") return;

  const sessionID = event.properties.sessionID;
  const session = await client.session.get({ path: { id: sessionID } });
  const info = session.data?.info;
  if (!info?.tokens?.output) return; // no tokens yet

  const mode = readModeFlag();
  const { estSavedTokens, estSavedUsd } = derivesSavings({
    outputTokens: info.tokens.output,
    mode,
    model: info.model,
  });

  const entry = JSON.stringify({
    ts: Date.now(),
    session_id: sessionID,
    mode: mode ?? null,
    model: info.model ?? null,
    output_tokens: info.tokens.output,
    cache_read_tokens: info.tokens.cache?.read ?? 0,
    est_saved_tokens: estSavedTokens,
    est_saved_usd: estSavedUsd,
  });

  appendHistory(HISTORY_PATH, entry); // ~/.caveman/.caveman-history.jsonl
},
```

**History schema** (same as caveman, compatible with caveman-stats aggregation):

```jsonl
{
  "ts": 1750000000000,
  "session_id": "abc123",
  "mode": "full",
  "model": "claude-sonnet-4-6",
  "output_tokens": 4821,
  "cache_read_tokens": 12048,
  "est_saved_tokens": 3134,
  "est_saved_usd": 0.047
}
```

**`/caveman-stats --all` and `--since Nd`:** reads history file directly via the same `aggregateHistory()` logic as caveman — no changes needed to that function.

---

## Hook 5 — TUI Status Line

**Claude Code source:** `caveman-statusline.sh` (shell script) + `settings.json` `statusLine` config

**Problem:** OpenCode has no `settings.json` statusLine command config. The TUI renders its own chrome.

**Solution:** Two-layer approach, mirroring opencode-quota's pattern.

### Layer A — Mode Change Toast (server plugin, always available)

```ts
// Show toast when mode is activated/changed
event: async ({ event }) => {
  if (event.type !== "session.idle") return;
  const activeMode = readModeFlag();
  if (!activeMode || activeMode === "off") return;

  try {
    await client.tui.showToast({
      body: {
        message: `[CAVEMAN:${activeMode.toUpperCase()}] active`,
        variant: "info",
      },
    });
  } catch {
    // headless — no TUI, skip silently
  }
},
```

### Layer B — Compact Status Badge (TUI plugin, interactive mode only)

Registered in `tui.json` alongside the server plugin registration in `opencode.json`.

The TUI plugin listens to `tui.prompt.append` to know when the prompt area refreshes, then injects the badge using `client.tui.appendPrompt` with a zero-width guard so it doesn't pollute the user's actual input:

```ts
// TUI plugin: compact status line injection
event: async ({ event }) => {
  if (event.type !== "tui.prompt.append") return;

  const activeMode = readModeFlag();
  if (!activeMode || activeMode === "off") return;

  // Show prerendered suffix from ~/.caveman/.caveman-statusline-suffix
  // (written by /caveman-stats, contains lifetime savings badge)
  const suffix = readStatuslineSuffix(); // e.g. "🦴 3.1k"

  // Inject compact badge as a non-input prompt annotation
  // Pattern mirrors opencode-quota tuiCompactStatus approach
  await client.tui.appendPrompt({
    body: {
      text: `[CAVEMAN:${activeMode.toUpperCase()}]${suffix ? " " + suffix : ""}`,
    },
  });
},
```

**Registration in `tui.json`:**

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["caveopen"]
}
```

**Guard pattern (headless safety):** All `client.tui.*` calls are wrapped in try/catch. Server plugin registers with `opencode.json`; TUI plugin registers with `tui.json`. Plugin detects absence of TUI and skips gracefully — same pattern as PLUGINS.md guidance.

---

## Caching Safety

Caveman injects content at multiple points. Each must be safe for OpenCode's two-layer caching.

| Injection point               | Hook                                      | Cache behavior                                       | Safe?                                  |
| ----------------------------- | ----------------------------------------- | ---------------------------------------------------- | -------------------------------------- |
| Full caveman ruleset          | `experimental.chat.system.transform`      | Goes into `system[0]` → always cached                | ✅ Cached, no repeat cost              |
| Per-turn reinforcement        | `chat.message` → `output.parts`           | User-turn message; last 2 non-system get cache marks | ✅ Tiny string (~30 tokens), ephemeral |
| Stats output                  | `command.execute.before` → `output.parts` | Same as above — one-shot, not repeated               | ✅ No cache impact                     |
| Session activation flag write | `session.created` event                   | No model context — pure side effect                  | ✅ No cache impact                     |
| History write                 | `session.idle` event                      | No model context — pure side effect                  | ✅ No cache impact                     |

**Key rules from CACHING.md:**

- `applyCaching()` marks `system[0..1]` + last 2 non-system messages
- Plugin-injected system content via `experimental.chat.system.transform` lands in those slots → cached
- Keep full ruleset in system transform (high reuse, cached), NOT in `chat.message` (ephemeral)
- Per-turn `chat.message` injection must stay small — one sentence is fine, dumping the full ruleset every turn would thrash the last-2 cache slots

**Gateway exception:** If user runs `@ai-sdk/gateway`, `applyCaching()` is skipped entirely (gateway handles caching). Plugin behavior unchanged — rules still inject into system, still small per-turn reminder. Just no cache marks.

---

## File Layout (CaveOpen plugin)

```
caveopen/
  src/
    caveopen.ts                     # Plugin entry — spreads module hooks, exports CaveOpenPlugin
    modules/
      caveman/
        index.ts                    # Module entry — composes all caveman hooks, exports cavemanHooks()
        hooks/
          activation.ts             # experimental.chat.system.transform + session.created
          message.ts                # chat.message: mode tracking + per-turn reinforcement
          commands.ts               # command.execute.before: /caveman-stats, /caveman-*
          history.ts                # session.idle: write ~/.caveman/.caveman-history.jsonl
          tui.ts                    # tui.prompt.append: compact status badge (TUI only)
        lib/
          config.ts                 # readModeFlag, writeModeFlag, readConfig
          history.ts                # appendHistory, aggregateHistory, parseHistory
          stats.ts                  # formatStats, formatHistory, derivesSavings
          ruleset.ts                # buildRuleset: reads SKILL.md, filters by active level
```

**Module boundary:** `src/modules/caveman/index.ts` owns hook composition — imports all hooks, merges them, and exports a single `cavemanHooks(ctx)` factory. `src/caveopen.ts` calls it without knowing internals. Future modules (`cavemem`, `cavekit`) follow the same pattern.

```ts
// src/modules/caveman/index.ts
import type { PluginContext, Hooks } from "@opencode-ai/plugin";
import { activationHooks } from "./hooks/activation.js";
import { messageHook } from "./hooks/message.js";
import { commandHooks } from "./hooks/commands.js";
import { historyHook } from "./hooks/history.js";
import { tuiHook } from "./hooks/tui.js";

export function cavemanHooks(ctx: PluginContext): Hooks {
  return {
    ...activationHooks(ctx),
    ...messageHook(ctx),
    ...commandHooks(ctx),
    ...historyHook(ctx),
    ...tuiHook(ctx),
  };
}
```

```ts
// src/caveopen.ts
import { cavemanHooks } from "./modules/caveman/index.js";
import type { Plugin } from "@opencode-ai/plugin";

export const CaveOpenPlugin: Plugin = async (ctx) => ({
  ...cavemanHooks(ctx),
  // future: ...cavememHooks(ctx), ...cavekitHooks(ctx)
});
```

---

## Implementation Order

1. **`modules/caveman/lib/config.ts`** — flag file read/write, mode validation, `~/.caveman/` init
2. **`modules/caveman/lib/history.ts`** — JSONL append, aggregate, parse (port from `caveman-stats.js`)
3. **`modules/caveman/lib/ruleset.ts`** — SKILL.md reader, level filter
4. **`modules/caveman/hooks/activation.ts`** — system transform + session.created flag write
5. **`modules/caveman/hooks/message.ts`** — chat.message mode tracking + per-turn reinforcement
6. **`modules/caveman/hooks/history.ts`** — session.idle history write
7. **`modules/caveman/hooks/commands.ts`** — command.execute.before for /caveman-stats
8. **`modules/caveman/hooks/tui.ts`** — tui.prompt.append compact badge (TUI plugin)
9. **`modules/caveman/index.ts`** — compose all hooks into `cavemanHooks(ctx)`
10. **`src/caveopen.ts`** — spread `cavemanHooks(ctx)` into `CaveOpenPlugin`
11. **Verify:** run `/caveman-stats`, check `~/.caveman/.caveman-history.jsonl`, confirm system prompt injection, confirm no cache thrash
