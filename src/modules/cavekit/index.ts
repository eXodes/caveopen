import type { Plugin, PluginInput, Hooks } from "@opencode-ai/plugin";
import { commandExecuteBeforeHook } from "./hooks/command.js";
import {
  handleSessionCreated,
  systemTransformHook,
} from "./hooks/session-init.js";
import { handleFileWatcherUpdated } from "./hooks/file-watcher.js";

export function cavekitHooks(ctx: PluginInput): Hooks {
  return {
    "command.execute.before": commandExecuteBeforeHook(ctx),
    "experimental.chat.system.transform": systemTransformHook(ctx),
    "event": async ({ event }) => {
      await handleSessionCreated(event, ctx);
      await handleFileWatcherUpdated(event, ctx);
    },
  };
}

export const CavekitPlugin: Plugin = async (ctx) => {
  await ctx.client.app.log({
    body: { service: "caveopen:cavekit", level: "info", message: "loaded" },
  });
  return cavekitHooks(ctx);
};
