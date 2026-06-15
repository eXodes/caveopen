import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Hooks } from "@opencode-ai/plugin";
import type { Part } from "@opencode-ai/sdk";

export function commandExecuteBeforeHook(): NonNullable<Hooks["command.execute.before"]> {
  return async (input, output) => {
    if (input.command !== "ck-init") return;

    const destFormat = path.join(process.cwd(), "FORMAT.md");

    if (existsSync(destFormat)) {
      output.parts.push({
        type: "text",
        text: `FORMAT.md already exists at ${destFormat}.`,
      } as unknown as Part);
      return;
    }

    const pluginDir = path.dirname(fileURLToPath(import.meta.url));
    const sourceFormat = path.join(pluginDir, "../../FORMAT.md");

    await fs.copyFile(sourceFormat, destFormat);

    output.parts.push({
      type: "text",
      text: `FORMAT.md copied to ${destFormat}\nNext: run /ck:spec to create SPEC.md`,
    } as unknown as Part);
  };
}
