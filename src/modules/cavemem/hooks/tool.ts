import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import { runCavememHook } from "../lib/runner.js";

export function toolExecuteAfterHook(
  ctx: PluginInput,
): NonNullable<Hooks["tool.execute.after"]> {
  return async (input, output) => {
    await runCavememHook("post-tool-use", {
      session_id: input.sessionID,
      tool_name: input.tool,
      tool_input: input.args,
      tool_response: output.output ?? output.title,
    });
  };
}
