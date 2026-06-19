#!/usr/bin/env node
/**
 * caveopen CLI — npx caveopen init [--modes M] [--project|--global] [--dry-run]
 * Adds npm-form plugin entry to opencode.json/jsonc and copies assets.
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

// ── Output helpers ──────────────────────────────────────────────────
const isTTY = Boolean(process.stdout.isTTY);

/**
 * Format a symbol with optional ANSI color. Exported for testing.
 * type: "ok" → ✓ green, "warn" → ⚠ yellow, "fail" → ✗ red
 */
export function fmtSymbol(type: "ok" | "warn" | "fail", tty: boolean): string {
  const sym = { ok: "✓", warn: "⚠", fail: "✗" }[type];
  if (!tty) return sym;
  const code = { ok: "\x1b[32m", warn: "\x1b[33m", fail: "\x1b[31m" }[type];
  return `${code}${sym}\x1b[0m`;
}

/**
 * Color a label token for output.
 * green: added | registered | configured  yellow: updated
 */
export function colorLabel(label: string, tty: boolean): string {
  if (!tty) return label;
  if (["added", "registered", "configured"].includes(label))
    return `\x1b[32m${label}\x1b[0m`;
  if (label === "updated") return `\x1b[33m${label}\x1b[0m`;
  return label;
}

/** Blue text when TTY; plain otherwise. */
export function blue(s: string, tty: boolean): string {
  return tty ? `\x1b[94m${s}\x1b[0m` : s;
}

const printOk = (msg: string) =>
  console.log(`${fmtSymbol("ok", isTTY)} ${msg}`);
const printWarn = (msg: string) =>
  process.stderr.write(`${fmtSymbol("warn", isTTY)} ${msg}\n`);
const printFail = (msg: string) => {
  process.stderr.write(`${fmtSymbol("fail", isTTY)} ${msg}\n`);
  process.exit(1);
};

// JSONC strip
/** String-aware JSONC comment strip. Preserves // and /* inside quoted strings.  */
export function stripJsonc(s: string): string {
  let out = "",
    i = 0,
    inStr = false;
  while (i < s.length) {
    const c = s[i]!;
    if (inStr) {
      if (c === "\\") {
        out += c + (s[i + 1] ?? "");
        i += 2;
        continue;
      }
      if (c === '"') inStr = false;
      out += c;
      i++;
    } else if (c === '"') {
      inStr = true;
      out += c;
      i++;
    } else if (c === "/" && s[i + 1] === "/") {
      while (i < s.length && s[i] !== "\n") i++;
    } else if (c === "/" && s[i + 1] === "*") {
      i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++;
      i += 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Strip comments + trailing commas, then JSON.parse. */
export function parseJsonc(raw: string): Record<string, unknown> {
  const clean = stripJsonc(raw).replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(clean) as Record<string, unknown>;
}

/**
 * Surgically replace the `plugin` array value in raw JSONC text.
 * Char-scan to find array bounds, splice new JSON fragment.
 */
export function splicePluginArray(raw: string, newPlugins: unknown[]): string {
  const keyMatch = /\"plugin\"\s*:/.exec(raw);
  if (!keyMatch || keyMatch.index === undefined) {
    throw new Error('Could not find "plugin" key in config');
  }
  let i = keyMatch.index + keyMatch[0].length;
  while (i < raw.length && /\s/.test(raw[i]!)) i++;
  if (raw[i] !== "[") throw new Error("plugin value is not an array");
  const arrStart = i;
  let depth = 0,
    inStr = false;
  while (i < raw.length) {
    const c = raw[i]!;
    if (inStr) {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
    } else if (c === "[" || c === "{") {
      depth++;
    } else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0) break;
    }
    i++;
  }
  const arrEnd = i;
  return (
    raw.slice(0, arrStart) + JSON.stringify(newPlugins) + raw.slice(arrEnd + 1)
  );
}

/**
 * Surgically inject `"cavemem": entry` into the `"mcp"` object in raw JSONC.
 * Char-scan to mcp object bounds; insert before closing }.
 */
export function spliceMcpCavemem(raw: string, entry: unknown): string {
  const keyMatch = /\"mcp\"\s*:/.exec(raw);
  if (!keyMatch || keyMatch.index === undefined) {
    throw new Error('Could not find "mcp" key in config');
  }
  let i = keyMatch.index + keyMatch[0].length;
  while (i < raw.length && /\s/.test(raw[i]!)) i++;
  if (raw[i] !== "{") throw new Error("mcp value is not an object");
  const objStart = i;
  let depth = 0,
    inStr = false;
  while (i < raw.length) {
    const c = raw[i]!;
    if (inStr) {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
    } else if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) break;
    }
    i++;
  }
  const objEnd = i;
  const inner = raw.slice(objStart + 1, objEnd);
  const entryStr = `"cavemem": ${JSON.stringify(entry)}`;
  // empty or trailing-comma → no separator; else prepend ", "
  const insertion =
    inner.trim() === "" || inner.trimEnd().endsWith(",") ?
      entryStr
    : `, ${entryStr}`;
  return raw.slice(0, objEnd) + insertion + raw.slice(objEnd);
}

