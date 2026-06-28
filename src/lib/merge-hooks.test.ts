import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { mergeHooks } from "./merge-hooks.js";

// mergeHooks merges all same-key handlers into an array, running them sequentially.

describe("mergeHooks fan-in sequential", () => {
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
      { "command.execute.before": async () => { calls.push("cmd"); } } as any,
    );
    await (merged as any).event();
    assert.deepStrictEqual(calls, ["event"]);
  });

  it("unique-key handlers pass through", async () => {
    const called: string[] = [];
    const merged = mergeHooks(
      { event: async () => { called.push("a"); } } as any,
      { "chat.message": async () => { called.push("b"); } } as any,
    );
    await (merged as any)["chat.message"]();
    assert.deepStrictEqual(called, ["b"]);
  });

  it("empty hookSets → empty merged", () => {
    const merged = mergeHooks();
    assert.deepStrictEqual(Object.keys(merged), []);
  });
});
