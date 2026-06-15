import type { Event } from "@opencode-ai/sdk";
import { getStore, closeStore } from "../lib/store.js";
import { deleteCachedContext } from "../lib/session-cache.js";
import { PluginInput } from "@opencode-ai/plugin";

export async function handleSessionDeleted(
  event: Event,
  ctx: PluginInput,
): Promise<void> {
  if (event.type !== "session.deleted") return;

  const sessionID = (
    event.properties as unknown as Record<string, string> | undefined
  )?.sessionID;
  if (!sessionID) return;

  const store = await getStore();
  if (!store) return;

  const turns = store.storage
    .listSummaries(sessionID)
    .filter((s: { scope: string; content: string }) => s.scope === "turn")
    .map((s: { content: string }) => s.content);

  if (turns.length > 0) {
    store.addSummary({
      session_id: sessionID,
      scope: "session",
      content: turns.slice(0, 20).join("\n"),
    });
  }

  store.endSession(sessionID);
  deleteCachedContext(sessionID);
}

export async function disposeHook(): Promise<void> {
  closeStore();
}
