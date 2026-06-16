import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import { runCavememHook } from "../lib/runner.js";
import { extractText } from "../lib/text.js";

export function chatMessageHook(
  ctx: PluginInput,
): NonNullable<Hooks["chat.message"]> {
  return async (input, output) => {
    const text = extractText(output.parts);
    if (!text.trim()) return;

    await runCavememHook("user-prompt-submit", {
      session_id: input.sessionID,
      prompt: text,
    });
  };
}
