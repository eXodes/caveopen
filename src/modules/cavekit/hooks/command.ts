import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import { messageId, partId } from "../../../lib/cuid.js";

export function commandExecuteBeforeHook(
  ctx: PluginInput,
): NonNullable<Hooks["command.execute.before"]> {
  return async (input, output) => {
    if (input.command !== "ck:init") return;

    const destFormat = path.join(ctx.directory, "FORMAT.md");

    const existed = existsSync(destFormat);
    const pluginDir = path.dirname(fileURLToPath(import.meta.url));
    const sourceFormat = path.join(pluginDir, "../assets/FORMAT.md");

    let text: string;
    try {
      await fs.copyFile(sourceFormat, destFormat);
      text =
        existed ?
          `FORMAT.md overwritten at ${destFormat} (updated to latest).`
        : `FORMAT.md copied to ${destFormat}\nNext: run /ck:spec to create SPEC.md`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      output.parts.push({
        id: partId(),
        messageID: messageId(),
        sessionID: input.sessionID,
        type: "text",
        text: `Failed to copy FORMAT.md to ${destFormat}: ${msg}`,
      });
      return;
    }

    if (output.parts.length > 0) {
      output.parts.splice(
        0,
        output.parts.length,
        {
          id: output.parts[0].id,
          messageID: output.parts[0].messageID,
          sessionID: input.sessionID,
          type: "text",
          text,
          ignored: true,
        },
        {
          id: partId(),
          messageID: output.parts[0].messageID,
          sessionID: input.sessionID,
          type: "text",
          text: "FORMAT.md copied, no further action.",
          synthetic: true,
        },
      );
    } else {
      output.parts.push({
        id: partId(),
        messageID: messageId(),
        sessionID: input.sessionID,
        type: "text",
        text,
      });
    }
  };
}
