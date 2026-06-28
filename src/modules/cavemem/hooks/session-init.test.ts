import { describe, it, beforeAll, afterAll, vi } from "vitest";
import assert from "node:assert/strict";

// initSession: already-initialized session → no-op. Concurrent callers share pending promise.
// handleSessionCreated fallback must use ctx.directory, not process.cwd().
// cavemem eager-init (tool hook) fallback must use ctx.directory, not process.cwd().

const { runnerState, runCavememHook } = vi.hoisted(() => {
  const hookCalls: Array<{ name: string; payload: object }> = [];
  const blockState = { enabled: false };
  const hookResolvers: Array<() => void> = [];
  const returnValue = { current: null as string | null };

  const runCavememHook = vi.fn(async (name: string, payload: object) => {
    hookCalls.push({ name, payload });
    if (blockState.enabled) {
      await new Promise<void>((r) => hookResolvers.push(r));
    }
    return returnValue.current;
  });

  return { runnerState: { hookCalls, blockState, hookResolvers, returnValue }, runCavememHook };
});

vi.mock("../lib/runner.js", () => ({ runCavememHook }));

// ─── Section A: initSession ───────────────────────────────────────────────────

describe("initSession pending dedup + hasSession no-op", () => {
  let initSession: (sessionID: string, directory: string) => Promise<void>;
  let hasSession: (sessionID: string) => boolean;
  let getCachedContext: (sessionID: string) => string | undefined;

  beforeAll(async () => {
    runnerState.returnValue.current = "prior context";
    const sessionMod = await import("./session-init.js");
    const contextMod = await import("../lib/context.js");
    initSession = sessionMod.initSession;
    hasSession = contextMod.hasSession;
    getCachedContext = contextMod.getCachedContext;
  });

  it("sets context after successful init", async () => {
    runnerState.hookCalls.length = 0;
    await initSession("ses_v8_fresh", "/dir");
    assert.strictEqual(runnerState.hookCalls.length, 1);
    assert.strictEqual(getCachedContext("ses_v8_fresh"), "prior context");
  });

  it("hasSession → no-op resolve, no hook call", async () => {
    runnerState.hookCalls.length = 0;
    await initSession("ses_v8_fresh", "/dir");
    assert.strictEqual(runnerState.hookCalls.length, 0);
  });

  it("concurrent callers share pending promise — single hook call", async () => {
    runnerState.hookCalls.length = 0;
    runnerState.blockState.enabled = true;
    runnerState.hookResolvers.length = 0;

    const p1 = initSession("ses_v8_concurrent", "/dir");
    const p2 = initSession("ses_v8_concurrent", "/dir");

    assert.strictEqual(runnerState.hookCalls.length, 1);

    runnerState.hookResolvers.forEach((r) => r());
    await Promise.all([p1, p2]);

    assert.strictEqual(runnerState.hookCalls.length, 1);
    runnerState.blockState.enabled = false;
  });

  it("null hook result → string cached (not null)", async () => {
    runnerState.hookCalls.length = 0;
    await initSession("ses_v8_null_check", "/dir");
    assert.ok(typeof getCachedContext("ses_v8_null_check") === "string");
  });
});

// ─── Section B: handleSessionCreated ─────────────────────────────────────────

