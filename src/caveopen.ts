import type { Plugin, PluginOptions } from "@opencode-ai/plugin";
import { cavemanHooks } from "./modules/caveman/index.js";
import { cavekitHooks } from "./modules/cavekit/index.js";
import { caveMemHooks } from "./modules/cavemem/index.js";
import { mergeHooks } from "./lib/merge-hooks.js";
import {
  combinedSystemTransform,
  type SystemContentProvider,
} from "./hooks/system-transform.js";
import { getCavemanSystemRuleset } from "./modules/caveman/lib/ruleset.js";
import { getCavememSystemSessionCache } from "./modules/cavemem/lib/session-cache.js";

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

  const merged = mergeHooks(...hookSets);

  // Replace the two individual system.transform hooks (caveman + cavemem) with a
  // single combined handler that pushes ruleset + priorContext as one system[] entry.
  // This keeps both in system[1] — within applyCaching()'s 2-slot window — instead of
  // spilling priorContext to system[2] (perpetual cache miss).
  // Providers are only added for active modules; inactive modules are not called.
  const providers: SystemContentProvider[] = [];

  if (modes.includes("caveman")) {
    providers.push((sessionID) => getCavemanSystemRuleset());
  }

  if (modes.includes("cavemem")) {
    const skipPriorContext = opts.cavemem?.skipPriorContext ?? false;
    providers.push((sessionID) =>
      getCavememSystemSessionCache(sessionID, { skipPriorContext }),
    );
  }

  if (providers.length > 0) {
    (merged as Record<string, unknown>)["experimental.chat.system.transform"] =
      combinedSystemTransform(providers);
  }

  return merged;
};

export default CaveOpenPlugin;
