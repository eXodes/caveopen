import type { Plugin, PluginInput, Hooks } from "@opencode-ai/plugin";
import { systemTransformHook, handleSessionCreated } from "./hooks/activation.js";
import { chatMessageHook } from "./hooks/message.js";
import { handleSessionIdle } from "./hooks/history.js";
import { commandExecuteBeforeHook } from "./hooks/commands.js";
import { handleTuiEvents } from "./hooks/tui.js";

export function cavemanHooks(ctx: PluginInput): Hooks {
  return {
    "experimental.chat.system.transform": systemTransformHook(),
    "chat.message": chatMessageHook(),
    "command.execute.before": commandExecuteBeforeHook(ctx),
    event: async ({ event }) => {
      await handleSessionCreated(event);
      await handleSessionIdle(event, ctx);
      await handleTuiEvents(event, ctx);
    },
  };
}

export const CavemanPlugin: Plugin = async (ctx) => {
  await ctx.client.app.log({
    body: { service: "caveopen:caveman", level: "info", message: "loaded" },
  });
  return cavemanHooks(ctx);
};
