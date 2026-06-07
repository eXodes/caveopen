import type { PluginInput } from "@opencode-ai/plugin"
import { caveman } from "./caveman.js"
import { cavekit } from "./cavekit.js"
import { cavemem } from "./cavemem.js"

type Mode = "all" | "caveman" | "cavekit" | "cavemem"

interface CaveopenOptions {
  mode?: Mode
}

const VALID_MODES: Mode[] = ["all", "caveman", "cavekit", "cavemem"]

const CaveopenPlugin = async (
  input: PluginInput,
  options: CaveopenOptions = {}
) => {
  let mode = options.mode ?? "all"

  if (!VALID_MODES.includes(mode)) {
    console.warn(`[caveopen] unknown mode "${mode}", falling back to "all"`)
    mode = "all"
  }

  const include = (m: Mode) => mode === "all" || mode === m
  const hooks: Record<string, unknown> = {}

  if (include("caveman")) Object.assign(hooks, await caveman(input))
  if (include("cavekit")) Object.assign(hooks, await cavekit(input))
  if (include("cavemem")) Object.assign(hooks, await cavemem(input))

  return hooks as any
}

export default CaveopenPlugin
