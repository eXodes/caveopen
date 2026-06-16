import type { PluginInput } from "@opencode-ai/plugin";
import type { Message } from "@opencode-ai/sdk";

export type SessionTokens = {
  input: number;
  output: number;
  cache: { read: number; write: number };
};

export async function getSessionTokens(
  client: PluginInput["client"],
  sessionID: string,
): Promise<SessionTokens | null> {
  let messages: Awaited<ReturnType<typeof client.session.messages>>;
  try {
    messages = await client.session.messages({ path: { id: sessionID } });
  } catch {
    return null;
  }

  const items = messages.data ?? [];
  const totals: SessionTokens = {
    input: 0,
    output: 0,
    cache: { read: 0, write: 0 },
  };

  for (const item of items) {
    const msg = item.info;
    if (msg.role !== "assistant") continue;
    const t = msg.tokens;
    totals.input += t.input;
    totals.output += t.output;
    totals.cache.read += t.cache.read;
    totals.cache.write += t.cache.write;
  }

  return totals.output > 0 ? totals : null;
}
