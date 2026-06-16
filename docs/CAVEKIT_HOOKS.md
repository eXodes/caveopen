# CAVEKIT_HOOKS.md — OpenCode Hook Plan

Port of [cavekit](https://github.com/JuliusBrussee/cavekit) spec-driven development (SDD) workflow to OpenCode plugin system.

Cavekit in CaveOpen is scoped: cavekit v4. CaveOpen ports the spec harness — `SPEC.md` lifecycle, `FORMAT.md` bootstrap, and SPEC-aware context injection.

---

## Source Mapping

| Claude Code hook / command           | Role                                        | OpenCode equivalent                                                 |
| ------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------- |
| `/ck:init` (UserPromptSubmit detect) | Ensure `FORMAT.md` at project root          | `command.execute.before`                                            |
| `/ck:spec`, `/ck:build`, `/ck:check` | Skill invocations (skill-level, not hooks)  | Skills read `FORMAT.md` from project root — no hook needed          |
| SPEC.md presence at session start    | Inject spec context into system prompt      | `session.created` event + `experimental.chat.system.transform`      |
| SPEC.md file change during session   | Keep injected context stable (cache safety) | `file.watcher.updated` → update session cache for NEXT session only |

---

## Hook 1 — `/ck:init` Command Intercept (`command.execute.before`)

**What it does:**

Ensures `FORMAT.md` exists at project root. No args. CLI install already handles the global case — this hook only concerns the current project.

**Pattern: mutate `output.parts` with `ignored: true` + `experimental.chat.messages.transform` command check**

Two hooks in concert — no shared state needed:

1. `command.execute.before` — copies file, replaces `output.parts` with a single `{ type: "text", ignored: true }` part containing the result message. This surfaces output in the TUI without LLM inference.
2. `experimental.chat.messages.transform` — if the last user message text is `/ck:init`, empties `output.messages` → LLM inference skipped entirely.

**`hooks/command.ts`:**

```ts
output.parts.splice(0, output.parts.length, {
  id: output.parts[0].id,
  messageID: output.parts[0].messageID,
  sessionID: input.sessionID,
  type: "text",
  text,          // "FORMAT.md copied to ..." or "FORMAT.md already exists at ..."
  ignored: true,
});
```

Source path: `path.join(__dirname, "../assets/FORMAT.md")` — bundled alongside the plugin.

**`hooks/messages-transform.ts`:**

```ts
"experimental.chat.messages.transform": async (_input, output) => {
  const last = output.messages.at(-1);
  if (!last || last.info.role !== "user") return;

  const isInit = last.parts.some(
    (p) => p.type === "text" && (p as TextPart).text.trim() === "/ck:init",
  );
  if (!isInit) return;

  output.messages = []; // drop /ck:init → no LLM inference
},
```

**No caching impact.** File copy is a pure side effect — no model context mutated. The system transform hook reads `FORMAT.md` once at `session.created`, so a mid-session `/ck:init` only takes effect next session.

---

## Hook 2 — SPEC Context Injection (`session.created` + `experimental.chat.system.transform`)

**What it does:**

When a `SPEC.md` exists at project root, inject a compact summary into the system prompt so the LLM has spec context without skills having to reload it on every command.

**Split across two hooks** (same pattern as CAVEMEM_HOOKS.md §Hook 1):

```ts
// Hook A — load SPEC.md once on session creation
event: async ({ event }) => {
  if (event.type !== "session.created") return;

  const { sessionID } = event.properties;
  if (specContextCache.has(sessionID)) return; // idempotent

  const specPath = path.join(process.cwd(), "SPEC.md");
  if (!existsSync(specPath)) {
    specContextCache.set(sessionID, "");
    return;
  }

  const content = await fs.readFile(specPath, "utf-8");
  const summary = extractSpecSummary(content); // pulls §G + §T task table only
  specContextCache.set(sessionID, summary);
},

// Hook B — inject into system[1] before inference
"experimental.chat.system.transform": async (input, output) => {
  const sessionID = input.sessionID;
  if (!sessionID) return;

  const ctx = specContextCache.get(sessionID);
  if (!ctx) return;

  // system[0] = caveman rules (from caveman module)
  // system[1] = spec context (this hook)
  // Both marked for caching by applyCaching()
  output.system.push(ctx);
},
```

**`extractSpecSummary()`** — pulls only `§G` (goal, one line) and `§T` (task table) from SPEC.md. Keeps injection small (~100–300 tokens). Full SPEC.md is read on demand by skills.

---

## Hook 3 — SPEC File Change Guard (`file.watcher.updated`)

**Problem:** If `SPEC.md` is edited during a session (e.g., user runs `/ck:spec` to amend it), the cached string in `specContextCache` is now stale. Re-injecting the updated content mid-session would:

1. Change the system string → bust the KV cache for that string
2. Cause `applyCaching()` to write a new cache entry every turn

**Solution:** Update the cache but do NOT emit a system transform mid-session. The new content takes effect on the next session. This keeps the injected string stable (immutable after first set) — same rule as CAVEMEM_HOOKS.md §Caching Safety.

```ts
event: async ({ event }) => {
  if (event.type !== "file.watcher.updated") return;

  const changedPath = event.properties?.path ?? "";
  if (!changedPath.endsWith("SPEC.md")) return;

  // Reload cache for NEXT session only — current session keeps stable string
  // We tag the session as "spec-dirty" so skills know to re-read from disk
  const dirtySessionIDs = [...specContextCache.keys()];
  for (const id of dirtySessionIDs) {
    specDirtySet.add(id); // Set<string> — skills check this before trusting cache
  }

  await client.app.log({
    body: {
      service: "caveopen:cavekit",
      level: "info",
      message: "SPEC.md changed — cache will refresh next session",
    },
  });
},
```

**Skills** (ck:spec, ck:build, ck:check) always read `SPEC.md` from disk directly — they don't consume the session cache. The cache is for passive LLM context only.

---

## Caching Safety Summary

| Injection point               | Hook                                      | Cache behavior                                                        | Safe?                                      |
| ----------------------------- | ----------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------ |
| SPEC.md summary (`§G` + `§T`) | `experimental.chat.system.transform`      | Fixed per session → lands in `system[1]` → cached by `applyCaching()` | ✅ Cached turn 2+, zero thrash             |
| FORMAT.md copy (file write)   | `command.execute.before` → `fs.copyFile`  | No model context mutation                                             | ✅ No cache impact                         |
| SPEC.md change mid-session    | `file.watcher.updated` → dirty flag only  | Cache string NOT updated mid-session; stable until next session       | ✅ No cache bust                           |
| `/ck:init` output             | `command.execute.before` → `output.parts.splice(ignored: true)`; `experimental.chat.messages.transform` → empty messages | Output shown via ignored part; messages emptied → no LLM inference | ✅ No LLM turn, no cache impact |

**Key rules (from CACHING.md):**

- `applyCaching()` marks `system[0..1]` + last 2 non-system messages
- SPEC summary in `system[1]` → cached. Must be immutable after first set.
- Never re-read SPEC.md and re-inject mid-session — that changes the string → busts KV cache on every turn
- `/ck:init` writes to disk only. System transform reads at `session.created`, not at command time — safe

---

## File Layout

```
src/modules/cavekit/
  index.ts                      # cavekitHooks(ctx) factory — composes all hooks
  hooks/
    command.ts                  # command.execute.before: /ck:init copy FORMAT.md + noReply
    messages-transform.ts       # experimental.chat.messages.transform: drop /ck:init turn
    session-init.ts             # session.created + experimental.chat.system.transform
    file-watcher.ts             # file.watcher.updated: dirty flag, no mid-session re-inject
    set-config.ts               # config hook: registers /ck:init as named slash command
  lib/
    spec.ts                     # readSpec(), extractSpecSummary() (pulls §G + §T)
    cache.ts                    # specContextCache Map, specDirtySet
```

**Composition in `src/caveopen.ts`:** see CAVEMAN_HOOKS.md — `mergeHooks(cavemanHooks, caveMemHooks, cavekitHooks)` with optional `modes` selection.

**Module entry:**

```ts
// src/modules/cavekit/index.ts
import type { PluginInput, Hooks } from "@opencode-ai/plugin";
import { commandExecuteBeforeHook } from "./hooks/command.js";
import { handleSessionCreated, systemTransformHook } from "./hooks/session-init.js";
import { handleFileWatcherUpdated } from "./hooks/file-watcher.js";
import { setConfig } from "./hooks/set-config.js";
import { messagesTransformHook } from "./hooks/messages-transform.js";

export function cavekitHooks(ctx: PluginInput): Hooks {
  return {
    "command.execute.before": commandExecuteBeforeHook(ctx),
    "experimental.chat.system.transform": systemTransformHook(ctx),
    "experimental.chat.messages.transform": messagesTransformHook(ctx),
    "event": async ({ event }) => {
      await handleSessionCreated(event, ctx);
      await handleFileWatcherUpdated(event, ctx);
    },
    "config": setConfig(ctx),
  };
}
```

**`config` hook** (`set-config.ts`) registers `/ck:init` as a named slash command with description. This makes it appear in the TUI command palette:

```ts
config: async (config) => {
  config.command = {
    ...config.command,
    "ck:init": {
      template: "/ck:init",
      description: "Copy FORMAT.md (the SPEC.md schema) to the current project root",
    },
  };
}
```

---

## Hook Merging with Caveman + Cavemem

Both caveman and cavemem also use `experimental.chat.system.transform` and `session.created`. OpenCode runs same-named hooks from all modules in sequence — object spread means last write wins for single-key hooks.

**Problem:** spreading multiple modules that each return `"experimental.chat.system.transform"` loses all but the last.

**Solution:** Merge at composition time in `src/caveopen.ts` via a `mergeHooks()` utility that appends multiple handlers per hook key into a sequential runner:

```ts
// lib/merge-hooks.ts
export function mergeHooks(...hookSets: Partial<Hooks>[]): Hooks {
  const merged: Record<string, Function[]> = {};

  for (const hooks of hookSets) {
    for (const [key, fn] of Object.entries(hooks)) {
      merged[key] ??= [];
      merged[key].push(fn);
    }
  }

  const result: Record<string, Function> = {};
  for (const [key, fns] of Object.entries(merged)) {
    result[key] = async (...args: unknown[]) => {
      for (const fn of fns) await fn(...args);
    };
  }
  return result as Hooks;
}
```

```ts
// src/caveopen.ts
export const CaveOpenPlugin: Plugin = async (ctx) =>
  mergeHooks(cavemanHooks(ctx), caveMemHooks(ctx), cavekitHooks(ctx));
```

`mergeHooks` ensures all three modules' `session.created` handlers, `experimental.chat.system.transform` handlers, and `chat.message` handlers run in order without clobbering each other.

---

## Verify Checklist

- `/ck:init` copies `FORMAT.md` to project root if absent; already-exists case returns early; missing source returns clear error
- `SPEC.md` present → session system prompt contains `§G` line + `§T` table
- Edit `SPEC.md` mid-session → system prompt unchanged this session, refreshes next
- `mergeHooks()` runs all three modules' `session.created` handlers in order
- `/ck:init` appears in TUI command palette (registered via `config` hook)
