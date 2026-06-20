import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCavemanArg } from "../modules/caveman/hooks/commands.js";

// V24: /caveman mode switch ! backed by command.execute.before handler.
// parseCavemanArg is the pure parser — proves correct mode dispatch
// without requiring file-system mocks.

describe("V24: parseCavemanArg — /caveman command.execute.before mode dispatch", () => {
  it("no args → full (default)", () => {
    assert.strictEqual(parseCavemanArg(undefined), "full");
    assert.strictEqual(parseCavemanArg(""), "full");
    assert.strictEqual(parseCavemanArg("  "), "full");
  });

  it("explicit full → full (via isValidMode, not special case)", () => {
    assert.strictEqual(parseCavemanArg("full"), "full");
    assert.strictEqual(parseCavemanArg("FULL"), "full");
  });

  it("lite → lite", () => {
    assert.strictEqual(parseCavemanArg("lite"), "lite");
  });

  it("ultra → ultra", () => {
    assert.strictEqual(parseCavemanArg("ultra"), "ultra");
  });

  it("wenyan variants → pass through", () => {
    assert.strictEqual(parseCavemanArg("wenyan-lite"), "wenyan-lite");
    assert.strictEqual(parseCavemanArg("wenyan-full"), "wenyan-full");
    assert.strictEqual(parseCavemanArg("wenyan-ultra"), "wenyan-ultra");
  });

  it("off → off (triggers removeModeFlag)", () => {
    assert.strictEqual(parseCavemanArg("off"), "off");
    assert.strictEqual(parseCavemanArg("OFF"), "off");
  });

  it("invalid arg → null (no-op, no flag write)", () => {
    assert.strictEqual(parseCavemanArg("bogus"), null);
    assert.strictEqual(parseCavemanArg("on"), null);
    assert.strictEqual(parseCavemanArg("medium"), null);
  });

  it("trims whitespace before matching", () => {
    assert.strictEqual(parseCavemanArg("  lite  "), "lite");
    assert.strictEqual(parseCavemanArg(" off "), "off");
  });
});
