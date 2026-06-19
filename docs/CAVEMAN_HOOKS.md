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

## Hook 1a — Ruleset Injection (`experimental.chat.system.transform`)

**Claude Code source:** `caveman-activate.js` (emit path)

**What it does:** Injects full caveman ruleset into `system[0]` before every inference.

```ts
"experimental.chat.system.transform": async (input, output) => {
  const mode = readModeFlag();
  if (!mode || mode === "off") return;

  const modeLabel = mode === "wenyan" ? "wenyan-full" : mode;
  const rules = buildRuleset(modeLabel); // reads SKILL.md, filters to active level
  output.system.push(rules);             // append after host instructions
},
```

**Fires before every inference** — not just once at session start. This is the key difference from upstream, where `caveman-activate.js` emits the ruleset once via SessionStart context. Because transform fires on every inference, the ruleset is always present regardless of context compaction.

**Caching:** OpenCode concatenates all instructions (agent prompt, AGENTS.md, `config.instructions`) into a single large block as `system[0]` before transforms run. Using `push` places the ruleset at `system[1]`, keeping the instructions block at `system[0]` — both within `applyCaching()`'s 2-slot window. Using `unshift` would displace the instructions block to `system[2]` (uncached), losing the most expensive cache slot for smaller content.

**Mode switches:** When `/caveman lite` changes the mode mid-session, `buildRuleset()` returns different content on the next turn. `system[1]` (ruleset slot) gets a cache miss on that turn, then hits again. `system[0]` (instructions) is unaffected — stable cache across mode switches.

**SKILL.md source:** Plugin reads `path.join(__dirname, "../skills/caveman/SKILL.md")` at runtime. Edits propagate automatically, no hardcoded duplication.

---

## Hook 1b — Flag Initialization (`session.created`)

**Claude Code source:** `caveman-activate.js` (flag-write path)

**What it does:** Writes `.caveman-active` to default mode on session start.

```ts
event: async ({ event }) => {
  if (event.type !== "session.created") return;
  const mode = readConfig().defaultMode ?? "full";
  if (mode === "off") { removeModeFlag(); return; }
  writeModeFlag(mode);
},
```

**Why separate from Hook 1a:** The flag file is mutable runtime state — `/caveman <level>` commands update it mid-session. Hook 1a (`experimental.chat.system.transform`) reads the flag to know the current mode. Hook 1b initializes it at session start so the flag reflects the configured default before any command fires.

**Flag consumers:**

- `experimental.chat.system.transform` — reads current mode to select ruleset
- `chat.message` — reads current mode after `/caveman` switches
- `tui.prompt.append` — reads current mode to render badge

Hook 1b is not about system prompt injection; it is flag lifecycle management. The two hooks are independent concerns that upstream bundled into one script.

---

## Hook 2 — Per-Turn Mode Tracking (`chat.message`)

**Claude Code source:** `caveman-mode-tracker.js` (UserPromptSubmit section)

**What it does:**

