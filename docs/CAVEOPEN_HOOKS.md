# CAVEOPEN_HOOKS.md — Integration Hook Design

Documents cross-module hook composition in `src/caveopen.ts` — where caveman, cavekit, and cavemem hooks meet.

---

## Module Hook Inventory

| Module  | `experimental.chat.system.transform` | `event`                                              | `chat.message` | `tool.execute.after` | `command.execute.before` | `config` |
| ------- | ------------------------------------ | ---------------------------------------------------- | -------------- | -------------------- | ------------------------ | -------- |
| caveman | ✅ push ruleset                      | `session.created`, `session.idle`, TUI               | ✅ mode track  | —                    | ✅ `/caveman-stats`      | —        |
| cavemem | ✅ push priorContext                 | `session.created`, `session.idle`, `session.deleted` | ✅ write-only  | ✅ post-tool-use     | —                        | —        |
| cavekit | —                                    | —                                                    | —              | —                    | ✅ `/ck:init`            | ✅       |

Two hooks collide across modules: `experimental.chat.system.transform` (caveman + cavemem) and `event` (caveman + cavemem). `mergeHooks` handles `event` correctly by sequencing — both handlers run in order. `command.execute.before` has no collision (each module intercepts by command name).

`experimental.chat.system.transform` collision is resolved differently: `caveopen.ts` post-assigns `combinedSystemTransform` after `mergeHooks`, replacing the chained pair with a single handler that pushes one merged `system[]` entry. Module files are unchanged — standalone `CavemanPlugin` / `CavememPlugin` still use their own individual transform.

---

## The System Transform Slot Problem

With `mergeHooks` fanning in both transforms sequentially, two separate `push` calls fire:

```
turn N:
  caveman transform → output.system.push(ruleset)     → system[1]
  cavemem transform → output.system.push(priorContext) → system[2]
```

`applyCaching()` marks `system[0..1]` only. Result:

| Slot        | Content              | Cached? |
| ----------- | -------------------- | ------- |
| `system[0]` | host instructions    | ✅      |
| `system[1]` | caveman ruleset      | ✅      |
| `system[2]` | cavemem priorContext | ❌      |

priorContext is immutable after `session.created` — same bytes every turn — but it always misses because it sits at `system[2]`. Wasted re-tokenization every turn for content that never changes.

With `opencode-claude-auth` also loaded (identity via `unshift`):

| Slot        | Content              | Cached? |
| ----------- | -------------------- | ------- |
| `system[0]` | oca identity         | ✅      |
| `system[1]` | host instructions    | ✅      |
| `system[2]` | caveman ruleset      | ❌      |
| `system[3]` | cavemem priorContext | ❌      |

Both CaveOpen additions fall outside the 2-slot window — two separate cache misses per turn.

---

## Merged Transform — Single `system[1]` Slot

Combine ruleset and priorContext into one string, pushed as a single entry. One `push` → one slot.

### Without oca-auth

```
turn N:
  combined transform → output.system.push(ruleset + "\n\n" + priorContext) → system[1]
```

| Slot        | Content                         | Cached? |
| ----------- | ------------------------------- | ------- |
| `system[0]` | host instructions               | ✅      |
| `system[1]` | ruleset + priorContext (merged) | ✅      |

Both get cached. priorContext moves from perpetual miss → hits on every turn after the first.

### With oca-auth

| Slot        | Content                         | Cached? |
| ----------- | ------------------------------- | ------- |
| `system[0]` | oca identity                    | ✅      |
| `system[1]` | host instructions               | ✅      |
| `system[2]` | ruleset + priorContext (merged) | ❌      |

Still uncached (outside 2-slot window), but 1 miss instead of 2. Combined block is fetched once — same total cost as before since both were misses.

### Mode-switch cache behavior

When `/caveman lite` changes mode, `buildRuleset()` returns different bytes → merged slot gets a cache miss on that turn, then hits again. priorContext is immutable so it doesn't drive misses. The only regression vs. having separate slots: the mode-switch miss now re-tokenizes priorContext too. In practice this is negligible — mode switches are rare, priorContext is short.

---

## Implementation

### Extract content providers from each module

Each module exports a pure function that returns its system content (or `null`/`""` to skip). No `output.system.push()` inside modules.

```ts
// src/modules/caveman/lib/ruleset.ts
export function getCavemanSystemRuleset(): string | null {
  const mode = readModeFlag();
  if (!mode) return null;
  return buildRuleset(mode);
}
```

```ts
// src/modules/cavemem/lib/context.ts
export function getCavememSystemPriorContext(
  sessionID: string | undefined,
  options?: { skipPriorContext?: boolean },
): string | null {
  if (options?.skipPriorContext) return null;
  if (!sessionID) return null;
  return cache.get(sessionID) || null;
}
```

### Single combined transform at integration layer

`combinedSystemTransform` is module-agnostic — it takes an array of provider functions and knows nothing about caveman or cavemem specifically. `caveopen.ts` builds that array conditionally so providers are only called when their module is active.

```ts
// src/hooks/system-transform.ts
import type { Hooks } from "@opencode-ai/plugin";

export type SystemContentProvider = (
  sessionID: string | undefined,
) => string | null;

export function combinedSystemTransform(
  providers: SystemContentProvider[],
): NonNullable<Hooks["experimental.chat.system.transform"]> {
  return async (input, output) => {
    const parts = providers
      .map((fn) => fn(input.sessionID))
      .filter((s): s is string => !!s);

    if (parts.length > 0) {
      output.system.push(parts.join("\n\n"));
    }
  };
}
```

