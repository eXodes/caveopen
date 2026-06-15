import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function resolveFormatSource(): string {
  const pluginDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(pluginDir, "../../../FORMAT.md");
}

export function resolveFormatDest(isGlobal: boolean): string {
  return isGlobal
    ? path.join(os.homedir(), ".config", "opencode", "FORMAT.md")
    : path.join(process.cwd(), "FORMAT.md");
}

export async function copyFormat(
  dest: string,
  force: boolean
): Promise<{ copied: boolean; skipped: boolean; error?: string }> {
  const source = resolveFormatSource();

  if (!existsSync(source)) {
    return { copied: false, skipped: false, error: `FORMAT.md not found in plugin bundle at ${source}` };
  }

  if (existsSync(dest) && !force) {
    return { copied: false, skipped: true };
  }

  const dir = path.dirname(dest);
  await fs.mkdir(dir, { recursive: true });
  await fs.copyFile(source, dest);
  return { copied: true, skipped: false };
}
