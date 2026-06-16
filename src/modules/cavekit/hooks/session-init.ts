import type { Event } from "@opencode-ai/sdk";
import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import { readSpec, extractSpecSummary } from "../lib/spec.js";
import {
  getSpecContext,
  setSpecContext,
  hasSpecSession,
} from "../lib/cache.js";

export async function handleSessionCreated(
  event: Event,
  ctx: PluginInput,
): Promise<void> {
  if (event.type !== "session.created") return;

  const sessionID = event.properties.info.id;
  if (!sessionID) return;

  if (hasSpecSession(sessionID)) return;

  const content = await readSpec();
  if (!content) {
    setSpecContext(sessionID, "");
    return;
  }

  const summary = extractSpecSummary(content);
  setSpecContext(sessionID, summary);
}

export function systemTransformHook(
  ctx: PluginInput,
): NonNullable<Hooks["experimental.chat.system.transform"]> {
  return async (input, output) => {
    const sessionID = input["sessionID"];
    if (!sessionID) return;

    const ctx = getSpecContext(sessionID);
    if (!ctx) return;

    // system[0] = caveman rules, system[1] = spec context
    output.system.push(ctx);
  };
}
