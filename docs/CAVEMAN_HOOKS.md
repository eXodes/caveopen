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
  const text = extractTextFromParts(output.parts);
  const prompt = text.toLowerCase().trim();

  // Mode switch: /caveman lite|full|ultra|off — checked first, returns early
  const modeSwitch = parseModeCommand(prompt);
  if (modeSwitch !== null) {
    modeSwitch === "off" ? removeModeFlag() : writeModeFlag(modeSwitch);
    return;
  }

  // Natural language deactivation
  if (isDeactivationPhrase(prompt)) {
    removeModeFlag();
    return;
  }

  // Natural language activation
  if (isActivationPhrase(prompt)) {
    const defMode = readConfig().defaultMode;
    if (defMode !== "off") writeModeFlag(defMode);
  }

  // Per-turn reinforcement: keep caveman in model attention on every turn
  const activeMode = readModeFlag();
  if (activeMode && !INDEPENDENT_MODES.has(activeMode)) {
    output.parts.push({
      id: partId(),
      sessionID: input.sessionID,
      messageID: output.message.id,
      type: "text",
      text: `CAVEMAN MODE ACTIVE (${activeMode}). Drop articles/filler/pleasantries/hedging. Fragments OK. Code/commits/security: write normal.`,
      synthetic: true,
    });
  }
},
```

**Logic order:** mode switch (`/caveman <level>`) checked first so it exits before activation/deactivation phrase matching. Deactivation before activation to avoid conflict when both phrases appear.

**`synthetic: true`** — marks the injected part as non-user-authored so OpenCode can distinguish it from real user input.

**`output.message.id`** — use the existing message's ID, not a fresh one; `partId()` generates a unique part ID via cuid.

**Why per-turn reminder:** OpenCode context may compact. System prompt gets pruned before user messages. A short reinforcement string (< 30 tokens) in `output.parts` keeps caveman in the model's attention window without re-loading the full ruleset.

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

  const args = input.arguments ?? "";
  const showAll = args.includes("--all");
  const sinceMatch = args.match(/--since\s+(\d+)d/);
  const sinceDays = sinceMatch ? parseInt(sinceMatch[1]!, 10) : undefined;

  const tokens = await getSessionTokens(ctx.client, input.sessionID);
  const sessionStats = formatStats({ tokens, mode: readModeFlag(), sessionID: input.sessionID });

  const parts: string[] = [sessionStats];
  if (showAll || sinceDays) {
    const agg = aggregateHistory(parseHistory(HISTORY_PATH, sinceDays));
    parts.push(formatHistory(agg));
  }

  output.parts.push({
    id: partId(),
    sessionID: input.sessionID,
    messageID: messageId(),
    type: "text",
    text: parts.filter(Boolean).join("\n\n"),
  });
},
```

**Flags:** `--all` shows lifetime history; `--since Nd` filters to last N days (e.g. `--since 7d`). Both read `~/.caveman/.caveman-history.jsonl` via `parseHistory(HISTORY_PATH, sinceDays)`.

**Part shape:** requires `id` (via `partId()`), `sessionID`, and `messageID` (via `messageId()`) — both from `src/lib/cuid.ts`.

---

## Hook 4 — History Persistence (`session.idle`)

**Claude Code source:** `caveman-stats.js` (history write section)

**The problem:** Claude Code reads token usage directly from session JSONL at `~/.claude/projects/`. OpenCode has no equivalent filesystem exposure — sessions are stored in a SQLite database (`opencode.db`).

**Solution:** Write our own history on every `session.idle` event. Tokens are aggregated from `client.session.messages()` via `getSessionTokens()` in `lib/tokens.ts` — summing across all assistant messages in the session.

```ts
event: async ({ event }) => {
  if (event.type !== "session.idle") return;

  const sessionID = event.properties?.sessionID;
  if (!sessionID) return;

  const tokens = await getSessionTokens(ctx.client, sessionID);
  if (!tokens) return; // no output tokens yet

  const mode = readModeFlag();
  const model: string | null = null; // not exposed per-session by SDK

  const { estSavedTokens, estSavedUsd } = derivesSavings({
    outputTokens: tokens.output,
    mode,
    model,
  });

  appendHistory(
    HISTORY_PATH,
    JSON.stringify({
      ts: Date.now(),
      session_id: sessionID,
      mode: mode ?? null,
      model,
      output_tokens: tokens.output,
      cache_read_tokens: tokens.cache.read,
      est_saved_tokens: estSavedTokens,
      est_saved_usd: estSavedUsd,
    }),
  );

  const agg = aggregateHistory(parseHistory(HISTORY_PATH));
  writeStatuslineSuffix(formatStatuslineSuffix(agg));
},
```

