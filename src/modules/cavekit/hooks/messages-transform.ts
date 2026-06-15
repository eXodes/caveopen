import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import type { TextPart } from "@opencode-ai/sdk";

export function messagesTransformHook(
  ctx: PluginInput,
): NonNullable<Hooks["experimental.chat.messages.transform"]> {
  return async (input, output) => {
    const last = output.messages.at(-1);
    if (!last || last.info.role !== "user") return;

    const isInit = last.parts.some(
      (p) => p.type === "text" && (p as TextPart).text.trim() === "/ck:init",
    );

    if (!isInit) return;

    // /ck:init is fully handled by command.execute.before — drop it so LLM never responds
    output.messages = [];
  };
}
