import type { Event } from "@opencode-ai/sdk";
import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import { runCavememHook } from "../lib/runner.js";
import {
  getCachedContext,
  hasSession,
  setCachedContext,
} from "../lib/session-cache.js";

export async function handleSessionCreated(
  event: Event,
  ctx: PluginInput,
): Promise<void> {
  if (event.type !== "session.created") return;

  const sessionID = (
    event.properties as unknown as Record<string, string> | undefined
  )?.sessionID;
  if (!sessionID) return;

  if (hasSession(sessionID)) return;

  const context = await runCavememHook("session-start", {
    session_id: sessionID,
    ide: "opencode",
    cwd: process.cwd(),
  });

  setCachedContext(sessionID, context ?? "");
}

export function systemTransformHook(
  ctx: PluginInput,
): NonNullable<Hooks["experimental.chat.system.transform"]> {
  return async (input, output) => {
    const sessionID = (input as Record<string, unknown>)["sessionID"] as
      | string
      | undefined;
    if (!sessionID) return;

    const context = getCachedContext(sessionID);
    if (!context) return;

    output.system.unshift(context);
  };
}
