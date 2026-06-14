# OpenCode Plugin System

Reference for building plugins against the OpenCode plugin API. Covers loading, structure, events, tools, SDK usage, and ecosystem patterns.

**Docs:** https://opencode.ai/docs/plugins  
**SDK:** https://opencode.ai/docs/sdk  
**Ecosystem:** https://opencode.ai/docs/ecosystem

---

## Server vs TUI Plugins

OpenCode architecture: **Server** (headless HTTP) + **TUI** (terminal UI client that talks to server).

| Mode              | Command           | Server | TUI |
| ----------------- | ----------------- | ------ | --- |
| Interactive       | `opencode`        | ✓      | ✓   |
| Headless          | `opencode serve`  | ✓      | ✗   |
| SDK-only          | `createOpencode()`| ✓      | ✗   |

**Server-level** hooks run in all modes. **TUI-level** hooks/APIs only work when TUI is active.

### Server-level (always available)

Events: all except `tui.*`  
API: `client.session.*`, `client.find.*`, `client.file.*`, `client.app.*`, `client.event.*`  
Hooks: `tool.execute.before/after`, `shell.env`, `session.*`, `file.*`, `experimental.session.compacting`

### TUI-level (interactive mode only)

Events: `tui.prompt.append`, `tui.command.execute`, `tui.toast.show`  
API: `client.tui.*` — `showToast`, `appendPrompt`, `submitPrompt`, `clearPrompt`, `executeCommand`  
HTTP: `/tui/*` endpoints (used by IDE plugins to drive the TUI)

**Guard TUI calls** when plugin must run in both modes:

```ts
export const MyPlugin: Plugin = async ({ client }) => {
  return {
    "session.idle": async () => {
      try {
        await client.tui.showToast({ body: { message: "Done", variant: "success" } })
      } catch {
        // headless mode — TUI unavailable, skip
      }
    },
  }
}
```

### TUI control protocol

The server exposes a control protocol for driving the TUI — used by IDE plugins (VS Code, Zed, etc.):

| Endpoint                | Description                          |
| ----------------------- | ------------------------------------ |
| `GET /tui/control/next` | Long-poll: wait for next TUI request |
| `POST /tui/control/response` | Send response back to TUI       |

Only relevant when TUI is running. External clients (IDEs) use this to prefill prompts, submit commands, and receive callbacks without direct terminal access.

### Decision guide for CaveOpen

| Hook / API                        | Layer  | Works headless? |
| --------------------------------- | ------ | --------------- |
| `tool.execute.before/after`       | Server | ✓               |
| `shell.env`                       | Server | ✓               |
| `session.*` events                | Server | ✓               |
| `experimental.session.compacting` | Server | ✓               |
| `client.tui.showToast`            | TUI    | ✗               |
| `tui.*` events                    | TUI    | ✗               |

---

## Loading Plugins

### Local files

OpenCode auto-loads `.js`/`.ts` files from:

- `.opencode/plugins/` — project-level
- `~/.config/opencode/plugins/` — global

### npm packages

Declare in `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-wakatime", "@my-org/my-plugin"]
}
```

npm plugins install via Bun at startup into `~/.cache/opencode/node_modules/`.

### Load order

1. Global config (`~/.config/opencode/opencode.json`)
2. Project config (`opencode.json`)
3. Global plugin dir (`~/.config/opencode/plugins/`)
4. Project plugin dir (`.opencode/plugins/`)

Same-name+version npm packages deduplicated. Local + npm same-name both load.

---

## Plugin Structure

A plugin exports one or more async functions. Each receives a context object and returns a hooks object.

```ts
import type { Plugin } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async ({ project, client, $, directory, worktree }) => {
  return {
    // hook implementations
  }
}
```

**Context object:**

| Field       | Description                                       |
| ----------- | ------------------------------------------------- |
| `project`   | Current project info                              |
| `directory` | Current working directory                         |
| `worktree`  | Git worktree path                                 |
| `client`    | `@opencode-ai/sdk` client for programmatic access |
| `$`         | Bun's shell API for running commands              |

---

## Dependencies

Add a `package.json` to `.opencode/` for external packages:

```json
// .opencode/package.json
{
  "dependencies": {
    "shescape": "^2.1.0"
  }
}
```

OpenCode runs `bun install` at startup. Import normally in plugins.

---

## Events

### Command

- `command.executed`

### File

- `file.edited`
- `file.watcher.updated`

### Installation

- `installation.updated`

### LSP

- `lsp.client.diagnostics`
- `lsp.updated`

### Message

- `message.part.removed`
- `message.part.updated`
- `message.removed`
- `message.updated`

### Permission

- `permission.asked`
- `permission.replied`

### Server

- `server.connected`

### Session

