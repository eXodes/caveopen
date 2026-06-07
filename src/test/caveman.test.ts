import { describe, it, mock } from "node:test"
import assert from "node:assert/strict"
import type { TextPart, Part } from "@opencode-ai/sdk"

// ── Mock node:fs before importing caveman (V43: probe npm path first) ─────────
let existsSyncLastPath: string | null = null

mock.module("node:fs", {
  namedExports: {
    existsSync: (p: string): boolean => {
      existsSyncLastPath = p
      return false // simulate npm path absent → fallback path used
    },
    readFileSync: (_p: string, _enc: unknown): string => { throw new Error("ENOENT") },
    appendFileSync: (): void => {},
    writeFileSync: (): void => {},
    mkdirSync: (): void => {},
  },
})

const { parseModeChange, caveman } = await import("../caveman.js") as typeof import("../caveman.js")

// ─── parseModeChange ──────────────────────────────────────────────────────────

describe("parseModeChange — V2/V3", () => {
  // Slash command: activate
  it("/caveman defaults to full", () => {
    assert.deepStrictEqual(parseModeChange("/caveman"), { action: "activate", mode: "full" })
  })

  it("/caveman full", () => {
    assert.deepStrictEqual(parseModeChange("/caveman full"), { action: "activate", mode: "full" })
  })

  it("/caveman ultra", () => {
    assert.deepStrictEqual(parseModeChange("/caveman ultra"), { action: "activate", mode: "ultra" })
  })

  it("/caveman wenyan-lite", () => {
    assert.deepStrictEqual(parseModeChange("/caveman wenyan-lite"), { action: "activate", mode: "wenyan-lite" })
  })

  it("/caveman off → deactivate", () => {
    assert.deepStrictEqual(parseModeChange("/caveman off"), { action: "deactivate" })
  })

  // NL activate
  it("NL: 'activate caveman' → full", () => {
    assert.deepStrictEqual(parseModeChange("activate caveman"), { action: "activate", mode: "full" })
  })

  it("NL: 'enable caveman ultra'", () => {
    assert.deepStrictEqual(parseModeChange("enable caveman ultra"), { action: "activate", mode: "ultra" })
  })

  it("NL: 'use caveman full'", () => {
    assert.deepStrictEqual(parseModeChange("use caveman full"), { action: "activate", mode: "full" })
  })

  // NL deactivate
  it("NL: 'deactivate caveman' → deactivate", () => {
    assert.deepStrictEqual(parseModeChange("deactivate caveman"), { action: "deactivate" })
  })

  it("NL: 'disable caveman' → deactivate", () => {
    assert.deepStrictEqual(parseModeChange("disable caveman"), { action: "deactivate" })
  })

  it("NL: 'turn off caveman' → deactivate", () => {
    assert.deepStrictEqual(parseModeChange("turn off caveman"), { action: "deactivate" })
  })

  // No match
  it("unrelated text → null", () => {
    assert.strictEqual(parseModeChange("please help me write tests"), null)
  })

  it("empty string → null", () => {
    assert.strictEqual(parseModeChange(""), null)
  })

  // Case-insensitive
  it("/CAVEMAN FULL → full (case-insensitive)", () => {
    assert.deepStrictEqual(parseModeChange("/CAVEMAN FULL"), { action: "activate", mode: "full" })
  })
})

// ─── Mode management via chat.message + system push via system.transform — V57 ─

type MsgInput = { sessionID: string; messageID?: string }
type MsgOutput = { message: object; parts: Part[] }
type SysInput = { sessionID?: string; model: { id: string } }
type SysOutput = { system: string[] }
type EventInput = { event: { type: string; properties?: unknown } }

function makeOutput(sid = "s1", text = "/caveman"): MsgOutput {
  return { message: {}, parts: [{ id: "p1", sessionID: sid, messageID: "m1", type: "text", text } as TextPart] }
}

async function getHooks() {
  return await caveman({} as Parameters<typeof caveman>[0])
}

// Helper: invoke system transform and return system array
async function getSystem(
  sysTransform: (i: SysInput, o: SysOutput) => Promise<void>,
  sessionID?: string
): Promise<string[]> {
  const out: SysOutput = { system: [] }
  await sysTransform({ sessionID, model: makeModel("claude-sonnet-4-5") }, out)
  return out.system
}

