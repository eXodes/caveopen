import type { Plugin, PluginOptions } from "@opencode-ai/plugin";
import { cavemanHooks } from "./modules/caveman/index.js";
import { cavekitHooks } from "./modules/cavekit/index.js";
import { caveMemHooks } from "./modules/cavemem/index.js";
import { mergeHooks } from "./lib/merge-hooks.js";

export type CaveOpenMode = "caveman" | "cavekit" | "cavemem";

export interface CaveOpenOptions extends PluginOptions {
  modes?: CaveOpenMode[];
  cavemem?: {
    skipPriorContext?: boolean;
  };
}

const ALL_MODES: CaveOpenMode[] = ["caveman", "cavekit", "cavemem"];

export const CaveOpenPlugin: Plugin = async (
  ctx,
  options: CaveOpenOptions | undefined,
) => {
  const opts = options ?? {};

  const modes: CaveOpenMode[] =
    Array.isArray(opts.modes) ?
      opts.modes.filter((m): m is CaveOpenMode =>
        ALL_MODES.includes(m as CaveOpenMode),
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
    modes.includes("cavemem") && caveMemHooks(ctx, opts.cavemem),
    modes.includes("cavekit") && cavekitHooks(ctx),
  ].filter(Boolean) as Parameters<typeof mergeHooks>;

  return mergeHooks(...hookSets);
};

export default CaveOpenPlugin;
