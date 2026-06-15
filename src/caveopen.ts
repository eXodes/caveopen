import type { Plugin } from "@opencode-ai/plugin";
import { cavemanHooks } from "./modules/caveman/index.js";
import { cavekitHooks } from "./modules/cavekit/index.js";
import { caveMemHooks } from "./modules/cavemem/index.js";
import { mergeHooks } from "./lib/merge-hooks.js";

export { CavemanPlugin } from "./modules/caveman/index.js";
export { CavekitPlugin } from "./modules/cavekit/index.js";
export { CavememPlugin } from "./modules/cavemem/index.js";

export const CaveOpenPlugin: Plugin = async (ctx) => {
  await Promise.all([
    ctx.client.app.log({
      body: { service: "caveopen", level: "info", message: "loaded" },
    }),
  ]);

  return mergeHooks(
    cavemanHooks(ctx),
    caveMemHooks(ctx),
    cavekitHooks(ctx)
  );
};

export default CaveOpenPlugin;
