import { describe, it, beforeAll, vi } from "vitest";
import assert from "node:assert/strict";
import { parseCavemanArg } from "./commands.js";

// V24: /caveman mode switch ! backed by command.execute.before handler.
// V30: parts.length > 0 → splice ignored stats + synthetic blocker.
// V31: splice ! reuse output.parts[0].id for stats; output.parts[0].messageID for both.
// V32: parts.length === 0 → push exactly 1 part; ignored ⊥ set, synthetic ⊥ set.

vi.mock("../lib/tokens.js", () => ({
  getSessionTokens: vi.fn(async () => null),
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => ""),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    appendFileSync: vi.fn(),
  };
});

let commandExecuteBeforeHook: (ctx: any) => (input: any, output: any) => Promise<void>;

beforeAll(async () => {
  const mod = await import("./commands.js");
  commandExecuteBeforeHook = mod.commandExecuteBeforeHook;
});

// ─── V24: parseCavemanArg ─────────────────────────────────────────────────────

describe("V24: parseCavemanArg — /caveman command.execute.before mode dispatch", () => {
  it("no args → full (default)", () => {
    assert.strictEqual(parseCavemanArg(undefined), "full");
    assert.strictEqual(parseCavemanArg(""), "full");
    assert.strictEqual(parseCavemanArg("  "), "full");
  });

  it("explicit full → full (via isValidMode, not special case)", () => {
    assert.strictEqual(parseCavemanArg("full"), "full");
    assert.strictEqual(parseCavemanArg("FULL"), "full");
  });

  it("lite → lite", () => {
    assert.strictEqual(parseCavemanArg("lite"), "lite");
  });

  it("ultra → ultra", () => {
    assert.strictEqual(parseCavemanArg("ultra"), "ultra");
  });

  it("wenyan variants → pass through", () => {
    assert.strictEqual(parseCavemanArg("wenyan-lite"), "wenyan-lite");
    assert.strictEqual(parseCavemanArg("wenyan-full"), "wenyan-full");
    assert.strictEqual(parseCavemanArg("wenyan-ultra"), "wenyan-ultra");
  });

  it("off → off (triggers removeModeFlag)", () => {
    assert.strictEqual(parseCavemanArg("off"), "off");
    assert.strictEqual(parseCavemanArg("OFF"), "off");
  });

  it("invalid arg → null (no-op, no flag write)", () => {
    assert.strictEqual(parseCavemanArg("bogus"), null);
    assert.strictEqual(parseCavemanArg("on"), null);
    assert.strictEqual(parseCavemanArg("medium"), null);
  });

  it("trims whitespace before matching", () => {
    assert.strictEqual(parseCavemanArg("  lite  "), "lite");
    assert.strictEqual(parseCavemanArg(" off "), "off");
  });
});

// ─── V30/V31/V32: caveman-stats hook splice ───────────────────────────────────

const SID = "ses_stats_hook_test";
const CTX = { directory: "/tmp/caveman-test", client: {} };

function makeInput(args?: string) {
  return { command: "caveman-stats", sessionID: SID, arguments: args };
}

function makeParts() {
  return [
    {
      id: "part_orig",
      messageID: "msg_orig",
      sessionID: SID,
      type: "text" as const,
      text: "placeholder",
    },
  ];
}

describe("V30: parts.length > 0 → splice 2 parts: ignored stats + synthetic blocker", () => {
  it("output has exactly 2 parts after splice", async () => {
    const handler = commandExecuteBeforeHook(CTX as any);
    const output = { parts: makeParts() };
    await handler(makeInput(), output);
    assert.strictEqual(output.parts.length, 2);
  });

  it("first part has ignored: true", async () => {
    const handler = commandExecuteBeforeHook(CTX as any);
    const output = { parts: makeParts() };
    await handler(makeInput(), output);
    assert.strictEqual((output.parts[0] as any).ignored, true);
  });

  it("second part has synthetic: true", async () => {
    const handler = commandExecuteBeforeHook(CTX as any);
    const output = { parts: makeParts() };
    await handler(makeInput(), output);
    assert.strictEqual((output.parts[1] as any).synthetic, true);
  });

  it("first part has non-empty stats text", async () => {
    const handler = commandExecuteBeforeHook(CTX as any);
    const output = { parts: makeParts() };
    await handler(makeInput(), output);
    assert.ok(((output.parts[0] as any).text ?? "").length > 0);
  });
});

describe("V31: splice reuses original id and messageID — ⊥ fresh messageId()", () => {
  it("stats part reuses output.parts[0].id", async () => {
    const handler = commandExecuteBeforeHook(CTX as any);
    const parts = makeParts();
    const output = { parts };
    await handler(makeInput(), output);
    assert.strictEqual((output.parts[0] as any).id, "part_orig");
  });

  it("stats part reuses output.parts[0].messageID", async () => {
    const handler = commandExecuteBeforeHook(CTX as any);
    const parts = makeParts();
    const output = { parts };
    await handler(makeInput(), output);
    assert.strictEqual((output.parts[0] as any).messageID, "msg_orig");
  });

  it("blocker part reuses output.parts[0].messageID", async () => {
    const handler = commandExecuteBeforeHook(CTX as any);
    const parts = makeParts();
    const output = { parts };
    await handler(makeInput(), output);
    assert.strictEqual((output.parts[1] as any).messageID, "msg_orig");
  });
});

describe("V32: empty-parts fallback → exactly 1 part, no ignored/synthetic", () => {
  it("pushes exactly 1 part", async () => {
    const handler = commandExecuteBeforeHook(CTX as any);
    const output = { parts: [] as any[] };
    await handler(makeInput(), output);
    assert.strictEqual(output.parts.length, 1);
  });

  it("pushed part has no ignored flag", async () => {
    const handler = commandExecuteBeforeHook(CTX as any);
    const output = { parts: [] as any[] };
    await handler(makeInput(), output);
    assert.strictEqual((output.parts[0] as any).ignored, undefined);
  });

  it("pushed part has no synthetic flag", async () => {
    const handler = commandExecuteBeforeHook(CTX as any);
    const output = { parts: [] as any[] };
    await handler(makeInput(), output);
    assert.strictEqual((output.parts[0] as any).synthetic, undefined);
  });

  it("pushed part has non-empty text", async () => {
    const handler = commandExecuteBeforeHook(CTX as any);
    const output = { parts: [] as any[] };
    await handler(makeInput(), output);
    assert.ok(((output.parts[0] as any).text ?? "").length > 0);
  });
});
