import { describe, it, before, mock } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

// V9: runCavememHook: spawn err | empty stdout | bad JSON → null.
// V4: cavemem bin absent → ⊥ throw.
// V22: stdin error guard — ⊥ unhandled EPIPE.

type SpawnBehavior =
  | { type: "spawn-error"; err: Error }
  | { type: "close"; stdout: string }
  | { type: "stdin-error"; stdout: string; stdinErr: Error };

let spawnBehavior: SpawnBehavior = { type: "close", stdout: "" };

mock.module("node:child_process", {
  namedExports: {
    spawn: () => {
      const behavior = spawnBehavior;
      const stdout = new EventEmitter();
      const stdin = new EventEmitter() as NodeJS.WritableStream & EventEmitter;
      (stdin as any).write = () => true;
      (stdin as any).end = () => {};

      const proc = new EventEmitter() as any;
      proc.stdout = stdout;
      proc.stdin = stdin;

      // Schedule events after current tick so listeners have time to attach
      setTimeout(() => {
        if (behavior.type === "spawn-error") {
          proc.emit("error", behavior.err);
        } else if (behavior.type === "close") {
          if (behavior.stdout) stdout.emit("data", Buffer.from(behavior.stdout));
          proc.emit("close");
        } else if (behavior.type === "stdin-error") {
          if (behavior.stdout)
            stdout.emit("data", Buffer.from(behavior.stdout));
          stdin.emit("error", behavior.stdinErr);
          proc.emit("close");
        }
      }, 0);

      return proc;
    },
  },
});

let runCavememHook: (
  name: string,
  payload: object,
) => Promise<string | null>;

before(async () => {
  const mod = await import("../modules/cavemem/lib/runner.js");
  runCavememHook = mod.runCavememHook;
});

describe("V9: runCavememHook spawn/empty/parse fallbacks", () => {
  it("spawn error → null", async () => {
    spawnBehavior = {
      type: "spawn-error",
      err: new Error("ENOENT: cavemem not found"),
    };
    assert.strictEqual(
      await runCavememHook("session-start", { session_id: "x" }),
      null,
    );
  });

  it("empty stdout → null", async () => {
    spawnBehavior = { type: "close", stdout: "" };
    assert.strictEqual(
      await runCavememHook("session-start", { session_id: "x" }),
      null,
    );
  });

  it("whitespace-only stdout → null", async () => {
    spawnBehavior = { type: "close", stdout: "   \n  " };
    assert.strictEqual(
      await runCavememHook("session-start", { session_id: "x" }),
      null,
    );
  });

  it("bad JSON → null", async () => {
    spawnBehavior = { type: "close", stdout: "not-json" };
    assert.strictEqual(
      await runCavememHook("session-start", { session_id: "x" }),
      null,
    );
  });

  it("valid JSON with additionalContext → returns it", async () => {
    spawnBehavior = {
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
    spawnBehavior = {
      type: "close",
      stdout: JSON.stringify({ hookSpecificOutput: {} }),
    };
    assert.strictEqual(
      await runCavememHook("session-start", { session_id: "x" }),
      null,
    );
  });

  it("null additionalContext → null", async () => {
    spawnBehavior = {
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
    spawnBehavior = {
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
    spawnBehavior = {
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
