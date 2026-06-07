import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import type { Event, Part, TextPart } from "@opencode-ai/sdk"
import { execSync, spawn, spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

// Note: no shell escaping needed — JSON is written directly to child stdin (no shell involved)

// Call cavemem hook runner asynchronously. Non-fatal on failure. ⊥ blocks event loop.
async function runHook(name: string, data: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    const json = JSON.stringify(data)
    let timer: ReturnType<typeof setTimeout> | null = null

    const done = () => {
      if (timer) { clearTimeout(timer); timer = null }
      resolve()
    }

    try {
      const child = spawn("cavemem", ["hook", "run", name, "--ide", "opencode"], {
        stdio: ["pipe", "pipe", "pipe"],
      })

      timer = setTimeout(() => { child.kill(); resolve() }, 10_000)

      child.stdin.end(json, "utf8")
      child.on("error", (err) => {
        console.warn(`[caveopen/cavemem] hook "${name}" failed:`, (err as Error).message?.slice(0, 120))
        done()
      })
      child.on("close", done)
    } catch (err) {
      console.warn(`[caveopen/cavemem] hook "${name}" failed:`, (err as Error).message?.slice(0, 120))
      resolve()
    }
  })
}

// Synchronous hook call for exit/signal context (execSync ok in signal handler — V39).
function runHookSync(name: string, data: Record<string, unknown>): void {
  if (!ensureCavemem()) return
  try {
    execSync(`cavemem hook run ${name} --ide opencode`, {
      input: JSON.stringify(data),
      timeout: 5_000,
      stdio: ["pipe", "pipe", "pipe"],
    })
  } catch { /* non-fatal */ }
}

// Check cavemem CLI is available, warn once on first use rather than at plugin load.
// Uses spawnSync (⊥ execSync) to avoid shell overhead; result cached.
let cavememChecked = false
let cavememAvailable = true
function ensureCavemem(): boolean {
  if (cavememChecked) return cavememAvailable
  cavememChecked = true
  const result = spawnSync("cavemem", ["--version"], { stdio: "pipe", timeout: 3_000 })
  if (result.error || result.status !== 0) {
    console.warn("[caveopen/cavemem] cavemem CLI not found — memory hooks disabled. Install: npm install -g cavemem")
    cavememAvailable = false
  } else {
    cavememAvailable = true
  }
  return cavememAvailable
}

// V59: gate memory-tools note on MCP config, ⊥ CLI probe.
// CLI present + MCP absent → hooks active, note suppressed (model ⊥ told of nonexistent tools).
// MCP present + CLI absent → note shown, hooks warn+disable (V6).
// Cache result per process (V56: system push must be static+deterministic).
let mcpChecked = false
let mcpConfigured = false

// Minimal JSONC strip (V21-V23): string-aware comment/trailing-comma removal.
function stripJsoncForMcp(s: string): string {
  let out = "", i = 0, inStr = false, escaped = false
  while (i < s.length) {
    const c = s[i]!
    if (escaped) { out += c; i++; escaped = false; continue }
    if (inStr) {
      if (c === "\\") { escaped = true; out += c; i++; continue }
      if (c === '"') inStr = false
      out += c; i++; continue
    }
    if (c === '"') { inStr = true; out += c; i++; continue }
    if (c === "/" && s[i + 1] === "/") {
      while (i < s.length && s[i] !== "\n") i++
      continue
    }
    if (c === "/" && s[i + 1] === "*") {
      i += 2
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++
      i += 2; continue
    }
    out += c; i++
  }
  return out.replace(/,(\s*[}\]])/g, "$1")
}

function tryReadMcpConfig(p: string): boolean {
  try {
    if (!existsSync(p)) return false
    const cfg = JSON.parse(stripJsoncForMcp(readFileSync(p, "utf8")))
    return !!(cfg?.mcp?.cavemem)
  } catch { return false }
}

/** Returns true if cavemem MCP server is configured in project or global opencode.json/jsonc. */
export function checkMcpCavemem(cwd: string): boolean {
  if (mcpChecked) return mcpConfigured
  mcpChecked = true
  const xdgConfig = process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config")
  const candidates = [
    join(cwd, ".opencode", "opencode.jsonc"),
    join(cwd, ".opencode", "opencode.json"),
    join(xdgConfig, "opencode", "opencode.jsonc"),
    join(xdgConfig, "opencode", "opencode.json"),
  ]
  for (const p of candidates) {
    if (tryReadMcpConfig(p)) { mcpConfigured = true; return true }
  }
  mcpConfigured = false
  return false
}

