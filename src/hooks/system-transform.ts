import type { Hooks } from "@opencode-ai/plugin";

/**
 * Returns the content to inject into system[] for a given session, or null to skip.
 * Receives sessionID from the transform input so cavemem can look up its per-session cache.
 */
export type SystemContentProvider = (sessionID: string | undefined) => string | null;

/**
 * Combines multiple content providers into a single experimental.chat.system.transform
 * handler that pushes all non-null results as one concatenated system[] entry.
 *
 * This keeps caveman ruleset + cavemem priorContext in a single slot (system[1]),
 * so both are within applyCaching()'s 2-slot window instead of spilling to system[2].
 *
 * caveopen.ts builds the providers array conditionally based on active modes —
 * providers for inactive modules are never added, so this function stays generic.
 */
export function combinedSystemTransform(
  providers: SystemContentProvider[],
): NonNullable<Hooks["experimental.chat.system.transform"]> {
  return async (input, output) => {
    const parts = providers
      .map((fn) => fn(input.sessionID))
      .filter((s): s is string => !!s);

    if (parts.length > 0) {
      output.system.push(parts.join("\n\n"));
    }
  };
}