describe("system push — V57/V3/V12", () => {
  it("no active mode → pushes rules only (no mode header)", async () => {
    const hooks = await getHooks()
    const sysTransform = hooks["experimental.chat.system.transform"] as (i: SysInput, o: SysOutput) => Promise<void>

    const system = await getSystem(sysTransform, "s1")
    assert.strictEqual(system.length, 1)
    assert.ok(!system[0].includes("CAVEMAN MODE ACTIVE"), "no mode header when mode null")
  })

  it("activating caveman → system push includes mode header (V57)", async () => {
    const hooks = await getHooks()
    const chatMsg = hooks["chat.message"] as (i: MsgInput, o: MsgOutput) => Promise<void>
    const sysTransform = hooks["experimental.chat.system.transform"] as (i: SysInput, o: SysOutput) => Promise<void>

    await chatMsg({ sessionID: "s1" }, makeOutput("s1", "/caveman"))

    const system = await getSystem(sysTransform, "s1")
    assert.strictEqual(system.length, 1)
    assert.ok(system[0].includes("CAVEMAN MODE ACTIVE (full)"), "system push contains mode header")
  })

  it("mode change → system push updates to new mode (V57/V3)", async () => {
    const hooks = await getHooks()
    const chatMsg = hooks["chat.message"] as (i: MsgInput, o: MsgOutput) => Promise<void>
    const sysTransform = hooks["experimental.chat.system.transform"] as (i: SysInput, o: SysOutput) => Promise<void>

    await chatMsg({ sessionID: "s1" }, makeOutput("s1", "/caveman"))
    await chatMsg({ sessionID: "s1" }, makeOutput("s1", "/caveman ultra"))

    const system = await getSystem(sysTransform, "s1")
    assert.ok(system[0].includes("ultra"), "system push reflects new mode")
    assert.ok(!system[0].includes("CAVEMAN MODE ACTIVE (full)"), "old mode not present")
  })

  it("system push is same bytes across multiple requests for same mode (V56/V57)", async () => {
    const hooks = await getHooks()
    const chatMsg = hooks["chat.message"] as (i: MsgInput, o: MsgOutput) => Promise<void>
    const sysTransform = hooks["experimental.chat.system.transform"] as (i: SysInput, o: SysOutput) => Promise<void>

    await chatMsg({ sessionID: "s1" }, makeOutput("s1", "/caveman full"))

    const sys1 = await getSystem(sysTransform, "s1")
    const sys2 = await getSystem(sysTransform, "s1")
    assert.deepStrictEqual(sys1, sys2, "identical bytes across requests for same mode")
  })

  it("deactivating caveman → system push reverts to rules only (V57)", async () => {
    const hooks = await getHooks()
    const chatMsg = hooks["chat.message"] as (i: MsgInput, o: MsgOutput) => Promise<void>
    const sysTransform = hooks["experimental.chat.system.transform"] as (i: SysInput, o: SysOutput) => Promise<void>

    await chatMsg({ sessionID: "s1" }, makeOutput("s1", "/caveman"))
    await chatMsg({ sessionID: "s1" }, makeOutput("s1", "/caveman off"))

    const system = await getSystem(sysTransform, "s1")
    assert.ok(!system[0].includes("CAVEMAN MODE ACTIVE"), "no mode header after deactivate")
  })

  it("session.created clears mode → system push reverts to rules only (V45/V57)", async () => {
    const hooks = await getHooks()
    const chatMsg = hooks["chat.message"] as (i: MsgInput, o: MsgOutput) => Promise<void>
    const eventHook = hooks["event"] as (i: EventInput) => Promise<void>
    const sysTransform = hooks["experimental.chat.system.transform"] as (i: SysInput, o: SysOutput) => Promise<void>

    await chatMsg({ sessionID: "s1" }, makeOutput("s1", "/caveman"))
    await eventHook({ event: { type: "session.created", properties: { info: { id: "s1" } } } })

    const system = await getSystem(sysTransform, "s1")
    assert.ok(!system[0].includes("CAVEMAN MODE ACTIVE"), "mode cleared by session.created")
  })

  it("session.created for s1 does NOT clear s2 mode (V45)", async () => {
    const hooks = await getHooks()
    const chatMsg = hooks["chat.message"] as (i: MsgInput, o: MsgOutput) => Promise<void>
    const eventHook = hooks["event"] as (i: EventInput) => Promise<void>
    const sysTransform = hooks["experimental.chat.system.transform"] as (i: SysInput, o: SysOutput) => Promise<void>

    await chatMsg({ sessionID: "s1" }, makeOutput("s1", "/caveman"))
    await chatMsg({ sessionID: "s2" }, makeOutput("s2", "/caveman ultra"))
    await eventHook({ event: { type: "session.created", properties: { info: { id: "s1" } } } })

    // s2 unaffected
    const sysS2 = await getSystem(sysTransform, "s2")
    assert.ok(sysS2[0].includes("ultra"), "s2 mode unaffected by s1 session.created")

    // s1 cleared
    const sysS1 = await getSystem(sysTransform, "s1")
    assert.ok(!sysS1[0].includes("CAVEMAN MODE ACTIVE"), "s1 mode cleared")
  })

  it("activeMode isolated per sessionID — s1 active does not affect s2 system push (V45)", async () => {
    const hooks = await getHooks()
    const chatMsg = hooks["chat.message"] as (i: MsgInput, o: MsgOutput) => Promise<void>
    const sysTransform = hooks["experimental.chat.system.transform"] as (i: SysInput, o: SysOutput) => Promise<void>

    await chatMsg({ sessionID: "s1" }, makeOutput("s1", "/caveman"))

    const sysS2 = await getSystem(sysTransform, "s2")
    assert.ok(!sysS2[0].includes("CAVEMAN MODE ACTIVE"), "s2 unaffected by s1 activation")
  })

  it("no synthetic parts injected into chat.message output (V57)", async () => {
    const hooks = await getHooks()
    const chatMsg = hooks["chat.message"] as (i: MsgInput, o: MsgOutput) => Promise<void>

    const out = makeOutput("s1", "/caveman")
    await chatMsg({ sessionID: "s1" }, out)
    const synthetic = out.parts.filter(p => (p as TextPart).synthetic)
    assert.strictEqual(synthetic.length, 0, "no synthetic parts — reinforcement lives in system push only")
  })
})

