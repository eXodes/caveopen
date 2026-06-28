import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import type { CavemanMode } from "../lib/config.js";
import {
  HISTORY_PATH,
  isValidMode,
  readModeFlag,
  removeModeFlag,
  writeModeFlag,
} from "../lib/config.js";
import { messageId, partId } from "../../../lib/cuid.js";
import { aggregateHistory, parseHistory } from "../lib/history.js";
import { formatHistory, formatStats } from "../lib/stats.js";
import { getSessionTokens } from "../lib/tokens.js";

/**
 * Parse `/caveman` slash command arguments → mode to apply.
 * Empty/missing args → "full" (default per command .md).
 * Invalid arg → null (no-op).
 */
export function parseCavemanArg(
  args: string | undefined,
): CavemanMode | "off" | null {
  const arg = (args ?? "").trim().toLowerCase();
  if (arg === "") return "full";
  if (arg === "off") return "off";
  return isValidMode(arg) ? arg : null;
}

export function commandExecuteBeforeHook(
  ctx: PluginInput,
): NonNullable<Hooks["command.execute.before"]> {
  return async (input, output) => {
    if (input.command === "caveman") {
      const action = parseCavemanArg(input.arguments);
      if (action === "off") removeModeFlag();
      else if (action !== null) writeModeFlag(action);
      return;
    }

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

    const statsText = parts.filter(Boolean).join("\n\n");

    if (output.parts.length > 0) {
      output.parts.splice(
        0,
        output.parts.length,
        {
          id: output.parts[0].id,
          messageID: output.parts[0].messageID,
          sessionID: input.sessionID,
          type: "text",
          text: statsText,
          ignored: true,
        },
        {
          id: partId(),
          messageID: output.parts[0].messageID,
          sessionID: input.sessionID,
          type: "text",
          text: "Stats displayed. No further action needed.",
          synthetic: true,
        },
      );
    } else {
      output.parts.push({
        id: partId(),
        messageID: messageId(),
        sessionID: input.sessionID,
        type: "text",
        text: statsText,
      });
    }
  };
}
