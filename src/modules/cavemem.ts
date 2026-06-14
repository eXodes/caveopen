import type { Plugin } from "@opencode-ai/plugin";

/**
 * CavememPlugin — persistent cross-session memory hooks.
 *
 * Placeholder: will connect to the cavemem MCP server and inject
 * relevant memories into session context automatically.
 *
 * Planned hooks:
 *   - session.created                     fetch + inject relevant memories
 *   - experimental.session.compacting     persist new memories before compaction
 *   - session.idle                        sync memory store after session ends
 *   - chat.message                        inject recalled context into messages
 */
export const CavememPlugin: Plugin = async ({ client }) => {
  await client.app.log({
    body: { service: "caveopen:cavemem", level: "info", message: "loaded" },
  });

  return {
    // TODO: implement cavemem hooks
  };
};
