import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import type { Event, TextPart, UserMessage, Part, Model } from "@opencode-ai/sdk"
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { appendFile, mkdir } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { homedir } from "node:os"

const here = dirname(fileURLToPath(import.meta.url))
const _npmSkillPath = join(here, "../assets/skills/caveman/SKILL.md")
const SKILL_PATH = existsSync(_npmSkillPath) ? _npmSkillPath : join(here, "../../skills/caveman/SKILL.md")

// V47: history dir + path as module-level constants; mkdir cached once at init (⊥ per-event)
const HISTORY_DIR = join(homedir(), ".caveman")
const HISTORY_PATH = join(HISTORY_DIR, ".caveman-history.jsonl")
const dirReady: Promise<void> = mkdir(HISTORY_DIR, { recursive: true }).then(() => {}).catch(() => {})

// V46: cap history file to last N rows to prevent unbounded growth
const HISTORY_MAX_ROWS = 10000

function capHistory(filePath: string): void {
  try {
    const raw = readFileSync(filePath, "utf8")
    const lines = raw.split("\n").filter(Boolean)
    if (lines.length > HISTORY_MAX_ROWS) {
      writeFileSync(filePath, lines.slice(-HISTORY_MAX_ROWS).join("\n") + "\n")
    }
  } catch { /* best-effort */ }
}

