import type { CavemanMode } from "./config.js";
import type { HistoryAggregate } from "./history.js";

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
  cost?: number;
  cache?: { read?: number; write?: number };
};

type StatsInput = {
  tokens: TokenInfo | undefined;
  mode: CavemanMode | null;
  sessionID: string;
};

type SavingsInput = {
  outputTokens: number;
  actualCost: number;
  mode: CavemanMode | null;
};

export function derivesSavings({ outputTokens, actualCost, mode }: SavingsInput): {
  estSavedTokens: number;
  estSavedUsd: number;
} {
  if (!mode) return { estSavedTokens: 0, estSavedUsd: 0 };

  const ratio = SAVINGS_RATIO[mode] ?? 0;
  const estSavedTokens = Math.round(outputTokens * ratio);
  const estSavedUsd = actualCost * ratio;

  return { estSavedTokens, estSavedUsd };
}

export function formatStats({ tokens, mode, sessionID }: StatsInput): string {
  const out = tokens?.output ?? 0;
  const cacheRead = tokens?.cache?.read ?? 0;
  const cacheWrite = tokens?.cache?.write ?? 0;
  const input = tokens?.input ?? 0;
  const actualCost = tokens?.cost ?? 0;

  const { estSavedTokens, estSavedUsd } =
    mode ?
      derivesSavings({ outputTokens: out, actualCost, mode })
    : { estSavedTokens: 0, estSavedUsd: 0 };

  return [
    `## Caveman Stats — Session ${sessionID.slice(0, 8)}`,
    `Mode: ${mode ?? "off"}`,
    `Input tokens:      ${fmt(input)}`,
    `Output tokens:     ${fmt(out)}`,
    `Cache read:        ${fmt(cacheRead)}`,
    `Cache write:       ${fmt(cacheWrite)}`,
    `Actual cost:       $${actualCost.toFixed(4)}`,
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
