import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  stripJsonc,
  parseJsonc,
  splicePluginArray,
  spliceMcpCavemem,
  fmtSymbol,
  colorLabel,
  blue,
} from "../cli.js";

describe("fmtSymbol", () => {
  it("plain symbols when tty=false", () => {
    assert.strictEqual(fmtSymbol("ok", false), "✓");
    assert.strictEqual(fmtSymbol("warn", false), "⚠");
    assert.strictEqual(fmtSymbol("fail", false), "✗");
  });

  it("ANSI-wrapped when tty=true: contains symbol + reset code", () => {
    const ok = fmtSymbol("ok", true);
    const warn = fmtSymbol("warn", true);
    const fail = fmtSymbol("fail", true);
    assert.ok(ok.includes("✓"), "ok missing ✓");
    assert.ok(warn.includes("⚠"), "warn missing ⚠");
    assert.ok(fail.includes("✗"), "fail missing ✗");
    // ANSI reset code present
    assert.ok(ok.includes("\x1b[0m"), "ok missing reset");
    assert.ok(warn.includes("\x1b[0m"), "warn missing reset");
    assert.ok(fail.includes("\x1b[0m"), "fail missing reset");
  });

  it("ok=green, warn=yellow, fail=red ANSI codes", () => {
    assert.ok(fmtSymbol("ok", true).startsWith("\x1b[32m"), "ok not green");
    assert.ok(
      fmtSymbol("warn", true).startsWith("\x1b[33m"),
      "warn not yellow",
    );
    assert.ok(fmtSymbol("fail", true).startsWith("\x1b[31m"), "fail not red");
  });

  it("plain and ANSI both contain the same bare symbol char", () => {
    for (const type of ["ok", "warn", "fail"] as const) {
      const plain = fmtSymbol(type, false);
      const ansi = fmtSymbol(type, true);
      assert.ok(
        ansi.includes(plain),
        `ansi form missing bare symbol for ${type}`,
      );
    }
  });
});

describe("blue", () => {
  it("plain when tty=false", () => {
    assert.strictEqual(blue("foo", false), "foo");
    assert.strictEqual(blue("skills", false), "skills");
    assert.strictEqual(blue("", false), "");
  });

  it("blue ANSI wrap when tty=true", () => {
    assert.strictEqual(blue("foo", true), "\x1b[94mfoo\x1b[0m");
  });

  it("empty string → ANSI wrap only", () => {
    assert.strictEqual(blue("", true), "\x1b[94m\x1b[0m");
  });

  it("tty=true: starts with \\x1b[94m, ends with \\x1b[0m, contains value", () => {
    const out = blue("global:skills", true);
    assert.ok(out.startsWith("\x1b[94m"), "missing blue code");
    assert.ok(out.endsWith("\x1b[0m"), "missing reset");
    assert.ok(out.includes("global:skills"), "missing value");
  });
});

describe("colorLabel", () => {
  it("plain (tty=false): returns label unchanged", () => {
    assert.strictEqual(colorLabel("added", false), "added");
    assert.strictEqual(colorLabel("registered", false), "registered");
    assert.strictEqual(colorLabel("configured", false), "configured");
    assert.strictEqual(colorLabel("updated", false), "updated");
  });

  it("tty=true: added/registered/configured → green ANSI wrap", () => {
    for (const label of ["added", "registered", "configured"]) {
      const out = colorLabel(label, true);
      assert.ok(out.startsWith("\x1b[32m"), `${label} not green`);
      assert.ok(out.includes(label), `${label} missing from output`);
      assert.ok(out.endsWith("\x1b[0m"), `${label} missing reset`);
    }
  });

  it("tty=true: updated → yellow ANSI wrap", () => {
    const out = colorLabel("updated", true);
    assert.ok(out.startsWith("\x1b[33m"), "updated not yellow");
    assert.ok(out.includes("updated"), "updated missing from output");
    assert.ok(out.endsWith("\x1b[0m"), "updated missing reset");
  });

  it("tty=true: unknown label → returned as-is (no color)", () => {
    assert.strictEqual(colorLabel("unknown-label", true), "unknown-label");
  });
});

