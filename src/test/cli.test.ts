import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { stripJsonc, parseJsonc, splicePluginArray, spliceMcpCavemem, fmtSymbol, colorLabel, blue } from "../cli.js"

// ─── fmtSymbol — V75 ─────────────────────────────────────────────────────

describe("fmtSymbol — V75", () => {
  it("plain symbols when tty=false", () => {
    assert.strictEqual(fmtSymbol("ok",   false), "✓")
    assert.strictEqual(fmtSymbol("warn", false), "⚠")
    assert.strictEqual(fmtSymbol("fail", false), "✗")
  })

  it("ANSI-wrapped when tty=true: contains symbol + reset code", () => {
    const ok   = fmtSymbol("ok",   true)
    const warn = fmtSymbol("warn", true)
    const fail = fmtSymbol("fail", true)
    assert.ok(ok.includes("✓"),   "ok missing ✓")
    assert.ok(warn.includes("⚠"), "warn missing ⚠")
    assert.ok(fail.includes("✗"), "fail missing ✗")
    // ANSI reset code present
    assert.ok(ok.includes("\x1b[0m"),   "ok missing reset")
    assert.ok(warn.includes("\x1b[0m"), "warn missing reset")
    assert.ok(fail.includes("\x1b[0m"), "fail missing reset")
  })

  it("ok=green, warn=yellow, fail=red ANSI codes", () => {
    assert.ok(fmtSymbol("ok",   true).startsWith("\x1b[32m"), "ok not green")
    assert.ok(fmtSymbol("warn", true).startsWith("\x1b[33m"), "warn not yellow")
    assert.ok(fmtSymbol("fail", true).startsWith("\x1b[31m"), "fail not red")
  })

  it("plain and ANSI both contain the same bare symbol char", () => {
    for (const type of ["ok", "warn", "fail"] as const) {
      const plain = fmtSymbol(type, false)
      const ansi  = fmtSymbol(type, true)
      assert.ok(ansi.includes(plain), `ansi form missing bare symbol for ${type}`)
    }
  })
})

// ─── blue — V86 ──────────────────────────────────────────────────────────

describe("blue — V86", () => {
  it("plain when tty=false", () => {
    assert.strictEqual(blue("foo", false), "foo")
    assert.strictEqual(blue("skills", false), "skills")
    assert.strictEqual(blue("", false), "")
  })

  it("blue ANSI wrap when tty=true", () => {
    assert.strictEqual(blue("foo", true), "\x1b[94mfoo\x1b[0m")
  })

  it("empty string → ANSI wrap only", () => {
    assert.strictEqual(blue("", true), "\x1b[94m\x1b[0m")
  })

  it("tty=true: starts with \\x1b[94m, ends with \\x1b[0m, contains value", () => {
    const out = blue("global:skills", true)
    assert.ok(out.startsWith("\x1b[94m"), "missing blue code")
    assert.ok(out.endsWith("\x1b[0m"), "missing reset")
    assert.ok(out.includes("global:skills"), "missing value")
  })
})

// ─── colorLabel — V75, V78 ───────────────────────────────────────────────

describe("colorLabel — V75,V78", () => {
  it("plain (tty=false): returns label unchanged", () => {
    assert.strictEqual(colorLabel("added",      false), "added")
    assert.strictEqual(colorLabel("registered", false), "registered")
    assert.strictEqual(colorLabel("configured", false), "configured")
    assert.strictEqual(colorLabel("updated",    false), "updated")
  })

  it("tty=true: added/registered/configured → green ANSI wrap", () => {
    for (const label of ["added", "registered", "configured"]) {
      const out = colorLabel(label, true)
      assert.ok(out.startsWith("\x1b[32m"), `${label} not green`)
      assert.ok(out.includes(label),        `${label} missing from output`)
      assert.ok(out.endsWith("\x1b[0m"),    `${label} missing reset`)
    }
  })

  it("tty=true: updated → yellow ANSI wrap", () => {
    const out = colorLabel("updated", true)
    assert.ok(out.startsWith("\x1b[33m"), "updated not yellow")
    assert.ok(out.includes("updated"),    "updated missing from output")
    assert.ok(out.endsWith("\x1b[0m"),    "updated missing reset")
  })

  it("tty=true: unknown label → returned as-is (no color)", () => {
    assert.strictEqual(colorLabel("unknown-label", true), "unknown-label")
  })
})

// ─── V87 — config output line format ─────────────────────────────────────

describe("V87 — config output line format", () => {
  it("plugin line plain: registered  plugin caveopen → global:config plugin", () => {
    const line = `${colorLabel("registered", false)}  ${blue("plugin", false)} caveopen → ${blue("global:config", false)} plugin`
    assert.strictEqual(line, "registered  plugin caveopen → global:config plugin")
  })

  it("mcp line plain: configured  mcp cavemem → global:config mcp", () => {
    const line = `${colorLabel("configured", false)}  ${blue("mcp", false)} cavemem → ${blue("global:config", false)} mcp`
    assert.strictEqual(line, "configured  mcp cavemem → global:config mcp")
  })

  it("type tokens (plugin, mcp) are plain — not blue-wrapped", () => {
    assert.ok(!`${blue("global:config", false)} plugin`.includes("\x1b"), "plugin type must be plain text")
    assert.ok(!`${blue("global:config", false)} mcp`.includes("\x1b"),   "mcp type must be plain text")
  })

  it("scope:config blue-wrapped when tty=true; type still plain", () => {
    const line = `${colorLabel("registered", true)}  ${blue("plugin", true)} caveopen → ${blue("project:config", true)} plugin`
    assert.ok(line.includes("project:config"), "scope:config present")
    assert.ok(line.endsWith(" plugin"), "type plain at end of line")
  })
})

