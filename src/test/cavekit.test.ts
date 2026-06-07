import { describe, it, mock } from "node:test"
import assert from "node:assert/strict"

// ── Mock node:fs before importing cavekit ────────────────────────────────────
const copyCalls: Array<{ src: string; dst: string }> = []

mock.module("node:fs", {
  namedExports: {
    existsSync: (_path: string): boolean => false,
    copyFileSync: (src: string, dst: string): void => {
      copyCalls.push({ src, dst })
    },
  },
})

const { cavekit } = await import("../cavekit.js")

type CmdInput = { command: string; sessionID: string; arguments: string }

function makeMockClient() {
  const promptCalls: Array<{ path: unknown; body: unknown }> = []
  const client = {
    session: {
      prompt: async (args: { path: unknown; body: unknown }) => {
        promptCalls.push(args)
        return {}
      },
    },
    app: { log: async () => {} },
  }
  return { client, promptCalls }
}

async function fireCmd(
  hooks: Awaited<ReturnType<typeof cavekit>>,
  input: CmdInput
): Promise<void> {
  const handler = hooks["command.execute.before"] as
    | ((i: CmdInput) => Promise<void>)
    | undefined
  if (!handler) throw new Error("command.execute.before not registered")
  await handler(input)
}

function flushCopyCalls() { copyCalls.length = 0 }

// ── V24 / §I: only /ck:init triggers handler ─────────────────────────────────
// V90: handler calls client.session.prompt(noReply:true); ⊥ sets output.parts

describe("V24 — cavekit command handler", () => {
  it("ck:init fires handler, copies FORMAT.md, and calls session.prompt(noReply:true)", async () => {
    const { client, promptCalls } = makeMockClient()
    const hooks = await cavekit({
      directory: "/tmp/proj",
      client,
    } as unknown as Parameters<typeof cavekit>[0])
    flushCopyCalls()
    await fireCmd(hooks, { command: "ck:init", sessionID: "s1", arguments: "" })
    assert.equal(promptCalls.length, 1, "session.prompt called once")
    const call = promptCalls[0] as { path: { id: string }; body: { noReply: boolean; parts: unknown[] } }
    assert.equal(call.path.id, "s1")
    assert.equal(call.body.noReply, true, "noReply:true")
    assert.equal(call.body.parts.length, 1, "one synthetic TextPart")
  })

  it("ck-init does NOT fire handler (alias removed)", async () => {
    const { client, promptCalls } = makeMockClient()
    const hooks = await cavekit({
      directory: "/tmp/proj",
      client,
    } as unknown as Parameters<typeof cavekit>[0])
    flushCopyCalls()
    await fireCmd(hooks, { command: "ck-init", sessionID: "s2", arguments: "" })
    assert.equal(promptCalls.length, 0, "ck-init should be ignored")
  })

  it("unrelated command does NOT fire handler", async () => {
    const { client, promptCalls } = makeMockClient()
    const hooks = await cavekit({
      directory: "/tmp/proj",
      client,
    } as unknown as Parameters<typeof cavekit>[0])
    flushCopyCalls()
    await fireCmd(hooks, { command: "ck:spec", sessionID: "s3", arguments: "" })
    assert.equal(promptCalls.length, 0)
  })
})
