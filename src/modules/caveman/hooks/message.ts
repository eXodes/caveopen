import type { Part, TextPart } from "@opencode-ai/sdk";
import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import { readConfig, removeModeFlag, writeModeFlag } from "../lib/config.js";

const ACTIVATION_PHRASES = [
  "activate caveman",
  "caveman mode",
  "talk like caveman",
  "use caveman",
  "less tokens",
  "be brief",
  "save tokens",
  "compress mode",
];

const DEACTIVATION_PHRASES = ["stop caveman", "normal mode", "caveman off"];

function isActivationPhrase(prompt: string): boolean {
  return ACTIVATION_PHRASES.some((p) => prompt.includes(p));
}

function isDeactivationPhrase(prompt: string): boolean {
  return DEACTIVATION_PHRASES.some((p) => prompt.includes(p));
}

function extractTextFromParts(parts: Part[]): string {
  return parts
    .filter((p): p is TextPart => p.type === "text")
    .map((p) => p.text)
    .join(" ");
}

export function chatMessageHook(
  ctx: PluginInput,
): NonNullable<Hooks["chat.message"]> {
  return async (input, output) => {
    const text = extractTextFromParts(output.parts);
    const prompt = text.toLowerCase().trim();

    if (isDeactivationPhrase(prompt)) {
      removeModeFlag();
      return;
    }

    if (isActivationPhrase(prompt)) {
      const defMode = readConfig().defaultMode;
      if (defMode !== "off") writeModeFlag(defMode);
    }
  };
}
