import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeHooks } from "../lib/merge-hooks.js";

// V2: mergeHooks merges ALL same-key handlers → array, run sequential.

describe("V2: mergeHooks fan-in sequential", () => {
  it("same-key handlers both run in order", async () => {
    const order: number[] = [];
    const merged = mergeHooks(
      { event: async () => { order.push(1); } } as any,
      { event: async () => { order.push(2); } } as any,
    );
    await (merged as any).event();
    assert.deepStrictEqual(order, [1, 2]);
  });

  it("three handlers run sequentially", async () => {
    const order: number[] = [];
    const merged = mergeHooks(
      { "command.execute.before": async () => { order.push(1); } } as any,
      { "command.execute.before": async () => { order.push(2); } } as any,
      { "command.execute.before": async () => { order.push(3); } } as any,
    );
    await (merged as any)["command.execute.before"]();
    assert.deepStrictEqual(order, [1, 2, 3]);
  });

  it("different keys stay independent", async () => {
    const calls: string[] = [];
    const merged = mergeHooks(
      { event: async () => { calls.push("event"); } } as any,
      { "chat.message": async () => { calls.push("chat"); } } as any,
    );
    await (merged as any).event();
    assert.deepStrictEqual(calls, ["event"]);
  });

  it("experimental.chat.system.transform also merged", async () => {
    const calls: number[] = [];
    const merged = mergeHooks(
      { "experimental.chat.system.transform": async () => { calls.push(1); } } as any,
      { "experimental.chat.system.transform": async () => { calls.push(2); } } as any,
    );
    await (merged as any)["experimental.chat.system.transform"]();
    assert.deepStrictEqual(calls, [1, 2]);
  });

  it("non-function values skipped", () => {
    const merged = mergeHooks(
      { event: async () => {} } as any,
      { badKey: "not-a-function" } as any,
    );
    assert.strictEqual(typeof (merged as any).event, "function");
    assert.strictEqual((merged as any).badKey, undefined);
  });

  it("passes args to each handler", async () => {
    const received: unknown[][] = [];
    const merged = mergeHooks(
      { event: async (...args: unknown[]) => { received.push([...args]); } } as any,
      { event: async (...args: unknown[]) => { received.push([...args]); } } as any,
    );
    await (merged as any).event("a", 42);
    assert.deepStrictEqual(received, [["a", 42], ["a", 42]]);
  });

  it("single hookset works", async () => {
    const calls: number[] = [];
    const merged = mergeHooks(
      { event: async () => { calls.push(1); } } as any,
    );
    await (merged as any).event();
    assert.deepStrictEqual(calls, [1]);
  });
});
