# CAVEMEM_HOOKS.md — OpenCode Hook Plan

Port of [cavemem](https://github.com/JuliusBrussee/cavemem) Claude Code hooks to OpenCode plugin system.

---

## Source Mapping

cavemem hooks shell out to a CLI that opens `MemoryStore` (SQLite), writes observations/summaries, and optionally returns a context string. Claude Code fires these at lifecycle points. OpenCode replaces the CLI round-trip with in-process TypeScript plugin hooks.

| cavemem handler | Claude Code hook | Role | OpenCode equivalent |
|---|---|---|---|
| `session-start.ts` | `SessionStart` | Register session; inject prior-session context | `session.created` event + `experimental.chat.system.transform` |
| `user-prompt-submit.ts` | `UserPromptSubmit` | Observe user prompt for embedding | `chat.message` |
| `post-tool-use.ts` | `PostToolUse` | Observe tool call + output for embedding | `tool.execute.after` |
| `stop.ts` | `Stop` | Write turn summary | `session.idle` event |
| `session-end.ts` | `SessionEnd` | Roll up turn summaries → session summary | `session.deleted` event |
| `auto-spawn.ts` | after every hook | Ensure background embedding worker alive | Inline async — no separate process needed |

---

## Hook 1 — Session Init (`session.created`)

**cavemem source:** `session-start.ts`

**What it does:**

1. `store.startSession({ id, ide, cwd })` — idempotent; safe on re-fire
2. Fetches up to 3 prior sessions by `cwd` match, pulls their session summary
3. Returns `## Prior-session context\n...` string — injected into initial prompt
4. Returns empty string on `source !== 'startup'` (resume / clear / compact)

**OpenCode split into two hooks:**

```ts
// Hook A — register session + cache prior-session context string
event: async ({ event }) => {
  if (event.type !== "session.created") return;

  const { sessionID } = event.properties;
  store.startSession({ id: sessionID, ide: "opencode", cwd: process.cwd() });

  // Fetch once per session — stored in Map for transform hook below
  const recentSessions = store.storage.listSessions(20);
  const hints = recentSessions
    .filter((s) => s.id !== sessionID && s.cwd === process.cwd())
    .slice(0, 3)
    .map((s) => store.storage.listSummaries(s.id).slice(0, 1).map((x) => x.content).join("\n"))
    .filter(Boolean);

  const ctx = hints.length > 0
    ? `## Prior-session context\n${hints.join("\n---\n")}`
    : "";

  sessionContextCache.set(sessionID, ctx); // Map<string, string>
},