// ── V58/V60: system push gated — no sessionID (V58) + captured small model (V60) ─

type SmallModelInput = { provider: object }
type SmallModelOutput = { model?: { id: string; providerID?: string; name?: string; api?: object } }

function makeModel(id: string): { id: string; providerID: string; name: string; api: object } {
  return { id, providerID: "anthropic", name: id, api: { id: "", url: "", npm: "" } }
}

describe("system push — V58 no-sessionID gate", () => {
  it("no sessionID → system array empty (aux call skipped)", async () => {
    const hooks = await getHooks()
    const sysTransform = hooks["experimental.chat.system.transform"] as (i: SysInput, o: SysOutput) => Promise<void>

    const out: SysOutput = { system: [] }
    await sysTransform({ sessionID: undefined, model: makeModel("claude-sonnet-4-5") }, out)
    assert.strictEqual(out.system.length, 0, "no push when sessionID absent")
  })

  it("sessionID present, no small model captured → push proceeds", async () => {
    const hooks = await getHooks()
    const sysTransform = hooks["experimental.chat.system.transform"] as (i: SysInput, o: SysOutput) => Promise<void>

    const out: SysOutput = { system: [] }
    await sysTransform({ sessionID: "s1", model: makeModel("claude-haiku-4-5-20251001") }, out)
    assert.strictEqual(out.system.length, 1, "push proceeds when capturedSmallModelId is null")
  })
})

describe("system push — V60 small-model capture gate", () => {
  it("experimental.provider.small_model hook is registered", async () => {
    const hooks = await getHooks()
    assert.ok("experimental.provider.small_model" in hooks, "hook registered")
  })

  it("captured small model ID → transform skipped when model.id matches (V60)", async () => {
    const hooks = await getHooks()
    const smallModelHook = hooks["experimental.provider.small_model"] as (
      i: SmallModelInput, o: SmallModelOutput
    ) => Promise<void>
    const sysTransform = hooks["experimental.chat.system.transform"] as (i: SysInput, o: SysOutput) => Promise<void>

    await smallModelHook({ provider: {} }, { model: makeModel("claude-haiku-4-5-20251001") })

    const out: SysOutput = { system: [] }
    await sysTransform({ sessionID: "s1", model: makeModel("claude-haiku-4-5-20251001") }, out)
    assert.strictEqual(out.system.length, 0, "skipped when model.id matches capturedSmallModelId")
  })

  it("main model does NOT match captured small model → push proceeds (V60)", async () => {
    const hooks = await getHooks()
    const smallModelHook = hooks["experimental.provider.small_model"] as (
      i: SmallModelInput, o: SmallModelOutput
    ) => Promise<void>
    const sysTransform = hooks["experimental.chat.system.transform"] as (i: SysInput, o: SysOutput) => Promise<void>

    await smallModelHook({ provider: {} }, { model: makeModel("claude-haiku-4-5-20251001") })

    const out: SysOutput = { system: [] }
    await sysTransform({ sessionID: "s1", model: makeModel("claude-sonnet-4-5") }, out)
    assert.strictEqual(out.system.length, 1, "push proceeds for non-small model")
  })

  it("capturedSmallModelId null (no output.model) → push proceeds for any model (V60)", async () => {
    const hooks = await getHooks()
    const smallModelHook = hooks["experimental.provider.small_model"] as (
      i: SmallModelInput, o: SmallModelOutput
    ) => Promise<void>
    const sysTransform = hooks["experimental.chat.system.transform"] as (i: SysInput, o: SysOutput) => Promise<void>

    // Fire hook with no output.model (undefined)
    await smallModelHook({ provider: {} }, {})

    const out: SysOutput = { system: [] }
    await sysTransform({ sessionID: "s1", model: makeModel("claude-haiku-4-5-20251001") }, out)
    assert.strictEqual(out.system.length, 1, "push proceeds when capturedSmallModelId is null")
  })
})

