import { describe, it, before, mock } from "node:test";
import assert from "node:assert/strict";

// V30: parts.length > 0 → splice ignored stats + synthetic blocker (2 parts total). ⊥ model runs.
// V31: splice ! reuse output.parts[0].id for stats; output.parts[0].messageID for both. ⊥ fresh messageId().
// V32: parts.length === 0 → push exactly 1 part; ignored ⊥ set, synthetic ⊥ set.

mock.module("../modules/caveman/lib/tokens.js", {
  namedExports: {
    getSessionTokens: async () => null,
  },
});

mock.module("node:fs", {
  namedExports: {
    existsSync: () => false,
    mkdirSync: () => {},
    readFileSync: () => "",
    writeFileSync: () => {},
    unlinkSync: () => {},
    appendFileSync: () => {},
  },
});

let commandExecuteBeforeHook: (ctx: any) => (input: any, output: any) => Promise<void>;

before(async () => {
  const mod = await import("../modules/caveman/hooks/commands.js");
  commandExecuteBeforeHook = mod.commandExecuteBeforeHook;
});

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
