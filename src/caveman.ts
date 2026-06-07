import type { PluginInput } from "@opencode-ai/plugin"
import { readFileSync, appendFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { homedir } from "node:os"

const here = dirname(fileURLToPath(import.meta.url))
const SKILL_PATH = join(here, "../assets/skills/caveman/SKILL.md")

// Token savings ratio per compression mode (tokens saved / tokens that would have been output)
// e.g. lite: model outputs ~59% of baseline → saves ~41%
const COMPRESSION: Record<string, number> = {
  lite: 0.41,
  full: 0.44,
  ultra: 0.90,
  "wenyan-lite": 0.35,
  "wenyan-full": 0.65,
  "wenyan-ultra": 0.80,
}

// Slash command + natural-language triggers
const MODE_ACTIVATE_RE =
  /^\/caveman(?:\s+(lite|full|ultra|wenyan-lite|wenyan-full|wenyan-ultra))?$/i
const MODE_DEACTIVATE_RE = /^\/caveman\s+off$/i
const NL_ACTIVATE_RE =
  /\b(?:activate|enable|use)\s+caveman(?:\s+(lite|full|ultra|wenyan-lite|wenyan-full|wenyan-ultra))?\b/i
const NL_DEACTIVATE_RE =
  /\b(?:deactivate|disable|turn\s+off)\s+caveman\b/i

// Persistent mode state — stored per-process in memory.
// For cross-session persistence the model can re-issue /caveman <mode> on session.created.
let activeMode: string | null = null

function parseModeChange(
  text: string
): { action: "activate"; mode: string } | { action: "deactivate" } | null {
  if (!text) return null

  const offMatch = MODE_DEACTIVATE_RE.exec(text) || NL_DEACTIVATE_RE.exec(text)
  if (offMatch) return { action: "deactivate" }

  const onMatch = MODE_ACTIVATE_RE.exec(text) || NL_ACTIVATE_RE.exec(text)
  if (onMatch) return { action: "activate", mode: onMatch[1]?.toLowerCase() ?? "lite" }

  return null
}

function historyPath(): string {
  const dir = join(homedir(), ".config", "caveman")
  mkdirSync(dir, { recursive: true })
  return join(dir, ".caveman-history.jsonl")
}

export const caveman = async (_input: PluginInput) => {
  // Per-session reinforcement gate: only inject once per session to avoid noise
  let reinforcementSent = false
  let rules: string

  try {
    rules = readFileSync(SKILL_PATH, "utf8")
  } catch {
    console.error("[caveopen/caveman] could not read SKILL.md at", SKILL_PATH)
    rules = "CAVEMAN: compress output, drop filler."
  }

  return {
    // ── System prompt: inject compression ruleset before every LLM call ──────
    "experimental.chat.system.transform": async (
      _in: unknown,
      output: { system: string[] }
    ) => {
      output.system.push(rules)
    },

    // ── Prompt append: mode management + per-prompt reinforcement ─────────────
    // tui.prompt.append is undocumented, not in typed Hooks — cast as any at call site
    "tui.prompt.append": async (
      input: { prompt?: string; text?: string } | undefined
    ) => {
      const promptText = (input?.prompt ?? input?.text ?? "").trim()
      const change = parseModeChange(promptText)

      if (change?.action === "activate") {
        activeMode = change.mode
        reinforcementSent = false
      } else if (change?.action === "deactivate") {
        activeMode = null
        reinforcementSent = false
      }

      if (activeMode && !reinforcementSent) {
        reinforcementSent = true
        return {
          append: `CAVEMAN MODE ACTIVE (${activeMode}). Drop articles/filler/pleasantries/hedging. Compress maximally per ruleset.`,
        }
      }

      return undefined
    },

    // ── Event hook: session lifecycle + token tracking ────────────────────────
    event: async ({ event }: { event: { type: string; properties?: unknown } }) => {
      if (event.type === "session.created") {
        reinforcementSent = false
        return
      }

      if (event.type !== "message.updated") return

      const info = (event.properties as any)?.info
      if (!info || info.role !== "assistant" || !info.time?.completed) return

      const outTokens: number = info.tokens?.output ?? 0
      const ratio = activeMode ? (COMPRESSION[activeMode] ?? null) : null
      const estSaved =
        ratio !== null ? Math.round(outTokens / (1 - ratio)) - outTokens : 0

      try {
        appendFileSync(
          historyPath(),
          JSON.stringify({
            ts: Date.now(),
            session_id: info.sessionID ?? null,
            mode: activeMode,
            output_tokens: outTokens,
            est_saved_tokens: estSaved,
          }) + "\n"
        )
      } catch {
        // non-fatal — history write is best-effort
      }
    },
  }
}