// ─── config output line format ─────────────────────────────────────

describe("config output line format", () => {
  it("plugin line plain: registered  plugin caveopen → global:config plugin", () => {
    const line = `${colorLabel("registered", false)}  ${blue("plugin", false)} caveopen → ${blue("global:config", false)} plugin`;
    assert.strictEqual(
      line,
      "registered  plugin caveopen → global:config plugin",
    );
  });

  it("mcp line plain: configured  mcp cavemem → global:config mcp", () => {
    const line = `${colorLabel("configured", false)}  ${blue("mcp", false)} cavemem → ${blue("global:config", false)} mcp`;
    assert.strictEqual(line, "configured  mcp cavemem → global:config mcp");
  });

  it("type tokens (plugin, mcp) are plain — not blue-wrapped", () => {
    assert.ok(
      !`${blue("global:config", false)} plugin`.includes("\x1b"),
      "plugin type must be plain text",
    );
    assert.ok(
      !`${blue("global:config", false)} mcp`.includes("\x1b"),
      "mcp type must be plain text",
    );
  });

  it("scope:config blue-wrapped when tty=true; type still plain", () => {
    const line = `${colorLabel("registered", true)}  ${blue("plugin", true)} caveopen → ${blue("project:config", true)} plugin`;
    assert.ok(line.includes("project:config"), "scope:config present");
    assert.ok(line.endsWith(" plugin"), "type plain at end of line");
  });
});

// ─── stripJsonc ────────────────────────────────────────────────

describe("stripJsonc", () => {
  it("passes plain JSON unchanged", () => {
    const s = '{"a":1}';
    assert.strictEqual(stripJsonc(s), s);
  });

  it("strips line comment", () => {
    const result = stripJsonc('{"a":1} // comment');
    assert.ok(!result.includes("comment"));
    assert.ok(result.includes('"a"'));
  });

  it("strips block comment", () => {
    const result = stripJsonc('{"a":1 /* block */}');
    assert.ok(!result.includes("block"));
    assert.ok(result.includes('"a"'));
  });

  it("preserves // inside string", () => {
    const s = '{"url":"http://example.com"}';
    assert.strictEqual(stripJsonc(s), s);
  });

  it("preserves /* inside string", () => {
    const s = '{"x":"/* not a comment */"}';
    assert.strictEqual(stripJsonc(s), s);
  });

  it("strips // after string value on same line", () => {
    const result = stripJsonc('{"a":"val"} // end');
    assert.ok(!result.includes("end"));
    assert.ok(result.includes('"val"'));
  });

  it("handles escaped quote inside string", () => {
    const s = '{"a":"he said \\"hi\\""}';
    assert.strictEqual(stripJsonc(s), s);
  });
});

// ─── parseJsonc ────────────────────────────────────────────────────

describe("parseJsonc", () => {
  it("parses plain JSON", () => {
    const obj = parseJsonc('{"a":1,"b":2}');
    assert.strictEqual(obj["a"], 1);
    assert.strictEqual(obj["b"], 2);
  });

  it("strips trailing comma before }", () => {
    const obj = parseJsonc('{"a":1,}');
    assert.strictEqual(obj["a"], 1);
  });

  it("strips trailing comma before ]", () => {
    const obj = parseJsonc('{"x":[1,2,]}');
    assert.deepStrictEqual(obj["x"], [1, 2]);
  });

  it("strips line comments before parse", () => {
    const obj = parseJsonc('{\n  "a": 1 // inline\n}');
    assert.strictEqual(obj["a"], 1);
  });

  it("comments + trailing commas combined", () => {
    const obj = parseJsonc('{\n  "a": 1, // comment\n}');
    assert.strictEqual(obj["a"], 1);
  });

  it("URL in string survives strip+parse", () => {
    const obj = parseJsonc('{"url":"https://example.com/api"}');
    assert.strictEqual(obj["url"], "https://example.com/api");
  });
});

