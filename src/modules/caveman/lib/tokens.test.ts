import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { getSessionTokens } from "./tokens.js";

// V12: getSessionTokens sum assistant msgs only. output==0 → null.

function makeMsg(
  role: string,
  input: number,
  output: number,
  cost: number,
  cacheRead = 0,
  cacheWrite = 0,
) {
  return {
    info: {
      role,
      tokens: { input, output, cache: { read: cacheRead, write: cacheWrite } },
      cost,
      modelID: "claude-3",
      providerID: "anthropic",
    },
  };
}

function makeClient(msgs: ReturnType<typeof makeMsg>[]) {
  return {
    session: {
      messages: async () => ({ data: msgs }),
    },
  } as any;
}

describe("V12: getSessionTokens assistant-only + null", () => {
  it("sums only assistant messages", async () => {
    const client = makeClient([
      makeMsg("assistant", 100, 50, 0.001),
      makeMsg("user", 200, 0, 0),
      makeMsg("assistant", 150, 75, 0.002),
    ]);
    const result = await getSessionTokens(client, "ses_test");
    assert.ok(result);
    assert.strictEqual(result.input, 250);
    assert.strictEqual(result.output, 125);
    assert.ok(Math.abs(result.cost - 0.003) < 0.000001);
  });

  it("output==0 → null", async () => {
    const client = makeClient([makeMsg("assistant", 100, 0, 0)]);
    assert.strictEqual(await getSessionTokens(client, "ses_test"), null);
  });

  it("empty messages → null", async () => {
    const client = makeClient([]);
    assert.strictEqual(await getSessionTokens(client, "ses_test"), null);
  });

  it("user-only messages → null (no assistant output)", async () => {
    const client = makeClient([makeMsg("user", 100, 0, 0)]);
    assert.strictEqual(await getSessionTokens(client, "ses_test"), null);
  });

  it("client error → null", async () => {
    const client = {
      session: {
        messages: async () => {
          throw new Error("network error");
        },
      },
    } as any;
    assert.strictEqual(await getSessionTokens(client, "ses_test"), null);
  });

  it("cache tokens summed from assistant msgs only", async () => {
    const client = makeClient([
      makeMsg("assistant", 10, 5, 0, 100, 50),
      makeMsg("user", 10, 0, 0, 999, 999),
      makeMsg("assistant", 10, 5, 0, 200, 0),
    ]);
    const result = await getSessionTokens(client, "ses_test");
    assert.ok(result);
    assert.strictEqual(result.cache.read, 300);
    assert.strictEqual(result.cache.write, 50);
  });

  it("returns model and provider from last assistant msg", async () => {
    const client = makeClient([makeMsg("assistant", 10, 5, 0)]);
    const result = await getSessionTokens(client, "ses_test");
    assert.ok(result);
    assert.strictEqual(result.modelID, "claude-3");
    assert.strictEqual(result.providerID, "anthropic");
  });
});