**`getSessionTokens()`** calls `client.session.messages()` and sums `tokens.{input,output,cache.read,cache.write}` across all assistant messages. Returns `null` if no output tokens yet. Model string is not exposed per-session by the SDK — stored as `null` in history.

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

### Compact Status Badge (TUI plugin, interactive mode only)

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
    caveopen.ts                     # Plugin entry — mergeHooks across modules, exports CaveOpenPlugin
    lib/
      merge-hooks.ts                # mergeHooks() utility — fan-in same-key hooks across modules
      cuid.ts                       # cuid(), partId(), messageId() — unique ID generation (SHA3-512)
    modules/
      caveman/
        index.ts                    # Module entry — composes caveman hooks, exports cavemanHooks()
        hooks/
          activation.ts             # experimental.chat.system.transform + session.created
          message.ts                # chat.message: mode tracking + per-turn reinforcement
          commands.ts               # command.execute.before: /caveman-stats, /caveman-*
          history.ts                # session.idle: write ~/.caveman/.caveman-history.jsonl
          tui.ts                    # tui.prompt.append: compact status badge (TUI only)
        lib/
          config.ts                 # readModeFlag, writeModeFlag, readConfig, writeStatuslineSuffix
          history.ts                # appendHistory, aggregateHistory, parseHistory
          stats.ts                  # formatStats, formatStatuslineSuffix, derivesSavings
          ruleset.ts                # buildRuleset: reads SKILL.md, filters by active level
          tokens.ts                 # getSessionTokens: aggregates token counts from session messages
```

**Module boundary:** `src/modules/caveman/index.ts` owns hook composition — hooks are keyed directly (not spread) so same-key handlers from multiple modules stay separate until `mergeHooks` fans them in at `src/caveopen.ts`.

```ts
// src/modules/caveman/index.ts
import type { PluginInput, Hooks } from "@opencode-ai/plugin";
import { systemTransformHook, handleSessionCreated } from "./hooks/activation.js";
import { chatMessageHook } from "./hooks/message.js";
import { handleSessionIdle } from "./hooks/history.js";
import { commandExecuteBeforeHook } from "./hooks/commands.js";
import { handleTuiEvents } from "./hooks/tui.js";

export function cavemanHooks(ctx: PluginInput): Hooks {
  return {
    "experimental.chat.system.transform": systemTransformHook(ctx),
    "chat.message": chatMessageHook(ctx),
    "command.execute.before": commandExecuteBeforeHook(ctx),
    "event": async ({ event }) => {
      await handleSessionCreated(event, ctx);
      await handleSessionIdle(event, ctx);
      await handleTuiEvents(event, ctx);
    },
  };
}
```

```ts
// src/caveopen.ts
import type { Plugin } from "@opencode-ai/plugin";
import { cavemanHooks } from "./modules/caveman/index.js";
import { cavekitHooks } from "./modules/cavekit/index.js";
import { caveMemHooks } from "./modules/cavemem/index.js";
import { mergeHooks } from "./lib/merge-hooks.js";

export type CaveOpenMode = "caveman" | "cavekit" | "cavemem";

const ALL_MODES: CaveOpenMode[] = ["caveman", "cavekit", "cavemem"];

export const CaveOpenPlugin: Plugin = async (ctx, options) => {
  const modes: CaveOpenMode[] = Array.isArray(options?.modes)
    ? (options.modes as string[]).filter((m): m is CaveOpenMode =>
        ALL_MODES.includes(m as CaveOpenMode)
      )
    : ALL_MODES;

  const hookSets = [
    modes.includes("caveman") && cavemanHooks(ctx),
    modes.includes("cavemem") && caveMemHooks(ctx),
    modes.includes("cavekit") && cavekitHooks(ctx),
  ].filter(Boolean) as Parameters<typeof mergeHooks>;

  return mergeHooks(...hookSets);
};
```

`options.modes` lets callers selectively enable modules, e.g. `{ modes: ["caveman"] }`. Defaults to all three.
