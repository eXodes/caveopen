import type { Plugin, PluginInput, Hooks } from "@opencode-ai/plugin";
import type { CaveOpenOptions } from "../../caveopen.js";
import {
  handleSessionCreated,
  systemTransformHook,
} from "./hooks/session-init.js";
import { chatMessageHook } from "./hooks/message.js";
import { toolExecuteAfterHook } from "./hooks/tool.js";
import { handleSessionIdle } from "./hooks/turn-summary.js";
import { handleSessionDeleted } from "./hooks/session-end.js";

export function caveMemHooks(
  ctx: PluginInput,
  options?: CaveOpenOptions["cavemem"],
): Hooks {
  return {
    "experimental.chat.system.transform": systemTransformHook(ctx, options),
    "chat.message": chatMessageHook(ctx),
    "tool.execute.after": toolExecuteAfterHook(ctx),
    "event": async ({ event }) => {
      await handleSessionCreated(event, ctx);
      await handleSessionIdle(event, ctx);
      await handleSessionDeleted(event, ctx);
    },
  };
}

export const CavememPlugin: Plugin = async (ctx) => {
  await ctx.client.app.log({
    body: { service: "caveopen:cavemem", level: "info", message: "loaded" },
  });
  return caveMemHooks(ctx);
};
