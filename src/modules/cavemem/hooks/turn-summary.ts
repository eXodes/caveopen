import type { Event } from "@opencode-ai/sdk";
import type { PluginInput } from "@opencode-ai/plugin";
import { runCavememHook } from "../lib/runner.js";
import { getLastAssistantText } from "../lib/text.js";

export async function handleSessionIdle(
  event: Event,
  ctx: PluginInput,
): Promise<void> {
  if (event.type !== "session.idle") return;

  const sessionID = (event.properties as unknown as Record<string, string> | undefined)?.sessionID;
  if (!sessionID) return;

  const text = await getLastAssistantText(ctx.client, sessionID);
  if (!text?.trim()) return;

  await runCavememHook("stop", {
    session_id: sessionID,
    last_assistant_message: text,
  });
}
