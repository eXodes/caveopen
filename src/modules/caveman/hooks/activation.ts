import type { Event } from "@opencode-ai/sdk";
import { readConfig, readModeFlag, removeModeFlag, writeModeFlag } from "../lib/config.js";
import { buildRuleset } from "../lib/ruleset.js";

export function systemTransformHook(): NonNullable<import("@opencode-ai/plugin").Hooks["experimental.chat.system.transform"]> {
  return async (_input, output) => {
    const mode = readModeFlag();
    if (!mode) return;
    output.system.unshift(buildRuleset(mode));
  };
}

export async function handleSessionCreated(event: Event): Promise<void> {
  if (event.type !== "session.created") return;
  const { defaultMode } = readConfig();
  if ((defaultMode as string) === "off") {
    removeModeFlag();
    return;
  }
  if (!readModeFlag()) writeModeFlag(defaultMode);
}
