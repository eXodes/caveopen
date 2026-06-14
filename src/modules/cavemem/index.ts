import type { Plugin, PluginInput, Hooks } from "@opencode-ai/plugin";
import { handleSessionCreated, systemTransformHook } from "./hooks/session-init.js";
import { chatMessageHook } from "./hooks/message.js";
import { toolUseHook } from "./hooks/tool-use.js";
import { handleSessionIdle } from "./hooks/turn-summary.js";
import { handleSessionDeleted, disposeHook } from "./hooks/session-end.js";

export function caveMemHooks(ctx: PluginInput): Hooks {
  return {
    "experimental.chat.system.transform": systemTransformHook(),
    "chat.message": chatMessageHook(ctx),
    "tool.execute.after": toolUseHook(ctx),
    dispose: disposeHook,
    event: async ({ event }) => {
      await handleSessionCreated(event);
      await handleSessionIdle(event, ctx);
      await handleSessionDeleted(event);
    },
  };
}

export const CavememPlugin: Plugin = async (ctx) => {
  await ctx.client.app.log({
    body: { service: "caveopen:cavemem", level: "info", message: "loaded" },
  });
  return caveMemHooks(ctx);
};
