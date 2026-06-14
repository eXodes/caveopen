import type { Plugin } from "@opencode-ai/plugin";
import { CavemanPlugin } from "./modules/caveman/index.js";
import { CavekitPlugin } from "./modules/cavekit/index.js";
import { CavememPlugin } from "./modules/cavemem/index.js";

export { CavemanPlugin } from "./modules/caveman/index.js";
export { CavekitPlugin } from "./modules/cavekit/index.js";
export { CavememPlugin } from "./modules/cavemem/index.js";

const plugins: Plugin[] = [CavemanPlugin, CavekitPlugin, CavememPlugin];

export const CaveOpenPlugin: Plugin = async (ctx) => {
  const hooks = await Promise.all(plugins.map((p) => p(ctx)));
  return Object.assign({}, ...hooks);
};

export default CaveOpenPlugin;