// ─── stripJsonc — V21, V22 ────────────────────────────────────────────────

describe("stripJsonc — V21,V22", () => {
  it("passes plain JSON unchanged", () => {
    const s = '{"a":1}'
    assert.strictEqual(stripJsonc(s), s)
  })

  it("strips line comment", () => {
    const result = stripJsonc('{"a":1} // comment')
    assert.ok(!result.includes("comment"))
    assert.ok(result.includes('"a"'))
  })

  it("strips block comment", () => {
    const result = stripJsonc('{"a":1 /* block */}')
    assert.ok(!result.includes("block"))
    assert.ok(result.includes('"a"'))
  })

  it("V22: preserves // inside string", () => {
    const s = '{"url":"http://example.com"}'
    assert.strictEqual(stripJsonc(s), s)
  })

  it("V22: preserves /* inside string", () => {
    const s = '{"x":"/* not a comment */"}'
    assert.strictEqual(stripJsonc(s), s)
  })

  it("strips // after string value on same line", () => {
    const result = stripJsonc('{"a":"val"} // end')
    assert.ok(!result.includes("end"))
    assert.ok(result.includes('"val"'))
  })

  it("handles escaped quote inside string", () => {
    const s = '{"a":"he said \\"hi\\""}'
    assert.strictEqual(stripJsonc(s), s)
  })
})

// ─── parseJsonc — V23 ────────────────────────────────────────────────────

describe("parseJsonc — V23", () => {
  it("parses plain JSON", () => {
    const obj = parseJsonc('{"a":1,"b":2}')
    assert.strictEqual(obj["a"], 1)
    assert.strictEqual(obj["b"], 2)
  })

  it("V23: strips trailing comma before }", () => {
    const obj = parseJsonc('{"a":1,}')
    assert.strictEqual(obj["a"], 1)
  })

  it("V23: strips trailing comma before ]", () => {
    const obj = parseJsonc('{"x":[1,2,]}')
    assert.deepStrictEqual(obj["x"], [1, 2])
  })

  it("V21: strips line comments before parse", () => {
    const obj = parseJsonc('{\n  "a": 1 // inline\n}')
    assert.strictEqual(obj["a"], 1)
  })

  it("V21+V23: comments + trailing commas combined", () => {
    const obj = parseJsonc('{\n  "a": 1, // comment\n}')
    assert.strictEqual(obj["a"], 1)
  })

  it("V22: URL in string survives strip+parse", () => {
    const obj = parseJsonc('{"url":"https://example.com/api"}')
    assert.strictEqual(obj["url"], "https://example.com/api")
  })
})

// ─── V40: npm-form deduplication (logic extracted) ────────────────────────

describe("V40: plugin entry deduplication", () => {
  /** Simulate the dedup+push logic from cli.ts */
  function applyEntry(plugins: unknown[], modes: string): unknown[] {
    const filtered = plugins.filter(
      e => e !== "caveopen" && !(Array.isArray(e) && e[0] === "caveopen")
    )
    const entry: unknown = modes ? ["caveopen", { modes }] : "caveopen"
    return [...filtered, entry]
  }

  it("adds string entry when no modes", () => {
    const result = applyEntry([], "")
    assert.deepStrictEqual(result, ["caveopen"])
  })

  it("adds array entry when modes specified", () => {
    const result = applyEntry([], "caveman")
    assert.deepStrictEqual(result, [["caveopen", { modes: "caveman" }]])
  })

  it("idempotent: deduplicates existing string entry", () => {
    const result = applyEntry(["caveopen"], "")
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0], "caveopen")
  })

  it("idempotent: deduplicates existing array entry", () => {
    const result = applyEntry([["caveopen", { modes: "caveman" }]], "cavekit")
    assert.strictEqual(result.length, 1)
    assert.deepStrictEqual(result[0], ["caveopen", { modes: "cavekit" }])
  })

  it("preserves other plugin entries", () => {
    const result = applyEntry(["other-plugin", "caveopen"], "")
    assert.ok(result.includes("other-plugin"))
    assert.ok(result.includes("caveopen"))
    assert.strictEqual(result.length, 2)
  })

  it("V40: ⊥ path form injected — no './plugins/...' entry", () => {
    const result = applyEntry([], "")
    assert.ok(!result.some(e => typeof e === "string" && e.startsWith("./")))
  })
})

// ─── splicePluginArray — V72 ──────────────────────────────────────────────

