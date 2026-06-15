import type { Event } from "@opencode-ai/sdk";
import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import {
  readConfig,
  readModeFlag,
  removeModeFlag,
  writeModeFlag,
} from "../lib/config.js";
import { buildRuleset } from "../lib/ruleset.js";

export function systemTransformHook(
  ctx: PluginInput,
): NonNullable<Hooks["experimental.chat.system.transform"]> {
  return async (input, output) => {
    const mode = readModeFlag();
    if (!mode) return;
    output.system.unshift(buildRuleset(mode));
  };
}

export async function handleSessionCreated(
  event: Event,
  ctx: PluginInput,
): Promise<void> {
  if (event.type !== "session.created") return;
  const { defaultMode } = readConfig();
  if ((defaultMode as string) === "off") {
    removeModeFlag();
    return;
  }
  if (!readModeFlag()) writeModeFlag(defaultMode);
}
