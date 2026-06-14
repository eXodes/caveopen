import type { Plugin } from "@opencode-ai/plugin";

/**
 * CavemanPlugin — caveman communication mode hooks.
 *
 * Placeholder: will inject compressed-communication system prompt
 * transforms and session-level mode tracking.
 *
 * Planned hooks:
 *   - experimental.chat.system.transform  inject caveman mode instructions
 *   - experimental.session.compacting     preserve mode across compaction
 *   - chat.message                        strip filler from outbound parts
 */
export const CavemanPlugin: Plugin = async ({ client }) => {
  await client.app.log({
    body: { service: "caveopen:caveman", level: "info", message: "loaded" },
  });

  return {
    // TODO: implement caveman hooks
  };
};
