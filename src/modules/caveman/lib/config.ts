import { homedir } from "node:os";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const CAVEMAN_DIR = join(homedir(), ".caveman");
export const MODE_FILE = join(CAVEMAN_DIR, ".caveman-active");
export const HISTORY_PATH = join(CAVEMAN_DIR, ".caveman-history.jsonl");
export const STATUSLINE_SUFFIX_FILE = join(CAVEMAN_DIR, ".caveman-statusline-suffix");

export type CavemanMode =
  | "lite"
  | "full"
  | "ultra"
  | "wenyan-lite"
  | "wenyan-full"
  | "wenyan-ultra";

export type CavemanConfig = {
  defaultMode: CavemanMode;
};

const VALID_MODES = new Set<string>([
  "lite",
  "full",
  "ultra",
  "wenyan-lite",
  "wenyan-full",
  "wenyan-ultra",
]);

export function isValidMode(m: string): m is CavemanMode {
  return VALID_MODES.has(m);
}

export function ensureCavemanDir(): void {
  if (!existsSync(CAVEMAN_DIR)) {
    mkdirSync(CAVEMAN_DIR, { recursive: true });
  }
}

export function readModeFlag(): CavemanMode | null {
  if (!existsSync(MODE_FILE)) return null;
  const raw = readFileSync(MODE_FILE, "utf8").trim();
  return isValidMode(raw) ? raw : null;
}

export function writeModeFlag(mode: CavemanMode): void {
  ensureCavemanDir();
  writeFileSync(MODE_FILE, mode, "utf8");
}

export function removeModeFlag(): void {
  if (existsSync(MODE_FILE)) unlinkSync(MODE_FILE);
}

export function readStatuslineSuffix(): string | null {
  if (!existsSync(STATUSLINE_SUFFIX_FILE)) return null;
  const raw = readFileSync(STATUSLINE_SUFFIX_FILE, "utf8").trim();
  return raw || null;
}

export function writeStatuslineSuffix(text: string): void {
  ensureCavemanDir();
  writeFileSync(STATUSLINE_SUFFIX_FILE, text, "utf8");
}

export function readConfig(): CavemanConfig {
  return { defaultMode: "full" };
}
