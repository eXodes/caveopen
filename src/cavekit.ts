import type { PluginInput } from "@opencode-ai/plugin"
import { copyFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const FORMAT_SRC = join(here, "../assets/FORMAT.md")

function copyFormat(directory: string): string {
  const dest = join(directory, "FORMAT.md")
  try {
    copyFileSync(FORMAT_SRC, dest)
    return `FORMAT.md written to ${dest}`
  } catch (err) {
    return `[caveopen/cavekit] failed to copy FORMAT.md: ${err}`
  }
}

export const cavekit = async (input: PluginInput) => {
  return {
    // ── Command intercept: /ck:init copies FORMAT.md to project root ──────────
    "command.execute.before": async (
      { command }: { command: string },
      output: { parts?: Array<{ type: string; text: string }> }
    ) => {
      if (command !== "ck:init" && command !== "ck-init") return
      output.parts = [{ type: "text", text: copyFormat(input.directory) }]
    },

    // ── Agent-callable tool: ck_init ─────────────────────────────────────────
    tool: {
      ck_init: {
        description:
          "Copy FORMAT.md (the SPEC.md schema) to the current project root. " +
          "Run once per project before using /ck:spec. " +
          "Idempotent — safe to re-run.",
        parameters: {
          type: "object" as const,
          properties: {},
          required: [],
        },
        execute: async (
          _args: Record<string, unknown>,
          ctx: { directory: string }
        ) => {
          return copyFormat(ctx.directory)
        },
      },
    },
  }
}
