import { describe, it, before, mock } from "node:test";
import assert from "node:assert/strict";

// V27: handleSessionCreated fallback ! use ctx.directory (⊥ process.cwd()).

const hookCalls: Array<{ name: string; payload: Record<string, unknown> }> = [];

mock.module("../modules/cavemem/lib/runner.js", {
  namedExports: {
    runCavememHook: async (name: string, payload: Record<string, unknown>) => {
      hookCalls.push({ name, payload });
      return null;
    },
  },
});

let handleSessionCreated: (event: any, ctx: any) => Promise<void>;

before(async () => {
  const mod = await import("../modules/cavemem/hooks/session-init.js");
  handleSessionCreated = mod.handleSessionCreated;
});

function makeEvent(id: string, directory?: string) {
  return {
    type: "session.created",
    properties: { info: { id, directory } },
  };
}

describe("V27: handleSessionCreated uses ctx.directory when event.dir absent", () => {
  it("event.directory present → uses event.directory", async () => {
    hookCalls.length = 0;
    const ctx = { directory: "/ctx/dir" };
    await handleSessionCreated(makeEvent("ses_t22_a", "/event/dir"), ctx);
    const call = hookCalls.find((c) => c.payload.session_id === "ses_t22_a");
    assert.ok(call, "runCavememHook not called");
    assert.strictEqual(call.payload.cwd, "/event/dir");
  });

  it("V27: event.directory absent → ctx.directory (not process.cwd())", async () => {
    hookCalls.length = 0;
    const ctx = { directory: "/ctx/session/root" };
    await handleSessionCreated(makeEvent("ses_t22_b", undefined), ctx);
    const call = hookCalls.find((c) => c.payload.session_id === "ses_t22_b");
    assert.ok(call, "runCavememHook not called");
    assert.strictEqual(call.payload.cwd, "/ctx/session/root");
    assert.notStrictEqual(call.payload.cwd, process.cwd());
  });

  it("event.type !== session.created → no-op", async () => {
    hookCalls.length = 0;
    await handleSessionCreated({ type: "session.deleted", properties: { info: { id: "ses_t22_c" } } }, { directory: "/ctx" });
    const call = hookCalls.find((c) => c.payload.session_id === "ses_t22_c");
    assert.strictEqual(call, undefined);
  });

  it("no sessionID → no-op", async () => {
    hookCalls.length = 0;
    await handleSessionCreated(makeEvent(""), { directory: "/ctx" });
    assert.strictEqual(hookCalls.length, 0);
  });
});
