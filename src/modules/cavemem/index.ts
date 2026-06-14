import type { Plugin } from "@opencode-ai/plugin";

/**
 * CavememPlugin — persistent cross-session memory hooks.
 */
export const CavememPlugin: Plugin = async ({ client }) => {
  await client.app.log({
    body: { service: "caveopen:cavemem", level: "info", message: "loaded" },
  });

  return {
    // TODO: implement cavemem hooks
  };
};
