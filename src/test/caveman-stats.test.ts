import { describe, it, mock } from "node:test"
import assert from "node:assert/strict"

// ── Mock node:fs before importing caveman ─────────────────────────────────────
const appendCalls: string[] = []
const writeCalls: Array<{ path: string; data: string }> = []
const fsFiles = new Map<string, string>()

mock.module("node:fs", {
  namedExports: {
    existsSync: (_p: string): boolean => false,
    readFileSync: (path: string, _enc?: string): string => {
      const content = fsFiles.get(path)
      if (content === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
      return content
    },
    writeFileSync: (path: string, data: string): void => {
      writeCalls.push({ path, data })
      fsFiles.set(path, data)
    },
    copyFileSync: (_src: string, _dst: string): void => { /* noop */ },
  },
})

// V47: caveman.ts now uses node:fs/promises for async appendFile + cached mkdir
mock.module("node:fs/promises", {
  namedExports: {
    appendFile: async (path: string, data: string): Promise<void> => {
      appendCalls.push(data)
      fsFiles.set(path, (fsFiles.get(path) ?? "") + data)
    },
    mkdir: async (_path: string, _opts?: unknown): Promise<void> => { /* noop */ },
  },
})

const { caveman } = await import("../caveman.js")

// ── Helpers ───────────────────────────────────────────────────────────────────

function flushAppend() { appendCalls.length = 0 }
function flushWrite() { writeCalls.length = 0 }

type PromptCall = { path: { id: string }; body: { noReply?: boolean; parts: unknown[] } }
function makeMockClient() {
  const calls: PromptCall[] = []
  return {
    calls,
    session: {
      prompt: async (opts: PromptCall) => { calls.push(opts) },
    },
  }
}

async function mkHooks(client = makeMockClient()) {
  return {
    hooks: await caveman({ client } as unknown as Parameters<typeof caveman>[0]),
    client,
  }
}

type CmdInput = { command: string; sessionID: string; arguments: string }
async function fireCmd(
  hooks: Awaited<ReturnType<typeof caveman>>,
  input: CmdInput
) {
  const handler = hooks["command.execute.before"] as ((i: CmdInput, o: object) => Promise<void>) | undefined
  if (!handler) throw new Error("command.execute.before not registered")
  await handler(input, { parts: [] })
}

// ── V92: experimental.text.complete history write ────────────────────────────

type TextCompleteInput = { sessionID: string; messageID: string; partID: string }
type TextCompleteOutput = { text: string }
async function fireTextComplete(
  hooks: Awaited<ReturnType<typeof caveman>>,
  hookInput: TextCompleteInput,
  hookOutput: TextCompleteOutput
) {
  const handler = hooks["experimental.text.complete"] as
    | ((i: TextCompleteInput, o: TextCompleteOutput) => Promise<void>)
    | undefined
  if (!handler) throw new Error("experimental.text.complete not registered")
  await handler(hookInput, hookOutput)
}

describe("V92 — experimental.text.complete history write", () => {
  it("handler registered", async () => {
    const { hooks } = await mkHooks()
    assert.ok(
      typeof hooks["experimental.text.complete"] === "function",
      "experimental.text.complete must be registered"
    )
  })

  it("writes history row with token estimate from text.length / 4", async () => {
    const { hooks } = await mkHooks()
    flushAppend()

    // 400-char text → ceil(400/4)=100 tokens
    const text = "a".repeat(400)
    await fireTextComplete(hooks, { sessionID: "s1", messageID: "m1", partID: "p1" }, { text })

    assert.strictEqual(appendCalls.length, 1, "must write 1 history row")
    const row = JSON.parse(appendCalls[0]) as { output_tokens: number; session_id: string }
    assert.strictEqual(row.output_tokens, 100)
    assert.strictEqual(row.session_id, "s1")
  })

  it("message.updated no longer writes history (V92 replaced it)", async () => {
    const { hooks } = await mkHooks()
    flushAppend()

    const eventHook = hooks["event"] as (i: { event: unknown }) => Promise<void>
    await eventHook({
      event: {
        type: "message.updated",
        properties: {
          info: {
            role: "assistant",
            time: { completed: Date.now() },
            tokens: { output: 42 },
            sessionID: "s1",
          },
        },
      },
    })

    assert.strictEqual(appendCalls.length, 0, "message.updated must no longer write history")
  })
})

// ── V28: /caveman-stats command handler ───────────────────────────────────────

describe("V28 — /caveman-stats command handler", () => {
  it("handler registered as command.execute.before", async () => {
    const { hooks } = await mkHooks()
    assert.ok(
      typeof hooks["command.execute.before"] === "function",
      "command.execute.before must be registered"
    )
  })

  it("no-history path injects 'no history found' message with noReply:true", async () => {
    const client = makeMockClient()
    // ensure no history file exists for this test
    fsFiles.clear()
    const { hooks } = await mkHooks(client)

    await fireCmd(hooks, { command: "caveman-stats", sessionID: "ses1", arguments: "" })

    assert.strictEqual(client.calls.length, 1)
    const call = client.calls[0]
    assert.strictEqual(call.path.id, "ses1")
    assert.strictEqual(call.body.noReply, true)
    const text = (call.body.parts[0] as { text: string }).text
    assert.ok(text.includes("no history found"), `expected 'no history found' in: ${text}`)
  })

  it("aggregates last-entry-per-session and injects stats with noReply:true", async () => {
    const client = makeMockClient()
    fsFiles.clear()

    // Build a fake history with 2 sessions, 2 rows each (last row wins)
    const rows = [
      { ts: 100, session_id: "sA", mode: "full", output_tokens: 10, est_saved_tokens: 5 },
      { ts: 200, session_id: "sA", mode: "full", output_tokens: 20, est_saved_tokens: 10 },
      { ts: 100, session_id: "sB", mode: "lite", output_tokens: 30, est_saved_tokens: 15 },
      { ts: 200, session_id: "sB", mode: "lite", output_tokens: 40, est_saved_tokens: 20 },
    ]

    // Write rows into the mock fs — historyPath() resolves to ~/.caveman/.caveman-history.jsonl
    // Seed the exact path that historyPath() produces so readFileSync mock returns it.
    // historyPath() = join(homedir(), ".caveman", ".caveman-history.jsonl")
    const { homedir } = await import("node:os")
    const { join } = await import("node:path")
    const hPath = join(homedir(), ".caveman", ".caveman-history.jsonl")
    fsFiles.set(hPath, rows.map(r => JSON.stringify(r)).join("\n") + "\n")

    const { hooks } = await mkHooks(client)
    await fireCmd(hooks, { command: "caveman-stats", sessionID: "ses2", arguments: "" })

    assert.strictEqual(client.calls.length, 1)
    const call = client.calls[0]
    assert.strictEqual(call.body.noReply, true)
    assert.strictEqual(call.path.id, "ses2")

    const text = (call.body.parts[0] as { text: string }).text
    // 2 sessions, last rows: sA=20 tokens+10 saved, sB=40 tokens+20 saved → total 60+30
    assert.ok(text.includes("2 session"), `expected '2 session' in:\n${text}`)
    assert.ok(text.includes("60"), `expected totalOutput=60 in:\n${text}`)
    assert.ok(text.includes("30"), `expected totalSaved=30 in:\n${text}`)
  })

  it("non-caveman-stats commands are ignored", async () => {
    const client = makeMockClient()
    const { hooks } = await mkHooks(client)

    await fireCmd(hooks, { command: "ck:init", sessionID: "ses3", arguments: "" })

    assert.strictEqual(client.calls.length, 0, "non-stats command must not call session.prompt")
  })
})

// ── V46: history cap — truncate to last HISTORY_MAX_ROWS on write ─────────────

describe("V46 — history file capped at 10000 rows", () => {
  it("writing row when file has >10000 rows truncates to last 10000", async () => {
    const { homedir } = await import("node:os")
    const { join } = await import("node:path")
    const hPath = join(homedir(), ".caveman", ".caveman-history.jsonl")

    // Seed file with 10001 rows
    const rows = Array.from({ length: 10001 }, (_, i) =>
      JSON.stringify({ ts: i, session_id: `s${i}`, mode: null, output_tokens: 1, est_saved_tokens: 0 })
    )
    fsFiles.set(hPath, rows.join("\n") + "\n")
    flushWrite()

    const { hooks } = await mkHooks()

    // Fire experimental.text.complete to trigger a write + capHistory
    await fireTextComplete(
      hooks,
      { sessionID: "sNew", messageID: "m1", partID: "p1" },
      { text: "a".repeat(40) }
    )

    // capHistory should have called writeFileSync to trim
    assert.ok(writeCalls.length >= 1, "writeFileSync must be called to cap the file")
    const written = writeCalls[writeCalls.length - 1].data
    const writtenLines = written.split("\n").filter(Boolean)
    assert.strictEqual(writtenLines.length, 10000, `expected 10000 rows after cap, got ${writtenLines.length}`)
  })

  it("writing row when file has ≤10000 rows does NOT call writeFileSync", async () => {
    const { homedir } = await import("node:os")
    const { join } = await import("node:path")
    const hPath = join(homedir(), ".caveman", ".caveman-history.jsonl")

    // Seed file with exactly 500 rows
    const rows = Array.from({ length: 500 }, (_, i) =>
      JSON.stringify({ ts: i, session_id: `s${i}`, mode: null, output_tokens: 1, est_saved_tokens: 0 })
    )
    fsFiles.set(hPath, rows.join("\n") + "\n")
    flushWrite()

    const { hooks } = await mkHooks()

    await fireTextComplete(
      hooks,
      { sessionID: "sSmall", messageID: "m1", partID: "p1" },
      { text: "a".repeat(20) }
    )

    assert.strictEqual(writeCalls.length, 0, "no writeFileSync when under cap")
  })
})
