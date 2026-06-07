import { describe, it, mock } from "node:test"
import assert from "node:assert/strict"
import type { Event } from "@opencode-ai/sdk"

// ── Mock node:child_process before importing cavemem ─────────────────────────
// spawnSync simulates cavemem available (V6).
// spawn records {name, data} and resolves immediately.

type SpawnCall = { name: string; data: Record<string, unknown> }
const spawnCalls: SpawnCall[] = []
const execSyncCalls: SpawnCall[] = []

mock.module("node:child_process", {
  namedExports: {
    spawnSync: (_cmd: string, _args: string[], _opts?: unknown) => ({
      status: 0,
      error: null,
      stdout: Buffer.from("1.0.0"),
      stderr: Buffer.from(""),
    }),
    execSync: (cmd: string, opts?: { input?: string }) => {
      // cmd: "cavemem hook run <name> --ide opencode"
      const parts = (cmd as string).trim().split(/\s+/)
      const runIdx = parts.indexOf("run")
      const hookName = runIdx >= 0 ? (parts[runIdx + 1] ?? "unknown") : "unknown"
      try {
        execSyncCalls.push({ name: hookName, data: JSON.parse(opts?.input ?? "{}") as Record<string, unknown> })
      } catch {
        execSyncCalls.push({ name: hookName, data: {} })
      }
      return ""
    },
    spawn: (_cmd: string, args: string[], _opts?: unknown) => {
      // args = ["hook", "run", <name>, "--ide", "opencode"]
      const hookName = args[2] ?? "unknown"

      let closeCb: ((code: number) => void) | null = null

      const stdin = {
        end: (data: string) => {
          try {
            spawnCalls.push({ name: hookName, data: JSON.parse(data) as Record<string, unknown> })
          } catch {
            spawnCalls.push({ name: hookName, data: {} })
          }
          // setImmediate defers until after child.on("close",...) is registered in runHook
          setImmediate(() => { if (closeCb) closeCb(0) })
        },
      }

      return {
        stdin,
        kill: () => { /* noop in tests */ },
        on: (event: string, handler: (...a: unknown[]) => void) => {
          if (event === "close") closeCb = handler as (code: number) => void
        },
      }
    },
  },
})

// Dynamic import AFTER mock is registered
const { cavemem } = await import("../cavemem.js")

// ── Helpers ───────────────────────────────────────────────────────────────────

function flush() {
  spawnCalls.length = 0
}

function hookedNames(): string[] {
  return spawnCalls.map(c => c.name)
}

/** Bypasses discriminated-union strictness for test event objects */
async function fireEvent(
  hooks: Awaited<ReturnType<typeof cavemem>>,
  e: Record<string, unknown>
) {
  return hooks.event!({ event: e as unknown as Event })
}

/** Fire chat.message hook with a user text message (replaces message.updated role===user, V100) */
async function fireChatMessage(
  hooks: Awaited<ReturnType<typeof cavemem>>,
  sessionID: string,
  text: string,
  messageID = "m1"
) {
  const handler = hooks["chat.message"] as
    | ((input: { sessionID: string; messageID?: string }, output: { parts: Array<{ type: string; text?: string }> }) => Promise<void>)
    | undefined
  if (!handler) throw new Error("chat.message not registered")
  return handler({ sessionID, messageID }, { parts: text ? [{ type: "text", text }] : [] })
}

async function mkHooks() {
  return await cavemem({ directory: "/tmp/test" } as Parameters<typeof cavemem>[0])
}

// ── V35: tool.execute.after guard ────────────────────────────────────────────

describe("V35 — tool.execute.after skips post-tool-use before session-start", () => {
  it("tool call before session-start → no post-tool-use", async () => {
    const hooks = await mkHooks()

    await fireEvent(hooks, { type: "session.created", properties: { info: { id: "s1" } } })
    flush()

    await hooks["tool.execute.after"]!(
      { tool: "read", sessionID: "s1", callID: "c1", args: {} } as never,
      { title: "read", output: "content", metadata: null } as never
    )

    assert.deepStrictEqual(hookedNames(), [], "no post-tool-use before session-start")
  })

  it("tool call after session-start → post-tool-use batched (fires on idle, not immediately)", async () => {
    const hooks = await mkHooks()

    await fireEvent(hooks, { type: "session.created", properties: { info: { id: "s2" } } })
    await fireChatMessage(hooks, "s2", "go")
    flush()

    await hooks["tool.execute.after"]!(
      { tool: "read", sessionID: "s2", callID: "c2", args: {} } as never,
      { title: "read", output: "content", metadata: null } as never
    )

    // V48: ⊥ fires immediately — batched until session.idle
    assert.deepStrictEqual(hookedNames(), [], "post-tool-use deferred until idle")

    // Flush via session.idle
    await fireEvent(hooks, { type: "session.idle", properties: { sessionID: "s2" } })
    assert.ok(hookedNames().includes("post-tool-use"), "post-tool-use fires on session.idle")
  })
})

