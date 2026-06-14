import type { Event } from "@opencode-ai/sdk";
import type { PluginInput } from "@opencode-ai/plugin";
import { HISTORY_PATH, readModeFlag, writeStatuslineSuffix } from "../lib/config.js";
import { appendHistory, aggregateHistory, parseHistory } from "../lib/history.js";
import { derivesSavings, formatStatuslineSuffix } from "../lib/stats.js";
import { getSessionTokens } from "../lib/tokens.js";

export async function handleSessionIdle(event: Event, ctx: PluginInput): Promise<void> {
  if (event.type !== "session.idle") return;

  const sessionID = (event.properties as Record<string, string> | undefined)
    ?.sessionID;
  if (!sessionID) return;

  const tokens = await getSessionTokens(ctx.client, sessionID);
  if (!tokens) return;

  const mode = readModeFlag();
  const model: string | null = null;

  const { estSavedTokens, estSavedUsd } = derivesSavings({
    outputTokens: tokens.output,
    mode,
    model,
  });

  appendHistory(
    HISTORY_PATH,
    JSON.stringify({
      ts: Date.now(),
      session_id: sessionID,
      mode: mode ?? null,
      model,
      output_tokens: tokens.output,
      cache_read_tokens: tokens.cache.read,
      est_saved_tokens: estSavedTokens,
      est_saved_usd: estSavedUsd,
    }),
  );

  const agg = aggregateHistory(parseHistory(HISTORY_PATH));
  writeStatuslineSuffix(formatStatuslineSuffix(agg));
}
