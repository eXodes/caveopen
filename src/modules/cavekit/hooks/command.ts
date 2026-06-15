import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Hooks, PluginInput } from "@opencode-ai/plugin";

export function commandExecuteBeforeHook(
  ctx: PluginInput,
): NonNullable<Hooks["command.execute.before"]> {
  return async (input, output) => {
    if (input.command !== "ck:init") return;

    const destFormat = path.join(process.cwd(), "FORMAT.md");

    const text =
      existsSync(destFormat) ?
        `FORMAT.md already exists at ${destFormat}.`
      : await (async () => {
          const pluginDir = path.dirname(fileURLToPath(import.meta.url));
          const sourceFormat = path.join(pluginDir, "../assets/FORMAT.md");
          await fs.copyFile(sourceFormat, destFormat);
          return `FORMAT.md copied to ${destFormat}\nNext: run /ck:spec to create SPEC.md`;
        })();

    await ctx.client.session.prompt({
      path: { id: input.sessionID },
      body: {
        noReply: true,
        parts: [{ type: "text", text: text }],
      },
    });
  };
}