export const cavemem = async ({ directory }: PluginInput): Promise<Partial<Hooks>> => {
  // V57 phantom-session guard:
  // session.created fires even when user opens + immediately closes OpenCode.
  // We defer session-start until we see the first real user message.
  const activeSessions = new Set<string>()   // all sessions that fired session.created
  const startedSessions = new Set<string>()  // sessions where session-start was called

  // V48: batch post-tool-use observations per session; flush on idle/deleted (⊥ spawn per call)
  const pendingObs = new Map<string, Array<Record<string, unknown>>>()

  // V39: sync flush on abrupt process exit — execSync ok in signal context.
  // startedSessions is only non-empty for sessions not yet ended normally (V9 clears on idle/deleted).
  const flushSync = () => {
    for (const sid of [...startedSessions]) {
      runHookSync("session-end", { session_id: sid })
      startedSessions.delete(sid)
    }
  }
  // Named handlers so they can be removed via process.off (dispose + re-raise).
  // V39: register once per instance; cleanup via dispose.
  const onExit = () => { flushSync() }
  const onSIGTERM = () => {
    flushSync()
    process.off("SIGTERM", onSIGTERM)
    process.kill(process.pid, "SIGTERM")
  }
  const onSIGINT = () => {
    flushSync()
    process.off("SIGINT", onSIGINT)
    process.kill(process.pid, "SIGINT")
  }
  process.on("exit", onExit)
  process.on("SIGTERM", onSIGTERM)
  process.on("SIGINT", onSIGINT)

  return {
    // ── System prompt: tell the model it has cavemem tools ───────────────────
    // V56 CACHE-PREFIX RULE: this push must be static+deterministic.
    // The pushed string is a hardcoded literal → same bytes ∀ request. ✓
    // checkMcpCavemem() is a cached per-process bool → push either
    // always present or always absent within a process lifetime. ✓
    // V59: gate on MCP config (⊥ CLI probe) — CLI present + MCP absent →
    // model ⊥ told of nonexistent tools; MCP present + CLI absent → note shown
    // (hooks will warn+disable via V6 but tools still registered by MCP server).
    "experimental.chat.system.transform": async (_input, output) => {
      if (!checkMcpCavemem(directory)) return
      output.system.push(
        "You have cavemem memory tools available (search, timeline, get_observations). " +
        "Use them when past context, decisions, or observations would help with the current task."
      )
    },

    // ── experimental.text.complete: assistant text → stop turn_summary (V99) ──
    // Replaces message.part.updated + message.updated assistant branch (V8 Map obsolete).
    // Fires once per generation with final output.text → call stop immediately, no buffer needed.
    "experimental.text.complete": async (
      hookInput: { sessionID: string; messageID: string; partID: string },
      hookOutput: { text: string }
    ) => {
      if (!hookInput.sessionID || !ensureCavemem()) return
      if (!startedSessions.has(hookInput.sessionID)) return
      const text = (hookOutput.text ?? "").trim()
      if (!text) return
      await runHook("stop", { session_id: hookInput.sessionID, turn_summary: text })
    },

    // ── chat.message: user-prompt capture (V100) ─────────────────────────────
    // Replaces message.updated role===user branch (V34 read site moved here).
    // output.parts already structured — filter type:"text", join.
    // V7: deferred session-start — only fires on first body-bearing user msg.
    // V10: data passed via spawn stdin (runHook uses spawn, ⊥ shell).
    "chat.message": async (
      chatInput: { sessionID: string; messageID?: string },
      chatOutput: { parts: Part[] }
    ) => {
      if (!chatInput.sessionID || !ensureCavemem()) return
      const sid = chatInput.sessionID
      const body = (chatOutput.parts as Array<{ type: string; text?: string }>)
        .filter((p) => p.type === "text")
        .map((p) => (p as TextPart).text ?? "")
        .join(" ")
        .trim()
      if (!body) return
      if (!startedSessions.has(sid)) {
        startedSessions.add(sid)
        await runHook("session-start", { session_id: sid, ide: "opencode", cwd: directory })
      }
      await runHook("user-prompt-submit", { session_id: sid, prompt: body })
    },

    // ── Post-tool-use: batch observations — flush on session.idle (V48) ────────
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string; args: unknown },
      output: { title: string; output: string; metadata: unknown }
    ) => {
      if (!input.sessionID || !ensureCavemem()) return
      if (!startedSessions.has(input.sessionID)) return // V35: skip before session-start
      // V48: buffer, don't spawn per call
      const buf = pendingObs.get(input.sessionID) ?? []
      buf.push({
        session_id: input.sessionID,
        tool_name: input.tool,
        tool_input: JSON.stringify(input.args ?? {}).slice(0, 500),
        tool_response: (output.output ?? "").slice(0, 2_000),
      })
      pendingObs.set(input.sessionID, buf)
    },

    // ── Event hook: full session + message lifecycle ─────────────────────────
    event: async ({ event }: { event: Event }) => {
      if (!ensureCavemem()) return

      // ── session.created: register session, no cavemem write yet ─────────────
      if (event.type === "session.created") {
        activeSessions.add(event.properties.info.id)
        return
      }

      // ── session.idle / session.deleted / session.error: flush + end ─────────
      // V98: session.error strands obs + session-end unless flushed here.
      if (event.type === "session.idle" || event.type === "session.deleted" || event.type === "session.error") {
        const sid =
          event.type === "session.idle"
            ? event.properties.sessionID
            : event.type === "session.deleted"
              ? event.properties.info.id
              : event.properties.sessionID  // session.error — optional, guard below
        if (!sid) return

        // Flush buffered tool observations (V48)
        const obs = pendingObs.get(sid) ?? []
        pendingObs.delete(sid)
        for (const data of obs) {
          await runHook("post-tool-use", data)
        }

        // Only call session-end if we actually started the session
        if (startedSessions.has(sid)) {
          await runHook("session-end", { session_id: sid })
        }

        activeSessions.delete(sid)
        startedSessions.delete(sid)
        return
      }

    },

    // V39: remove signal handlers on plugin teardown
    dispose: async () => {
      process.off("exit", onExit)
      process.off("SIGTERM", onSIGTERM)
      process.off("SIGINT", onSIGINT)
    },
  }
}
