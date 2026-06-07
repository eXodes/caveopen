import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { composeHooks } from "../compose.js"

// Minimal stand-in for Partial<Hooks> — just enough shape for tests
type H = Record<string, unknown>

describe("composeHooks — V1", () => {
  it("new key from b is added", () => {
    const b_fn = async () => {}
    const result = composeHooks({} as H, { event: b_fn } as H) as H
    assert.strictEqual(result.event, b_fn)
  })

  it("chain: a fires before b", async () => {
    const order: string[] = []
    const a = { event: async () => { order.push("a") } }
    const b = { event: async () => { order.push("b") } }
    const merged = composeHooks(a as H, b as H) as H
    await (merged.event as () => Promise<void>)()
    assert.deepStrictEqual(order, ["a", "b"])
  })

  it("chain: mutations to shared output accumulate", async () => {
    type Out = { system: string[] }
    const output: Out = { system: [] }
    const a = { "experimental.chat.system.transform": async (_i: unknown, o: Out) => { o.system.push("from-a") } }
    const b = { "experimental.chat.system.transform": async (_i: unknown, o: Out) => { o.system.push("from-b") } }
    const merged = composeHooks(a as H, b as H) as H
    const fn = merged["experimental.chat.system.transform"] as (_i: unknown, o: Out) => Promise<void>
    await fn(null, output)
    assert.deepStrictEqual(output.system, ["from-a", "from-b"])
  })

  it("tool: sub-maps merged", () => {
    const merged = composeHooks({ tool: { t_a: {} } } as H, { tool: { t_b: {} } } as H) as H
    const tools = merged.tool as H
    assert.ok("t_a" in tools)
    assert.ok("t_b" in tools)
  })

  it("tool: b's entry overwrites a's on same name", () => {
    const v2 = { description: "v2" }
    const merged = composeHooks(
      { tool: { t: { description: "v1" } } } as H,
      { tool: { t: v2 } } as H,
    ) as H
    assert.strictEqual((merged.tool as H).t, v2)
  })

  it("auth: last-write-wins (b replaces a)", () => {
    const b_auth = async () => {}
    const merged = composeHooks({ auth: async () => {} } as H, { auth: b_auth } as H) as H
    assert.strictEqual(merged.auth, b_auth)
  })

  it("provider: last-write-wins", () => {
    const b_p = {}
    const merged = composeHooks({ provider: {} } as H, { provider: b_p } as H) as H
    assert.strictEqual(merged.provider, b_p)
  })

  // V97: config is (config)=>void mutator — both a+b must apply to same arg
  it("config: both mutators apply to same arg", async () => {
    type Cfg = { x?: number; y?: number }
    const a = { config: async (c: Cfg) => { c.x = 1 } }
    const b = { config: async (c: Cfg) => { c.y = 2 } }
    const merged = composeHooks(a as H, b as H) as H
    const cfg: Cfg = {}
    await (merged.config as (c: Cfg) => Promise<void>)(cfg)
    assert.strictEqual(cfg.x, 1, "a mutation must apply")
    assert.strictEqual(cfg.y, 2, "b mutation must apply")
  })

  it("keys only in a are preserved", () => {
    const fn = async () => {}
    const merged = composeHooks({ event: fn } as H, {} as H) as H
    assert.strictEqual(merged.event, fn)
  })

  // V44: fault isolation
  it("a throws — b still runs", async () => {
    const ran: string[] = []
    const a = { event: async () => { throw new Error("a-boom") } }
    const b = { event: async () => { ran.push("b") } }
    const merged = composeHooks(a as H, b as H) as H
    await (merged.event as () => Promise<void>)()
    assert.deepStrictEqual(ran, ["b"])
  })

  it("b throws — a already ran, no rethrow", async () => {
    const ran: string[] = []
    const a = { event: async () => { ran.push("a") } }
    const b = { event: async () => { throw new Error("b-boom") } }
    const merged = composeHooks(a as H, b as H) as H
    await assert.doesNotReject((merged.event as () => Promise<void>)())
    assert.deepStrictEqual(ran, ["a"])
  })

  // V96: blocking hooks — throw propagates, b skipped, op blocked
  it("tool.execute.before: a throws — propagates (not swallowed)", async () => {
    const ran: string[] = []
    const err = new Error("block-op")
    const a = { "tool.execute.before": async () => { throw err } }
    const b = { "tool.execute.before": async () => { ran.push("b") } }
    const merged = composeHooks(a as H, b as H) as H
    const fn = merged["tool.execute.before"] as () => Promise<void>
    await assert.rejects(fn, err)
    assert.deepStrictEqual(ran, [], "b must not run after a throws")
  })

  it("permission.ask: a throws — propagates (not swallowed)", async () => {
    const err = new Error("deny")
    const a = { "permission.ask": async () => { throw err } }
    const b = { "permission.ask": async () => {} }
    const merged = composeHooks(a as H, b as H) as H
    const fn = merged["permission.ask"] as () => Promise<void>
    await assert.rejects(fn, err)
  })

  it("tool.execute.before: a ok — b still runs", async () => {
    const ran: string[] = []
    const a = { "tool.execute.before": async () => { ran.push("a") } }
    const b = { "tool.execute.before": async () => { ran.push("b") } }
    const merged = composeHooks(a as H, b as H) as H
    await (merged["tool.execute.before"] as () => Promise<void>)()
    assert.deepStrictEqual(ran, ["a", "b"])
  })

  // V56: caveman(a)+cavemem(b) system.transform pushes must be const+ordered.
  // Simulates the exact compose pattern from caveopen.ts:
  //   caveman pushes static SKILL.md string (const, read once at init)
  //   cavemem pushes hardcoded note string (const literal)
  // Both must appear in a→b order; same bytes ∀ call.
  it("V56: static system pushes const+ordered across multiple calls", async () => {
    const CAVEMAN_PUSH = "CAVEMAN SKILL.MD RULES (static, read once at init)"
    const CAVEMEM_PUSH = "You have cavemem memory tools available (search, timeline, get_observations)."
    type Out = { system: string[] }
    const caveman_hooks = {
      "experimental.chat.system.transform": async (_i: unknown, o: Out) => {
        o.system.push(CAVEMAN_PUSH) // static: same const string ∀ call
      },
    }
    const cavemem_hooks = {
      "experimental.chat.system.transform": async (_i: unknown, o: Out) => {
        o.system.push(CAVEMEM_PUSH) // static: hardcoded literal ∀ call
      },
    }
    const merged = composeHooks(caveman_hooks as H, cavemem_hooks as H) as H
    const fn = merged["experimental.chat.system.transform"] as (_i: unknown, o: Out) => Promise<void>

    // Call twice — verify same bytes, same order both times (cache prefix stable)
    for (let i = 0; i < 2; i++) {
      const output: Out = { system: [] }
      await fn(null, output)
      assert.deepStrictEqual(output.system, [CAVEMAN_PUSH, CAVEMEM_PUSH],
        `call ${i + 1}: expected caveman(a) before cavemem(b), const strings`)
    }
  })
})