describe("splicePluginArray — V72", () => {
  it("replaces plugin array preserving surrounding JSONC comments", () => {
    const raw = `{
  // top comment
  "plugin": ["old-plugin"], // inline comment
  "mcp": {}
}`
    const result = splicePluginArray(raw, ["caveopen"])
    // JSONC comments preserved
    assert.ok(result.includes("// top comment"))
    assert.ok(result.includes("// inline comment"))
    assert.ok(result.includes('"mcp"'))
    // new array spliced in
    assert.ok(result.includes('["caveopen"]'))
    assert.ok(!result.includes('"old-plugin"'))
  })

  it("handles nested objects in existing plugin array", () => {
    const raw = `{"plugin":[["x",{"modes":"a"}]],"mcp":{}}`
    const result = splicePluginArray(raw, ["caveopen"])
    assert.ok(result.includes('["caveopen"]'))
    assert.ok(result.includes('"mcp"'))
    assert.ok(!result.includes('"x"'))
  })

  it("handles empty plugin array", () => {
    const raw = `{"plugin":[],"mcp":{}}`
    const result = splicePluginArray(raw, ["caveopen"])
    assert.ok(result.includes('["caveopen"]'))
  })

  it("throws if no plugin key found", () => {
    assert.throws(() => splicePluginArray(`{"mcp":{}}`, ["caveopen"]), /plugin/)
  })

  it("preserves content outside plugin key unchanged", () => {
    const raw = `{"other":"value","plugin":["old"],"after":42}`
    const result = splicePluginArray(raw, ["caveopen"])
    assert.ok(result.includes('"other":"value"'))
    assert.ok(result.includes('"after":42'))
  })

  it("preserves JSONC with http:// URLs in strings", () => {
    const raw = `{
  "url": "http://example.com", // a URL
  "plugin": ["old"]
}`
    const result = splicePluginArray(raw, ["caveopen"])
    assert.ok(result.includes('"http://example.com"'))
    assert.ok(result.includes('["caveopen"]'))
  })
})

// ─── spliceMcpCavemem — V73 ───────────────────────────────────────────────

describe("spliceMcpCavemem — V73", () => {
  const cavememEntry = { type: "local", command: ["npx", "cavemem", "mcp"] }

  it("injects into empty mcp object", () => {
    const raw = `{"plugin":["caveopen"],"mcp":{}}`
    const result = spliceMcpCavemem(raw, cavememEntry)
    const parsed = JSON.parse(result) as Record<string, unknown>
    assert.deepStrictEqual(
      (parsed.mcp as Record<string, unknown>).cavemem,
      cavememEntry
    )
  })

  it("injects into non-empty mcp object with comma", () => {
    const raw = `{"mcp":{"other":{"type":"remote","url":"x"}}}`
    const result = spliceMcpCavemem(raw, cavememEntry)
    const parsed = JSON.parse(result) as Record<string, unknown>
    const mcp = parsed.mcp as Record<string, unknown>
    assert.ok("other" in mcp)
    assert.deepStrictEqual(mcp.cavemem, cavememEntry)
  })

  it("preserves surrounding JSONC comments", () => {
    const raw = `{
  // top comment
  "plugin": ["caveopen"],
  "mcp": {} // mcp comment
}`
    const result = spliceMcpCavemem(raw, cavememEntry)
    assert.ok(result.includes("// top comment"))
    assert.ok(result.includes("// mcp comment"))
    assert.ok(result.includes('"cavemem"'))
  })

  it("throws if no mcp key found", () => {
    assert.throws(() => spliceMcpCavemem(`{"plugin":[]}`, cavememEntry), /mcp/)
  })

  it("preserves content outside mcp unchanged", () => {
    const raw = `{"plugin":["caveopen"],"mcp":{},"other":42}`
    const result = spliceMcpCavemem(raw, cavememEntry)
    assert.ok(result.includes('"other":42'))
    assert.ok(result.includes('["caveopen"]'))
  })

  it("idempotent-safe: does not double-inject (splice path gates on !hasMcpCavemem)", () => {
    // spliceMcpCavemem itself has no idempotency guard — gate is in caller
    // verify it injects exactly one cavemem key
    const raw = `{"mcp":{}}`
    const once = spliceMcpCavemem(raw, cavememEntry)
    const parsed = JSON.parse(once) as Record<string, unknown>
    const keys = Object.keys(parsed.mcp as object)
    assert.strictEqual(keys.filter(k => k === "cavemem").length, 1)
  })

  it("V74: trailing comma in mcp object → ⊥ double comma → valid JSON", () => {
    // JSONC mcp object where existing entry ends with trailing comma
    const raw = `{"mcp":{"other":{"type":"remote"},"url":"x",}}`
    const result = spliceMcpCavemem(raw, cavememEntry)
    // output must not contain double comma
    assert.ok(!result.includes(",,"), `double comma in: ${result}`)
    // strip trailing commas to parse as JSON
    const clean = result.replace(/,(\s*[}\]])/g, "$1")
    const parsed = JSON.parse(clean) as Record<string, unknown>
    const mcp = parsed.mcp as Record<string, unknown>
    assert.deepStrictEqual(mcp.cavemem, cavememEntry)
    assert.ok("other" in mcp)
  })
})
