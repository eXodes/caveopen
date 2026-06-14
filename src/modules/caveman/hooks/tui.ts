import type { Event } from "@opencode-ai/sdk";
import type { PluginInput } from "@opencode-ai/plugin";
import { readModeFlag, readStatuslineSuffix } from "../lib/config.js";

export async function handleTuiEvents(event: Event, ctx: PluginInput): Promise<void> {
  if (event.type === "session.idle") {
    const activeMode = readModeFlag();
    if (!activeMode) return;

    try {
      await ctx.client.tui.showToast({
        body: {
          message: `[CAVEMAN:${activeMode.toUpperCase()}] active`,
          variant: "info",
        },
      });
    } catch {
      // headless — no TUI
    }
    return;
  }

  if (event.type === "tui.prompt.append") {
    const activeMode = readModeFlag();
    if (!activeMode) return;

    const suffix = readStatuslineSuffix();
    const badge = `[CAVEMAN:${activeMode.toUpperCase()}]${suffix ? " " + suffix : ""}`;

    try {
      await ctx.client.tui.appendPrompt({
        body: { text: badge },
      });
    } catch {
      // headless — no TUI
    }
  }
}