// ── V101: experimental.session.compacting — mode reminder in output.context ──

type CompactInput = { sessionID: string }
type CompactOutput = { context: string[]; prompt?: string }

describe("experimental.session.compacting — V101", () => {
  it("handler is registered", async () => {
    const hooks = await getHooks()
    assert.ok("experimental.session.compacting" in hooks, "hook registered")
  })

  it("no active mode → context array unchanged", async () => {
    const hooks = await getHooks()
    const compact = hooks["experimental.session.compacting"] as unknown as (
      i: CompactInput, o: CompactOutput
    ) => Promise<void>

    const out: CompactOutput = { context: [] }
    await compact({ sessionID: "s1" }, out)
    assert.strictEqual(out.context.length, 0, "no context pushed when mode null")
  })

  it("active mode → context array contains mode reminder", async () => {
    const hooks = await getHooks()
    const chatMsg = hooks["chat.message"] as (i: MsgInput, o: MsgOutput) => Promise<void>
    const compact = hooks["experimental.session.compacting"] as unknown as (
      i: CompactInput, o: CompactOutput
    ) => Promise<void>

    await chatMsg({ sessionID: "s1" }, makeOutput("s1", "/caveman ultra"))

    const out: CompactOutput = { context: [] }
    await compact({ sessionID: "s1" }, out)
    assert.strictEqual(out.context.length, 1, "one item pushed")
    assert.ok(out.context[0].includes("CAVEMAN MODE ACTIVE (ultra)"), "context contains mode reminder")
  })

  it("does NOT replace output.prompt", async () => {
    const hooks = await getHooks()
    const chatMsg = hooks["chat.message"] as (i: MsgInput, o: MsgOutput) => Promise<void>
    const compact = hooks["experimental.session.compacting"] as unknown as (
      i: CompactInput, o: CompactOutput
    ) => Promise<void>

    await chatMsg({ sessionID: "s1" }, makeOutput("s1", "/caveman"))

    const out: CompactOutput = { context: [], prompt: "original prompt" }
    await compact({ sessionID: "s1" }, out)
    assert.strictEqual(out.prompt, "original prompt", "prompt unchanged")
  })

  it("appends to existing context entries (⊥ replace)", async () => {
    const hooks = await getHooks()
    const chatMsg = hooks["chat.message"] as (i: MsgInput, o: MsgOutput) => Promise<void>
    const compact = hooks["experimental.session.compacting"] as unknown as (
      i: CompactInput, o: CompactOutput
    ) => Promise<void>

    await chatMsg({ sessionID: "s1" }, makeOutput("s1", "/caveman full"))

    const out: CompactOutput = { context: ["prior context entry"] }
    await compact({ sessionID: "s1" }, out)
    assert.strictEqual(out.context.length, 2, "prior entry preserved + new entry added")
    assert.strictEqual(out.context[0], "prior context entry", "prior context preserved")
    assert.ok(out.context[1].includes("CAVEMAN MODE ACTIVE (full)"), "mode reminder appended")
  })

  it("session isolation: s1 no mode, s2 active mode (V45)", async () => {
    const hooks = await getHooks()
    const chatMsg = hooks["chat.message"] as (i: MsgInput, o: MsgOutput) => Promise<void>
    const compact = hooks["experimental.session.compacting"] as unknown as (
      i: CompactInput, o: CompactOutput
    ) => Promise<void>

    await chatMsg({ sessionID: "s2" }, makeOutput("s2", "/caveman lite"))

    const outS1: CompactOutput = { context: [] }
    await compact({ sessionID: "s1" }, outS1)
    assert.strictEqual(outS1.context.length, 0, "s1 has no mode → no context pushed")

    const outS2: CompactOutput = { context: [] }
    await compact({ sessionID: "s2" }, outS2)
    assert.ok(outS2.context[0]?.includes("lite"), "s2 mode reminder present")
  })
})

// ── V43: SKILL_PATH probe — npm path probed first ─────────────────────────────

describe("V43 — SKILL_PATH npm-path probe", () => {
  it("existsSync called with npm assets path first", () => {
    assert.ok(
      existsSyncLastPath?.includes("assets/skills/caveman/SKILL.md"),
      `expected npm skill path probe, got: ${existsSyncLastPath}`
    )
  })
})
