import type { PluginInput } from "@opencode-ai/plugin";
import type { Part, TextPart } from "@opencode-ai/sdk";

export function extractText(parts: Part[]): string {
  return parts
    .filter((p): p is TextPart => p.type === "text")
    .map((p) => p.text)
    .join("\n");
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
    const msg = item.info;
    if (msg.role !== "assistant") continue;
    const parts: Part[] = item.parts;
    const text = extractText(parts);
    if (text.trim()) return text;
  }
  return null;
}
