import type { Part, TextPart } from "@opencode-ai/sdk";
import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import type { CavemanMode } from "../lib/config.js";
import {
  isValidMode,
  readConfig,
  readModeFlag,
  removeModeFlag,
  writeModeFlag,
} from "../lib/config.js";
import { cuid } from "../../../lib/cuid.js";

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

const INDEPENDENT_MODES = new Set(["commit", "review", "compress"]);

function isActivationPhrase(prompt: string): boolean {
  return ACTIVATION_PHRASES.some((p) => prompt.includes(p));
}

function isDeactivationPhrase(prompt: string): boolean {
  return DEACTIVATION_PHRASES.some((p) => prompt.includes(p));
}

function parseModeCommand(prompt: string): CavemanMode | "off" | null {
  const match = prompt.match(
    /^\/caveman\s+(lite|full|ultra|wenyan-lite|wenyan-full|wenyan-ultra|off)\s*$/,
  );
  if (!match) return null;
  const level = match[1]!;
  if (level === "off") return "off";
  return isValidMode(level) ? level : null;
}

function extractTextFromParts(parts: Part[]): string {
  return parts
    .filter((p): p is TextPart => p.type === "text")
    .map((p) => p.text)
    .join(" ");
}

const executedKeys = new Set<string>();

export function chatMessageHook(
  ctx: PluginInput,
): NonNullable<Hooks["chat.message"]> {
  return async (input, output) => {
    const key = `${input.sessionID}:${output.message.id}`;
    if (executedKeys.has(key)) return;
    executedKeys.add(key);

    const text = extractTextFromParts(output.parts);
    const prompt = text.toLowerCase().trim();

    const modeSwitch = parseModeCommand(prompt);
    if (modeSwitch !== null) {
      modeSwitch === "off" ? removeModeFlag() : writeModeFlag(modeSwitch);
      return;
    }

    if (isDeactivationPhrase(prompt)) {
      removeModeFlag();
      return;
    }

    if (isActivationPhrase(prompt)) {
      writeModeFlag(readConfig().defaultMode);
    }

    const activeMode = readModeFlag();
    if (activeMode && !INDEPENDENT_MODES.has(activeMode)) {
      output.parts.push({
        id: `prt_${cuid()}`,
        sessionID: input.sessionID,
        messageID: output.message.id,
        type: "text",
        text: `CAVEMAN MODE ACTIVE (${activeMode}). Drop articles/filler/pleasantries/hedging. Fragments OK. Code/commits/security: write normal.`,
        synthetic: true,
      });
    }
  };
}
