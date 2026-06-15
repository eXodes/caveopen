import type { Event } from "@opencode-ai/sdk";
import type { PluginInput } from "@opencode-ai/plugin";
import { allSessionIDs, markSpecDirty } from "../lib/cache.js";

export async function handleFileWatcherUpdated(
  event: Event,
  ctx: PluginInput,
): Promise<void> {
  if (event.type !== "file.watcher.updated") return;

  const changedPath =
    (event.properties as unknown as Record<string, string> | undefined)?.path ??
    "";
  if (!changedPath.endsWith("SPEC.md")) return;

  for (const id of allSessionIDs()) {
    markSpecDirty(id);
  }

  await ctx.client.app.log({
    body: {
      service: "caveopen:cavekit",
      level: "info",
      message: "SPEC.md changed — cache will refresh next session",
    },
  });
}