No module imports here. `system-transform.ts` is a pure fan-in utility.

### Wire into caveopen.ts

Module selection happens here — providers are only added to the array when their mode is active. Options (e.g. `skipPriorContext`) are closed over in the provider closure, not threaded through `combinedSystemTransform`.

```ts
// src/caveopen.ts
import { combinedSystemTransform, type SystemContentProvider } from "./hooks/system-transform.js";
import { getCavemanSystemRuleset } from "./modules/caveman/lib/ruleset.js";
import { getCavememSystemPriorContext } from "./modules/cavemem/lib/context.js";

export const CaveOpenPlugin: Plugin = async (ctx, options) => {
  const opts = options ?? {};
  const modes: CaveOpenMode[] = /* ... resolve from opts ... */;

  // Module hooks still include their own system.transform handlers (used by standalone
  // CavemanPlugin / CavememPlugin). caveopen.ts post-assigns combinedSystemTransform
  // to replace the chained result with a single-slot version.
  const hookSets = [
    modes.includes("caveman") && cavemanHooks(ctx),
    modes.includes("cavemem") && caveMemHooks(ctx, opts.cavemem),
    modes.includes("cavekit") && cavekitHooks(ctx),
  ].filter(Boolean) as Parameters<typeof mergeHooks>;

  const merged = mergeHooks(...hookSets);

  // Build provider list — only include providers for active modules
  const providers: SystemContentProvider[] = [];

  if (modes.includes("caveman")) {
    providers.push((sessionID) => getCavemanSystemRuleset());
  }

  if (modes.includes("cavemem")) {
    const skipPriorContext = opts.cavemem?.skipPriorContext ?? false;
    providers.push((sessionID) => getCavememSystemPriorContext(sessionID, { skipPriorContext }));
  }

  if (providers.length > 0) {
    (merged as Record<string, unknown>)["experimental.chat.system.transform"] =
      combinedSystemTransform(providers);
  }

  return merged;
};
```

`providers.length === 0` when neither caveman nor cavemem is in `modes` (e.g. cavekit-only). No hook registered, no slot consumed.

**Module hook files are unchanged.** `cavemanHooks()` and `caveMemHooks()` still return `"experimental.chat.system.transform"` — those handlers are used by the standalone `CavemanPlugin` / `CavememPlugin` subpath exports. Inside `CaveOpenPlugin`, the post-assign on `merged` replaces the chained result with the combined single-slot version.

---

## Event Hook Merging

`event` collides between caveman and cavemem — both need `session.created`, `session.idle`. `mergeHooks` handles this correctly: both handlers run in sequence per event. No changes needed.

Order: caveman event handler runs before cavemem (caveman registered first in `hookSets`). Relevant for `session.created` — caveman writes `.caveman-active` flag, cavemem initializes session in the cavemem store. No dependency between the two, so order is safe.

---

## Guard Conditions

| Condition                      | Combined transform behavior                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| caveman mode is `off` or unset | `getCavemanSystemRuleset` → `null`; only priorContext in `parts` (if cavemem active) |
| `skipPriorContext: true`       | `getCavememSystemPriorContext` → `null`; only ruleset in `parts` (if caveman active) |
| Both return `null`/`""`        | `parts` empty; no `push` — `output.system` unchanged                                 |
| cavemem not in `modes`         | cavemem provider never added to array; `getCavememSystemPriorContext` never called   |
| caveman not in `modes`         | caveman provider never added to array; `getCavemanSystemRuleset` never called        |
| neither in `modes`             | `providers` empty; `combinedSystemTransform` never registered; no slot consumed      |

Provider exclusion is structural — the array in `caveopen.ts` is built conditionally, so unchecked modules have zero runtime cost (no closure allocated, no function called per turn).

---

## Slot Summary — All Configurations

| Config                       | system[0]       | system[1]        | system[2]            | Cache hits (2-slot) |
| ---------------------------- | --------------- | ---------------- | -------------------- | ------------------- |
| caveman only                 | instructions ✅ | ruleset ✅       | —                    | 2/2                 |
| cavemem only                 | instructions ✅ | priorContext ✅  | —                    | 2/2                 |
| caveman + cavemem (merged)   | instructions ✅ | ruleset+prior ✅ | —                    | 2/2                 |
| + oca-auth (merged)          | identity ✅     | instructions ✅  | ruleset+prior ❌     | 2/3                 |
| caveman + cavemem (unmerged) | instructions ✅ | ruleset ✅       | priorContext ❌      | 2/3                 |
| + oca-auth (unmerged)        | identity ✅     | instructions ✅  | ruleset ❌, prior ❌ | 2/4                 |

Merged is strictly better or equal in every config. Maximum improvement in the common case (caveman + cavemem, no oca-auth): priorContext moves from perpetual miss to cached.

---

## Files Affected

```
src/
  hooks/
    system-transform.ts             # SystemContentProvider type + combinedSystemTransform()
  modules/
    caveman/
      lib/ruleset.ts                # getCavemanSystemRuleset() export
    cavemem/
      lib/context.ts                # getCavememSystemPriorContext() export
  caveopen.ts                       # providers[] build + post-assign combinedSystemTransform
```

Module hook files (`caveman/hooks/activation.ts`, `cavemem/hooks/session-init.ts`, `caveman/index.ts`, `cavemem/index.ts`) are **unchanged** — standalone plugins still use their own `systemTransformHook`. Only `caveopen.ts` overrides the merged result.
