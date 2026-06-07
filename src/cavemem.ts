import type { PluginInput } from "@opencode-ai/plugin"
import { execSync } from "node:child_process"

// Escape a string for safe use as a single-quoted shell argument
function shellEsc(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`
}

// Call cavemem hook runner. Non-fatal on failure.
function runHook(name: string, data: Record<string, unknown>): void {
  try {
    const json = JSON.stringify(data)
    execSync(
      `printf '%s' ${shellEsc(json)} | cavemem hook run ${name} --ide opencode 2>&1`,
      { encoding: "utf8", timeout: 10_000 }
    )
  } catch (err) {
    // cavemem not installed or hook runner not available — log and continue
    console.warn(`[caveopen/cavemem] hook "${name}" failed:`, (err as Error).message?.slice(0, 120))
  }
}

// Check cavemem CLI is available, warn once on first use rather than at plugin load
let cavememChecked = false
let cavememAvailable = true
function ensureCavemem(): boolean {
  if (cavememChecked) return cavememAvailable
  cavememChecked = true
  try {
    execSync("cavemem --version", { encoding: "utf8", timeout: 3_000, stdio: "pipe" })
    cavememAvailable = true
  } catch {
    console.warn("[caveopen/cavemem] cavemem CLI not found — memory hooks disabled. Install: npm install -g cavemem")
    cavememAvailable = false
  }
  return cavememAvailable
}

export const cavemem = async ({ directory }: PluginInput) => {
  // V57 phantom-session guard:
  // session.created fires even when user opens + immediately closes OpenCode.
  // We defer session-start until we see the first real user message.
  const activeSessions = new Set<string>()   // all sessions that fired session.created
  const startedSessions = new Set<string>()  // sessions where session-start was called
  const messageTexts = new Map<string, { sessionID: string; text: string }>()

  return {
    // ── System prompt: tell the model it has cavemem tools ───────────────────
    "experimental.chat.system.transform": async (
      _in: unknown,
      output: { system: string[] }
    ) => {
      output.system.push(
        "You have cavemem memory tools available (search, timeline, get_observations). " +
        "Use them when past context, decisions, or observations would help with the current task."
      )
    },

    // ── Post-tool-use: record tool calls to cavemem ──────────────────────────
    "tool.execute.after": async (
      input: { sessionID?: string; tool?: string; args?: unknown },
      output: { output: string }
    ) => {
      if (!input.sessionID || !ensureCavemem()) return
      runHook("post-tool-use", {
        session_id: input.sessionID,
        tool_name: input.tool ?? "unknown",
        tool_input: String(input.args ?? "").slice(0, 500),
        tool_response: (output.output ?? "").slice(0, 2_000),
      })
    },

    // ── Event hook: full session + message lifecycle ─────────────────────────
    event: async ({ event }: { event: { type: string; properties?: unknown } }) => {
      if (!ensureCavemem()) return

      const type = event.type
      const props = event.properties as any

      // ── session.created: register session, no cavemem write yet ─────────────
      if (type === "session.created") {
        const id = props?.info?.id
        if (id) activeSessions.add(id)
        return
      }

      // ── message.updated ──────────────────────────────────────────────────────
      if (type === "message.updated") {
        const info = props?.info
        if (!info?.sessionID || !info?.id) return

        if (info.role === "user" && info.summary?.body?.trim()) {
          const sid = info.sessionID
          // First real user message → deferred session-start
          if (!startedSessions.has(sid)) {
            startedSessions.add(sid)
            runHook("session-start", { session_id: sid, ide: "opencode", cwd: directory })
          }
          runHook("user-prompt-submit", {
            session_id: sid,
            prompt: info.summary.body.trim(),
          })
          // Discard any streamed text for this user message ID (not needed)
          messageTexts.delete(info.id)
          return
        }

        if (info.role === "assistant" && info.time?.completed) {
          const entry = messageTexts.get(info.id)
          if (entry?.text.trim()) {
            runHook("stop", {
              session_id: info.sessionID,
              turn_summary: entry.text.trim(),
            })
          }
          messageTexts.delete(info.id)
          return
        }
      }

      // ── session.idle / session.deleted: flush + end ──────────────────────────
      if (type === "session.idle" || type === "session.deleted") {
        const sid =
          type === "session.idle"
            ? props?.sessionID
            : props?.info?.id
        if (!sid) return

        // Flush any buffered assistant text for this session
        for (const [mid, entry] of messageTexts) {
          if (entry.sessionID === sid && entry.text.trim()) {
            runHook("stop", { session_id: sid, turn_summary: entry.text.trim() })
            messageTexts.delete(mid)
          }
        }

        // Only call session-end if we actually started the session
        if (startedSessions.has(sid)) {
          runHook("session-end", { session_id: sid })
        }

        activeSessions.delete(sid)
        startedSessions.delete(sid)
        return
      }

      // ── message.part.updated: buffer streaming assistant text ────────────────
      if (type === "message.part.updated") {
        const part = props?.part
        if (part?.type !== "text" || !part.sessionID || !part.messageID) return

        const delta: string = props?.delta ?? part.text ?? ""
        if (!delta) return

        const existing = messageTexts.get(part.messageID)
        if (existing) {
          existing.text += delta
        } else {
          messageTexts.set(part.messageID, {
            sessionID: part.sessionID,
            text: delta,
          })
        }
      }
    },
  }
}
