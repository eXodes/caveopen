import { Hooks, PluginInput } from "@opencode-ai/plugin";

export function setConfig(ctx: PluginInput): NonNullable<Hooks["config"]> {
  return async (config) => {
    config.command = {
      ...config.command,
      "ck:init": {
        template: "/ck:init",
        description:
          "Copy/overwrite FORMAT.md (the SPEC.md schema) to the current project root",
      },
    };
  };
}
