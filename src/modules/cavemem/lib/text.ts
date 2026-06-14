import type { PluginInput } from "@opencode-ai/plugin";
import type { Message, Part, TextPart } from "@opencode-ai/sdk";

export function extractText(parts: Part[]): string {
  return parts
    .filter((p): p is TextPart => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

export function stringifyShort(value: unknown): string {
  try {
    return JSON.stringify(value)?.slice(0, 2000) ?? "";
  } catch {
    return String(value).slice(0, 2000);
  }
}

export async function getLastAssistantText(
  client: PluginInput["client"],
  sessionID: string,
): Promise<string | null> {
  let messages: Awaited<ReturnType<typeof client.session.messages>>;
  try {
    messages = await client.session.messages({ path: { id: sessionID } });
  } catch {
    return null;
  }

  const items = (messages.data ?? []).slice().reverse();
  for (const item of items) {
    const msg = item.info as Message;
    if (msg.role !== "assistant") continue;
    const parts: Part[] = (item as Record<string, unknown>)["parts"] as Part[] ?? [];
    const text = extractText(parts);
    if (text.trim()) return text;
  }
  return null;
}
