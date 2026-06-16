import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { ensureCavemanDir } from "./config.js";

export type HistoryEntry = {
  ts: number;
  session_id: string;
  mode: string | null;
  model: string | null;
  output_tokens: number;
  cache_read_tokens: number;
  actual_cost?: number;
  est_saved_tokens: number;
  est_saved_usd: number;
};

export type HistoryAggregate = {
  totalSessions: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalEstSavedTokens: number;
  totalEstSavedUsd: number;
  activeMode: string | null;
};

export function appendHistory(historyPath: string, entry: string): void {
  ensureCavemanDir();
  appendFileSync(historyPath, entry + "\n", "utf8");
}

export function parseHistory(historyPath: string, sinceDays?: number): HistoryEntry[] {
  if (!existsSync(historyPath)) return [];

  const raw = readFileSync(historyPath, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim());
  const cutoff = sinceDays ? Date.now() - sinceDays * 86_400_000 : 0;

  const entries: HistoryEntry[] = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as HistoryEntry;
      if (entry.ts >= cutoff) entries.push(entry);
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

export function aggregateHistory(entries: HistoryEntry[]): HistoryAggregate {
  const agg: HistoryAggregate = {
    totalSessions: entries.length,
    totalOutputTokens: 0,
    totalCacheReadTokens: 0,
    totalEstSavedTokens: 0,
    totalEstSavedUsd: 0,
    activeMode: entries.at(-1)?.mode ?? null,
  };
  for (const e of entries) {
    agg.totalOutputTokens += e.output_tokens;
    agg.totalCacheReadTokens += e.cache_read_tokens;
    agg.totalEstSavedTokens += e.est_saved_tokens;
    agg.totalEstSavedUsd += e.est_saved_usd;
  }
  return agg;
}
