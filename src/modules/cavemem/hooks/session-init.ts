import type { Event } from "@opencode-ai/sdk";
import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import { getStore } from "../lib/store.js";
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

  const store = await getStore();
  if (!store) {
    setCachedContext(sessionID, "");
    return;
  }

  store.startSession({ id: sessionID, ide: "opencode", cwd: process.cwd() });

  const recent = store.storage.listSessions(20);
  const hints = recent
    .filter(
      (s: { id: string; cwd: string | null }) =>
        s.id !== sessionID && s.cwd === process.cwd(),
    )
    .slice(0, 3)
    .map((s: { id: string }) => {
      const summaries = store.storage.listSummaries(s.id).slice(0, 1);
      return summaries.map((x: { content: string }) => x.content).join("\n");
    })
    .filter(Boolean);

  const prevContext =
    hints.length > 0 ?
      `## Prior-session context\n${hints.join("\n---\n")}`
    : "";

  setCachedContext(sessionID, prevContext);
}

export function systemTransformHook(
  ctx: PluginInput,
): NonNullable<Hooks["experimental.chat.system.transform"]> {
  return async (input, output) => {
    const sessionID = (input as Record<string, unknown>)["sessionID"] as
      | string
      | undefined;
    if (!sessionID) return;

    const ctx = getCachedContext(sessionID);
    if (!ctx) return;

    output.system.unshift(ctx);
  };
}