// ─── npm-form deduplication (logic extracted) ────────────────────────

describe("plugin entry deduplication", () => {
  /** Simulate the dedup+push logic from cli.ts */
  function applyEntry(plugins: unknown[], modes: string): unknown[] {
    const filtered = plugins.filter(
      (e) => e !== "caveopen" && !(Array.isArray(e) && e[0] === "caveopen"),
    );
    const entry: unknown = modes ? ["caveopen", { modes }] : "caveopen";
    return [...filtered, entry];
  }

  it("adds string entry when no modes", () => {
    const result = applyEntry([], "");
    assert.deepStrictEqual(result, ["caveopen"]);
  });

  it("adds array entry when modes specified", () => {
    const result = applyEntry([], "caveman");
    assert.deepStrictEqual(result, [["caveopen", { modes: "caveman" }]]);
  });

  it("idempotent: deduplicates existing string entry", () => {
    const result = applyEntry(["caveopen"], "");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0], "caveopen");
  });

  it("idempotent: deduplicates existing array entry", () => {
    const result = applyEntry([["caveopen", { modes: "caveman" }]], "cavekit");
    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual(result[0], ["caveopen", { modes: "cavekit" }]);
  });

  it("preserves other plugin entries", () => {
    const result = applyEntry(["other-plugin", "caveopen"], "");
    assert.ok(result.includes("other-plugin"));
    assert.ok(result.includes("caveopen"));
    assert.strictEqual(result.length, 2);
  });

  it("⊥ path form injected — no './plugins/...' entry", () => {
    const result = applyEntry([], "");
    assert.ok(!result.some((e) => typeof e === "string" && e.startsWith("./")));
  });
});

// ─── splicePluginArray ──────────────────────────────────────────────

describe("splicePluginArray", () => {
  it("replaces plugin array preserving surrounding JSONC comments", () => {
    const raw = `{
  // top comment
  "plugin": ["old-plugin"], // inline comment
  "mcp": {}
}`;
    const result = splicePluginArray(raw, ["caveopen"]);
    // JSONC comments preserved
    assert.ok(result.includes("// top comment"));
    assert.ok(result.includes("// inline comment"));
    assert.ok(result.includes('"mcp"'));
    // new array spliced in
    assert.ok(result.includes('["caveopen"]'));
    assert.ok(!result.includes('"old-plugin"'));
  });

  it("handles nested objects in existing plugin array", () => {
    const raw = `{"plugin":[["x",{"modes":"a"}]],"mcp":{}}`;
    const result = splicePluginArray(raw, ["caveopen"]);
    assert.ok(result.includes('["caveopen"]'));
    assert.ok(result.includes('"mcp"'));
    assert.ok(!result.includes('"x"'));
  });

  it("handles empty plugin array", () => {
    const raw = `{"plugin":[],"mcp":{}}`;
    const result = splicePluginArray(raw, ["caveopen"]);
    assert.ok(result.includes('["caveopen"]'));
  });

  it("throws if no plugin key found", () => {
    assert.throws(
      () => splicePluginArray(`{"mcp":{}}`, ["caveopen"]),
      /plugin/,
    );
  });

  it("preserves content outside plugin key unchanged", () => {
    const raw = `{"other":"value","plugin":["old"],"after":42}`;
    const result = splicePluginArray(raw, ["caveopen"]);
    assert.ok(result.includes('"other":"value"'));
    assert.ok(result.includes('"after":42'));
  });

  it("preserves JSONC with http:// URLs in strings", () => {
    const raw = `{
  "url": "http://example.com", // a URL
  "plugin": ["old"]
}`;
    const result = splicePluginArray(raw, ["caveopen"]);
    assert.ok(result.includes('"http://example.com"'));
    assert.ok(result.includes('["caveopen"]'));
  });
});

// ─── spliceMcpCavemem ───────────────────────────────────────────────

