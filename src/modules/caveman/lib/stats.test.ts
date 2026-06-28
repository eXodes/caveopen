import { describe, it } from "vitest";
import assert from "node:assert/strict";
import {
  derivesSavings,
  formatStats,
} from "./stats.js";

// derivesSavings: mode null → {0,0}; else savedTok=round(out*ratio), savedUsd=cost*ratio.

describe("derivesSavings", () => {
  it("mode null → {0, 0}", () => {
    const r = derivesSavings({ outputTokens: 1000, actualCost: 0.01, mode: null });
    assert.strictEqual(r.estSavedTokens, 0);
    assert.strictEqual(r.estSavedUsd, 0);
  });

  it("full → 40% saved", () => {
    const r = derivesSavings({ outputTokens: 1000, actualCost: 1.0, mode: "full" });
    assert.strictEqual(r.estSavedTokens, 400);
    assert.strictEqual(r.estSavedUsd, 0.4);
  });

  it("lite → 20% saved", () => {
    const r = derivesSavings({ outputTokens: 1000, actualCost: 1.0, mode: "lite" });
    assert.strictEqual(r.estSavedTokens, 200);
    assert.strictEqual(r.estSavedUsd, 0.2);
  });

  it("ultra → 55% saved", () => {
    const r = derivesSavings({ outputTokens: 1000, actualCost: 1.0, mode: "ultra" });
    assert.strictEqual(r.estSavedTokens, 550);
    assert.strictEqual(r.estSavedUsd, 0.55);
  });

  it("wenyan-full → 60% saved", () => {
    const r = derivesSavings({ outputTokens: 1000, actualCost: 1.0, mode: "wenyan-full" });
    assert.strictEqual(r.estSavedTokens, 600);
    assert.strictEqual(r.estSavedUsd, 0.6);
  });

  it("wenyan-ultra → 65% saved", () => {
    const r = derivesSavings({ outputTokens: 1000, actualCost: 1.0, mode: "wenyan-ultra" });
    assert.strictEqual(r.estSavedTokens, 650);
    assert.strictEqual(r.estSavedUsd, 0.65);
  });

  it("savedTokens is integer (Math.round applied)", () => {
    const r = derivesSavings({ outputTokens: 3, actualCost: 0, mode: "full" });
    assert.ok(Number.isInteger(r.estSavedTokens));
  });

  it("zero output → zero saved tokens; savedUsd still cost*ratio", () => {
    const r = derivesSavings({ outputTokens: 0, actualCost: 0.5, mode: "full" });
    assert.strictEqual(r.estSavedTokens, 0);
    assert.ok(Math.abs(r.estSavedUsd - 0.2) < 0.000001);
  });
});

describe("formatStats", () => {
  it("includes session id prefix", () => {
    const text = formatStats({
      tokens: undefined,
      mode: null,
      sessionID: "ses_abcdefgh",
    });
    assert.ok(text.includes("ses_abcd"), `missing session prefix in:\n${text}`);
  });

  it("mode off → est saved = 0", () => {
    const text = formatStats({
      tokens: { output: 1000, input: 500, cost: 0.01 },
      mode: null,
      sessionID: "ses_1",
    });
    assert.ok(
      text.includes("Est. saved tokens: 0"),
      `missing zero saved in:\n${text}`,
    );
  });

  it("mode full → shows 40% ratio and correct mode label", () => {
    const text = formatStats({
      tokens: { output: 1000, input: 500, cost: 1.0 },
      mode: "full",
      sessionID: "ses_1",
    });
    assert.ok(text.includes("40%"), `missing 40% in:\n${text}`);
    assert.ok(text.includes("Mode: full"), `missing mode label in:\n${text}`);
  });

  it("undefined tokens → zero fields", () => {
    const text = formatStats({
      tokens: undefined,
      mode: "lite",
      sessionID: "ses_1",
    });
    assert.ok(text.includes("Output tokens:     0"));
  });
});
