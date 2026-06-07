import { describe, it, mock } from "node:test"
import assert from "node:assert/strict"
import type { Event } from "@opencode-ai/sdk"

// ── Mock node:child_process ───────────────────────────────────────────────────
// With V38 (spawn + stdin), payload is raw JSON written to stdin — no shell escaping needed.

type SpawnCall = { name: string; data: Record<string, unknown> }
const spawnCalls: SpawnCall[] = []

mock.module("node:child_process", {
  namedExports: {
    spawnSync: (_cmd: string, _args: string[], _opts?: unknown) => ({
      status: 0,
      error: null,
      stdout: Buffer.from("1.0.0"),
      stderr: Buffer.from(""),
    }),
    execSync: (_cmd: string, _opts?: unknown) => "",
    spawn: (_cmd: string, args: string[], _opts?: unknown) => {
      const hookName = args[2] ?? "unknown"
      let closeCb: ((code: number) => void) | null = null
      const stdin = {
        end: (data: string) => {
          try {
            spawnCalls.push({ name: hookName, data: JSON.parse(data) as Record<string, unknown> })
          } catch {
            spawnCalls.push({ name: hookName, data: {} })
          }
          setImmediate(() => { if (closeCb) closeCb(0) })
        },
      }
      return {
        stdin,
        kill: () => {},
        on: (event: string, handler: (...a: unknown[]) => void) => {
          if (event === "close") closeCb = handler as (code: number) => void
        },
      }
    },
  },
})

const { cavemem } = await import("../cavemem.js")

// ── Helpers ───────────────────────────────────────────────────────────────────

function flush() {
  spawnCalls.length = 0
}

function payloadFor(hookName: string): Record<string, unknown> | undefined {
  return spawnCalls.find(c => c.name === hookName)?.data
}

async function mkHooks() {
  return await cavemem({ directory: "/tmp/test" } as Parameters<typeof cavemem>[0])
}

async function fireEvent(
  hooks: Awaited<ReturnType<typeof cavemem>>,
  e: Record<string, unknown>
) {
  return hooks.event!({ event: e as unknown as Event })
}

async function bootSession(hooks: Awaited<ReturnType<typeof cavemem>>, sid: string, body: string) {
  await fireEvent(hooks, { type: "session.created", properties: { info: { id: sid } } })
  await fireEvent(hooks, {
    type: "message.updated",
    properties: {
      info: { role: "user", id: `msg-${sid}`, sessionID: sid, parts: [{ type: "text", text: body }] },
    },
  })
}

// ── V10: payload delivery via stdin (no shell) ────────────────────────────────
// With spawn + stdin, JSON is transmitted raw — no shell injection risk.

describe("V10 — spawn stdin delivery: special chars round-trip correctly", () => {
  it("plain text round-trips correctly", async () => {
    const hooks = await mkHooks()
    flush()
    await bootSession(hooks, "s1", "hello world")
    const payload = payloadFor("user-prompt-submit")
    assert.ok(payload, "user-prompt-submit fired")
    assert.strictEqual(payload!.prompt, "hello world")
  })

  it("single quote in prompt round-trips (no shell escape needed)", async () => {
    const hooks = await mkHooks()
    flush()
    await bootSession(hooks, "s2", "it's a test")
    const payload = payloadFor("user-prompt-submit")
    assert.ok(payload, "user-prompt-submit fired")
    assert.strictEqual(payload!.prompt, "it's a test")
  })

  it("shell injection via semicolon is safe — stdin not parsed by shell", async () => {
    const hooks = await mkHooks()
    flush()
    const injection = "'; rm -rf /'"
    await bootSession(hooks, "s3", injection)
    const payload = payloadFor("user-prompt-submit")
    assert.ok(payload, "user-prompt-submit fired")
    assert.strictEqual(payload!.prompt, injection, "injection string round-trips unchanged")
  })

  it("backtick injection is safe — `id`", async () => {
    const hooks = await mkHooks()
    flush()
    const injection = "`id`"
    await bootSession(hooks, "s4", injection)
    const payload = payloadFor("user-prompt-submit")
    assert.ok(payload, "user-prompt-submit fired")
    assert.strictEqual(payload!.prompt, injection)
  })

  it("$() injection is safe — $(cat /etc/passwd)", async () => {
    const hooks = await mkHooks()
    flush()
    const injection = "$(cat /etc/passwd)"
    await bootSession(hooks, "s5", injection)
    const payload = payloadFor("user-prompt-submit")
    assert.ok(payload, "user-prompt-submit fired")
    assert.strictEqual(payload!.prompt, injection)
  })

  it("mixed injection is safe — '; $(evil) && cmd", async () => {
    const hooks = await mkHooks()
    flush()
    const injection = "'; $(evil) && rm -rf / || echo 'pwned"
    await bootSession(hooks, "s6", injection)
    const payload = payloadFor("user-prompt-submit")
    assert.ok(payload, "user-prompt-submit fired")
    assert.strictEqual(payload!.prompt, injection)
  })

  it("multiple single quotes round-trip correctly", async () => {
    const hooks = await mkHooks()
    flush()
    const text = "it's you're can't won't"
    await bootSession(hooks, "s7", text)
    const payload = payloadFor("user-prompt-submit")
    assert.ok(payload, "user-prompt-submit fired")
    assert.strictEqual(payload!.prompt, text)
  })

  it("backslash sequences round-trip correctly", async () => {
    const hooks = await mkHooks()
    flush()
    const text = "path\\to\\file and C:\\Windows\\System32"
    await bootSession(hooks, "s8", text)
    const payload = payloadFor("user-prompt-submit")
    assert.ok(payload, "user-prompt-submit fired")
    assert.strictEqual(payload!.prompt, text)
  })

  it("newline in assistant text round-trips via stop hook", async () => {
    const hooks = await mkHooks()

    await fireEvent(hooks, { type: "session.created", properties: { info: { id: "s9" } } })
    await fireEvent(hooks, {
      type: "message.updated",
      properties: {
        info: { role: "user", id: "mu9", sessionID: "s9", parts: [{ type: "text", text: "go" }] },
      },
    })

    const multiline = "line one\nline two\n'; injection attempt"
    const handler = hooks["experimental.text.complete"] as
      | ((input: { sessionID: string; messageID: string; partID: string }, output: { text: string }) => Promise<void>)
      | undefined
    if (!handler) throw new Error("experimental.text.complete not registered")
    flush()
    await handler({ sessionID: "s9", messageID: "a9", partID: "p1" }, { text: multiline })

    const payload = payloadFor("stop")
    assert.ok(payload, "stop hook fired")
    assert.strictEqual(payload!.turn_summary, multiline)
  })

  it("double-quote and pipe chars in prompt are safe", async () => {
    const hooks = await mkHooks()
    flush()
    const text = `"quoted" | tee /tmp/out && echo "done"`
    await bootSession(hooks, "s10", text)
    const payload = payloadFor("user-prompt-submit")
    assert.ok(payload, "user-prompt-submit fired")
    assert.strictEqual(payload!.prompt, text)
  })
})
