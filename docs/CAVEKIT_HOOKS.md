# CAVEKIT_HOOKS.md — OpenCode Hook Plan

Port of [cavekit](https://github.com/JuliusBrussee/cavekit) spec-driven development (SDD) workflow to OpenCode plugin system.

Cavekit in CaveOpen is scoped: cavekit v4. CaveOpen ports the spec harness — `SPEC.md` lifecycle, `FORMAT.md` bootstrap, and SPEC-aware context injection.

---

## Source Mapping

| Claude Code hook / command           | Role                                       | OpenCode equivalent                                                      |
| ------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------ |
| `/ck:init` (UserPromptSubmit detect) | Ensure `FORMAT.md` at project root         | `command.execute.before`                                                 |
| `/ck:spec`, `/ck:build`, `/ck:check` | Skill invocations (skill-level, not hooks) | Skills read `FORMAT.md` and `SPEC.md` from project root — no hook needed |

---

## Hook 1 — `/ck:init` Command Intercept (`command.execute.before`)

**What it does:**

Ensures `FORMAT.md` exists at project root. No args. CLI install already handles the global case — this hook only concerns the current project.

**Pattern: two parts — `ignored: true` (user-visible result) + `synthetic: true` (no-LLM signal)**

Single hook, no `messages.transform`:

`command.execute.before` copies the file, then replaces `output.parts` with two entries:

1. `{ type: "text", ignored: true }` — the result message, shown in the TUI, excluded from LLM context.
2. `{ type: "text", synthetic: true }` — signals to OpenCode that the command produced its own response and no LLM reply is needed.

**`hooks/command.ts`:**

```ts
output.parts.splice(
  0,
  output.parts.length,
  {
    id: output.parts[0].id,
    messageID: output.parts[0].messageID,
    sessionID: input.sessionID,
    type: "text",
    text, // "FORMAT.md copied to ..." or "FORMAT.md already exists at ..."
    ignored: true,
  },
  {
    id: partId(),
    messageID: output.parts[0].messageID,
    sessionID: input.sessionID,
    type: "text",
    text: "FORMAT.md copied, no further action.",
    synthetic: true,
  },
);
```

Source path: `path.join(__dirname, "../assets/FORMAT.md")` — bundled alongside the plugin.

> **Why not `experimental.chat.messages.transform`?**
> An earlier design used that hook to set `output.messages = []`, intending to skip LLM inference entirely. This caused provider error 2013 (`messages must not be empty`) because OpenCode still dispatches the LLM call after the transform. Tracked upstream as [anomalyco/opencode#9306](https://github.com/anomalyco/opencode/issues/9306) — when `noReply` lands, the `synthetic` part can be removed.

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
// src/caveopen.ts (simplified — actual impl also wires combinedSystemTransform)
const merged = mergeHooks(
  cavemanHooks(ctx),
  caveMemHooks(ctx, opts.cavemem),
  cavekitHooks(ctx),
);
// post-assign replaces individual system.transform handlers with one combined push
(merged as Record<string, unknown>)["experimental.chat.system.transform"] =
  combinedSystemTransform(providers);
return merged;
```

Cavekit contributes only `command.execute.before` and `config` — no `system.transform` or `event` collision.

---

## File Layout

```
src/modules/cavekit/
  index.ts                      # cavekitHooks(ctx) factory — composes all hooks
  hooks/
    command.ts                  # command.execute.before: /ck:init copy FORMAT.md + synthetic part
    set-config.ts               # config hook: registers /ck:init as named slash command
```

**`config` hook** (`set-config.ts`) registers `/ck:init` as a named slash command with description. This makes it appear in the TUI command palette:

```ts
config: async (config) => {
  config.command = {
    ...config.command,
    "ck:init": {
      template: "/ck:init",
      description:
        "Copy FORMAT.md (the SPEC.md schema) to the current project root",
    },
  };
};
```

---

## Verify Checklist

- `/ck:init` copies `FORMAT.md` to project root if absent; already-exists case returns early; missing source returns clear error
- `/ck:init` appears in TUI command palette (registered via `config` hook)
- Non-cavekit prompts receive no spec context — no hallucination from stray `§T` task rows
- Skills (`ck:spec`, `ck:build`, `ck:check`) read `SPEC.md` from disk directly — unaffected by this change
