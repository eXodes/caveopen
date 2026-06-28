import { describe, it, beforeAll, afterAll } from "vitest";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseHistory,
  aggregateHistory,
  type HistoryEntry,
} from "./history.js";

// parseHistory and aggregateHistory skip malformed entries, filter by date, and aggregate.

let tmpDir: string;
let histPath: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "caveopen-history-"));
  histPath = join(tmpDir, "history.jsonl");
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function entry(
  ts: number,
  mode: string | null,
  output: number,
  est: number,
  usd = 0,
): string {
  return JSON.stringify({
    ts,
    session_id: "ses_x",
    mode,
    model: null,
    output_tokens: output,
    cache_read_tokens: 0,
    est_saved_tokens: est,
    est_saved_usd: usd,
  });
}

describe("parseHistory + aggregateHistory", () => {
  it("file absent → []", () => {
    assert.deepStrictEqual(parseHistory("/nonexistent/path.jsonl"), []);
  });

  it("skips malformed lines, keeps valid", () => {
    writeFileSync(
      histPath,
      ["not-json", entry(1000, "full", 100, 40), "also-bad"].join("\n"),
      "utf8",
    );
    const result = parseHistory(histPath);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]!.output_tokens, 100);
  });

  it("empty file → []", () => {
    writeFileSync(histPath, "", "utf8");
    assert.deepStrictEqual(parseHistory(histPath), []);
  });

  it("filters by sinceDays — excludes old entries", () => {
    const now = Date.now();
    const old = now - 10 * 86_400_000;
    const recent = now - 1 * 86_400_000;
    writeFileSync(
      histPath,
      [entry(old, "full", 100, 40), entry(recent, "lite", 50, 10)].join("\n"),
      "utf8",
    );
    const result = parseHistory(histPath, 3);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]!.output_tokens, 50);
  });

  it("sinceDays=0 → no cutoff (returns all)", () => {
    const old = Date.now() - 30 * 86_400_000;
    writeFileSync(histPath, entry(old, "full", 100, 40), "utf8");
    const result = parseHistory(histPath, 0);
    assert.strictEqual(result.length, 1);
  });

  it("aggregateHistory totals correctly", () => {
    const entries: HistoryEntry[] = [
      JSON.parse(entry(1, "full", 100, 40, 0.01)) as HistoryEntry,
      JSON.parse(entry(2, "lite", 200, 40, 0.02)) as HistoryEntry,
    ];
    const agg = aggregateHistory(entries);
    assert.strictEqual(agg.totalSessions, 2);
    assert.strictEqual(agg.totalOutputTokens, 300);
    assert.strictEqual(agg.totalEstSavedTokens, 80);
    assert.ok(Math.abs(agg.totalEstSavedUsd - 0.03) < 0.0001);
  });

  it("aggregateHistory activeMode = last entry mode", () => {
    const entries: HistoryEntry[] = [
      JSON.parse(entry(1, "full", 100, 40)) as HistoryEntry,
      JSON.parse(entry(2, "lite", 100, 20)) as HistoryEntry,
    ];
    assert.strictEqual(aggregateHistory(entries).activeMode, "lite");
  });

  it("aggregateHistory empty → null activeMode, zero totals", () => {
    const agg = aggregateHistory([]);
    assert.strictEqual(agg.activeMode, null);
    assert.strictEqual(agg.totalSessions, 0);
    assert.strictEqual(agg.totalOutputTokens, 0);
  });

  it("aggregateHistory null mode in last entry → null activeMode", () => {
    const entries: HistoryEntry[] = [
      JSON.parse(entry(1, "full", 100, 40)) as HistoryEntry,
      JSON.parse(entry(2, null, 100, 0)) as HistoryEntry,
    ];
    assert.strictEqual(aggregateHistory(entries).activeMode, null);
  });
});
