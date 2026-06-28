# CAVEMEM_HOOKS.md — OpenCode Hook Port

Port of [cavemem](https://github.com/JuliusBrussee/cavemem) hooks to the OpenCode plugin system.

---

## Approach

Invoke the installed `cavemem` CLI via `cavemem hook run <name>`. No `@cavemem/*` imports. The CLI reads a JSON payload from stdin, runs the handler, and writes structured output to stdout (for hooks that return context) or stderr (telemetry only).

```
echo '<json>' | cavemem hook run <hook-name>
```

Uses `node:child_process.spawn` (no Bun path — OpenCode runs plugins via Bun but the plugin itself uses the Node-compatible spawn API):

```ts
import { spawn } from "node:child_process";

function spawnNode(name: string, json: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("cavemem", ["hook", "run", name], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    proc.on("close", () => resolve(out));
    proc.on("error", reject);
    proc.stdin.write(json);
    proc.stdin.end();
  });
}

export async function runCavememHook(
  name: string,
  payload: object,
): Promise<string | null> {
  const json = JSON.stringify(payload);
  let text: string;
  try {
    text = await spawnNode(name, json);
  } catch {
    return null;
  }
  if (!text.trim()) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed?.hookSpecificOutput?.additionalContext ?? null;
  } catch {
    return null;
  }
}
```

---

## CLI Output Format

`cavemem hook run` writes to:

- **stdout** — `{ hookSpecificOutput: { hookEventName, additionalContext } }` — only for `session-start` and `user-prompt-submit` when context is non-empty
- **stderr** — `{ hook, ok, ms, error? }` — telemetry; always written

Only `session-start` and `user-prompt-submit` produce stdout. All other hooks stay silent on stdout.

---

## Hook Mapping

| OpenCode hook                     | cavemem hook name    | Stdin payload fields                                     | Returns context?                                            |
| --------------------------------- | -------------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| `event: session.created`          | `session-start`      | `session_id`, `ide`, `cwd`                               | ✅ prior-session context (suppressed by `skipPriorContext`) |
| `chat.message`                    | `user-prompt-submit` | `session_id`, `prompt`                                   | ✅ (always `''`)                                            |
| `tool.execute.after`              | `post-tool-use`      | `session_id`, `tool_name`, `tool_input`, `tool_response` | ❌                                                          |
| `event: session.idle` + SDK fetch | `stop`               | `session_id`, `last_assistant_message`                   | ❌                                                          |
| `event: session.deleted`          | `session-end`        | `session_id`                                             | ❌                                                          |

---

## Hook 1 — Session Init (`session.created` → `session-start`)

```ts
// Pending promises dedupe concurrent callers. cavemem uses INSERT OR IGNORE,
// so whoever fires first wins. Without this, user-prompt-submit/post-tool-use
// can trigger ensureSession() with ide:"unknown"/cwd:null before session-start
// completes, permanently locking out the real values.
const pending = new Map<string, Promise<void>>();

export function initSession(
  sessionID: string,
  directory: string,
): Promise<void> {
  if (hasSession(sessionID)) return Promise.resolve();
  if (pending.has(sessionID)) return pending.get(sessionID)!;

  const p = runCavememHook("session-start", {
    session_id: sessionID,
    ide: "opencode",
    cwd: directory,
  }).then((context) => {
    setCachedContext(sessionID, context ?? "");
    pending.delete(sessionID);
  });

  pending.set(sessionID, p);
  return p;
}

event: async ({ event }) => {
  if (event.type !== "session.created") return;
  const { id, directory } = event.properties.info;
  await initSession(id, directory ?? process.cwd());
};
```

**Event shape:** `session.created` carries `{ info: Session }` (same as `session.deleted`), not `{ sessionID }`. Session ID is `event.properties.info.id`.

**`source` guard:** The handler returns `''` when `source` is set and not `'startup'` (skips injection on resume/clear/compact). OpenCode `session.created` fires once per new session only — omitting `source` means the guard never trips and prior-session context is always returned.

**`cwd`:** Pass `event.properties.info.directory` (the session's actual directory from the SDK). This is critical for subagent sessions, which may have a different working directory than the plugin process. `process.cwd()` is only a fallback if the field is absent.

**Inject via system transform** — cache the returned string on `session.created`, inject in `experimental.chat.system.transform`:

```ts
'experimental.chat.system.transform': async (input, output) => {
  if (options?.skipPriorContext) return;   // opt-out via plugin options
  const ctx = getCachedContext(input.sessionID)
  if (ctx) output.system.push(ctx)         // append after host instructions
}
```

Use `push`, not `unshift`. OpenCode concatenates all instructions into `system[0]` before transforms run. `unshift` displaces that large block to `system[2]` (outside `applyCaching()`'s 2-slot window), causing a cache miss on the most expensive content every turn. `push` places priorContext at `system[2]` instead — smaller content, accepts the miss.

Never inject in `chat.message` — thrashes the last-2 KV-cache slots.

**`skipPriorContext` option** — when `cavemem.skipPriorContext: true` is set in plugin options, `systemTransformHook` returns immediately without injecting. Observations (prompts, tool calls, turn summaries) are still written to the store; only the system-prompt injection is suppressed. This is the recommended workaround for cavemem ≤ 0.2.1, which fetches prior-session hints globally without filtering by `cwd` ([cavemem#39](https://github.com/JuliusBrussee/cavemem/issues/39)).

---

## Hook 2 — User Prompt (`chat.message` → `user-prompt-submit`)

```ts
'chat.message': async (input, output) => {
  const sessionID = input.sessionID;
  if (!sessionID) return;

  // Guard: user-prompt-submit triggers ensureSession() in cavemem, which
  // uses INSERT OR IGNORE with ide:"unknown"/cwd:null. If session-start
  // hasn't completed yet, it wins and the real values are permanently blocked.
  if (!hasSession(sessionID)) {
    try {
      const resp = await ctx.client.session.get({ path: { id: sessionID } });
      await initSession(sessionID, resp.data?.directory ?? ctx.directory);
    } catch { /* best-effort */ }
  }

  const text = extractText(output.parts)   // join text-typed parts
  if (!text.trim()) return
  await runCavememHook('user-prompt-submit', {
    session_id: sessionID,
    prompt: text,
  })
  // handler always returns '' — no output mutation needed
}
```

Pure write path. `additionalContext` is always empty — retrieval is MCP-driven.

---

## Hook 3 — Tool Use (`tool.execute.after` → `post-tool-use`)

```ts
'tool.execute.after': async (input, output) => {
  const sessionID = input.sessionID;
  if (!sessionID) return;

  // Subagent sessions: tool.execute.after fires before session.created reaches
  // the event handler. Same INSERT OR IGNORE race as chat.message — eagerly
  // init with correct directory before post-tool-use adds any observation.
  if (!hasSession(sessionID)) {
    try {
      const resp = await ctx.client.session.get({ path: { id: sessionID } });
      await initSession(sessionID, resp.data?.directory ?? ctx.directory);
    } catch { /* best-effort */ }
  }

  await runCavememHook('post-tool-use', {
    session_id: sessionID,
    tool_name: input.tool,
    tool_input: input.args,                         // available in-process; no .before capture needed
    tool_response: output.output || output.title,    // || not ??: empty string falls through to title
  })
}
```

**No `.before` stash.** The official OpenCode installer captures args in `tool.execute.before` because the external detached spawn in `.after` can't access them. In-process (or a synchronous spawn), `input.args` is available directly in `tool.execute.after`.

---

## Hook 4 — Turn Summary (`session.idle` → `stop`)

`session.idle` fires with no message payload. Fetch the last assistant message via `getLastAssistantText()` from `lib/text.ts`, which calls `client.session.messages()` and scans in reverse for the last assistant message with non-empty text parts:

```ts
event: async ({ event }) => {
  if (event.type !== "session.idle") return;
  const sessionID = event.properties?.sessionID;
  if (!sessionID) return;

  const text = await getLastAssistantText(ctx.client, sessionID);
  if (!text?.trim()) return;

  await runCavememHook("stop", {
    session_id: sessionID,
    last_assistant_message: text,
  });
};
```

**Gap vs official installer:** The official OpenCode installer calls `stop` with only `{ session_id, ide }` — no `last_assistant_message`. The handler returns early, so turn summaries are never written. CaveOpen fixes this with the SDK fetch before the `cavemem hook run stop` call.

**Note:** `client.message.list()` does not exist on the SDK client. The correct call is `client.session.messages({ path: { id: sessionID } })`, which is what `getLastAssistantText()` uses internally.

---

## Hook 5 — Session Rollup (`session.deleted` → `session-end`)

```ts
event: async ({ event }) => {
  if (event.type !== "session.deleted") return;

  const sessionID = event.properties.info.id; // note: .info.id not .sessionID
  if (!sessionID) return;

  await runCavememHook("session-end", { session_id: sessionID });
  deleteCachedContext(sessionID); // evict from in-process context
};
```

**`event.properties.info.id`** — `session.deleted` event shape differs from `session.idle`: it carries `{ info: { id, ... } }` not `{ sessionID }`. No `dispose` hook — `session.deleted` fires reliably before server shutdown.

The handler rolls up all `scope: 'turn'` summaries into a `scope: 'session'` summary.

---

## Caching Safety

| Injection point         | Hook                                      | Cache behavior                                                                   |
| ----------------------- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| Prior-session context   | `experimental.chat.system.transform`      | `push` → `system[2]` (after instructions + ruleset) → uncached; turn 1 cost only |
| User prompt observation | `chat.message` (write only)               | No model context mutation                                                        |
| Tool observation        | `tool.execute.after` (write only)         | No model context mutation                                                        |
| Turn summary            | `session.idle` (write only)               | No model context mutation                                                        |
| Session rollup          | `session.deleted` → `deleteCachedContext` | No model context mutation                                                        |

Prior-session context string is immutable after `session.created`. Never re-fetch or mutate mid-session.

**Slot assignment with all plugins loaded** (`applyCaching()` marks `system[0..1]`):

| Slot        | Content                            | Cached? | Rationale                                    |
| ----------- | ---------------------------------- | ------- | -------------------------------------------- |
| `system[0]` | OpenCode concatenated instructions | ✅      | Largest block, host-owned, always first      |
| `system[1]` | caveman ruleset (`push`)           | ✅      | Behavioral modifier, medium size             |
| `system[2]` | cavemem priorContext (`push`)      | ❌      | Background context, immutable, one-time cost |

When `opencode-claude-auth` is loaded (injects identity via `unshift`):

| Slot        | Content                  | Cached? |
| ----------- | ------------------------ | ------- |
| `system[0]` | oca identity (`unshift`) | ✅      |
| `system[1]` | OpenCode instructions    | ✅      |
| `system[2]` | caveman ruleset          | ❌      |
| `system[3]` | cavemem priorContext     | ❌      |

Identity + instructions stay cached. CaveOpen additions fall outside the window — acceptable given their relative size and the priority of auth + host instructions.

---

## CaveOpen vs Official OpenCode Installer

| Feature                 | Official installer                      | CaveOpen                                                                     |
| ----------------------- | --------------------------------------- | ---------------------------------------------------------------------------- |
| Invocation              | `Bun.spawn` detached (fire-and-forget)  | `node:child_process.spawn` awaited (captures stdout)                         |
| User prompt observation | ❌ Not wired                            | ✅ `chat.message` → `cavemem hook run user-prompt-submit`                    |
| Turn summaries          | ❌ `stop` receives no text → no-op      | ✅ SDK fetch on `session.idle` → `cavemem hook run stop`                     |
| Session rollup          | ❌ Not wired                            | ✅ `session.deleted` → `cavemem hook run session-end`                        |
| `cwd` scoping           | ❌ null → all-project hints             | ✅ `event.properties.info.directory` → correct per-session directory         |
| Session init ordering   | N/A                                     | ✅ Promise dedup + eager init guards prevent `ensureSession("unknown")` race |
| `.before` arg capture   | ✅ Required (detached spawn loses args) | ❌ Not needed (args available in `.after`)                                   |