describe("spliceMcpCavemem", () => {
  const cavememEntry = { type: "local", command: ["npx", "cavemem", "mcp"] };

  it("injects into empty mcp object", () => {
    const raw = `{"plugin":["caveopen"],"mcp":{}}`;
    const result = spliceMcpCavemem(raw, cavememEntry);
    const parsed = JSON.parse(result) as Record<string, unknown>;
    assert.deepStrictEqual(
      (parsed.mcp as Record<string, unknown>).cavemem,
      cavememEntry,
    );
  });

  it("injects into non-empty mcp object with comma", () => {
    const raw = `{"mcp":{"other":{"type":"remote","url":"x"}}}`;
    const result = spliceMcpCavemem(raw, cavememEntry);
    const parsed = JSON.parse(result) as Record<string, unknown>;
    const mcp = parsed.mcp as Record<string, unknown>;
    assert.ok("other" in mcp);
    assert.deepStrictEqual(mcp.cavemem, cavememEntry);
  });

  it("preserves surrounding JSONC comments", () => {
    const raw = `{
  // top comment
  "plugin": ["caveopen"],
  "mcp": {} // mcp comment
}`;
    const result = spliceMcpCavemem(raw, cavememEntry);
    assert.ok(result.includes("// top comment"));
    assert.ok(result.includes("// mcp comment"));
    assert.ok(result.includes('"cavemem"'));
  });

  it("throws if no mcp key found", () => {
    assert.throws(() => spliceMcpCavemem(`{"plugin":[]}`, cavememEntry), /mcp/);
  });

  it("preserves content outside mcp unchanged", () => {
    const raw = `{"plugin":["caveopen"],"mcp":{},"other":42}`;
    const result = spliceMcpCavemem(raw, cavememEntry);
    assert.ok(result.includes('"other":42'));
    assert.ok(result.includes('["caveopen"]'));
  });

  it("idempotent-safe: does not double-inject (splice path gates on !hasMcpCavemem)", () => {
    // spliceMcpCavemem itself has no idempotency guard — gate is in caller
    // verify it injects exactly one cavemem key
    const raw = `{"mcp":{}}`;
    const once = spliceMcpCavemem(raw, cavememEntry);
    const parsed = JSON.parse(once) as Record<string, unknown>;
    const keys = Object.keys(parsed.mcp as object);
    assert.strictEqual(keys.filter((k) => k === "cavemem").length, 1);
  });

  it("trailing comma in mcp object → ⊥ double comma → valid JSON", () => {
    // JSONC mcp object where existing entry ends with trailing comma
    const raw = `{"mcp":{"other":{"type":"remote"},"url":"x",}}`;
    const result = spliceMcpCavemem(raw, cavememEntry);
    // output must not contain double comma
    assert.ok(!result.includes(",,"), `double comma in: ${result}`);
    // strip trailing commas to parse as JSON
    const clean = result.replace(/,(\s*[}\]])/g, "$1");
    const parsed = JSON.parse(clean) as Record<string, unknown>;
    const mcp = parsed.mcp as Record<string, unknown>;
    assert.deepStrictEqual(mcp.cavemem, cavememEntry);
    assert.ok("other" in mcp);
  });
});

// ─── tui config injection ───────────────────────────────────────────

/**
 * Simulate the tui.json injection path from runCLI().
 * entry: "caveopen" | ["caveopen", {modes}]
 */
function applyTuiPlugin(tuiRaw: string, entry: unknown): string {
  const tuiConfig = parseJsonc(tuiRaw);
  if (!Array.isArray(tuiConfig.plugin)) tuiConfig.plugin = [];
  const filtered = (tuiConfig.plugin as unknown[]).filter(
    (e) => e !== "caveopen" && !(Array.isArray(e) && e[0] === "caveopen"),
  );
  filtered.push(entry);
  if (/\"plugin\"\s*:/.test(tuiRaw)) {
    return splicePluginArray(tuiRaw, filtered);
  }
  tuiConfig.plugin = filtered;
  return JSON.stringify(tuiConfig, null, 2) + "\n";
}

