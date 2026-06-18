import type { Event } from "@opencode-ai/sdk";
import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import { runCavememHook } from "../lib/runner.js";
import {
  getCachedContext,
  hasSession,
  setCachedContext,
} from "../lib/session-cache.js";

// Pending promises prevent concurrent callers from racing to insert the session
// record — cavemem uses INSERT OR IGNORE, so whoever fires first wins. Without
// this, user-prompt-submit/post-tool-use can trigger ensureSession() with
// ide:"unknown"/cwd:null before session-start completes.
const pending = new Map<string, Promise<void>>();

export function initSession(
  sessionID: string,
  directory: string,
): Promise<void> {
  if (hasSession(sessionID)) return Promise.resolve();
  if (pending.has(sessionID)) return pending.get(sessionID)!;

  const p = runCavememHook("session-start", {
    session_id: sessionID,
    ide: "opencode",
    cwd: directory,
  }).then((context) => {
    setCachedContext(sessionID, context ?? "");
    pending.delete(sessionID);
  });

  pending.set(sessionID, p);
  return p;
}

export async function handleSessionCreated(
  event: Event,
  ctx: PluginInput,
): Promise<void> {
  if (event.type !== "session.created") return;

  const sessionID = event.properties.info.id;
  if (!sessionID) return;

  await initSession(sessionID, event.properties.info.directory ?? process.cwd());
}

export function systemTransformHook(
  ctx: PluginInput,
): NonNullable<Hooks["experimental.chat.system.transform"]> {
  return async (input, output) => {
    const sessionID = input.sessionID;
    if (!sessionID) return;

    const context = getCachedContext(sessionID);
    if (!context) return;

    output.system.unshift(context);
  };
}
