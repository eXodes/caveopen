# Plugin Hooks Reference

Hooks are organized into three contexts:

- **Shared** — fire in all contexts (TUI, CLI, headless); always available
- **Server** — direct interceptors/mutators run in the server process
- **TUI** — events emitted by the terminal UI; only fire when TUI is active

All hooks are registered by returning them from the plugin function:

```ts
import type { Plugin } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async ({ client, $ }) => ({
  "tool.execute.before": async (input, output) => { /* ... */ },
  event: async ({ event }) => { /* ... */ },
})
```

---

## Shared Hooks

These fire via the `event` hook in every context. Use for cross-cutting concerns that should work regardless of how OpenCode is invoked.

```ts
event: async ({ event }) => {
  if (event.type === "session.idle") { /* ... */ }
}
```

### Session Events

| Event | When |
|---|---|
| `session.created` | New session initialized |
| `session.idle` | Session finished processing, awaiting input |
| `session.error` | Session encountered an error |
| `session.status` | Session status changed |
| `session.updated` | Session metadata updated |
| `session.diff` | File diff produced during session |
| `session.compacted` | Session context was compacted |
| `session.deleted` | Session deleted |

### Message Events

| Event | When |
|---|---|
| `message.updated` | Message content changed |
| `message.part.updated` | Individual message part changed |
| `message.removed` | Message deleted |
| `message.part.removed` | Message part deleted |

### File Events

| Event | When |
|---|---|
| `file.edited` | File was written by a tool |
| `file.watcher.updated` | File changed on disk (external edit) |

### Tool Events (observable)

| Event | When |
|---|---|
| `tool.execute.before` *(also direct)* | Tool call about to run |
| `tool.execute.after` *(also direct)* | Tool call completed |

### Permission Events

| Event | When |
|---|---|
| `permission.asked` | Permission prompt shown to user |
| `permission.replied` | User responded to permission prompt |

### LSP Events

| Event | When |
|---|---|
| `lsp.client.diagnostics` | LSP diagnostics received |
| `lsp.updated` | LSP server state changed |

### Other Shared Events

| Event | When |
|---|---|
| `command.executed` | Slash command ran |
| `todo.updated` | Todo list changed |
| `installation.updated` | Plugin/tool installation changed |

---

## Server Hooks

Direct interceptors and mutators. These run synchronously in the server process and can **mutate** their `output` argument or **throw** to block the operation.

### Lifecycle

#### `dispose`
Called on server shutdown. Use for cleanup (close connections, flush buffers).

```ts
dispose: async () => {
  await db.close()
}
```

#### `config`
Mutate the resolved config before OpenCode applies it. Runs once at startup.

```ts
config: async (config) => {
  config.model = "anthropic:claude-opus-4-5"
}
```

### Registration

#### `tool`
Register custom tools alongside built-ins. Plugin tools shadow built-ins with the same name.

```ts
import { tool } from "@opencode-ai/plugin"

tool: {
  mytool: tool({
    description: "Do a thing",
    args: { input: tool.schema.string() },
    async execute(args, { directory }) {
      return `Got: ${args.input} in ${directory}`
    },
  }),
}
```

#### `auth`
Register a custom auth provider (OAuth or API key).

```ts
auth: {
  provider: "my-provider",
  methods: [{ type: "api", label: "API Key", /* ... */ }],
}
```

#### `provider`
Register a custom model provider and its available models.

```ts
provider: {
  id: "my-provider",
  models: async (provider, ctx) => ({ /* ModelV2 map */ }),
}
```

### Tool Interception

#### `tool.execute.before`
Mutate args or throw to block a tool call before it runs.

```ts
"tool.execute.before": async (input, output) => {
  // input: { tool, sessionID, callID }
  // output: { args }
  if (input.tool === "read" && output.args.filePath.includes(".env"))
    throw new Error("Reading .env is not allowed")
}
```

#### `tool.execute.after`
Observe or mutate tool output after execution.

```ts
"tool.execute.after": async (input, output) => {
  // input: { tool, sessionID, callID, args }
  // output: { title, output, metadata }
  await log(input.tool, output.output)
}
```

#### `tool.definition`
Mutate the tool description and parameter schema sent to the LLM.

```ts
"tool.definition": async (input, output) => {
  // input: { toolID }
  // output: { description, parameters }
  if (input.toolID === "bash")
    output.description += " Prefer read-only commands."
}
```

### Chat / LLM

#### `chat.message`
Called when a new user message arrives. Mutate `output.parts` to inject context.

```ts
"chat.message": async (input, output) => {
  // input: { sessionID, agent, model, messageID, variant }
  // output: { message, parts }
  output.parts.push({ type: "text", text: "System context: ..." })
}
```

#### `chat.params`
Mutate LLM sampling parameters before each inference call.

