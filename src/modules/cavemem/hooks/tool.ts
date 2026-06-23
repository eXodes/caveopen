import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import { runCavememHook } from "../lib/runner.js";
import { hasSession } from "../lib/context.js";
import { initSession } from "./session-init.js";

export function toolExecuteAfterHook(
  ctx: PluginInput,
): NonNullable<Hooks["tool.execute.after"]> {
  return async (input, output) => {
    const sessionID = input.sessionID;
    if (!sessionID) return;

    // Subagent sessions: tool.execute.after can fire before session.created
    // reaches the event handler. cavemem's ensureSession() would write
    // ide:'unknown'/cwd:null first, then INSERT OR IGNORE blocks the real
    // session-start. Eagerly init with correct data before post-tool-use.
    if (!hasSession(sessionID)) {
      try {
        const resp = await ctx.client.session.get({ path: { id: sessionID } });
        const dir = resp.data?.directory ?? ctx.directory;
        await initSession(sessionID, dir);
      } catch {
        // best-effort; don't block tool hook
      }
    }

    await runCavememHook("post-tool-use", {
      session_id: sessionID,
      tool_name: input.tool,
      tool_input: input.args,
      tool_response: output.output || output.title,
    });
  };
}
