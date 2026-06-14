import { homedir } from "node:os";
import { join } from "node:path";

export interface StorageLike {
  listSessions(limit: number): Array<{ id: string; cwd: string | null; started_at: number; ended_at: number | null }>;
  listSummaries(sessionId: string): Array<{ scope: string; content: string }>;
}

export interface MemoryStoreCompat {
  readonly storage: StorageLike;
  startSession(p: { id: string; ide: string; cwd: string | null }): void;
  endSession(id: string): void;
  addObservation(p: { session_id: string; kind: string; content: string; metadata?: Record<string, unknown> }): number;
  addSummary(p: { session_id: string; scope: "turn" | "session"; content: string }): number;
  close(): void;
}

const DB_PATH = join(homedir(), ".cavemem", "memory.db");

let store: MemoryStoreCompat | null = null;
let initAttempted = false;

export async function getStore(): Promise<MemoryStoreCompat | null> {
  if (initAttempted) return store;
  initAttempted = true;

  try {
    const [coreModule, configModule] = await Promise.all([
      import("@cavemem/core" as string),
      import("@cavemem/config" as string),
    ]);
    const settings = (configModule as { SettingsSchema: { parse(v: unknown): unknown } }).SettingsSchema.parse({});
    const { MemoryStore } = coreModule as { MemoryStore: new (o: { dbPath: string; settings: unknown }) => MemoryStoreCompat };
    store = new MemoryStore({ dbPath: DB_PATH, settings });
  } catch {
    store = null;
  }

  return store;
}

export function closeStore(): void {
  store?.close();
  store = null;
  initAttempted = false;
}