- `session.created`
- `session.compacted`
- `session.deleted`
- `session.diff`
- `session.error`
- `session.idle`
- `session.status`
- `session.updated`

### Shell

- `shell.env`

### Todo

- `todo.updated`

### Tool

- `tool.execute.before` — intercept before tool runs; mutate `output.args` or throw to block
- `tool.execute.after`

### TUI _(TUI mode only)_

- `tui.prompt.append`
- `tui.command.execute`
- `tui.toast.show`

---

## Hook Patterns

### tool.execute.before — intercept/mutate

```ts
"tool.execute.before": async (input, output) => {
  if (input.tool === "read" && output.args.filePath.includes(".env")) {
    throw new Error("Do not read .env files")
  }
}
```

### shell.env — inject env vars

```ts
"shell.env": async (input, output) => {
  output.env.MY_API_KEY = "secret"
  output.env.PROJECT_ROOT = input.cwd
}
```

### session.idle — notify on completion

```ts
event: async ({ event }) => {
  if (event.type === "session.idle") {
    await $`osascript -e 'display notification "Done!" with title "opencode"'`
  }
}
```

### experimental.session.compacting — inject context

```ts
"experimental.session.compacting": async (input, output) => {
  output.context.push(`
## Persistent State
- Current task: ...
- Files in progress: ...
`)
}
```

Set `output.prompt` to replace the compaction prompt entirely (ignores `output.context`).

---

## Custom Tools

```ts
import { type Plugin, tool } from "@opencode-ai/plugin"

export const CustomToolsPlugin: Plugin = async (ctx) => {
  return {
    tool: {
      mytool: tool({
        description: "Does X",
        args: {
          foo: tool.schema.string(),
        },
        async execute(args, context) {
          return `Hello ${args.foo} from ${context.directory}`
        },
      }),
    },
  }
}
```

Plugin tools with same name as built-ins take precedence.

---

## Logging

Use `client.app.log()` over `console.log` for structured output:

```ts
await client.app.log({
  body: {
    service: "my-plugin",
    level: "info",   // debug | info | warn | error
    message: "Plugin initialized",
    extra: { foo: "bar" },
  },
})
```

---

## SDK Client

Available as `ctx.client` inside plugins, or standalone:

```ts
import { createOpencode } from "@opencode-ai/sdk"
const { client } = await createOpencode()
```

**Key APIs:**

| Namespace        | Notable methods                                         | Layer  |
| ---------------- | ------------------------------------------------------- | ------ |
| `client.session` | `create`, `prompt`, `messages`, `abort`, `summarize`    | Server |
| `client.find`    | `text`, `files`, `symbols`                              | Server |
| `client.file`    | `read`, `status`                                        | Server |
| `client.app`     | `log`, `agents`                                         | Server |
| `client.event`   | `subscribe` (SSE stream)                                | Server |
| `client.tui`     | `showToast`, `appendPrompt`, `submitPrompt`              | TUI ⚠  |

### Inject context without triggering AI

```ts
await client.session.prompt({
  path: { id: sessionId },
  body: {
    noReply: true,
    parts: [{ type: "text", text: "You are a helpful assistant." }],
  },
})
```

### Structured output

```ts
const result = await client.session.prompt({
  path: { id: sessionId },
  body: {
    parts: [{ type: "text", text: "Summarize this codebase" }],
    format: {
      type: "json_schema",
      schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          files: { type: "number" },
        },
        required: ["summary"],
      },
    },
  },
})
console.log(result.data.info.structured_output)
```

---

## Packages

| Package               | Purpose                                         |
| --------------------- | ----------------------------------------------- |
| `@opencode-ai/plugin` | Plugin types (`Plugin`) and tool helpers        |
| `@opencode-ai/sdk`    | Programmatic client (`createOpencode`, `Session`, `Message`, etc.) |

Install both via Bun: `bun add @opencode-ai/plugin @opencode-ai/sdk`

---

## Ecosystem Highlights

Notable community plugins to study or use:

| Plugin                            | Useful for                                      |
| --------------------------------- | ----------------------------------------------- |
| `opencode-wakatime`               | Time tracking via `session.idle` event          |
| `opencode-dynamic-context-pruning`| Token optimization via compaction hooks         |
| `opencode-vibeguard`              | Secret redaction via `tool.execute.before`      |
| `opencode-supermemory`            | Cross-session persistent memory                 |
| `opencode-morph-fast-apply`       | Faster edits via custom apply strategy          |
| `opencode-worktree`               | Git worktree automation                         |
| `opencode-skillful`               | Lazy-loaded prompt skill injection              |

Full list: https://opencode.ai/docs/ecosystem#plugins  
Plugin template: https://github.com/zenobi-us/opencode-plugin-template/
