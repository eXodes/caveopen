import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { CavemanMode } from "./config.js";
import { readModeFlag } from "./config.js";

// Probe in priority order: project → global OpenCode install.
// Matches where `caveopen init --project` and `caveopen init --global` write skills.
const SKILL_SEARCH_PATHS = [
  join(process.cwd(), ".opencode", "skills", "caveman", "SKILL.md"),
  join(homedir(), ".config", "opencode", "skills", "caveman", "SKILL.md"),
];

// Embedded fallback: mirrors SKILL.md body so behavior is correct even when
// the assets directory is absent (e.g. standalone install without assets/).
// Matches upstream caveman-activate.js pattern.
const EMBEDDED_SKILL = `Respond terse like smart caveman. All technical substance stay. Only fluff die.

## Persistence

ACTIVE EVERY RESPONSE. No revert after many turns. No filler drift. Still active if unsure. Off only: "stop caveman" / "normal mode".

Default: **full**. Switch: \`/caveman lite|full|ultra\`.

## Rules

Drop: articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries (sure/certainly/of course/happy to), hedging. Fragments OK. Short synonyms (big not extensive, fix not "implement a solution for"). Technical terms exact. Code blocks unchanged. Errors quoted exact.

Pattern: \`[thing] [action] [reason]. [next step].\`

Not: "Sure! I'd be happy to help you with that. The issue you're experiencing is likely caused by..."
Yes: "Bug in auth middleware. Token expiry check use \`<\` not \`<=\`. Fix:"

## Auto-Clarity

Drop caveman when:
- Security warnings
- Irreversible action confirmations
- Multi-step sequences where fragment order or omitted conjunctions risk misread
- Compression itself creates technical ambiguity (e.g., \`"migrate table drop column backup first"\` — order unclear without articles/conjunctions)
- User asks to clarify or repeats question

Resume caveman after clear part done.

## Boundaries

Code/commits/PRs: write normal. "stop caveman" or "normal mode": revert. Level persist until changed or session end.`;

let cachedSkill: string | null = null;

function loadSkill(): string {
  if (cachedSkill !== null) return cachedSkill;
  for (const p of SKILL_SEARCH_PATHS) {
    if (!existsSync(p)) continue;
    const raw = readFileSync(p, "utf8");
    cachedSkill = raw.replace(/^---[\s\S]*?---\n/, "").trim();
    return cachedSkill;
  }
  cachedSkill = EMBEDDED_SKILL;
  return cachedSkill;
}

export function buildRuleset(mode: CavemanMode): string {
  const body = loadSkill();
  const label = mode === "wenyan-full" ? "wenyan-full" : mode;

  const header = `<system-reminder>\nCAVEMAN MODE ACTIVE — level: ${label}\n\n`;
  const footer = `\n</system-reminder>`;

  return header + body + footer;
}

/**
 * Returns the caveman ruleset string for the current mode, or null when
 * caveman is off or the mode flag is absent. Used by caveopen.ts to build
 * the combined system.transform provider — not called directly by the hook.
 */
export function getCavemanSystemRuleset(): string | null {
  const mode = readModeFlag();
  if (!mode) return null;
  return buildRuleset(mode);
}
