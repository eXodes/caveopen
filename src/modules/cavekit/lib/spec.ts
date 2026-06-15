import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export async function readSpec(): Promise<string | null> {
  const specPath = path.join(process.cwd(), "SPEC.md");
  if (!existsSync(specPath)) return null;
  return fs.readFile(specPath, "utf-8");
}

/**
 * Pull §G (goal) and §T (task table) from SPEC.md.
 * Keeps injection small (~100–300 tokens). Full SPEC.md read on demand by skills.
 */
export function extractSpecSummary(content: string): string {
  const parts: string[] = [];

  // §G — goal section: one or two lines after the §G heading
  const goalMatch = content.match(/^##\s*§G[^\n]*\n([\s\S]*?)(?=\n##\s*§|\s*$)/m);
  if (goalMatch) {
    const goalText = goalMatch[1].trim();
    if (goalText) parts.push(`## §G\n${goalText}`);
  }

  // §T — task table: the full pipe-table block after the §T heading
  const taskMatch = content.match(/^##\s*§T[^\n]*\n([\s\S]*?)(?=\n##\s*§|\s*$)/m);
  if (taskMatch) {
    const taskText = taskMatch[1].trim();
    if (taskText) parts.push(`## §T\n${taskText}`);
  }

  return parts.join("\n\n");
}
