# CAVEKIT_HOOKS.md — OpenCode Hook Plan

Port of [cavekit](https://github.com/JuliusBrussee/cavekit) spec-driven development (SDD) workflow to OpenCode plugin system.

Cavekit in CaveOpen is scoped: cavekit v4. CaveOpen ports the spec harness — `SPEC.md` lifecycle, `FORMAT.md` bootstrap, and SPEC-aware context injection.

---

## Source Mapping

| Claude Code hook / command           | Role                                        | OpenCode equivalent                                                 |
| ------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------- |
| `/ck:init` (UserPromptSubmit detect) | Ensure `FORMAT.md` at project root          | `command.execute.before`                                            |
| `/ck:spec`, `/ck:build`, `/ck:check` | Skill invocations (skill-level, not hooks)  | Skills read `FORMAT.md` and `SPEC.md` from project root — no hook needed |

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

**No caching impact.** File copy is a pure side effect — no model context mutated.

---

## Why No Passive SPEC Context Injection

An earlier design injected `§G` + `§T` from `SPEC.md` into `system[1]` on every turn via `experimental.chat.system.transform`. This caused hallucination: the LLM saw open tasks on unrelated prompts and fabricated connections.

`experimental.chat.system.transform` `input` is `{ sessionID?, model }` — no messages. A relevance gate inside the hook is impossible without cross-hook coordination.

**Decision:** no passive injection. Skills (`ck:spec`, `ck:build`, `ck:check`) read `SPEC.md` from disk directly — they never needed the cache. Passive injection added zero functional value and caused harm.

Files removed as a result: `hooks/session-init.ts`, `hooks/file-watcher.ts`, `lib/cache.ts`, `lib/spec.ts`.

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

Cavekit no longer contributes a `system.transform` or `event` handler, so merging is simpler — only `command.execute.before`, `experimental.chat.messages.transform`, and `config` come from this module.

---

## File Layout

```
src/modules/cavekit/
  index.ts                      # cavekitHooks(ctx) factory — composes all hooks
  hooks/
    command.ts                  # command.execute.before: /ck:init copy FORMAT.md + noReply
    messages-transform.ts       # experimental.chat.messages.transform: drop /ck:init turn
    set-config.ts               # config hook: registers /ck:init as named slash command
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

## Verify Checklist

- `/ck:init` copies `FORMAT.md` to project root if absent; already-exists case returns early; missing source returns clear error
- `/ck:init` appears in TUI command palette (registered via `config` hook)
- Non-cavekit prompts receive no spec context — no hallucination from stray `§T` task rows
- Skills (`ck:spec`, `ck:build`, `ck:check`) read `SPEC.md` from disk directly — unaffected by this change