// ── V7: phantom-session guard ─────────────────────────────────────────────────

describe("V7 — phantom-session guard", () => {
  it("session.created alone does NOT fire session-start", async () => {
    const hooks = await mkHooks()
    flush()

    await fireEvent(hooks, { type: "session.created", properties: { info: { id: "s1" } } })

    assert.deepStrictEqual(hookedNames(), [], "no hooks on session.created alone")
  })

  it("first user message with body fires session-start then user-prompt-submit", async () => {
    const hooks = await mkHooks()

    await fireEvent(hooks, { type: "session.created", properties: { info: { id: "s1" } } })
    flush()

    await fireChatMessage(hooks, "s1", "hello")

    assert.deepStrictEqual(hookedNames(), ["session-start", "user-prompt-submit"])
  })

  it("user message with whitespace-only parts does NOT fire session-start", async () => {
    const hooks = await mkHooks()

    await fireEvent(hooks, { type: "session.created", properties: { info: { id: "s2" } } })
    flush()

    await fireChatMessage(hooks, "s2", "  ")

    assert.deepStrictEqual(hookedNames(), [], "whitespace parts = no start")
  })

  it("user message with missing parts does NOT fire session-start", async () => {
    const hooks = await mkHooks()

    await fireEvent(hooks, { type: "session.created", properties: { info: { id: "s3" } } })
    flush()

    await fireChatMessage(hooks, "s3", "")

    assert.deepStrictEqual(hookedNames(), [], "no parts = no start")
  })

  it("session-start fires only once per session (second user msg skips it)", async () => {
    const hooks = await mkHooks()

    await fireEvent(hooks, { type: "session.created", properties: { info: { id: "s4" } } })
    await fireChatMessage(hooks, "s4", "first")
    flush()

    await fireChatMessage(hooks, "s4", "second", "m2")

    assert.deepStrictEqual(hookedNames(), ["user-prompt-submit"], "no second session-start")
  })
})

// ── V99: experimental.text.complete → stop ──────────────────────────────────

async function fireTextComplete(
  hooks: Awaited<ReturnType<typeof cavemem>>,
  sessionID: string,
  text: string
) {
  const handler = hooks["experimental.text.complete"] as
    | ((input: { sessionID: string; messageID: string; partID: string }, output: { text: string }) => Promise<void>)
    | undefined
  if (!handler) throw new Error("experimental.text.complete not registered")
  return handler({ sessionID, messageID: "m-tc", partID: "p1" }, { text })
}

describe("V99 — experimental.text.complete fires stop with final text", () => {
  it("experimental.text.complete → stop called with turn_summary", async () => {
    const hooks = await mkHooks()

    await fireEvent(hooks, { type: "session.created", properties: { info: { id: "tc-s1" } } })
    await fireChatMessage(hooks, "tc-s1", "go")
    flush()

    await fireTextComplete(hooks, "tc-s1", "Hello world")

    assert.deepStrictEqual(hookedNames(), ["stop"], "stop fired once")
    const stopCall = spawnCalls.find(c => c.name === "stop")
    assert.ok(stopCall, "stop recorded")
    assert.strictEqual((stopCall!.data as { turn_summary?: string }).turn_summary, "Hello world")
  })

  it("experimental.text.complete before session-start → no stop", async () => {
    const hooks = await mkHooks()

    await fireEvent(hooks, { type: "session.created", properties: { info: { id: "tc-s2" } } })
    flush()

    await fireTextComplete(hooks, "tc-s2", "ignored text")

    assert.deepStrictEqual(hookedNames(), [], "no stop before session-start")
  })

  it("experimental.text.complete with empty text → no stop", async () => {
    const hooks = await mkHooks()

    await fireEvent(hooks, { type: "session.created", properties: { info: { id: "tc-s3" } } })
    await fireChatMessage(hooks, "tc-s3", "go")
    flush()

    await fireTextComplete(hooks, "tc-s3", "   ")

    assert.deepStrictEqual(hookedNames(), [], "whitespace-only text → no stop")
  })
})

// ── V9: session-end guard and flush ──────────────────────────────────────────

