import { describe, it, before, mock } from "node:test";
import assert from "node:assert/strict";

// V27: cavemem eager-init fallback ! use ctx.directory (⊥ process.cwd()).

const initCalls: Array<{ sessionID: string; directory: string }> = [];

mock.module("../modules/cavemem/lib/runner.js", {
  namedExports: {
    runCavememHook: async () => null,
  },
});

mock.module("../modules/cavemem/hooks/session-init.js", {
  namedExports: {
    initSession: async (sessionID: string, directory: string) => {
      initCalls.push({ sessionID, directory });
    },
  },
});

let toolExecuteAfterHook: (ctx: any) => (input: any, output: any) => Promise<void>;

before(async () => {
  const mod = await import("../modules/cavemem/hooks/tool.js");
  toolExecuteAfterHook = mod.toolExecuteAfterHook;
});

function makeTool(sessionID: string, respDir: string | undefined, ctxDir: string) {
  return {
    ctx: {
      directory: ctxDir,
      client: {
        session: {
          get: async () => ({ data: { directory: respDir } }),
        },
      },
    },
    input: { sessionID, tool: "test_tool", args: {} },
    output: { output: null, title: "" },
  };
}

describe("V27: tool eager-init uses ctx.directory ⊥ process.cwd()", () => {
  it("uses resp.data.directory when present", async () => {
    initCalls.length = 0;
    const { ctx, input, output } = makeTool("ses_t27_1", "/resp/dir", "/ctx/dir");
    const handler = toolExecuteAfterHook(ctx);
    await handler(input, output);

    const call = initCalls.find((c) => c.sessionID === "ses_t27_1");
    assert.ok(call, "initSession not called");
    assert.strictEqual(call.directory, "/resp/dir");
  });

  it("V27: resp.data.directory absent → ctx.directory (not process.cwd())", async () => {
    initCalls.length = 0;
    const { ctx, input, output } = makeTool(
      "ses_t27_2",
      undefined,
      "/ctx/fallback/dir",
    );
    const handler = toolExecuteAfterHook(ctx);
    await handler(input, output);

    const call = initCalls.find((c) => c.sessionID === "ses_t27_2");
    assert.ok(call, "initSession not called");
    assert.strictEqual(call.directory, "/ctx/fallback/dir");
    assert.notStrictEqual(call.directory, process.cwd());
  });

  it("no sessionID → no initSession call", async () => {
    initCalls.length = 0;
    const ctx = { directory: "/ctx", client: { session: { get: async () => ({}) } } };
    const handler = toolExecuteAfterHook(ctx);
    await handler({ sessionID: undefined, tool: "t", args: {} }, { output: null, title: "" });
    assert.strictEqual(initCalls.length, 0);
  });

  it("client.session.get error → best-effort, no throw", async () => {
    initCalls.length = 0;
    const ctx = {
      directory: "/ctx",
      client: {
        session: {
          get: async () => { throw new Error("network error"); },
        },
      },
    };
    const handler = toolExecuteAfterHook(ctx);
    let threw = false;
    try {
      await handler({ sessionID: "ses_t27_3", tool: "t", args: {} }, { output: null, title: "" });
    } catch {
      threw = true;
    }
    assert.strictEqual(threw, false, "should not throw on client error");
  });
});
