import type { Hooks, Plugin, PluginInput, PluginModule, PluginOptions } from "@opencode-ai/plugin"
import { composeHooks } from "./compose.js"
import { caveman } from "./caveman.js"
import { cavekit } from "./cavekit.js"
import { cavemem } from "./cavemem.js"

type Module = "caveman" | "cavekit" | "cavemem"
const ALL_MODULES: Module[] = ["caveman", "cavekit", "cavemem"]

/** Parse `modes` option: CSV string → Set of active modules. V2 */
export function parseModes(raw: unknown): Set<Module> {
  if (raw === undefined || raw === null) return new Set(ALL_MODULES)
  if (typeof raw !== "string" || raw.trim() === "") return new Set(ALL_MODULES)

  const result = new Set<Module>()
  for (const part of raw.split(",")) {
    const val = part.trim()
    if (!val) continue
    if ((ALL_MODULES as string[]).includes(val)) {
      result.add(val as Module)
    } else {
      console.warn(`[caveopen] unknown module "${val}", skipping`)
    }
  }
  // all-unknown → fall back to all 3 (warn already emitted per unknown)
  return result.size > 0 ? result : new Set(ALL_MODULES)
}

export const CaveopenPlugin: Plugin = async (
  input: PluginInput,
  options?: PluginOptions
) => {
  const modes = parseModes(options?.["modes"])
  const include = (m: Module) => modes.has(m)

  // Compose order: caveman (a) → cavekit → cavemem (b).
  // V1: same-key handlers chain a→b; both fire, mutations accumulate.
  // V56: for experimental.chat.system.transform specifically —
  //   a = caveman pushes SKILL.md rules (read once at init, static bytes)
  //   b = cavemem pushes memory-tools note (hardcoded string literal)
  // Both pushes are const+deterministic → Anthropic prompt-cache prefix preserved.
  let hooks: Partial<Hooks> = {}
  if (include("caveman")) hooks = composeHooks(hooks, await caveman(input))
  if (include("cavekit")) hooks = composeHooks(hooks, await cavekit(input))
  if (include("cavemem")) hooks = composeHooks(hooks, await cavemem(input))

  return hooks
}

const CaveopenModule: PluginModule = {
  id: "caveopen",
  server: CaveopenPlugin,
}

export default CaveopenModule
