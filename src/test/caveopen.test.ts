import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { parseModes, CaveopenPlugin } from "../caveopen.js"

// ─── Integration — V83/V90 ───────────────────────────────────────────────────
// V90: ck_init tool removed from cavekit.ts; /ck:init uses command.execute.before
// + client.session.prompt(noReply:true) instead. Verify ck_init ⊥ result.tool.

describe("V83 — CaveopenPlugin integration", () => {
  it("ck_init ⊥ result.tool (all modes) — V90", async () => {
    const mockClient = {
      session: { prompt: async () => ({}) },
      app: { log: async () => {} },
    }
    const mockPluginInput = {
      directory: "/tmp",
      project: {},
      client: mockClient,
      $: null,
      worktree: null,
    } as unknown as Parameters<typeof CaveopenPlugin>[0]

    const result = await CaveopenPlugin(mockPluginInput)
    const toolKeys = Object.keys(result.tool ?? {})
    assert.ok(
      !toolKeys.includes("ck_init"),
      `Expected "ck_init" absent from result.tool, got: ${JSON.stringify(toolKeys)}`
    )
  })

  it("ck_init ⊥ result.tool (cavekit-only mode) — V90", async () => {
    const mockClient = {
      session: { prompt: async () => ({}) },
      app: { log: async () => {} },
    }
    const mockPluginInput = {
      directory: "/tmp",
      project: {},
      client: mockClient,
      $: null,
      worktree: null,
    } as unknown as Parameters<typeof CaveopenPlugin>[0]

    const result = await CaveopenPlugin(mockPluginInput, { modes: "cavekit" })
    const toolKeys = Object.keys(result.tool ?? {})
    assert.ok(
      !toolKeys.includes("ck_init"),
      `Expected "ck_init" absent from result.tool (cavekit-only), got: ${JSON.stringify(toolKeys)}`
    )
  })

  it("command.execute.before registered when cavekit active", async () => {
    const mockClient = {
      session: { prompt: async () => ({}) },
      app: { log: async () => {} },
    }
    const mockPluginInput = {
      directory: "/tmp",
      project: {},
      client: mockClient,
      $: null,
      worktree: null,
    } as unknown as Parameters<typeof CaveopenPlugin>[0]

    const result = await CaveopenPlugin(mockPluginInput, { modes: "cavekit" })
    assert.ok(
      typeof result["command.execute.before"] === "function",
      "command.execute.before should be registered when cavekit active"
    )
  })

  it("ck_init ⊥ result.tool when cavekit excluded", async () => {
    const mockClient = {
      session: { prompt: async () => ({}) },
      app: { log: async () => {} },
    }
    const mockPluginInput = {
      directory: "/tmp",
      project: {},
      client: mockClient,
      $: null,
      worktree: null,
    } as unknown as Parameters<typeof CaveopenPlugin>[0]

    const result = await CaveopenPlugin(mockPluginInput, { modes: "caveman" })
    const toolKeys = Object.keys(result.tool ?? {})
    assert.ok(
      !toolKeys.includes("ck_init"),
      `Expected "ck_init" absent when cavekit excluded, got: ${JSON.stringify(toolKeys)}`
    )
  })
})

// ─── parseModes — V2 ──────────────────────────────────────────────────────────

describe("parseModes — V2", () => {
  it("undefined → all 3 modules", () => {
    const m = parseModes(undefined)
    assert.ok(m.has("caveman"))
    assert.ok(m.has("cavekit"))
    assert.ok(m.has("cavemem"))
    assert.strictEqual(m.size, 3)
  })

  it("null → all 3 modules", () => {
    const m = parseModes(null)
    assert.strictEqual(m.size, 3)
  })

  it("empty string → all 3 modules", () => {
    const m = parseModes("")
    assert.strictEqual(m.size, 3)
  })

  it("whitespace-only string → all 3 modules", () => {
    const m = parseModes("   ")
    assert.strictEqual(m.size, 3)
  })

  it("single known module", () => {
    const m = parseModes("caveman")
    assert.ok(m.has("caveman"))
    assert.ok(!m.has("cavekit"))
    assert.ok(!m.has("cavemem"))
    assert.strictEqual(m.size, 1)
  })

  it("CSV of two known modules", () => {
    const m = parseModes("caveman,cavekit")
    assert.ok(m.has("caveman"))
    assert.ok(m.has("cavekit"))
    assert.ok(!m.has("cavemem"))
    assert.strictEqual(m.size, 2)
  })

  it("all 3 explicit → all 3 active", () => {
    const m = parseModes("caveman,cavekit,cavemem")
    assert.strictEqual(m.size, 3)
  })

  it("unknown val warns+skips, known vals included (V2)", () => {
    const warns: string[] = []
    const origWarn = console.warn
    console.warn = (...args: unknown[]) => { warns.push(String(args[0])) }
    try {
      const m = parseModes("caveman,badmod")
      assert.ok(m.has("caveman"))
      assert.ok(!m.has("badmod" as never))
      assert.strictEqual(m.size, 1)
      assert.ok(warns.some(w => w.includes("badmod")), "should warn about unknown module")
    } finally {
      console.warn = origWarn
    }
  })

  it("all-unknown vals warns+falls back to all 3 (V2 ⊥ throw)", () => {
    const warns: string[] = []
    const origWarn = console.warn
    console.warn = (...args: unknown[]) => { warns.push(String(args[0])) }
    try {
      const m = parseModes("badmod1,badmod2")
      assert.strictEqual(m.size, 3, "all-unknown falls back to all 3")
      assert.ok(warns.length >= 2, "should warn for each unknown")
    } finally {
      console.warn = origWarn
    }
  })

  it("non-string value → all 3 modules", () => {
    const m = parseModes(42)
    assert.strictEqual(m.size, 3)
  })

  it("CSV with spaces around commas", () => {
    const m = parseModes("caveman , cavekit")
    assert.ok(m.has("caveman"))
    assert.ok(m.has("cavekit"))
    assert.strictEqual(m.size, 2)
  })
})