describe("V9 — session-end only if started; flush before end", () => {
  it("session.idle without session-start → no session-end", async () => {
    const hooks = await mkHooks()

    await fireEvent(hooks, { type: "session.created", properties: { info: { id: "s1" } } })
    // No user message → session-start never called
    flush()

    await fireEvent(hooks, { type: "session.idle", properties: { sessionID: "s1" } })

    assert.deepStrictEqual(hookedNames(), [], "no session-end without session-start")
  })

  it("session.deleted without session-start → no session-end", async () => {
    const hooks = await mkHooks()

    await fireEvent(hooks, { type: "session.created", properties: { info: { id: "s2" } } })
    flush()

    await fireEvent(hooks, { type: "session.deleted", properties: { info: { id: "s2" } } })

    assert.deepStrictEqual(hookedNames(), [], "no session-end on deleted without start")
  })

  it("session.idle after session-start → session-end fires", async () => {
    const hooks = await mkHooks()

    await fireEvent(hooks, { type: "session.created", properties: { info: { id: "s3" } } })
    await fireChatMessage(hooks, "s3", "hi")
    flush()

    await fireEvent(hooks, { type: "session.idle", properties: { sessionID: "s3" } })

    assert.ok(hookedNames().includes("session-end"), "session-end fires after started session")
  })

  it("experimental.text.complete fires stop; session.idle fires session-end after", async () => {
    const hooks = await mkHooks()

    await fireEvent(hooks, { type: "session.created", properties: { info: { id: "s4" } } })
    await fireChatMessage(hooks, "s4", "hi")
    await fireTextComplete(hooks, "s4", "Response text")
    flush()

    await fireEvent(hooks, { type: "session.idle", properties: { sessionID: "s4" } })

    const names = hookedNames()
    assert.ok(names.includes("session-end"), "session-end fires")
    // stop fired before flush() call — not in this window, but it did fire
  })

  it("session.deleted fires session-end (stop via experimental.text.complete fires separately)", async () => {
    const hooks = await mkHooks()

    await fireEvent(hooks, { type: "session.created", properties: { info: { id: "s5" } } })
    await fireChatMessage(hooks, "s5", "go")
    await fireTextComplete(hooks, "s5", "In progress")
    flush()

    await fireEvent(hooks, { type: "session.deleted", properties: { info: { id: "s5" } } })

    const names = hookedNames()
    assert.ok(names.includes("session-end"), "session-end on deleted")
  })

  it("session cleanup prevents double session-end on repeated idle", async () => {
    const hooks = await mkHooks()

    await fireEvent(hooks, { type: "session.created", properties: { info: { id: "s6" } } })
    await fireChatMessage(hooks, "s6", "hey")
    await fireEvent(hooks, { type: "session.idle", properties: { sessionID: "s6" } })
    flush()

    // Second idle for same session → already cleaned up → no session-end
    await fireEvent(hooks, { type: "session.idle", properties: { sessionID: "s6" } })

    assert.deepStrictEqual(hookedNames(), [], "no double session-end")
  })
})

// ── V48: batch observations, flush on idle ────────────────────────────────────

describe("V48 — post-tool-use batched; no spawn per call; flush on idle", () => {
  it("multiple tool calls accumulate; single session.idle flushes all in order", async () => {
    const hooks = await mkHooks()

    await fireEvent(hooks, { type: "session.created", properties: { info: { id: "v48-s1" } } })
    await fireChatMessage(hooks, "v48-s1", "go", "v48-m1")
    flush()

    await hooks["tool.execute.after"]!(
      { tool: "read", sessionID: "v48-s1", callID: "c1", args: { filePath: "a.ts" } } as never,
      { title: "read", output: "content-a", metadata: null } as never
    )
    await hooks["tool.execute.after"]!(
      { tool: "write", sessionID: "v48-s1", callID: "c2", args: { filePath: "b.ts" } } as never,
      { title: "write", output: "ok", metadata: null } as never
    )

    // Nothing fired yet
    assert.deepStrictEqual(hookedNames(), [], "no spawns during tool calls")

    await fireEvent(hooks, { type: "session.idle", properties: { sessionID: "v48-s1" } })

    const names = hookedNames()
    assert.strictEqual(names.filter(n => n === "post-tool-use").length, 2, "both observations flushed")
    assert.ok(names.indexOf("post-tool-use") < names.indexOf("session-end"), "observations before session-end")
  })

  it("observations from different sessions don't mix on flush", async () => {
    const hooks = await mkHooks()

    for (const sid of ["v48-sa", "v48-sb"]) {
      await fireEvent(hooks, { type: "session.created", properties: { info: { id: sid } } })
      await fireChatMessage(hooks, sid, "hi", `m-${sid}`)
    }
    flush()

    await hooks["tool.execute.after"]!(
      { tool: "read", sessionID: "v48-sa", callID: "ca", args: {} } as never,
      { title: "read", output: "a", metadata: null } as never
    )
    await hooks["tool.execute.after"]!(
      { tool: "read", sessionID: "v48-sb", callID: "cb", args: {} } as never,
      { title: "read", output: "b", metadata: null } as never
    )

    // Flush only sa
    await fireEvent(hooks, { type: "session.idle", properties: { sessionID: "v48-sa" } })
    const namesAfterA = hookedNames()
    // post-tool-use for sa fired; sb not yet
    assert.ok(namesAfterA.includes("post-tool-use"), "sa observation flushed")
    assert.ok(namesAfterA.includes("session-end"), "sa session ended")
    flush()

    // sb still has pending obs — flush now
    await fireEvent(hooks, { type: "session.idle", properties: { sessionID: "v48-sb" } })
    assert.ok(hookedNames().includes("post-tool-use"), "sb observation flushed on its own idle")
  })
})

