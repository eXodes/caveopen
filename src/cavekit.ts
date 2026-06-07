import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import type { TextPart } from "@opencode-ai/sdk"
import { existsSync, copyFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const _npmFormatPath = join(here, "../assets/FORMAT.md")
const FORMAT_SRC = existsSync(_npmFormatPath) ? _npmFormatPath : join(here, "../FORMAT.md")

function copyFormat(directory: string): string {
  const dest = join(directory, "FORMAT.md")
  try {
    copyFileSync(FORMAT_SRC, dest)
    return `FORMAT.md written to ${dest}`
  } catch (err) {
    return `[caveopen/cavekit] failed to copy FORMAT.md: ${err}`
  }
}

export const cavekit = async (input: PluginInput): Promise<Partial<Hooks>> => {
  const { directory, client } = input
  return {
    // ── Command intercept: /ck:init copies FORMAT.md to project root ──────────
    // V90: inject result via client.session.prompt(noReply:true); ⊥ set output.parts
    "command.execute.before": async (
      { command, sessionID }: { command: string; sessionID: string; arguments: string }
    ) => {
      if (command !== "ck:init") return
      const part: TextPart = {
        id: crypto.randomUUID(),
        sessionID,
        messageID: crypto.randomUUID(),
        type: "text",
        synthetic: true,
        text: copyFormat(directory),
      }
      await client.session.prompt({
        path: { id: sessionID },
        body: { noReply: true, parts: [part] },
      })
    },
  }
}
