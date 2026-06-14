import type { CavemanMode } from "./config.js";
import type { HistoryAggregate } from "./history.js";

const OUTPUT_TOKEN_COST_PER_1K: Record<string, number> = {
  "claude-opus-4-8": 0.075,
  "claude-sonnet-4-6": 0.015,
  "claude-haiku-4-5": 0.00125,
};

const DEFAULT_COST_PER_1K = 0.015;

const SAVINGS_RATIO: Record<CavemanMode, number> = {
  "lite": 0.2,
  "full": 0.4,
  "ultra": 0.55,
  "wenyan-lite": 0.25,
  "wenyan-full": 0.6,
  "wenyan-ultra": 0.65,
};

type TokenInfo = {
  input?: number;
  output?: number;
  cache?: { read?: number; write?: number };
};

type StatsInput = {
  tokens: TokenInfo | undefined;
  mode: CavemanMode | null;
  sessionID: string;
};

type SavingsInput = {
  outputTokens: number;
  mode: CavemanMode | null;
  model: string | null;
};

export function derivesSavings({ outputTokens, mode, model }: SavingsInput): {
  estSavedTokens: number;
  estSavedUsd: number;
} {
  if (!mode) return { estSavedTokens: 0, estSavedUsd: 0 };

  const ratio = SAVINGS_RATIO[mode] ?? 0;
  const estSavedTokens = Math.round(outputTokens * ratio);
  const costPer1k =
    model && OUTPUT_TOKEN_COST_PER_1K[model]
      ? OUTPUT_TOKEN_COST_PER_1K[model]!
      : DEFAULT_COST_PER_1K;
  const estSavedUsd = (estSavedTokens / 1000) * costPer1k;

  return { estSavedTokens, estSavedUsd };
}

export function formatStats({ tokens, mode, sessionID }: StatsInput): string {
  const out = tokens?.output ?? 0;
  const cacheRead = tokens?.cache?.read ?? 0;
  const cacheWrite = tokens?.cache?.write ?? 0;
  const input = tokens?.input ?? 0;

  const { estSavedTokens, estSavedUsd } = mode
    ? derivesSavings({ outputTokens: out, mode, model: null })
    : { estSavedTokens: 0, estSavedUsd: 0 };

  return [
    `## Caveman Stats — Session ${sessionID.slice(0, 8)}`,
    `Mode: ${mode ?? "off"}`,
    `Input tokens:      ${fmt(input)}`,
    `Output tokens:     ${fmt(out)}`,
    `Cache read:        ${fmt(cacheRead)}`,
    `Cache write:       ${fmt(cacheWrite)}`,
    `Est. saved tokens: ${fmt(estSavedTokens)} (~${SAVINGS_RATIO[mode as CavemanMode] ? (SAVINGS_RATIO[mode as CavemanMode]! * 100).toFixed(0) : 0}%)`,
    `Est. saved cost:   $${estSavedUsd.toFixed(4)}`,
  ].join("\n");
}

export function formatHistory(agg: HistoryAggregate): string {
  return [
    `## Caveman Lifetime Stats`,
    `Sessions:          ${agg.totalSessions}`,
    `Total output tok:  ${fmt(agg.totalOutputTokens)}`,
    `Total cache read:  ${fmt(agg.totalCacheReadTokens)}`,
    `Est. saved tokens: ${fmt(agg.totalEstSavedTokens)}`,
    `Est. saved cost:   $${agg.totalEstSavedUsd.toFixed(4)}`,
    `Active mode:       ${agg.activeMode ?? "off"}`,
  ].join("\n");
}

export function formatStatuslineSuffix(agg: HistoryAggregate): string {
  const k = (agg.totalEstSavedTokens / 1000).toFixed(1);
  return `🦴 ${k}k`;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}