// Token savings ratio per compression mode (tokens saved / tokens that would have been output)
// Derived from benchmark medians across 21 models (full/lite/ultra modes, n=9 task categories).
// Ultra median includes 8/21 models with 0% savings (many models expand tokens at ultra).
// wenyan-* values are theoretical (no benchmark data collected).
const COMPRESSION: Record<string, number> = {
  lite: 0.53,
  full: 0.50,
  ultra: 0.41,
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

export function parseModeChange(
  text: string
): { action: "activate"; mode: string } | { action: "deactivate" } | null {
  if (!text) return null

  const offMatch = MODE_DEACTIVATE_RE.exec(text) || NL_DEACTIVATE_RE.exec(text)
  if (offMatch) return { action: "deactivate" }

  const onMatch = MODE_ACTIVATE_RE.exec(text) || NL_ACTIVATE_RE.exec(text)
  if (onMatch) return { action: "activate", mode: onMatch[1]?.toLowerCase() ?? "full" }

  return null
}

export const caveman = async (input: PluginInput): Promise<Partial<Hooks>> => {
  // Per-session mode state: keyed by sessionID (V45). Isolated per session, per plugin load.
  // For cross-session persistence the model can re-issue /caveman <mode> on session.created.
  const activeMode = new Map<string, string | null>()
  // V60: capture small model ID from experimental.provider.small_model hook;
  // used in transform to skip SKILL.md push for aux/small-model calls (⊥ typeof-string/regex).
  let capturedSmallModelId: string | null = null
  let rules: string

  try {
    rules = readFileSync(SKILL_PATH, "utf8")
  } catch {
    console.error("[caveopen/caveman] could not read SKILL.md at", SKILL_PATH)
    rules = "CAVEMAN: compress output, drop filler."
  }

  return {
    // ── Command: /caveman-stats — aggregate history and inject stats (V28) ─────
    "command.execute.before": async (
      { command, sessionID }: { command: string; sessionID: string; arguments: string }
    ) => {
      if (command !== "caveman-stats") return

      let statsText: string
      try {
        const raw = readFileSync(HISTORY_PATH, "utf8").trim()
        const lastBySession = new Map<string, {
          ts: number; mode: string | null; output_tokens: number; est_saved_tokens: number
        }>()
        for (const line of raw.split("\n").filter(Boolean)) {
          try {
            const row = JSON.parse(line) as {
              ts: number; session_id: string; mode: string | null
              output_tokens: number; est_saved_tokens: number
            }
            const prev = lastBySession.get(row.session_id)
            if (!prev || row.ts > prev.ts) lastBySession.set(row.session_id, row)
          } catch { /* skip malformed line */ }
        }
        const sessions = [...lastBySession.values()]
        const totalOutput = sessions.reduce((s, r) => s + (r.output_tokens ?? 0), 0)
        const totalSaved = sessions.reduce((s, r) => s + (r.est_saved_tokens ?? 0), 0)
        statsText = [
          `## Caveman Stats (${sessions.length} session${sessions.length !== 1 ? "s" : ""})`,
          `Total output tokens: ${totalOutput}`,
          `Est. saved tokens: ${totalSaved}`,
        ].join("\n")
      } catch {
        statsText = "[caveopen/caveman] no history found"
      }

      await input.client.session.prompt({
        path: { id: sessionID },
        body: { noReply: true, parts: [{ type: "text", text: statsText }] },
      })
    },

    // V60: capture small model ID from experimental.provider.small_model hook.
    // Called by OpenCode when selecting a small model (title-gen, summary, compaction).
    // output.model is the configured small model — capture its id for transform gating.
    "experimental.provider.small_model": async (
      _hookInput: { provider: object },
      hookOutput: { model?: { id: string } }
    ) => {
      capturedSmallModelId = hookOutput.model?.id ?? null
    },

    // ── System prompt: inject compression ruleset (+ active mode nudge) ────────
    // V56 CACHE-PREFIX RULE: push must be static+deterministic for a given mode.
    // V57 REFINEMENT: mode nudge belongs here, NOT in per-turn chat.message parts.
    //   Rationale: chat.message synthetic parts are NOT persisted by OpenCode into
    //   session history → turn N injects the part, turn N+1 omits it (V3 gate blocks
    //   re-add) → user-msg block bytes differ across turns → cache miss each turn.
    //   System push: same mode → same bytes every request → cache hits ✓.
    //   Mode change → one cache bust → accepted per V57 ("re-cache on mode change only").
    // `rules` = readFileSync(SKILL_PATH) once at module init → stable bytes. ✓
    // V58: gate to main agent loop — skip aux/small-model calls (title-gen,
    //   summary, compaction). Aux calls lack sessionID or match captured small
    //   model ID (V60). refines V12.
    "experimental.chat.system.transform": async (
      input: { sessionID?: string; model: Model },
      output: { system: string[] }
    ) => {
      // V58 PRIMARY: skip non-interactive/aux calls (⊥ sessionID = aux/title-gen/summary).
      // This is the reliable gate — independent of hook registration order.
      if (!input.sessionID) return
      // V60 SECONDARY (best-effort): skip when model matches captured small model ID.
      // V102 ORDERING LIMIT: experimental.provider.small_model is NOT guaranteed to fire
      // before the first experimental.chat.system.transform. On early calls capturedSmallModelId
      // is still null → this check does not fire → V58 (!sessionID) is the only guard then.
      // ⊥ assert capture-before-transform ordering. Once captured, V60 fires reliably for
      // subsequent calls. Refines V60, documents V102.
      if (capturedSmallModelId && input.model.id === capturedSmallModelId) return

      const sid = input.sessionID
      const currentMode = sid ? (activeMode.get(sid) ?? null) : null
      if (currentMode) {
        output.system.push(
          rules +
            `\n\n---\nCAVEMAN MODE ACTIVE (${currentMode}). Drop articles/filler/pleasantries/hedging. Compress maximally per ruleset.`
        )
      } else {
        output.system.push(rules)
      }
    },

    // ── chat.message: mode management only ───────────────────────────────────
    // Detects /caveman commands and updates activeMode.
    // Per-turn reinforcement moved to system push (V57) — no synthetic parts injected.
    "chat.message": async (
      input: { sessionID: string; messageID?: string },
      output: { message: UserMessage; parts: Part[] }
    ) => {
      const textPart = output.parts.find((p): p is TextPart => p.type === "text")
      const promptText = (textPart?.text ?? "").trim()
      const change = parseModeChange(promptText)

      if (change?.action === "activate") {
        activeMode.set(input.sessionID, change.mode)
      } else if (change?.action === "deactivate") {
        activeMode.set(input.sessionID, null)
      }
    },

    // ── experimental.text.complete: history row write (V92) ─────────────────
    // Replaces message.updated assistant-text branch (V8 Map accumulation obsolete).
    // Fires once per generation with final output.text → no zero-token guard needed (V29 n/a).
    // output_tokens estimated from text.length / 4 (rough chars-per-token). V5: best-effort.
    "experimental.text.complete": async (
      hookInput: { sessionID: string; messageID: string; partID: string },
      hookOutput: { text: string }
    ) => {
      const mode = activeMode.get(hookInput.sessionID) ?? null
      const outTokens = Math.ceil(hookOutput.text.length / 4)
      const ratio = mode ? (COMPRESSION[mode] ?? null) : null
      const estSaved =
        ratio !== null ? Math.round(outTokens / (1 - ratio)) - outTokens : 0

      try {
        await dirReady
        await appendFile(
          HISTORY_PATH,
          JSON.stringify({
            ts: Date.now(),
            session_id: hookInput.sessionID,
            mode,
            output_tokens: outTokens,
            est_saved_tokens: estSaved,
          }) + "\n"
        )
        capHistory(HISTORY_PATH) // V46: keep file bounded
      } catch {
        // non-fatal — history write is best-effort (V5)
      }
    },

    // ── Compaction: preserve caveman framing across summarization (V101) ────────
    // V56 static-bytes rule does NOT apply — compaction is one-shot, ⊥ cached prefix.
    // Push mode reminder → output.context (⊥ replace output.prompt).
    "experimental.session.compacting": async (
      hookInput: { sessionID: string },
      hookOutput: { context: string[]; prompt?: string }
    ) => {
      const currentMode = activeMode.get(hookInput.sessionID) ?? null
      if (!currentMode) return
      hookOutput.context.push(
        `CAVEMAN MODE ACTIVE (${currentMode}). Drop articles/filler/pleasantries/hedging. Compress maximally per ruleset.`
      )
    },

    // ── Event hook: session lifecycle only ───────────────────────────────────
    // Token tracking moved to experimental.text.complete (V92). Only session.created remains.
    event: async ({ event }: { event: Event }) => {
      if (event.type === "session.created") {
        const sid = (event as { type: "session.created"; properties: { info: { id: string } } }).properties.info.id
        activeMode.delete(sid) // V45: clear mode for this sid on session reset
      }
    },
  }
}
