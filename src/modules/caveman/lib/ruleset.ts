import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CavemanMode } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SKILL_PATH = join(
  __dirname,
  "../../../../..",
  "assets/skills/caveman/SKILL.md",
);

let cachedSkill: string | null = null;

function loadSkill(): string {
  if (cachedSkill !== null) return cachedSkill;
  if (!existsSync(SKILL_PATH)) return "";
  cachedSkill = readFileSync(SKILL_PATH, "utf8");
  return cachedSkill;
}

export function buildRuleset(mode: CavemanMode): string {
  const skill = loadSkill();
  const label = mode === "wenyan-full" ? "wenyan-full" : mode;

  const header = `<system-reminder>\nCAVEMAN MODE ACTIVE — level: ${label}\n\n`;
  const footer = `\n</system-reminder>`;

  if (!skill) {
    return (
      header +
      `Respond terse like smart caveman. Drop articles/filler/pleasantries/hedging. Fragments OK. Technical terms exact. Code blocks unchanged.` +
      footer
    );
  }

  // Strip YAML frontmatter
  const body = skill.replace(/^---[\s\S]*?---\n/, "").trim();
  return header + body + footer;
}