// ── Entry point guard — run only when executed directly ────────
function runCLI(): void {
  // ── Subcommand gate ──────────────────────────────────────────
  const subcommand = process.argv[2];
  if (subcommand !== "init") {
    process.stderr.write(
      subcommand ? `Unknown subcommand: ${subcommand}\n\n` : "",
    );
    process.stderr.write(
      "Usage: npx caveopen init [--modes M] [--project|--global] [--dry-run]\n",
    );
    process.exit(1);
  }

  // ── Args ────────────────────────────────────────────────────────────────
  let modes = "";
  let target: "global" | "project" = "global";
  let dryRun = false;
  const args = process.argv.slice(3);

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--modes" && args[i + 1]) {
      modes = args[++i]!;
      continue;
    }
    if (a === "--project") {
      target = "project";
      continue;
    }
    if (a === "--global") {
      target = "global";
      continue;
    }
    if (a === "--dry-run") {
      dryRun = true;
      continue;
    }
    printFail(`Unknown arg: ${a}`);
  }

  const scope = target; // "global" | "project"
  const g = (s: string) => blue(s, isTTY);

  // ── Paths ──────────────────────────────────────────────────────────────
  const opencodeDir =
    target === "global" ?
      join(homedir(), ".config", "opencode")
    : join(process.cwd(), ".opencode");

  const skillsDir = join(opencodeDir, "skills");
  const commandsDir = join(opencodeDir, "commands");
  const agentsDir = join(opencodeDir, "agents");
  const here = dirname(fileURLToPath(import.meta.url));
  const assetsDir = join(here, "..", "assets");

  // prefer .jsonc if present
  let jsonPath = join(opencodeDir, "opencode.json");
  if (existsSync(join(opencodeDir, "opencode.jsonc"))) {
    jsonPath = join(opencodeDir, "opencode.jsonc");
  }

  // ── Read or init config ────────────────────────────────────────────────
  if (!dryRun) mkdirSync(opencodeDir, { recursive: true });

  let raw = "";
  let config: Record<string, unknown>;
  if (existsSync(jsonPath)) {
    raw = readFileSync(jsonPath, "utf8");
    config = parseJsonc(raw);
  } else {
    config = { plugin: [], mcp: {} };
  }

  if (!Array.isArray(config.plugin)) config.plugin = [];
  const pluginsRaw = config.plugin;
  if (!Array.isArray(pluginsRaw)) throw new Error("internal: plugin not array");

  // Track pre-existing caveopen entry for ADDED|MODIFIED state
  const hadCaveopen = pluginsRaw.some(
    (e) => e === "caveopen" || (Array.isArray(e) && e[0] === "caveopen"),
  );

  // npm-form — "caveopen" or ["caveopen", {"modes":"..."}]; idempotent
  const filtered = pluginsRaw.filter(
    (e) => e !== "caveopen" && !(Array.isArray(e) && e[0] === "caveopen"),
  );
  const modesArray =
    modes ?
      modes
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean)
    : undefined;
  const entry: unknown =
    modesArray ? ["caveopen", { modes: modesArray }] : "caveopen";
  filtered.push(entry);

  // inject mcp.cavemem when cavemem mode included
  const mcpEntry = { type: "local", command: ["npx", "cavemem", "mcp"] };
  const includeCavemem =
    !modes ||
    modes
      .split(",")
      .map((m) => m.trim())
      .includes("cavemem");
  const hasMcpCavemem = Boolean(
    config.mcp &&
    typeof config.mcp === "object" &&
    (config.mcp as Record<string, unknown>).cavemem,
  );
  const needsMcp = includeCavemem && !hasMcpCavemem;

  // surgical splice — preserve JSONC comments; ⊥ JSON.stringify(config) roundtrip
  let outputStr: string;
  if (raw && /\"plugin\"\s*:/.test(raw)) {
    outputStr = splicePluginArray(raw, filtered);
    if (needsMcp) {
      if (/\"mcp\"\s*:/.test(raw)) {
        outputStr = spliceMcpCavemem(outputStr, mcpEntry);
      } else {
        const reconf = parseJsonc(outputStr);
        if (!reconf.mcp || typeof reconf.mcp !== "object") reconf.mcp = {};
        (reconf.mcp as Record<string, unknown>).cavemem = mcpEntry;
        outputStr = JSON.stringify(reconf, null, 2) + "\n";
      }
    }
  } else {
    config.plugin = filtered;
    if (needsMcp) {
      if (!config.mcp || typeof config.mcp !== "object") config.mcp = {};
      (config.mcp as Record<string, unknown>).cavemem = mcpEntry;
    }
    outputStr = JSON.stringify(config, null, 2) + "\n";
  }

  // ── Write config + per-mutation output ──────────────────
  try {
    if (!dryRun) writeFileSync(jsonPath, outputStr);
    const pluginLabel = hadCaveopen ? "updated" : "registered";
    // config format: {colorAction}  {blue(type)} {name} → {blue(scope+":config")} type (plain)
    printOk(
      `${colorLabel(pluginLabel, isTTY)}  ${g("plugin")} caveopen → ${g(scope + ":config")} plugin`,
    );
    if (needsMcp) {
      printOk(
        `${colorLabel("configured", isTTY)}  ${g("mcp")} cavemem → ${g(scope + ":config")} mcp`,
      );
    }
  } catch (e) {
    printFail(`write config: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── TUI config (tui.json / tui.jsonc) — update if present ──────────
  // let tuiPath: string | null = null;
  // if (existsSync(join(opencodeDir, "tui.jsonc"))) {
  //   tuiPath = join(opencodeDir, "tui.jsonc");
  // } else if (existsSync(join(opencodeDir, "tui.json"))) {
  //   tuiPath = join(opencodeDir, "tui.json");
  // }

  // if (tuiPath) {
  //   try {
  //     const tuiRaw = readFileSync(tuiPath, "utf8");
  //     const tuiConfig = parseJsonc(tuiRaw);
  //     if (!Array.isArray(tuiConfig.plugin)) tuiConfig.plugin = [];

  //     const tuiHadCaveopen = (tuiConfig.plugin[]).some(
  //       (e) => e === "caveopen" || (Array.isArray(e) && e[0] === "caveopen"),
  //     );

  //     const tuiFiltered = (tuiConfig.plugin[]).filter(
  //       (e) => e !== "caveopen" && !(Array.isArray(e) && e[0] === "caveopen"),
  //     );
  //     tuiFiltered.push(entry);

  //     let tuiOutputStr: string;
  //     if (tuiRaw && /\"plugin\"\s*:/.test(tuiRaw)) {
  //       tuiOutputStr = splicePluginArray(tuiRaw, tuiFiltered);
  //     } else {
  //       tuiConfig.plugin = tuiFiltered;
  //       tuiOutputStr = JSON.stringify(tuiConfig, null, 2) + "\n";
  //     }

  //     if (!dryRun) writeFileSync(tuiPath, tuiOutputStr);
  //     const tuiLabel = tuiHadCaveopen ? "updated" : "registered";
  //     printOk(
  //       `${colorLabel(tuiLabel, isTTY)}  ${g("plugin")} caveopen → ${g(scope + ":tui")} plugin`,
  //     );
  //   } catch (e) {
  //     printWarn(`tui config: ${e instanceof Error ? e.message : String(e)}`);
  //   }
  // }

  // ── Active modules ────────────────────────────────────────────────
  const activeMods = new Set<string>(
    modes ?
      modes
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean)
    : ["caveman", "cavekit", "cavemem"],
  );
  const hasCaveman = activeMods.has("caveman");
  const hasCavekit = activeMods.has("cavekit");

  // ── Per-file copy helpers ─────────────────────────────────────────

  /**
   * Copy src → dest with state detection and per-file output.
   * label: added (dest ⊥ exist) | updated (dest existed). ∀ case → copyFileSync.
   * asset format: {colorAction}  {blue(type)} {name} → {blue(scope:type)} {name}
   */
  function copyFileWithState(
    srcPath: string,
    destPath: string,
    type: string,
    name: string,
  ): void {
    const label: "added" | "updated" =
      existsSync(destPath) ? "updated" : "added";
    if (!dryRun) {
      mkdirSync(dirname(destPath), { recursive: true });
      copyFileSync(srcPath, destPath);
    }
    printOk(
      `${colorLabel(label, isTTY)}  ${g(type)} ${name} → ${g(`${scope}:${type}`)} ${name}`,
    );
  }

  /** Recursively copy srcDir → destDir, emitting per-file output. type+name constant across subtree. */
  function walkCopy(
    srcDir: string,
    destDir: string,
    type: string,
    name: string,
  ): void {
    if (!dryRun) mkdirSync(destDir, { recursive: true });
    for (const e of readdirSync(srcDir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        walkCopy(join(srcDir, e.name), join(destDir, e.name), type, name);
      } else if (e.isFile()) {
        try {
          copyFileWithState(
            join(srcDir, e.name),
            join(destDir, e.name),
            type,
            name,
          );
        } catch (err) {
          printWarn(
            `copy ${e.name}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }

  // ── Copy assets (module-scoped, per-file output) ────
  if (!dryRun) {
    if (hasCaveman || hasCavekit) mkdirSync(skillsDir, { recursive: true });
    if (hasCaveman || hasCavekit) mkdirSync(commandsDir, { recursive: true });
    if (hasCaveman) mkdirSync(agentsDir, { recursive: true });
  }

  // Skills: caveman→ caveman*/cavecrew/ dirs; cavekit→ explicit set
  const CAVEKIT_SKILLS = new Set([
    "cavekit",
    "spec",
    "build",
    "check",
    "audit",
    "eval",
    "backprop",
  ]);
  try {
    const src = join(assetsDir, "skills");
    for (const e of readdirSync(src, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const n = e.name;
      const include =
        (hasCaveman && (n.startsWith("caveman") || n === "cavecrew")) ||
        (hasCavekit && CAVEKIT_SKILLS.has(n));
      if (!include) continue;
      walkCopy(join(src, n), join(skillsDir, n), "skills", n);
    }
  } catch (e) {
    printWarn(`copy skills: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Commands: caveman→ caveman*.md; cavekit→ ck:*.md
  try {
    const src = join(assetsDir, "commands");
    for (const e of readdirSync(src, { withFileTypes: true })) {
      if (!e.isFile()) continue;
      const n = e.name;
      const include =
        (hasCaveman && n.startsWith("caveman")) ||
        (hasCavekit && n.startsWith("ck:"));
      if (!include) continue;
      try {
        copyFileWithState(
          join(src, n),
          join(commandsDir, n),
          "commands",
          "/" + n.replace(/\.md$/, ""),
        );
      } catch (err) {
        printWarn(
          `copy ${n}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } catch (e) {
    printWarn(`copy commands: ${e instanceof Error ? e.message : String(e)}`);
  }

  // README.md: always (not module-gated; always useful)
  try {
    copyFileWithState(
      join(assetsDir, "README.md"),
      join(opencodeDir, "plugins", "caveopen", "README.md"),
      "plugins",
      "caveopen/README.md",
    );
  } catch (e) {
    printWarn(`copy README.md: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Agents: caveman→ cavecrew-*.agent.md
  if (hasCaveman) {
    try {
      const src = join(assetsDir, "agents");
      for (const e of readdirSync(src, { withFileTypes: true })) {
        if (!e.isFile()) continue;
        if (!/^cavecrew-.*\.agent\.md$/.test(e.name)) continue;
        try {
          copyFileWithState(
            join(src, e.name),
            join(agentsDir, e.name),
            "agents",
            e.name.replace(/\.agent\.md$/, ""),
          );
        } catch (err) {
          printWarn(
            `copy ${e.name}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } catch (e) {
      printWarn(`copy agents: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── Summary ─────────────────────────────────────────────────────
  const activeModes =
    modes ?
      modes
        .split(",")
        .map((m) => m.trim())
        .join(", ")
    : "caveman, cavekit, cavemem";

  console.log("");
  if (dryRun) console.log("(dry-run — no files written)");
  console.log("caveopen configured");
  console.log(`  Modes:  ${activeModes}`);
  console.log(`  Config: ${jsonPath}`);
  // if (tuiPath) console.log(`  TUI:    ${tuiPath}`);
  console.log(`  Run:    opencode`);
}

const __realFile = fileURLToPath(import.meta.url);
let __realArgv1 = process.argv[1];
try {
  __realArgv1 = realpathSync(process.argv[1]);
} catch {
  /* ENOENT — keep original */
}
if (__realFile === __realArgv1) {
  runCLI();
}
