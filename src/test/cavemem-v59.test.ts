import { describe, it, mock } from "node:test"
import assert from "node:assert/strict"

// ── V59: MCP gate for memory-tools system note ────────────────────────────────
// checkMcpCavemem gates the system note on `mcp.cavemem` config presence,
// NOT on CLI probe (ensureCavemem). Tests verify JSONC parsing logic and
// the hook's gate behavior.

// ── JSONC strip logic (mirrors stripJsoncForMcp in cavemem.ts) ───────────────

function stripJsonc(s: string): string {
  let out = "", i = 0, inStr = false, escaped = false
  while (i < s.length) {
    const c = s[i]!
    if (escaped) { out += c; i++; escaped = false; continue }
    if (inStr) {
      if (c === "\\") { escaped = true; out += c; i++; continue }
      if (c === '"') inStr = false
      out += c; i++; continue
    }
    if (c === '"') { inStr = true; out += c; i++; continue }
    if (c === "/" && s[i + 1] === "/") { while (i < s.length && s[i] !== "\n") i++; continue }
    if (c === "/" && s[i + 1] === "*") {
      i += 2; while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++; i += 2; continue
    }
    out += c; i++
  }
  return out.replace(/,(\s*[}\]])/g, "$1")
}

function hasMcpCavemem(raw: string): boolean {
  try {
    const cfg = JSON.parse(stripJsonc(raw)) as { mcp?: { cavemem?: unknown } }
    return !!(cfg?.mcp?.cavemem)
  } catch { return false }
}

// ── stripJsoncForMcp parsing tests ───────────────────────────────────────────

describe("V59 — JSONC strip + mcp.cavemem detection", () => {
  it("plain JSON with mcp.cavemem → true", () => {
    const raw = JSON.stringify({ mcp: { cavemem: { type: "local", command: ["npx", "cavemem", "mcp"] } } })
    assert.strictEqual(hasMcpCavemem(raw), true)
  })

  it("JSONC with line comments + trailing commas → true", () => {
    const raw = `{
      // cavemem MCP
      "mcp": {
        "cavemem": {
          "type": "local",
          "command": ["npx", "cavemem", "mcp"], // trailing
        }, // trailing
      },
    }`
    assert.strictEqual(hasMcpCavemem(raw), true)
  })

  it("JSONC with block comments → true", () => {
    const raw = `{
      /* block comment */
      "mcp": {
        "cavemem": { "type": "local", /* inline */ "command": [] },
      },
    }`
    assert.strictEqual(hasMcpCavemem(raw), true)
  })

  it("URL string ⊥ stripped by comment strip (V22)", () => {
    const raw = `{
      "url": "http://example.com/path",
      "mcp": { "cavemem": { "type": "local" } }
    }`
    assert.strictEqual(hasMcpCavemem(raw), true, "URL string preserved → parse succeeds")
  })

  it("no mcp key → false", () => {
    const raw = JSON.stringify({ plugin: ["./plugins/foo.ts"] })
    assert.strictEqual(hasMcpCavemem(raw), false)
  })

  it("mcp without cavemem → false", () => {
    const raw = JSON.stringify({ mcp: { other: { type: "remote" } } })
    assert.strictEqual(hasMcpCavemem(raw), false)
  })

  it("invalid JSON → false (⊥ throw)", () => {
    assert.strictEqual(hasMcpCavemem("not json"), false)
  })
})

// ── Integration: cavemem transform hook gate ──────────────────────────────────
// V59: transform uses checkMcpCavemem (config-based), ⊥ ensureCavemem (CLI-based).
// The module-level mcpChecked cache means we can only test one scenario per
// import. Here we test with existsSync → false (no config → note ⊥ pushed).

mock.module("node:child_process", {
  namedExports: {
    spawnSync: () => ({ status: 0, error: null, stdout: Buffer.from("1.0.0"), stderr: Buffer.from("") }),
    execSync: () => "",
    spawn: (_: unknown, args: string[]) => {
      let closeCb: ((code: number) => void) | null = null
      return {
        stdin: { end: () => { setImmediate(() => { if (closeCb) closeCb(0) }) } },
        kill: () => {},
        on: (evt: string, h: (...a: unknown[]) => void) => { if (evt === "close") closeCb = h as (c: number) => void },
      }
    },
  },
})

mock.module("node:fs", {
  namedExports: {
    existsSync: () => false,          // no opencode config anywhere
    readFileSync: () => { throw new Error("no config files") },
  },
})

const { cavemem, checkMcpCavemem } = await import("../cavemem.js")

describe("V59 — transform hook gated on MCP config, ⊥ CLI probe", () => {
  it("checkMcpCavemem returns false when no opencode config found", () => {
    // existsSync → false for all paths → no MCP config detected
    const result = checkMcpCavemem("/tmp/test-project")
    assert.strictEqual(result, false, "no config files → MCP not configured")
  })

  it("transform hook exists on cavemem hooks object", async () => {
    const hooks = await cavemem({ directory: "/tmp/test-project" } as Parameters<typeof cavemem>[0])
    assert.ok(typeof hooks["experimental.chat.system.transform"] === "function")
  })

  it("transform ⊥ injects note when MCP not configured", async () => {
    const hooks = await cavemem({ directory: "/tmp/test-project" } as Parameters<typeof cavemem>[0])
    const output: { system: string[] } = { system: [] }
    await (hooks["experimental.chat.system.transform"] as (i: unknown, o: typeof output) => Promise<void>)(
      {}, output
    )
    assert.deepStrictEqual(output.system, [], "no MCP config → note ⊥ pushed (V59)")
  })

  it("CLI available but MCP absent → note still ⊥ pushed (CLI ≠ MCP, V59)", async () => {
    // spawnSync returns status:0 (CLI present), but existsSync → false (no config)
    // → ensureCavemem() = true, checkMcpCavemem() = false → note ⊥ injected
    const hooks = await cavemem({ directory: "/tmp/no-mcp-dir" } as Parameters<typeof cavemem>[0])
    const output: { system: string[] } = { system: [] }
    await (hooks["experimental.chat.system.transform"] as (i: unknown, o: typeof output) => Promise<void>)(
      {}, output
    )
    assert.deepStrictEqual(output.system, [], "CLI present + MCP absent → note ⊥ pushed")
  })
})
