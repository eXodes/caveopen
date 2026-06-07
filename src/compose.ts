import type { Hooks } from "@opencode-ai/plugin"

/**
 * Compose two hooks objects so same-key handlers both run.
 * - `tool`: sub-maps merged (both dicts shallow-merged)
 * - `auth` | `provider` | `config`: last-write-wins
 * - `tool.execute.before` | `permission.ask`: bare chain a→b; throw propagates + blocks op (V96)
 * - all other keys: chain a → b with fault isolation; a throw warns + b still runs (V44)
 */

// V96: blocking hooks — throw must propagate to block the op; no swallow-wrap
const BLOCKING_HOOKS = new Set(["tool.execute.before", "permission.ask"])

export function composeHooks(a: Partial<Hooks>, b: Partial<Hooks>): Partial<Hooks> {
  const out = { ...a } as Record<string, unknown>
  for (const [k, fn] of Object.entries(b)) {
    const prev = out[k]
    if (prev === undefined) {
      out[k] = fn
      continue
    }
    if (k === "tool") {
      out[k] = {
        ...(prev as Record<string, unknown>),
        ...(fn as Record<string, unknown>),
      }
      continue
    }
    if (k === "auth" || k === "provider") {
      out[k] = fn
      continue
    }
    // V97: config is a mutator (config)=>void — chain both a+b on same arg; ⊥ last-write-wins
    const chainPrev = prev as (...args: unknown[]) => Promise<void>
    const chainFn = fn as (...args: unknown[]) => Promise<void>
    if (BLOCKING_HOOKS.has(k)) {
      // V96: bare chain — a throw propagates, b skipped, op blocked
      out[k] = async (...args: unknown[]) => {
        await chainPrev(...args)
        await chainFn(...args)
      }
    } else {
      // V44: fault isolation — a throw warns + continue; b always runs
      out[k] = async (...args: unknown[]) => {
        try { await chainPrev(...args) } catch (e) { console.warn(`[caveopen] hook "${k}" (a) threw:`, e) }
        try { await chainFn(...args) } catch (e) { console.warn(`[caveopen] hook "${k}" (b) threw:`, e) }
      }
    }
  }
  return out as Partial<Hooks>
}