// Hook B — inject cached context into system prompt (runs before every inference)
"experimental.chat.system.transform": async (input, output) => {
  const sessionID = input.sessionID;
  if (!sessionID) return;

  const ctx = sessionContextCache.get(sessionID);
  if (!ctx) return;

  // Unshift so it lands in system[0] — applyCaching() marks system[0..1]
  output.system.unshift(ctx);
},
```

**Idempotency:** `store.startSession()` must be idempotent. OpenCode may emit `session.created` once, but plugin should guard against duplicate calls with the same `sessionID`.

---

## Caching Safety — Hook 1

This is the highest-risk injection point. Full analysis:

**Why it's safe:**

- Prior-session context string is fetched ONCE on `session.created` and stored in `sessionContextCache` (in-process Map).
- `experimental.chat.system.transform` reads from the Map — zero DB calls per turn.
- The string is FIXED for the session lifetime. Same content → same hash → `applyCaching()` marks system[0] → KV cache hit from turn 2 onward.
- Changing the string mid-session would bust the cache. We never mutate it after set.

**Why NOT to inject via `chat.message`:**

- `chat.message` appends to user-turn `output.parts`.
- User turns compete for the last-2 cache slots.
- Injecting a large prior-session blob per-turn thrashes those slots.
- System prompt is the right layer: high-reuse content, always cached.

**Resume / compact guard:**

- Claude Code has `source` field to skip injection on non-startup fires.
- OpenCode emits `session.created` once per new session — no resume re-fire.
- Guard with Map: if `sessionContextCache.has(sessionID)` already, skip DB fetch (idempotent re-fire protection).

---

## Hook 2 — User Prompt Observation (`chat.message`)

**cavemem source:** `user-prompt-submit.ts`

**What it does:**

- `store.addObservation({ kind: 'user_prompt', content: prompt })`
- Returns empty string — retrieval is MCP-driven, not hook-driven

**OpenCode implementation:**

```ts
"chat.message": async (input, output) => {
  const text = extractText(output.message); // pull plain text from parts
  if (!text?.trim()) return;

  store.addObservation({
    session_id: input.sessionID,
    kind: "user_prompt",
    content: text,
  });

  // No context injection here. Retrieval goes through MCP tools, same as cavemem.
},
```

**Caching impact:** Zero. No `output.parts` mutation. Pure write path.

---

## Hook 3 — Tool Use Observation (`tool.execute.after`)

**cavemem source:** `post-tool-use.ts`

**What it does:**

- Builds `"${tool} input=... output=..."` string, truncated to 4000 chars
- `store.addObservation({ kind: 'tool_use', content, metadata: { tool } })`

**OpenCode implementation:**

```ts
"tool.execute.after": async (input, output) => {
  const body = [
    `${input.tool}`,
    `input=${stringifyShort(input.args)}`,
    `output=${stringifyShort(output.output)}`,
  ].join(" ").slice(0, 4000);

  if (!body.trim()) return;

  store.addObservation({
    session_id: input.sessionID,
    kind: "tool_use",
    content: body,
    metadata: { tool: input.tool },
  });
},
```

**Caching impact:** Zero. Pure write path. No mutation of tool output or model context.

---

## Hook 4 — Turn Summary (`session.idle`)

**cavemem source:** `stop.ts`

**What it does:**

- Receives `last_assistant_message` (turn summary text)
- `store.addSummary({ scope: 'turn', content: summary })`

**OpenCode equivalent:** `session.idle` fires after each agent turn completes — closest analog to Claude Code's `Stop`.

```ts
event: async ({ event }) => {
  if (event.type !== "session.idle") return;

  const { sessionID } = event.properties;

  // Pull last assistant message text from session via SDK
  const session = await client.session.get({ path: { id: sessionID } });
  const lastMessage = getLastAssistantText(session.data);
  if (!lastMessage?.trim()) return;

  store.addSummary({
    session_id: sessionID,
    scope: "turn",
    content: lastMessage,
  });
},
```

**Caching impact:** Zero. Pure write path; no model context mutation.

**Note on `last_assistant_message`:** Claude Code passes this directly in the hook payload. OpenCode's `session.idle` event does not — fetch via SDK. One SDK call per idle event; lightweight since it's after the turn, not during inference.

---

## Hook 5 — Session Rollup (`session.deleted`)

**cavemem source:** `session-end.ts`

**What it does:**

1. Lists all `scope: 'turn'` summaries for the session
2. Rolls them up: `turns.slice(0, 20).join('\n')`
3. Writes `scope: 'session'` summary
4. `store.endSession(sessionID)`

**OpenCode implementation:**

```ts
event: async ({ event }) => {
  if (event.type !== "session.deleted") return;

  const { sessionID } = event.properties;

  const turns = store.storage
    .listSummaries(sessionID)
    .filter((s) => s.scope === "turn")
    .map((s) => s.content);

  if (turns.length > 0) {
    store.addSummary({
      session_id: sessionID,
      scope: "session",
      content: turns.slice(0, 20).join("\n"),
    });
  }

  store.endSession(sessionID);
  sessionContextCache.delete(sessionID); // clean up in-process cache
},
```

**Fallback:** Also register a `dispose` hook to flush any sessions that end via server shutdown rather than explicit deletion.

```ts
dispose: async () => {
  store.close();
},
```

**Caching impact:** Zero.

---

## Worker Auto-Spawn Replacement

**cavemem source:** `auto-spawn.ts`

**What it does in cavemem:** After each successful hook, spawns a detached `cavemem worker start` process for background embedding generation. Cheap (<2ms) when worker is already alive.

**OpenCode difference:** Plugin runs in-process inside the OpenCode server. No separate CLI to exec. Background work uses standard async patterns.

**Strategy:** Replace the spawned worker with a module-level async queue inside the plugin process.

```ts
// src/modules/cavemem/lib/worker.ts
const embeddingQueue: Array<() => Promise<void>> = [];
let running = false;

