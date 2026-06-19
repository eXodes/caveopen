import { CaveOpenOptions } from "../../../caveopen.js";

const cache = new Map<string, string>();

export function getCachedContext(sessionID: string): string | undefined {
  return cache.get(sessionID);
}

export function setCachedContext(sessionID: string, ctx: string): void {
  cache.set(sessionID, ctx);
}

export function deleteCachedContext(sessionID: string): void {
  cache.delete(sessionID);
}

export function hasSession(sessionID: string): boolean {
  return cache.has(sessionID);
}

/**
 * Returns cached prior-session context for injection into system[], or null to skip.
 * Used by caveopen.ts to build the combined system.transform provider.
 * Empty string context (session initialized but no prior summaries) → null (no push).
 */
export function getCavememSystemSessionCache(
  sessionID: string | undefined,
  options?: CaveOpenOptions["cavemem"],
): string | null {
  if (options?.skipPriorContext) return null;
  if (!sessionID) return null;
  return cache.get(sessionID) || null;
}