describe("tui config injection", () => {
  it("existing plugin key: splices in caveopen, preserves other keys", () => {
    const raw = `{
  "$schema": "https://opencode.ai/tui.json",
  "theme": "tokyonight",
  "plugin": ["other-plugin"]
}`;
    const out = applyTuiPlugin(raw, "caveopen");
    const parsed = parseJsonc(out);
    assert.ok(Array.isArray(parsed.plugin));
    assert.ok((parsed.plugin as unknown[]).includes("caveopen"));
    assert.ok((parsed.plugin as unknown[]).includes("other-plugin"));
    assert.strictEqual(parsed["theme"], "tokyonight");
    assert.strictEqual(parsed["$schema"], "https://opencode.ai/tui.json");
  });

  it("existing plugin key: preserves JSONC comments", () => {
    const raw = `{
  // tui config
  "theme": "dark",
  "plugin": ["x"] // plugins
}`;
    const out = applyTuiPlugin(raw, "caveopen");
    assert.ok(out.includes("// tui config"));
    assert.ok(out.includes("// plugins"));
    assert.ok(out.includes('"caveopen"'));
  });

  it("no plugin key: adds plugin array via JSON path", () => {
    const raw = `{"$schema":"https://opencode.ai/tui.json","theme":"dark"}`;
    const out = applyTuiPlugin(raw, "caveopen");
    const parsed = JSON.parse(out) as Record<string, unknown>;
    assert.deepStrictEqual(parsed.plugin, ["caveopen"]);
    assert.strictEqual(parsed["theme"], "dark");
  });

  it("no plugin key: modes form produces array entry", () => {
    const raw = `{"theme":"dark"}`;
    const entry = ["caveopen", { modes: "caveman" }];
    const out = applyTuiPlugin(raw, entry);
    const parsed = JSON.parse(out) as Record<string, unknown>;
    assert.deepStrictEqual(parsed.plugin, [["caveopen", { modes: "caveman" }]]);
  });

  it("idempotent: deduplicates existing caveopen string entry", () => {
    const raw = `{"plugin":["caveopen","other"]}`;
    const out = applyTuiPlugin(raw, "caveopen");
    const parsed = parseJsonc(out);
    const plugins = parsed.plugin as unknown[];
    assert.strictEqual(plugins.filter((e) => e === "caveopen").length, 1);
    assert.ok(plugins.includes("other"));
  });

  it("idempotent: deduplicates existing caveopen array entry", () => {
    const raw = `{"plugin":[["caveopen",{"modes":"caveman"}]]}`;
    const out = applyTuiPlugin(raw, ["caveopen", { modes: "cavekit" }]);
    const parsed = parseJsonc(out);
    const plugins = parsed.plugin as unknown[];
    assert.strictEqual(
      plugins.filter((e) => Array.isArray(e) && e[0] === "caveopen").length,
      1,
    );
    assert.deepStrictEqual(plugins[0], ["caveopen", { modes: "cavekit" }]);
  });

  it("mcp key NOT injected into tui output", () => {
    const raw = `{"plugin":[]}`;
    const out = applyTuiPlugin(raw, "caveopen");
    const parsed = parseJsonc(out);
    assert.ok(!("mcp" in parsed), "mcp must not appear in tui output");
  });

  it("output line format: scope:tui token", () => {
    const line = `${colorLabel("registered", false)}  ${blue("plugin", false)} caveopen → ${blue("global:tui", false)} plugin`;
    assert.strictEqual(line, "registered  plugin caveopen → global:tui plugin");
  });

  it("output line format: updated when tui already had caveopen", () => {
    const line = `${colorLabel("updated", false)}  ${blue("plugin", false)} caveopen → ${blue("project:tui", false)} plugin`;
    assert.strictEqual(line, "updated  plugin caveopen → project:tui plugin");
  });
});
