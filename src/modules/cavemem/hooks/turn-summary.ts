import type { Event } from "@opencode-ai/sdk";
import type { PluginInput } from "@opencode-ai/plugin";
import { getStore } from "../lib/store.js";
import { getLastAssistantText } from "../lib/text.js";

export async function handleSessionIdle(
  event: Event,
  ctx: PluginInput,
): Promise<void> {
  if (event.type !== "session.idle") return;

  const sessionID = (event.properties as unknown as Record<string, string> | undefined)
    ?.sessionID;
  if (!sessionID) return;

  const store = await getStore();
  if (!store) return;

  const lastMessage = await getLastAssistantText(ctx.client, sessionID);
  if (!lastMessage?.trim()) return;

  store.addSummary({
    session_id: sessionID,
    scope: "turn",
    content: lastMessage,
  });
}