```ts
"chat.params": async (input, output) => {
  // input: { sessionID, agent, model, provider, message }
  // output: { temperature, topP, topK, maxOutputTokens, options }
  output.temperature = 0.2
}
```

#### `chat.headers`
Inject or override HTTP headers sent to the LLM provider.

```ts
"chat.headers": async (input, output) => {
  // input: { sessionID, agent, model, provider, message }
  // output: { headers }
  output.headers["X-Session-ID"] = input.sessionID
}
```

### Permissions & Commands

#### `permission.ask`
Override the permission decision before the user is prompted.

```ts
"permission.ask": async (input, output) => {
  // input: Permission object
  // output: { status: "ask" | "allow" | "deny" }
  if (input.tool === "read") output.status = "allow"
}
```

#### `command.execute.before`
Intercept slash commands before execution. Mutate `output.parts` to prepend context.

```ts
"command.execute.before": async (input, output) => {
  // input: { command, sessionID, arguments }
  // output: { parts }
  if (input.command === "clear") await saveHistory(input.sessionID)
}
```

### Shell

#### `shell.env`
Inject environment variables into every shell execution (AI tools and user terminals).

```ts
"shell.env": async (input, output) => {
  // input: { cwd, sessionID?, callID? }
  // output: { env }
  output.env.MY_API_KEY = process.env.MY_API_KEY!
  output.env.PROJECT_ROOT = input.cwd
}
```

### Experimental

> These hooks are stable enough to use but their signatures may change.

#### `experimental.session.compacting`
Customize the compaction prompt. Append context or replace the prompt entirely.

```ts
"experimental.session.compacting": async (input, output) => {
  // input: { sessionID }
  // output: { context: string[], prompt?: string }

  // Append context (default prompt still used):
  output.context.push("## Active task\nRefactoring auth module.")

  // Or replace prompt entirely:
  // output.prompt = "Generate a continuation summary..."
}
```

#### `experimental.compaction.autocontinue`
Control whether a synthetic "continue" turn is added after compaction.

```ts
"experimental.compaction.autocontinue": async (input, output) => {
  // input: { sessionID, agent, model, provider, message, overflow }
  // output: { enabled }
  output.enabled = false  // suppress auto-continue
}
```

#### `experimental.chat.messages.transform`
Transform the full message history sent to the LLM.

```ts
"experimental.chat.messages.transform": async (input, output) => {
  // input: {}
  // output: { messages: { info: Message, parts: Part[] }[] }
  output.messages = output.messages.filter(m => !isStale(m))
}
```

#### `experimental.chat.system.transform`
Mutate the system prompt strings sent to the LLM.

```ts
"experimental.chat.system.transform": async (input, output) => {
  // input: { sessionID?, model }
  // output: { system: string[] }
  output.system.push("Always respond in JSON.")
}
```

#### `experimental.provider.small_model`
Override which small/fast model is used for internal tasks (title generation, etc.).

```ts
"experimental.provider.small_model": async (input, output) => {
  // input: { provider: ProviderV2 }
  // output: { model?: ModelV2 }
  output.model = myFastModel
}
```

#### `experimental.text.complete`
Observe text generation as it completes.

```ts
"experimental.text.complete": async (input, output) => {
  // input: { sessionID, messageID, partID }
  // output: { text }
  await logCompletion(input.sessionID, output.text)
}
```

---

## TUI Hooks

Events emitted by the terminal UI. Only fire when OpenCode is running with the TUI (`opencode` with interactive terminal). Observe via `event`.

```ts
event: async ({ event }) => {
  if (event.type === "tui.prompt.append") { /* ... */ }
}
```

### Connection

| Event | When |
|---|---|
| `server.connected` | TUI client established connection to the server |

### Prompt & Commands

| Event | When |
|---|---|
| `tui.prompt.append` | Text was appended to the prompt input |
| `tui.command.execute` | User executed a slash command via TUI |

### Notifications

| Event | When |
|---|---|
| `tui.toast.show` | Toast notification displayed in TUI |

---

## Hook Execution Order

All loaded plugins run their hooks in sequence. Load order:

1. Global config (`~/.config/opencode/opencode.json`)
2. Project config (`opencode.json`)
3. Global plugins (`~/.config/opencode/plugins/`)
4. Project plugins (`.opencode/plugins/`)

Throwing in `tool.execute.before` or `permission.ask` stops the operation — later plugins in the sequence do not run for that call.

---

## Type Imports

```ts
import type { Plugin, Hooks, AuthHook, ProviderHook } from "@opencode-ai/plugin"
import type { Event } from "@opencode-ai/sdk"
```

Source: [`packages/plugin/src/index.ts`](https://github.com/anomalyco/opencode/blob/dev/packages/plugin/src/index.ts)
