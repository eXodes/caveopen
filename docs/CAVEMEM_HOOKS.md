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

| OpenCode hook                     | cavemem hook name    | Stdin payload fields                                     | Returns context?         |
| --------------------------------- | -------------------- | -------------------------------------------------------- | ------------------------ |
| `event: session.created`          | `session-start`      | `session_id`, `ide`, `cwd`                               | ✅ prior-session context |
| `chat.message`                    | `user-prompt-submit` | `session_id`, `prompt`                                   | ✅ (always `''`)         |
| `tool.execute.after`              | `post-tool-use`      | `session_id`, `tool_name`, `tool_input`, `tool_response` | ❌                       |
| `event: session.idle` + SDK fetch | `stop`               | `session_id`, `last_assistant_message`                   | ❌                       |
| `event: session.deleted`          | `session-end`        | `session_id`                                             | ❌                       |

---

## Hook 1 — Session Init (`session.created` → `session-start`)

```ts
event: async ({ event }) => {
  if (event.type !== "session.created") return;
  const context = await runCavememHook("session-start", {
    session_id: event.properties.info.id,
    ide: "opencode",
    cwd: process.cwd(),
    // omit `source` — session.created is always a new session, never resume/clear/compact
  });
  setCachedContext(event.properties.info.id, context ?? "");
};
```

**Event shape:** `session.created` carries `{ info: Session }` (same as `session.deleted`), not `{ sessionID }`. Session ID is `event.properties.info.id`.

**`source` guard:** The handler returns `''` when `source` is set and not `'startup'` (skips injection on resume/clear/compact). OpenCode `session.created` fires once per new session only — omitting `source` means the guard never trips and prior-session context is always returned.

**`cwd`:** Pass `process.cwd()`. Without it the handler returns hints from all projects, not just the current one.

**Inject via system transform** — cache the returned string on `session.created`, inject in `experimental.chat.system.transform`:

```ts
'experimental.chat.system.transform': async (input, output) => {
  const ctx = getCachedContext(input.sessionID)
  if (ctx) output.system.unshift(ctx)
}
```

Never inject in `chat.message` — thrashes the last-2 KV-cache slots.

---

## Hook 2 — User Prompt (`chat.message` → `user-prompt-submit`)

```ts
'chat.message': async (input, output) => {
  const text = extractText(output.parts)   // join text-typed parts
  if (!text.trim()) return
  await runCavememHook('user-prompt-submit', {
    session_id: input.sessionID,
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
  await runCavememHook('post-tool-use', {
    session_id: input.sessionID,
    tool_name: input.tool,
    tool_input: input.args,                         // available in-process; no .before capture needed
    tool_response: output.output ?? output.title,   // title fallback for tools with no text output
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
  deleteCachedContext(sessionID); // evict from in-process session-cache
};
```

**`event.properties.info.id`** — `session.deleted` event shape differs from `session.idle`: it carries `{ info: { id, ... } }` not `{ sessionID }`. No `dispose` hook — `session.deleted` fires reliably before server shutdown.

The handler rolls up all `scope: 'turn'` summaries into a `scope: 'session'` summary.

---

## Caching Safety

| Injection point         | Hook                                      | Cache behavior                                      |
| ----------------------- | ----------------------------------------- | --------------------------------------------------- |
| Prior-session context   | `experimental.chat.system.transform`      | Fixed per session → `system[0]` → KV-cached turn 2+ |
| User prompt observation | `chat.message` (write only)               | No model context mutation                           |
| Tool observation        | `tool.execute.after` (write only)         | No model context mutation                           |
| Turn summary            | `session.idle` (write only)               | No model context mutation                           |
| Session rollup          | `session.deleted` → `deleteCachedContext` | No model context mutation                           |

Prior-session context string is immutable after `session.created`. Never re-fetch or mutate mid-session.

---

## CaveOpen vs Official OpenCode Installer

| Feature                 | Official installer                      | CaveOpen                                                  |
| ----------------------- | --------------------------------------- | --------------------------------------------------------- |
| Invocation              | `Bun.spawn` detached (fire-and-forget)  | `Bun.spawn` awaited (same CLI, captures stdout)           |
| User prompt observation | ❌ Not wired                            | ✅ `chat.message` → `cavemem hook run user-prompt-submit` |
| Turn summaries          | ❌ `stop` receives no text → no-op      | ✅ SDK fetch on `session.idle` → `cavemem hook run stop`  |
| Session rollup          | ❌ Not wired                            | ✅ `session.deleted` → `cavemem hook run session-end`     |
| `cwd` scoping           | ❌ null → all-project hints             | ✅ `process.cwd()` → project-scoped hints                 |
| `.before` arg capture   | ✅ Required (detached spawn loses args) | ❌ Not needed (args available in `.after`)                |
