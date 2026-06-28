import { describe, it, beforeAll, vi } from "vitest";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

// V9: runCavememHook: spawn err | empty stdout | bad JSON → null.
// V4: cavemem bin absent → ⊥ throw.
// V22: stdin error guard — ⊥ unhandled EPIPE.

type SpawnBehavior =
  | { type: "spawn-error"; err: Error }
  | { type: "close"; stdout: string }
  | { type: "stdin-error"; stdout: string; stdinErr: Error };

const { spawnState, spawn } = vi.hoisted(() => {
  const spawnState = { behavior: { type: "close", stdout: "" } as SpawnBehavior };

  const spawn = vi.fn(() => {
    const behavior = spawnState.behavior;
    const stdout = new EventEmitter();
    const stdin = new EventEmitter() as NodeJS.WritableStream & EventEmitter;
    (stdin as any).write = () => true;
    (stdin as any).end = () => {};

    const proc = new EventEmitter() as any;
    proc.stdout = stdout;
    proc.stdin = stdin;

    setTimeout(() => {
      if (behavior.type === "spawn-error") {
        proc.emit("error", behavior.err);
      } else if (behavior.type === "close") {
        if (behavior.stdout) stdout.emit("data", Buffer.from(behavior.stdout));
        proc.emit("close");
      } else if (behavior.type === "stdin-error") {
        if (behavior.stdout) stdout.emit("data", Buffer.from(behavior.stdout));
        stdin.emit("error", behavior.stdinErr);
        proc.emit("close");
      }
    }, 0);

    return proc;
  });

  return { spawnState, spawn };
});

vi.mock("node:child_process", () => ({ spawn }));

let runCavememHook: (name: string, payload: object) => Promise<string | null>;

beforeAll(async () => {
  const mod = await import("./runner.js");
  runCavememHook = mod.runCavememHook;
});

describe("V9: runCavememHook spawn/empty/parse fallbacks", () => {
  it("spawn error → null", async () => {
    spawnState.behavior = {
      type: "spawn-error",
      err: new Error("ENOENT: cavemem not found"),
    };
    assert.strictEqual(
      await runCavememHook("session-start", { session_id: "x" }),
      null,
    );
  });

  it("empty stdout → null", async () => {
    spawnState.behavior = { type: "close", stdout: "" };
    assert.strictEqual(
      await runCavememHook("session-start", { session_id: "x" }),
      null,
    );
  });

  it("whitespace-only stdout → null", async () => {
    spawnState.behavior = { type: "close", stdout: "   \n  " };
    assert.strictEqual(
      await runCavememHook("session-start", { session_id: "x" }),
      null,
    );
  });

  it("bad JSON → null", async () => {
    spawnState.behavior = { type: "close", stdout: "not-json" };
    assert.strictEqual(
      await runCavememHook("session-start", { session_id: "x" }),
      null,
    );
  });

  it("valid JSON with additionalContext → returns it", async () => {
    spawnState.behavior = {
      type: "close",
      stdout: JSON.stringify({
        hookSpecificOutput: { additionalContext: "prior ctx" },
      }),
    };
    assert.strictEqual(
      await runCavememHook("session-start", { session_id: "x" }),
      "prior ctx",
    );
  });

  it("valid JSON without additionalContext → null", async () => {
    spawnState.behavior = {
      type: "close",
      stdout: JSON.stringify({ hookSpecificOutput: {} }),
    };
    assert.strictEqual(
      await runCavememHook("session-start", { session_id: "x" }),
      null,
    );
  });

  it("null additionalContext → null", async () => {
    spawnState.behavior = {
      type: "close",
      stdout: JSON.stringify({
        hookSpecificOutput: { additionalContext: null },
      }),
    };
    assert.strictEqual(
      await runCavememHook("session-start", { session_id: "x" }),
      null,
    );
  });
});

describe("V4/V22: cavemem absence + stdin-error guard", () => {
  it("V4: ENOENT → null, no throw", async () => {
    spawnState.behavior = {
      type: "spawn-error",
      err: Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    };
    let threw = false;
    let result: string | null = "sentinel";
    try {
      result = await runCavememHook("session-start", { session_id: "x" });
    } catch {
      threw = true;
    }
    assert.strictEqual(threw, false);
    assert.strictEqual(result, null);
  });

  it("V22: stdin EPIPE → null, no unhandled throw", async () => {
    spawnState.behavior = {
      type: "stdin-error",
      stdout: "",
      stdinErr: Object.assign(new Error("EPIPE"), { code: "EPIPE" }),
    };
    let threw = false;
    let result: string | null = "sentinel";
    try {
      result = await runCavememHook("session-start", { session_id: "x" });
    } catch {
      threw = true;
    }
    assert.strictEqual(threw, false);
    assert.strictEqual(result, null);
  });
});
