# CLAUDE.md — OpenCode Plugin Project

## Project Overview

This project builds an integrated plugin for [OpenCode](https://opencode.ai), an open-source AI coding agent. Plugins hook into OpenCode's event system to extend behavior, add tools, integrate with external services, or modify the agent's defaults.

**Docs:** https://opencode.ai/docs/plugins  
**SDK:** https://opencode.ai/docs/sdk  
**Ecosystem:** https://opencode.ai/docs/ecosystem

---

## Tech Stack

- **Runtime:** Bun (used by OpenCode internally for plugin execution)
- **Language:** TypeScript (preferred) or JavaScript
- **Package:** `@opencode-ai/plugin` for types and the `tool` helper
- **SDK:** `@opencode-ai/sdk` for programmatic client access
- **Dependencies:** Declared in `.opencode/package.json`, installed via `bun install` at startup

---

## Plugin Structure

```
.opencode/
  plugins/          # Project-level plugins (auto-loaded at startup)
    index.ts        # Main plugin entry point
  package.json      # Plugin dependencies (Bun installs these)
opencode.json       # OpenCode config (register npm plugins here)
```

**Plugin signature:**

```ts
import type { Plugin } from "@opencode-ai/plugin";

export const MyPlugin: Plugin = async ({
  project,
  client,
  $,
  directory,
  worktree,
}) => {
  return {
    // hook name: handler
  };
};
```

**Context object:**

| Key         | Description                              |
| ----------- | ---------------------------------------- |
| `project`   | Current project info                     |
| `directory` | Current working directory                |
| `worktree`  | Git worktree path                        |
| `client`    | OpenCode SDK client                      |
| `$`         | Bun shell API for running shell commands |

---

## Available Hooks

### Tool Events

- `tool.execute.before` — intercept/mutate tool calls before execution
- `tool.execute.after` — observe results after execution

### Session Events

- `session.created`, `session.idle`, `session.error`, `session.status`
- `session.compacted`, `session.deleted`, `session.diff`, `session.updated`
- `experimental.session.compacting` — inject/replace compaction prompt

### File Events

- `file.edited`, `file.watcher.updated`

### Shell Events

- `shell.env` — inject environment variables into all shell executions

### TUI Events

- `tui.prompt.append`, `tui.command.execute`, `tui.toast.show`

### Other

- `command.executed`, `message.updated`, `message.part.updated`
- `permission.asked`, `permission.replied`
- `lsp.client.diagnostics`, `lsp.updated`
- `server.connected`, `todo.updated`, `installation.updated`

---

## Custom Tools

Use the `tool` helper from `@opencode-ai/plugin`:

```ts
import { type Plugin, tool } from "@opencode-ai/plugin";

export const MyPlugin: Plugin = async (ctx) => ({
  tool: {
    my_tool: tool({
      description: "What this tool does",
      args: { input: tool.schema.string() },
      async execute(args, { directory, worktree }) {
        return `Result: ${args.input}`;
      },
    }),
  },
});
```

- Plugin tools take precedence over built-in tools with the same name.

---

## SDK Client Usage

```ts
import { createOpencodeClient } from "@opencode-ai/sdk"

const client = createOpencodeClient({ baseUrl: "http://localhost:4096" })

// Key APIs
client.session.create({ body: { title: "..." } })
client.session.prompt({ path: { id }, body: { parts: [{ type: "text", text: "..." }] } })
client.session.prompt({ path: { id }, body: { noReply: true, parts: [...] } })  // inject context only
client.tui.showToast({ body: { message: "...", variant: "success" } })
client.event.subscribe()  // SSE stream
```

---

## Logging

Use `client.app.log()` over `console.log` for structured output:

```ts
await client.app.log({
  body: { service: "my-plugin", level: "info", message: "Ready", extra: {} },
});
```

Levels: `debug` | `info` | `warn` | `error`

---

## Load Order

1. Global config: `~/.config/opencode/opencode.json`
2. Project config: `opencode.json`
3. Global plugins: `~/.config/opencode/plugins/`
4. Project plugins: `.opencode/plugins/`

All hooks run in sequence across all loaded plugins.

---

## Conventions

- **Prefer `tool.execute.before`** for input validation/sanitization; **`tool.execute.after`** for logging or side effects.
- **Throw errors** in `tool.execute.before` to block dangerous operations (see `.env` protection pattern).
- **Use `noReply: true`** when injecting context into a session without triggering an AI response.
- **Keep hooks focused** — one concern per hook, compose plugins for complex behavior.
- **No hardcoded secrets** — use `shell.env` to inject credentials at runtime.
- **Export named plugin functions** — one plugin function per file is preferred for clarity.

---

## Common Patterns

### Block sensitive file reads

```ts
"tool.execute.before": async (input, output) => {
  if (input.tool === "read" && output.args.filePath.includes(".env"))
    throw new Error("Reading .env files is not allowed")
}
```

### Notify on session idle

```ts
"session.idle" handled via the `event` hook:
event: async ({ event }) => {
  if (event.type === "session.idle")
    await $`notify-send "OpenCode" "Session complete"`
}
```

### Inject env vars

```ts
"shell.env": async (input, output) => {
  output.env.MY_SECRET = process.env.MY_SECRET
}
```

---

## Key References

| Resource          | URL                                   |
| ----------------- | ------------------------------------- |
| Plugin docs       | https://opencode.ai/docs/plugins      |
| SDK docs          | https://opencode.ai/docs/sdk          |
| Config reference  | https://opencode.ai/docs/config       |
| Custom tools      | https://opencode.ai/docs/custom-tools |
| Community plugins | https://opencode.ai/docs/ecosystem    |
| GitHub repo       | https://github.com/anomalyco/opencode |
