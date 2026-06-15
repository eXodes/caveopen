import type { Hooks } from "@opencode-ai/plugin";
import type { Part } from "@opencode-ai/sdk";
import { resolveFormatDest, copyFormat } from "../lib/format.js";

export function commandExecuteBeforeHook(): NonNullable<Hooks["command.execute.before"]> {
  return async (input, output) => {
    if (input.command !== "ck-init") return;

    const args = input.arguments ?? [];
    const isGlobal = args.includes("--global");
    const force = args.includes("--force");

    const dest = resolveFormatDest(isGlobal);
    const result = await copyFormat(dest, force);

    if (result.error) {
      output.parts.push({ type: "text", text: `Error: ${result.error}` } as unknown as Part);
      return;
    }

    if (result.skipped) {
      output.parts.push({
        type: "text",
        text: `FORMAT.md already exists at ${dest}. Use --force to overwrite.`,
      } as unknown as Part);
      return;
    }

    output.parts.push({
      type: "text",
      text: [
        `FORMAT.md copied to ${dest}`,
        `Scope: ${isGlobal ? "global" : "project"}`,
        `Next: run /ck:spec to create SPEC.md`,
      ].join("\n"),
    } as unknown as Part);
  };
}