export function enqueueEmbedding(fn: () => Promise<void>): void {
  if (settings.embedding.provider === "none") return;
  if (!settings.embedding.autoStart) return;
  embeddingQueue.push(fn);
  if (!running) drainQueue();
}

async function drainQueue(): Promise<void> {
  running = true;
  while (embeddingQueue.length > 0) {
    const task = embeddingQueue.shift()!;
    try { await task(); } catch { /* best-effort */ }
  }
  running = false;
}
```

Call `enqueueEmbedding(() => store.embedObservation(id))` after writes in hooks 2 and 3. No process spawn needed; cleanup on `dispose`.

**Guard flags:**

- `CAVEMEM_NO_AUTOSTART` env var: skip queue drain (test isolation)
- `settings.embedding.provider === 'none'`: skip entirely

---

## Caching Safety Summary

| Injection point | Hook | Cache behavior | Safe? |
|---|---|---|---|
| Prior-session context string | `experimental.chat.system.transform` | Fixed per session → lands in `system[0]` → always cache-marked | ✅ Cached turn 2+, zero thrash |
| User prompt observation | `chat.message` (write only) | No `output.parts` mutation | ✅ No cache impact |
| Tool use observation | `tool.execute.after` (write only) | No context mutation | ✅ No cache impact |
| Turn summary write | `session.idle` event | No model context | ✅ No cache impact |
| Session rollup | `session.deleted` event | No model context | ✅ No cache impact |

**Key rules:**

1. Prior-session context goes in `system[0]` via `experimental.chat.system.transform` — never in `chat.message`. `applyCaching()` always marks `system[0..1]`; user-turn slots are ephemeral.
2. The context string must be immutable after first set. Never re-fetch or mutate mid-session.
3. Retrieval augmentation (MCP search results) is NOT injected by hooks — it's MCP-driven per query. This keeps hook injection deterministic and cache-friendly.
4. If `@ai-sdk/gateway` is in use, `applyCaching()` is bypassed entirely. Plugin behavior unchanged — context still injected, just no cache marks. No action required.

---

## File Layout

```
src/modules/cavemem/
  index.ts                  # caveMemHooks(ctx) factory — composes all hooks
  hooks/
    session-init.ts         # session.created: register + fetch prior context
    message.ts              # chat.message: observe user prompt
    tool-use.ts             # tool.execute.after: observe tool call + output
    turn-summary.ts         # session.idle: write turn summary
    session-end.ts          # session.deleted: rollup + endSession + cache cleanup
  lib/
    store.ts                # MemoryStore singleton init, open/close lifecycle
    session-cache.ts        # Map<sessionID, string> — prior-session context cache
    worker.ts               # inline embedding queue (replaces auto-spawn.ts)
    text.ts                 # extractText, getLastAssistantText, stringifyShort
```

**Composition in `src/caveopen.ts`:**

```ts
export const CaveOpenPlugin: Plugin = async (ctx) => ({
  ...cavemanHooks(ctx),
  ...caveMemHooks(ctx),   // ← new
});
```

---

## Implementation Order

1. `lib/store.ts` — open MemoryStore singleton, expose to hooks via ctx
2. `lib/session-cache.ts` — Map + get/set/delete helpers
3. `lib/worker.ts` — embedding queue, env guards
4. `lib/text.ts` — extractText, getLastAssistantText, stringifyShort
5. `hooks/session-init.ts` — `session.created` + `experimental.chat.system.transform`
6. `hooks/message.ts` — `chat.message` observation write
7. `hooks/tool-use.ts` — `tool.execute.after` observation write
8. `hooks/turn-summary.ts` — `session.idle` summary write
9. `hooks/session-end.ts` — `session.deleted` rollup + dispose
10. `index.ts` — compose, export `caveMemHooks(ctx)`
11. Verify: create session → check `store.storage.listSessions()`, send message → check observations, end session → check session summary, confirm no system prompt mutation between turns (cache stable)
