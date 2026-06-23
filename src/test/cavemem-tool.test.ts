import { describe, it, before, mock } from "node:test";
import assert from "node:assert/strict";

// V28: toolExecuteAfterHook ! use output.output || output.title (⊥ ??).
// Task/agent tools return output.output="" → ?? passes "" through; || falls back to title.

const hookCalls: Array<{ name: string; payload: Record<string, unknown> }> = [];

mock.module("../modules/cavemem/lib/runner.js", {
  namedExports: {
    runCavememHook: async (name: string, payload: Record<string, unknown>) => {
      hookCalls.push({ name, payload });
      return null;
    },
  },
});

mock.module("../modules/cavemem/lib/context.js", {
  namedExports: {
    hasSession: () => true,
    getCachedContext: () => undefined,
    setCachedContext: () => {},
    deleteCachedContext: () => {},
    getCavememSystemPriorContext: () => null,
  },
});

let toolExecuteAfterHook: (ctx: any) => (input: any, output: any) => Promise<void>;

const ctx = {
  directory: "/ctx",
  client: { session: { get: async () => ({ data: {} }) } },
};

const input = { sessionID: "ses_v28", tool: "test_tool", args: {} };

before(async () => {
  const mod = await import("../modules/cavemem/hooks/tool.js");
  toolExecuteAfterHook = mod.toolExecuteAfterHook;
});

describe("V28: tool_response uses || (⊥ ??)", () => {
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
