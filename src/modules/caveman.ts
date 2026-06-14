import type { Plugin } from "@opencode-ai/plugin";

/**
 * CavemanPlugin — caveman communication mode hooks.
 */
export const CavemanPlugin: Plugin = async ({ client }) => {
  await client.app.log({
    body: { service: "caveopen:caveman", level: "info", message: "loaded" },
  });

  return {
    // TODO: implement caveman hooks
  };
};