// ── V98: session.error flushes pendingObs + session-end ──────────────────────

describe("V98 — session.error flushes like session.idle", () => {
  it("session.error flushes buffered observations and fires session-end", async () => {
    const hooks = await mkHooks()

    await fireEvent(hooks, { type: "session.created", properties: { info: { id: "err-s1" } } })
    await fireChatMessage(hooks, "err-s1", "go", "err-m1")
    flush()

    await hooks["tool.execute.after"]!(
      { tool: "read", sessionID: "err-s1", callID: "ec1", args: {} } as never,
      { title: "read", output: "content", metadata: null } as never
    )

    await fireEvent(hooks, { type: "session.error", properties: { sessionID: "err-s1", error: { type: "UnknownError", message: "oops" } } })

    const names = hookedNames()
    assert.ok(names.includes("post-tool-use"), "pendingObs flushed on session.error")
    assert.ok(names.includes("session-end"), "session-end fires on session.error")
    assert.ok(names.indexOf("post-tool-use") < names.indexOf("session-end"), "obs before end")
  })

  it("session.error without session-start → no session-end", async () => {
    const hooks = await mkHooks()

    await fireEvent(hooks, { type: "session.created", properties: { info: { id: "err-s2" } } })
    flush()

    await fireEvent(hooks, { type: "session.error", properties: { sessionID: "err-s2" } })

    assert.deepStrictEqual(hookedNames(), [], "no session-end without session-start")
  })

  it("session.error with missing sessionID → no-op", async () => {
    const hooks = await mkHooks()
    flush()

    await fireEvent(hooks, { type: "session.error", properties: {} })

    assert.deepStrictEqual(hookedNames(), [], "missing sessionID → no-op")
  })
})

// ── V38: runHook is async, ensureCavemem uses spawnSync ──────────────────────

describe("V38 — async runHook, spawnSync ensureCavemem", () => {
  it("runHook resolves after child close → caller can await ordering", async () => {
    const hooks = await mkHooks()
    flush()

    // After session-start, fire a user message — this calls runHook twice sequentially
    await fireEvent(hooks, { type: "session.created", properties: { info: { id: "v38-s1" } } })
    await fireChatMessage(hooks, "v38-s1", "ping", "v38-m1")

    // Both hooks must be recorded in order: session-start, user-prompt-submit
    assert.deepStrictEqual(hookedNames(), ["session-start", "user-prompt-submit"])
  })

  it("spawnSync mock returns status:0 → ensureCavemem returns true", async () => {
    // cavememChecked is cached per module — already set. Verify behavior is correct
    // by checking that subsequent hooks are allowed to fire (not blocked by ensureCavemem)
    const hooks = await mkHooks()
    flush()

    await fireEvent(hooks, { type: "session.created", properties: { info: { id: "v38-s2" } } })
    await fireChatMessage(hooks, "v38-s2", "ok", "v38-m2")

    assert.ok(hookedNames().length > 0, "hooks fire when cavemem available")
  })
})

// ── V39: signal/exit handler flushes started sessions ────────────────────────

