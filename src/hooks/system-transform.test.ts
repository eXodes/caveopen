import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { combinedSystemTransform } from "./system-transform.js";
import { mergeHooks } from "../lib/merge-hooks.js";

// combined path → single output.system.push() (one system slot).
// push only when at least one provider returns non-null.
// caveopen.ts overwrites merged transform key to prevent double-push.

describe("combinedSystemTransform single-slot + skip-empty", () => {
  it("single provider → one push", async () => {
    const transform = combinedSystemTransform([() => "ruleset"]);
    const system: string[] = [];
    await transform({ sessionID: "ses_test" } as any, { system } as any);
    assert.strictEqual(system.length, 1);
    assert.strictEqual(system[0], "ruleset");
  });

  it("multiple providers → single push with joined content", async () => {
    const transform = combinedSystemTransform([() => "a", () => "b"]);
    const system: string[] = [];
    await transform({ sessionID: "ses_test" } as any, { system } as any);
    assert.strictEqual(system.length, 1);
    assert.strictEqual(system[0], "a\n\nb");
  });

  it("all null providers → no push", async () => {
    const transform = combinedSystemTransform([() => null, () => null]);
    const system: string[] = [];
    await transform({ sessionID: "ses_test" } as any, { system } as any);
    assert.strictEqual(system.length, 0);
  });

  it("mix null + non-null → push only non-null", async () => {
    const transform = combinedSystemTransform([
      () => null,
      () => "content",
      () => null,
    ]);
    const system: string[] = [];
    await transform({ sessionID: "ses_test" } as any, { system } as any);
    assert.strictEqual(system.length, 1);
    assert.strictEqual(system[0], "content");
  });

  it("empty providers array → no push", async () => {
    const transform = combinedSystemTransform([]);
    const system: string[] = [];
    await transform({ sessionID: "ses_test" } as any, { system } as any);
    assert.strictEqual(system.length, 0);
  });

  it("provider receives sessionID", async () => {
    let receivedSID: string | undefined;
    const transform = combinedSystemTransform([
      (sid) => {
        receivedSID = sid;
        return "content";
      },
    ]);
    await transform({ sessionID: "ses_abc" } as any, { system: [] } as any);
    assert.strictEqual(receivedSID, "ses_abc");
  });
});

describe("combinedSystemTransform overwrites merged transform — ⊥ double-push", () => {
  it("mergeHooks alone double-pushes; overwrite prevents it", async () => {
    const merged = mergeHooks(
      {
        "experimental.chat.system.transform": async (_i: any, output: any) => {
          output.system.push("a");
        },
      } as any,
      {
        "experimental.chat.system.transform": async (_i: any, output: any) => {
          output.system.push("b");
        },
      } as any,
    );

    // Without overwrite: merged handler double-pushes
    const systemBefore: string[] = [];
    await (merged as any)["experimental.chat.system.transform"](
      {},
      { system: systemBefore },
    );
    assert.strictEqual(systemBefore.length, 2);

    // After overwrite with combinedSystemTransform: single push
    (merged as Record<string, unknown>)["experimental.chat.system.transform"] =
      combinedSystemTransform([() => "a", () => "b"]);
    const systemAfter: string[] = [];
    await (merged as any)["experimental.chat.system.transform"](
      { sessionID: "test" },
      { system: systemAfter },
    );
    assert.strictEqual(systemAfter.length, 1);
    assert.strictEqual(systemAfter[0], "a\n\nb");
  });
});
