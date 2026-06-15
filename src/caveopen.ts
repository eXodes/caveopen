import type { Plugin } from "@opencode-ai/plugin";
import { cavemanHooks } from "./modules/caveman/index.js";
import { cavekitHooks } from "./modules/cavekit/index.js";
import { caveMemHooks } from "./modules/cavemem/index.js";
import { mergeHooks } from "./lib/merge-hooks.js";

export { CavemanPlugin } from "./modules/caveman/index.js";
export { CavekitPlugin } from "./modules/cavekit/index.js";
export { CavememPlugin } from "./modules/cavemem/index.js";

export type CaveOpenMode = "caveman" | "cavekit" | "cavemem";

const ALL_MODES: CaveOpenMode[] = ["caveman", "cavekit", "cavemem"];

export const CaveOpenPlugin: Plugin = async (ctx, options) => {
  const modes: CaveOpenMode[] = Array.isArray(options?.modes)
    ? (options.modes as string[]).filter((m): m is CaveOpenMode =>
        ALL_MODES.includes(m as CaveOpenMode)
      )
    : ALL_MODES;

  await ctx.client.app.log({
    body: {
      service: "caveopen",
      level: "info",
      message: `loaded (modes: ${modes.join(", ")})`,
    },
  });

  const hookSets = [
    modes.includes("caveman") && cavemanHooks(ctx),
    modes.includes("cavemem") && caveMemHooks(ctx),
    modes.includes("cavekit") && cavekitHooks(ctx),
  ].filter(Boolean) as Parameters<typeof mergeHooks>;

  return mergeHooks(...hookSets);
};

export default CaveOpenPlugin;
