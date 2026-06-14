import type { Plugin } from "@opencode-ai/plugin";

/**
 * CavekitPlugin — spec-driven development (SDD) hooks.
 */
export const CavekitPlugin: Plugin = async ({ client }) => {
  await client.app.log({
    body: { service: "caveopen:cavekit", level: "info", message: "loaded" },
  });

  return {
    // TODO: implement cavekit hooks
  };
};
