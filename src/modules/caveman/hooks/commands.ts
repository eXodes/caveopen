import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import { HISTORY_PATH, readModeFlag } from "../lib/config.js";
import { messageId, partId } from "../../../lib/cuid.js";
import { aggregateHistory, parseHistory } from "../lib/history.js";
import { formatHistory, formatStats } from "../lib/stats.js";
import { getSessionTokens } from "../lib/tokens.js";

export function commandExecuteBeforeHook(
  ctx: PluginInput,
): NonNullable<Hooks["command.execute.before"]> {
  return async (input, output) => {
    if (input.command !== "caveman-stats") return;

    const args = input.arguments ?? "";
    const showAll = args.includes("--all");
    const sinceMatch = args.match(/--since\s+(\d+)d/);
    const sinceDays = sinceMatch ? parseInt(sinceMatch[1]!, 10) : undefined;

    const tokens = await getSessionTokens(ctx.client, input.sessionID);
    const sessionStats = formatStats({
      tokens:
        tokens ?
          {
            input: tokens.input,
            output: tokens.output,
            cost: tokens.cost,
            cache: tokens.cache,
          }
        : undefined,
      mode: readModeFlag(),
      sessionID: input.sessionID,
    });

    const parts: string[] = [sessionStats];

    if (showAll || sinceDays) {
      const agg = aggregateHistory(parseHistory(HISTORY_PATH, sinceDays));
      parts.push(formatHistory(agg));
    }

    output.parts.push({
      id: partId(),
      sessionID: input.sessionID,
      messageID: messageId(),
      type: "text",
      text: parts.filter(Boolean).join("\n\n"),
    });
  };
}
