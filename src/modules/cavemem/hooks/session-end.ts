import type { Event } from "@opencode-ai/sdk";
import type { PluginInput } from "@opencode-ai/plugin";
import { runCavememHook } from "../lib/runner.js";
import { deleteCachedContext } from "../lib/session-cache.js";

export async function handleSessionDeleted(
  event: Event,
  ctx: PluginInput,
): Promise<void> {
  if (event.type !== "session.deleted") return;

  const sessionID = (
    event.properties as unknown as Record<string, string> | undefined
  )?.sessionID;
  if (!sessionID) return;

  await runCavememHook("session-end", { session_id: sessionID });
  deleteCachedContext(sessionID);
}

export async function disposeHook(): Promise<void> {
  // cavemem CLI manages its own store; nothing to flush here
}
