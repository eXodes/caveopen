import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  getCavememSystemPriorContext,
  setCachedContext,
  deleteCachedContext,
} from "../modules/cavemem/lib/context.js";

// V7: getCavememSystemPriorContext → null when skipPriorContext | ⊥ sessionID | empty ctx.

const SID = "test-session-v7";

describe("V7: getCavememSystemPriorContext null paths", () => {
  beforeEach(() => {
    deleteCachedContext(SID);
  });

  it("skipPriorContext: true → null", () => {
    setCachedContext(SID, "has context");
    assert.strictEqual(
      getCavememSystemPriorContext(SID, { skipPriorContext: true }),
      null,
    );
  });

  it("undefined sessionID → null", () => {
    assert.strictEqual(getCavememSystemPriorContext(undefined), null);
  });

  it("no cached session → null", () => {
    assert.strictEqual(getCavememSystemPriorContext(SID), null);
  });

  it("empty string context → null", () => {
    setCachedContext(SID, "");
    assert.strictEqual(getCavememSystemPriorContext(SID), null);
  });

  it("valid context → returns string", () => {
    setCachedContext(SID, "prior session context here");
    assert.strictEqual(
      getCavememSystemPriorContext(SID),
      "prior session context here",
    );
  });

  it("skipPriorContext: false → returns context (explicit false)", () => {
    setCachedContext(SID, "ctx");
    assert.strictEqual(
      getCavememSystemPriorContext(SID, { skipPriorContext: false }),
      "ctx",
    );
  });
});
