const specContextCache = new Map<string, string>();
const specDirtySet = new Set<string>();

export function getSpecContext(sessionID: string): string | undefined {
  return specContextCache.get(sessionID);
}

export function setSpecContext(sessionID: string, ctx: string): void {
  specContextCache.set(sessionID, ctx);
}

export function hasSpecSession(sessionID: string): boolean {
  return specContextCache.has(sessionID);
}

export function deleteSpecSession(sessionID: string): void {
  specContextCache.delete(sessionID);
  specDirtySet.delete(sessionID);
}

export function markSpecDirty(sessionID: string): void {
  specDirtySet.add(sessionID);
}

export function isSpecDirty(sessionID: string): boolean {
  return specDirtySet.has(sessionID);
}

export function allSessionIDs(): string[] {
  return [...specContextCache.keys()];
}