describe("V39 — exit/signal handler fires session-end for all started sessions", () => {
  it("'exit' event flushes all started sessions synchronously via execSync", async () => {
    execSyncCalls.length = 0
    const hooks = await mkHooks()

    await fireEvent(hooks, { type: "session.created", properties: { info: { id: "exit-s1" } } })
    await fireChatMessage(hooks, "exit-s1", "hello", "exit-m1")

    // Invoke the exit listener registered by this cavemem instance
    const exitListeners = process.listeners("exit") as (() => void)[]
    exitListeners[exitListeners.length - 1]!()

    assert.ok(
      execSyncCalls.some(c => c.name === "session-end" && c.data["session_id"] === "exit-s1"),
      "session-end fired for started session on exit"
    )
  })

  it("exit handler does NOT fire session-end for non-started sessions (phantom guard V7)", async () => {
    execSyncCalls.length = 0
    const hooks = await mkHooks()

    await fireEvent(hooks, { type: "session.created", properties: { info: { id: "exit-s2" } } })
    // No user message → session-start never called

    const exitListeners = process.listeners("exit") as (() => void)[]
    exitListeners[exitListeners.length - 1]!()

    assert.deepStrictEqual(
      execSyncCalls.filter(c => c.name === "session-end"),
      [],
      "no session-end for non-started session"
    )
  })

  it("exit handler does NOT double-fire session-end after normal session.idle", async () => {
    execSyncCalls.length = 0
    const hooks = await mkHooks()

    await fireEvent(hooks, { type: "session.created", properties: { info: { id: "exit-s3" } } })
    await fireChatMessage(hooks, "exit-s3", "hey", "exit-m3")
    // Normal end via session.idle
    await fireEvent(hooks, { type: "session.idle", properties: { sessionID: "exit-s3" } })
    execSyncCalls.length = 0

    // Exit should find startedSessions empty for this sid
    const exitListeners = process.listeners("exit") as (() => void)[]
    exitListeners[exitListeners.length - 1]!()

    assert.deepStrictEqual(
      execSyncCalls.filter(c => c.name === "session-end"),
      [],
      "no double session-end after normal end"
    )
  })

  it("SIGTERM handler flushes started sessions then re-raises via process.kill", async () => {
    execSyncCalls.length = 0
    const hooks = await mkHooks()

    await fireEvent(hooks, { type: "session.created", properties: { info: { id: "sig-s1" } } })
    await fireChatMessage(hooks, "sig-s1", "hi", "sig-m1")

    const killCalls: Array<[number, string]> = []
    const killMock = mock.method(process, "kill", (pid: number, sig: string) => { killCalls.push([pid, sig]); return true })
    try {
      const handlers = process.listeners("SIGTERM") as (() => void)[]
      handlers[handlers.length - 1]!()

      assert.ok(
        execSyncCalls.some(c => c.name === "session-end" && c.data["session_id"] === "sig-s1"),
        "SIGTERM flushes session-end"
      )
      assert.ok(
        killCalls.some(([pid, sig]) => pid === process.pid && sig === "SIGTERM"),
        "SIGTERM re-raised via process.kill"
      )
    } finally {
      killMock.mock.restore()
    }
  })

  it("SIGINT handler flushes started sessions then re-raises via process.kill", async () => {
    execSyncCalls.length = 0
    const hooks = await mkHooks()

    await fireEvent(hooks, { type: "session.created", properties: { info: { id: "sig-s2" } } })
    await fireChatMessage(hooks, "sig-s2", "yo", "sig-m2")

    const killCalls: Array<[number, string]> = []
    const killMock = mock.method(process, "kill", (pid: number, sig: string) => { killCalls.push([pid, sig]); return true })
    try {
      const handlers = process.listeners("SIGINT") as (() => void)[]
      handlers[handlers.length - 1]!()

      assert.ok(
        execSyncCalls.some(c => c.name === "session-end" && c.data["session_id"] === "sig-s2"),
        "SIGINT flushes session-end"
      )
      assert.ok(
        killCalls.some(([pid, sig]) => pid === process.pid && sig === "SIGINT"),
        "SIGINT re-raised via process.kill"
      )
    } finally {
      killMock.mock.restore()
    }
  })

  it("dispose removes all process signal/exit handlers", async () => {
    const before = {
      exit: process.listenerCount("exit"),
      SIGTERM: process.listenerCount("SIGTERM"),
      SIGINT: process.listenerCount("SIGINT"),
    }
    const hooks = await mkHooks()

    assert.strictEqual(process.listenerCount("exit"), before.exit + 1, "exit handler registered")
    assert.strictEqual(process.listenerCount("SIGTERM"), before.SIGTERM + 1, "SIGTERM handler registered")
    assert.strictEqual(process.listenerCount("SIGINT"), before.SIGINT + 1, "SIGINT handler registered")

    await hooks.dispose!()

    assert.strictEqual(process.listenerCount("exit"), before.exit, "exit handler removed after dispose")
    assert.strictEqual(process.listenerCount("SIGTERM"), before.SIGTERM, "SIGTERM handler removed after dispose")
    assert.strictEqual(process.listenerCount("SIGINT"), before.SIGINT, "SIGINT handler removed after dispose")
  })
})
