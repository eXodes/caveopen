import type { Hooks } from "@opencode-ai/plugin";

type AnyFn = (...args: unknown[]) => Promise<void>;

export function mergeHooks(...hookSets: Partial<Hooks>[]): Hooks {
  const merged: Record<string, AnyFn[]> = {};

  for (const hooks of hookSets) {
    for (const [key, fn] of Object.entries(hooks)) {
      if (typeof fn !== "function") continue;
      merged[key] ??= [];
      merged[key].push(fn as AnyFn);
    }
  }

  const result: Record<string, AnyFn> = {};
  for (const [key, fns] of Object.entries(merged)) {
    result[key] = async (...args: unknown[]) => {
      for (const fn of fns) await fn(...args);
    };
  }

  return result as unknown as Hooks;
}
