import type { Plugin, PluginInput, Hooks } from "@opencode-ai/plugin";
import { commandExecuteBeforeHook } from "./hooks/command.js";
import { setConfig } from "./hooks/set-config.js";

export function cavekitHooks(ctx: PluginInput): Hooks {
  return {
    "command.execute.before": commandExecuteBeforeHook(ctx),
    "config": setConfig(ctx),
  };
}

export const CavekitPlugin: Plugin = async (ctx) => {
  await ctx.client.app.log({
    body: { service: "caveopen:cavekit", level: "info", message: "loaded" },
  });
  return cavekitHooks(ctx);
};
