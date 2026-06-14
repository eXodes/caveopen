import type { Plugin } from "@opencode-ai/plugin";
import { CavemanPlugin } from "./modules/caveman.js";
import { CavekitPlugin } from "./modules/cavekit.js";
import { CavememPlugin } from "./modules/cavemem.js";

export { CavemanPlugin } from "./modules/caveman.js";
export { CavekitPlugin } from "./modules/cavekit.js";
export { CavememPlugin } from "./modules/cavemem.js";

const plugins: Plugin[] = [CavemanPlugin, CavekitPlugin, CavememPlugin];

export const CaveOpenPlugin: Plugin = async (ctx) => {
  const hooks = await Promise.all(plugins.map((p) => p(ctx)));
  return Object.assign({}, ...hooks);
};

export default CaveOpenPlugin;
