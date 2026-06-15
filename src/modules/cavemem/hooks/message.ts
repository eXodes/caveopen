import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import { getStore } from "../lib/store.js";
import { extractText } from "../lib/text.js";
import { enqueueEmbedding } from "../lib/worker.js";

export function chatMessageHook(
  ctx: PluginInput,
): NonNullable<Hooks["chat.message"]> {
  return async (input, output) => {
    const text = extractText(output.parts);
    if (!text.trim()) return;

    const store = await getStore();
    if (!store) return;

    const id = store.addObservation({
      session_id: input.sessionID,
      kind: "user_prompt",
      content: text,
    });

    if (id > 0) {
      enqueueEmbedding(async () => {
        // embedding is best-effort; no embedder wired in-process by default
      });
    }
  };
}