describe("handleSessionCreated uses ctx.directory when event.dir absent", () => {
  let handleSessionCreated: (event: any, ctx: any) => Promise<void>;

  beforeAll(async () => {
    runnerState.returnValue.current = null;
    runnerState.hookCalls.length = 0;
    const mod = await import("./session-init.js");
    handleSessionCreated = mod.handleSessionCreated;
  });

  function makeEvent(id: string, directory?: string) {
    return {
      type: "session.created",
      properties: { info: { id, directory } },
    };
  }

  it("event.directory present → uses event.directory", async () => {
    runnerState.hookCalls.length = 0;
    const ctx = { directory: "/ctx/dir" };
    await handleSessionCreated(makeEvent("ses_t22_a", "/event/dir"), ctx);
    const call = runnerState.hookCalls.find(
      (c) => (c.payload as any).session_id === "ses_t22_a",
    );
    assert.ok(call, "runCavememHook not called");
    assert.strictEqual((call.payload as any).cwd, "/event/dir");
  });

  it("event.directory absent → ctx.directory (not process.cwd())", async () => {
    runnerState.hookCalls.length = 0;
    const ctx = { directory: "/ctx/session/root" };
    await handleSessionCreated(makeEvent("ses_t22_b", undefined), ctx);
    const call = runnerState.hookCalls.find(
      (c) => (c.payload as any).session_id === "ses_t22_b",
    );
    assert.ok(call, "runCavememHook not called");
    assert.strictEqual((call.payload as any).cwd, "/ctx/session/root");
    assert.notStrictEqual((call.payload as any).cwd, process.cwd());
  });

  it("event.type !== session.created → no-op", async () => {
    runnerState.hookCalls.length = 0;
    await handleSessionCreated(
      { type: "session.deleted", properties: { info: { id: "ses_t22_c" } } },
      { directory: "/ctx" },
    );
    const call = runnerState.hookCalls.find(
      (c) => (c.payload as any).session_id === "ses_t22_c",
    );
    assert.strictEqual(call, undefined);
  });

  it("no sessionID → no-op", async () => {
    runnerState.hookCalls.length = 0;
    await handleSessionCreated(makeEvent(""), { directory: "/ctx" });
    assert.strictEqual(runnerState.hookCalls.length, 0);
  });
});

// ─── Section C: tool eager-init (isolated modules) ───────────────────────────

describe("tool eager-init uses ctx.directory ⊥ process.cwd()", () => {
  const initCalls: Array<{ sessionID: string; directory: string }> = [];
  let toolExecuteAfterHook: (ctx: any) => (input: any, output: any) => Promise<void>;

  beforeAll(async () => {
    vi.resetModules();
    vi.doMock("./session-init.js", () => ({
      initSession: async (sessionID: string, directory: string) => {
        initCalls.push({ sessionID, directory });
      },
    }));
    runCavememHook.mockImplementation(async () => null);
    const mod = await import("./tool.js");
    toolExecuteAfterHook = mod.toolExecuteAfterHook;
  });

  afterAll(() => {
    vi.resetModules();
  });

  function makeTool(sessionID: string, respDir: string | undefined, ctxDir: string) {
    return {
      ctx: {
        directory: ctxDir,
        client: {
          session: { get: async () => ({ data: { directory: respDir } }) },
        },
      },
      input: { sessionID, tool: "test_tool", args: {} },
      output: { output: null, title: "" },
    };
  }

  it("uses resp.data.directory when present", async () => {
    initCalls.length = 0;
    const { ctx, input, output } = makeTool("ses_t27_1", "/resp/dir", "/ctx/dir");
    await toolExecuteAfterHook(ctx)(input, output);
    const call = initCalls.find((c) => c.sessionID === "ses_t27_1");
    assert.ok(call, "initSession not called");
    assert.strictEqual(call.directory, "/resp/dir");
  });

  it("resp.data.directory absent → ctx.directory (not process.cwd())", async () => {
    initCalls.length = 0;
    const { ctx, input, output } = makeTool("ses_t27_2", undefined, "/ctx/fallback/dir");
    await toolExecuteAfterHook(ctx)(input, output);
    const call = initCalls.find((c) => c.sessionID === "ses_t27_2");
    assert.ok(call, "initSession not called");
    assert.strictEqual(call.directory, "/ctx/fallback/dir");
    assert.notStrictEqual(call.directory, process.cwd());
  });

  it("no sessionID → no initSession call", async () => {
    initCalls.length = 0;
    const ctx = { directory: "/ctx", client: { session: { get: async () => ({}) } } };
    await toolExecuteAfterHook(ctx)(
      { sessionID: undefined, tool: "t", args: {} },
      { output: null, title: "" },
    );
    assert.strictEqual(initCalls.length, 0);
  });

  it("client.session.get error → best-effort, no throw", async () => {
    initCalls.length = 0;
    const ctx = {
      directory: "/ctx",
      client: { session: { get: async () => { throw new Error("network error"); } } },
    };
    let threw = false;
    try {
      await toolExecuteAfterHook(ctx)(
        { sessionID: "ses_t27_3", tool: "t", args: {} },
        { output: null, title: "" },
      );
    } catch {
      threw = true;
    }
    assert.strictEqual(threw, false, "should not throw on client error");
  });
});
