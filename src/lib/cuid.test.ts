import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { cuid, partId, sessionId, messageId } from "./cuid.js";

// V19: cuid → first char letter, [a-z0-9], default len 24. id prefixes prt_ ses_ msg_.

describe("V19: cuid format + prefixes", () => {
  it("default length 24", () => {
    assert.strictEqual(cuid().length, 24);
  });

  it("first char is letter [a-z]", () => {
    for (let i = 0; i < 50; i++) {
      const id = cuid();
      assert.match(
        id[0]!,
        /^[a-z]$/,
        `first char of "${id}" is not [a-z]`,
      );
    }
  });

  it("all chars [a-z0-9]", () => {
    for (let i = 0; i < 50; i++) {
      const id = cuid();
      assert.match(id, /^[a-z0-9]+$/, `"${id}" has non-alphanumeric chars`);
    }
  });

  it("custom length respected", () => {
    assert.strictEqual(cuid({ length: 10 }).length, 10);
    assert.strictEqual(cuid({ length: 32 }).length, 32);
  });

  it("ids are unique across 200 samples", () => {
    const ids = new Set(Array.from({ length: 200 }, () => cuid()));
    assert.strictEqual(ids.size, 200);
  });

  it("partId prefix prt_", () => {
    assert.ok(partId().startsWith("prt_"), `partId=${partId()}`);
  });

  it("sessionId prefix ses_", () => {
    assert.ok(sessionId().startsWith("ses_"), `sessionId=${sessionId()}`);
  });

  it("messageId prefix msg_", () => {
    assert.ok(messageId().startsWith("msg_"), `messageId=${messageId()}`);
  });

  it("prefixed ids still [a-z0-9] after prefix", () => {
    const id = partId().slice("prt_".length);
    assert.match(id, /^[a-z0-9]+$/);
  });
});