1. Detects natural language activation ("activate caveman", "less tokens", "be brief")
2. Syncs flag file when mode changes via `/caveman <level>` or natural language

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
},
```

**Logic order:** mode switch (`/caveman <level>`) checked first so it exits before activation/deactivation phrase matching. Deactivation before activation to avoid conflict when both phrases appear.

**No per-turn reminder injected here.** Upstream's `caveman-mode-tracker.js` appended a short `additionalContext` reminder every turn because `caveman-activate.js` emits the ruleset only once (SessionStart), and context compaction can prune it. In CaveOpen, `experimental.chat.system.transform` fires before every inference and re-injects the full ruleset into `system[0]` — so the ruleset is always present regardless of compaction. Injecting a reminder here would be redundant and would consume one of the last-2 non-system cache slots `applyCaching()` marks.

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
  const model = tokens.modelID; // last assistant message modelID from session messages

  const { estSavedTokens, estSavedUsd } = derivesSavings({
    outputTokens: tokens.output,
    actualCost: tokens.cost,
    mode,
  });

  appendHistory(
    HISTORY_PATH,
    JSON.stringify({
      ts: Date.now(),
      session_id: sessionID,
      mode: mode ?? null,
      model,
      provider: tokens.providerID,
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

**`getSessionTokens()`** calls `client.session.messages()` and sums `tokens.{input,output,cache.read,cache.write}` and `cost` across all assistant messages. Returns `null` if no output tokens yet. `modelID` is taken from the last assistant message (`AssistantMessage.modelID`) and stored in history for informational purposes.

**Cost sourcing:** `AssistantMessage.cost` holds the actual USD cost OpenCode computed using its own model pricing table. We sum this across all messages in `SessionTokens.cost` — no hardcoded price table needed. `derivesSavings()` takes `actualCost: number` and multiplies by the mode's savings ratio: `estSavedUsd = actualCost * ratio`. Token savings (`estSavedTokens`) are still estimated as `outputTokens * ratio` since OpenCode doesn't expose per-message token-saved counts.

**History schema** (same as caveman, compatible with caveman-stats aggregation):

```jsonl
{
  "ts": 1750000000000,
  "session_id": "abc123",
  "mode": "full",
  "model": "claude-sonnet-4-6",
  "provider": "anthropic",
  "output_tokens": 4821,
  "cache_read_tokens": 12048,
  "actual_cost": 0.0723,
  "est_saved_tokens": 3134,
  "est_saved_usd": 0.029
}
```

`actual_cost` is the sum of `AssistantMessage.cost` across all messages — OpenCode's own calculation using current provider pricing. `est_saved_usd = actual_cost * savings_ratio[mode]`.

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

| Injection point               | Hook                                      | Cache behavior                                          | Safe?                     |
| ----------------------------- | ----------------------------------------- | ------------------------------------------------------- | ------------------------- |
| Full caveman ruleset          | `experimental.chat.system.transform`      | `push` → `system[1]` (after host instructions) → cached | ✅ Cached, no repeat cost |
| Stats output                  | `command.execute.before` → `output.parts` | User-turn message; one-shot, not repeated               | ✅ No cache impact        |
| Session activation flag write | `session.created` event                   | No model context — pure side effect                     | ✅ No cache impact        |
| History write                 | `session.idle` event                      | No model context — pure side effect                     | ✅ No cache impact        |

**Key rules from CACHING.md:**

- `applyCaching()` marks `system[0..1]` + last 2 non-system messages
- OpenCode's concatenated instructions occupy `system[0]` before any transform runs — this is the largest block and highest-priority cache slot
- Ruleset uses `push` → lands at `system[1]`, cached without displacing instructions
- Full ruleset stays in system transform only — `chat.message` does not inject context, preserving both last-2 non-system cache slots for real user messages
- If `opencode-claude-auth` is loaded, its identity `unshift` takes `system[0]`, pushing instructions to `system[1]`; ruleset falls to `system[2]` (uncached) — acceptable, identity + instructions are higher priority

**Gateway exception:** If user runs `@ai-sdk/gateway`, `applyCaching()` is skipped entirely (gateway handles caching). Plugin behavior unchanged — rules still inject into `system[0]` via transform. Just no cache marks.

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
          message.ts                # chat.message: mode tracking (activation, deactivation, /caveman switches)
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
import {
  systemTransformHook,
  handleSessionCreated,
} from "./hooks/activation.js";
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
import type { Plugin, PluginOptions } from "@opencode-ai/plugin";
import { cavemanHooks } from "./modules/caveman/index.js";
import { cavekitHooks } from "./modules/cavekit/index.js";
import { caveMemHooks } from "./modules/cavemem/index.js";
import { mergeHooks } from "./lib/merge-hooks.js";
import {
  combinedSystemTransform,
  type SystemContentProvider,
} from "./hooks/system-transform.js";
import { getCavemanSystemRuleset } from "./modules/caveman/lib/ruleset.js";
import { getCavememSystemPriorContext } from "./modules/cavemem/lib/context.js";

export type CaveOpenMode = "caveman" | "cavekit" | "cavemem";

export interface CaveOpenOptions extends PluginOptions {
  modes?: CaveOpenMode[];
  cavemem?: { skipPriorContext?: boolean };
}

const ALL_MODES: CaveOpenMode[] = ["caveman", "cavekit", "cavemem"];

export const CaveOpenPlugin: Plugin = async (
  ctx,
  options: CaveOpenOptions | undefined,
) => {
  const opts = options ?? {};
  const modes: CaveOpenMode[] =
    Array.isArray(opts.modes) ?
      opts.modes.filter((m): m is CaveOpenMode =>
        ALL_MODES.includes(m as CaveOpenMode),
      )
    : ALL_MODES;

  const hookSets = [
    modes.includes("caveman") && cavemanHooks(ctx),
    modes.includes("cavemem") && caveMemHooks(ctx, opts.cavemem),
    modes.includes("cavekit") && cavekitHooks(ctx),
  ].filter(Boolean) as Parameters<typeof mergeHooks>;

  const merged = mergeHooks(...hookSets);

  // Replace individual system.transform handlers with a single combined push.
  // Keeps ruleset + priorContext in one system[] slot — both stay within
  // applyCaching()'s 2-slot window instead of spilling to system[2].
  const providers: SystemContentProvider[] = [];
  if (modes.includes("caveman")) {
    providers.push((sessionID) => getCavemanSystemRuleset());
  }
  if (modes.includes("cavemem")) {
    const skipPriorContext = opts.cavemem?.skipPriorContext ?? false;
    providers.push((sessionID) =>
      getCavememSystemPriorContext(sessionID, { skipPriorContext }),
    );
  }
  if (providers.length > 0) {
    (merged as Record<string, unknown>)["experimental.chat.system.transform"] =
      combinedSystemTransform(providers);
  }

  return merged;
};
```

`opts.modes` lets callers selectively enable modules, e.g. `{ modes: ["caveman"] }`. Defaults to all three. Inactive modules are omitted from `hookSets` entirely and their providers are never added — zero per-turn cost.
