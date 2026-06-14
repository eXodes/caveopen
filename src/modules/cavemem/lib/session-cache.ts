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
