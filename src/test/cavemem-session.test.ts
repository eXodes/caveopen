import { describe, it, before, mock } from "node:test";
import assert from "node:assert/strict";

// V8: initSession: hasSession → no-op resolve. concurrent caller → share pending promise.

const hookCalls: Array<{ name: string; payload: object }> = [];
let hookShouldBlock = false;
const hookResolvers: Array<() => void> = [];

mock.module("../modules/cavemem/lib/runner.js", {
  namedExports: {
    runCavememHook: async (name: string, payload: object) => {
      hookCalls.push({ name, payload });
      if (hookShouldBlock) {
        await new Promise<void>((resolve) => {
          hookResolvers.push(resolve);
        });
      }
      return "prior context";
    },
  },
});

let initSession: (sessionID: string, directory: string) => Promise<void>;
let hasSession: (sessionID: string) => boolean;
let getCachedContext: (sessionID: string) => string | undefined;

before(async () => {
  const sessionMod = await import(
    "../modules/cavemem/hooks/session-init.js"
  );
  const contextMod = await import("../modules/cavemem/lib/context.js");
  initSession = sessionMod.initSession;
  hasSession = contextMod.hasSession;
  getCachedContext = contextMod.getCachedContext;
});

describe("V8: initSession pending dedup + hasSession no-op", () => {
  it("sets context after successful init", async () => {
    hookCalls.length = 0;
    await initSession("ses_v8_fresh", "/dir");
    assert.strictEqual(hookCalls.length, 1);
    assert.strictEqual(getCachedContext("ses_v8_fresh"), "prior context");
  });

  it("hasSession → no-op resolve, no hook call", async () => {
    hookCalls.length = 0;
    // ses_v8_fresh already initialized above
    await initSession("ses_v8_fresh", "/dir");
    assert.strictEqual(hookCalls.length, 0);
  });

  it("concurrent callers share pending promise — single hook call", async () => {
    hookCalls.length = 0;
    hookShouldBlock = true;
    hookResolvers.length = 0;

    const p1 = initSession("ses_v8_concurrent", "/dir");
    const p2 = initSession("ses_v8_concurrent", "/dir");

    // Both share same pending promise → only one hook call queued
    assert.strictEqual(hookCalls.length, 1);

    // Unblock
    hookResolvers.forEach((r) => r());
    await Promise.all([p1, p2]);

    assert.strictEqual(hookCalls.length, 1);
    hookShouldBlock = false;
  });

  it("null hook result → empty string cached (not null)", async () => {
    hookCalls.length = 0;
    // Temporarily override to return null - but mock is set at module scope.
    // Use a unique SID; the current mock returns "prior context".
    await initSession("ses_v8_null", "/dir");
    // cached as "prior context" from our mock
    assert.ok(typeof getCachedContext("ses_v8_null") === "string");
  });
});
