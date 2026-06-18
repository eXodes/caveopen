import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import { runCavememHook } from "../lib/runner.js";
import { hasSession } from "../lib/session-cache.js";
import { initSession } from "./session-init.js";
import { extractText } from "../lib/text.js";

export function chatMessageHook(
  ctx: PluginInput,
): NonNullable<Hooks["chat.message"]> {
  return async (input, output) => {
    const sessionID = input.sessionID;
    if (!sessionID) return;

    // Same race as tool.execute.after: user-prompt-submit triggers
    // ensureSession() in cavemem with ide:"unknown"/cwd:null if session-start
    // hasn't completed yet. Eagerly init before adding any observation.
    if (!hasSession(sessionID)) {
      try {
        const resp = await ctx.client.session.get({ path: { id: sessionID } });
        await initSession(sessionID, resp.data?.directory ?? ctx.directory);
      } catch {
        // best-effort; don't block message hook
      }
    }

    const text = extractText(output.parts);
    if (!text.trim()) return;

    await runCavememHook("user-prompt-submit", {
      session_id: sessionID,
      prompt: text,
    });
  };
}
