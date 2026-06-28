import { describe, it, beforeAll, vi } from "vitest";
import assert from "node:assert/strict";

// toolExecuteAfterHook must use output.output || output.title, not nullish coalescing.
// Task/agent tools return output.output="" → ?? passes "" through; || falls back to title.

const { hookCalls, runCavememHook } = vi.hoisted(() => {
  const hookCalls: Array<{ name: string; payload: Record<string, unknown> }> = [];
  const runCavememHook = vi.fn(async (name: string, payload: Record<string, unknown>) => {
    hookCalls.push({ name, payload });
    return null;
  });
  return { hookCalls, runCavememHook };
});

vi.mock("../lib/runner.js", () => ({ runCavememHook }));

vi.mock("../lib/context.js", () => ({
  hasSession: vi.fn(() => true),
  getCachedContext: vi.fn(() => undefined),
  setCachedContext: vi.fn(),
  deleteCachedContext: vi.fn(),
  getCavememSystemPriorContext: vi.fn(() => null),
}));

let toolExecuteAfterHook: (ctx: any) => (input: any, output: any) => Promise<void>;

const ctx = {
  directory: "/ctx",
  client: { session: { get: async () => ({ data: {} }) } },
};

const input = { sessionID: "ses_v28", tool: "test_tool", args: {} };

beforeAll(async () => {
  const mod = await import("./tool.js");
  toolExecuteAfterHook = mod.toolExecuteAfterHook;
});

describe("tool_response uses || (⊥ ??)", () => {
  it("output.output='' → falls back to output.title", async () => {
    hookCalls.length = 0;
    const handler = toolExecuteAfterHook(ctx);
    await handler(input, { output: "", title: "Task completed" });
    const call = hookCalls.find((c) => c.name === "post-tool-use");
    assert.ok(call, "runCavememHook not called");
    assert.strictEqual(call.payload.tool_response, "Task completed");
  });

  it("output.output='result text' → uses output.output", async () => {
    hookCalls.length = 0;
    const handler = toolExecuteAfterHook(ctx);
    await handler(input, { output: "result text", title: "ignored title" });
    const call = hookCalls.find((c) => c.name === "post-tool-use");
    assert.ok(call, "runCavememHook not called");
    assert.strictEqual(call.payload.tool_response, "result text");
  });

  it("output.output=null → falls back to output.title", async () => {
    hookCalls.length = 0;
    const handler = toolExecuteAfterHook(ctx);
    await handler(input, { output: null, title: "fallback title" });
    const call = hookCalls.find((c) => c.name === "post-tool-use");
    assert.ok(call, "runCavememHook not called");
    assert.strictEqual(call.payload.tool_response, "fallback title");
  });
});
