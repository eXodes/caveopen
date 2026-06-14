import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import { getStore } from "../lib/store.js";
import { stringifyShort } from "../lib/text.js";
import { enqueueEmbedding } from "../lib/worker.js";

export function toolUseHook(
  _ctx: PluginInput,
): NonNullable<Hooks["tool.execute.after"]> {
  return async (input, output) => {
    const body = [
      input.tool,
      `input=${stringifyShort(input.args)}`,
      `output=${stringifyShort(output.output)}`,
    ]
      .join(" ")
      .slice(0, 4000);

    if (!body.trim()) return;

    const store = await getStore();
    if (!store) return;

    const id = store.addObservation({
      session_id: input.sessionID,
      kind: "tool_use",
      content: body,
      metadata: { tool: input.tool },
    });

    if (id > 0) {
      enqueueEmbedding(async () => {
        // embedding is best-effort; no embedder wired in-process by default
      });
    }
  };
}
