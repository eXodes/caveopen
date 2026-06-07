#!/usr/bin/env bash
# caveopen installer
# Usage:
#   ./install.sh                   — global install (~/.config/opencode/)
#   ./install.sh --project         — project-local install (.opencode/)
#   ./install.sh --mode cavemem    — install only cavemem module
#   ./install.sh --no-pkg          — skip npm install (dev/local use)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="all"
TARGET="global"
SKIP_PKG=false

# ── Argument parsing ────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) TARGET="project"; shift ;;
    --mode)    MODE="$2"; shift 2 ;;
    --no-pkg)  SKIP_PKG=true; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

VALID_MODES="all caveman cavekit cavemem"
if ! echo "$VALID_MODES" | grep -wq "$MODE"; then
  echo "Invalid mode: $MODE. Valid: $VALID_MODES" >&2
  exit 1
fi

# ── Paths ──────────────────────────────────────────────────────────────────
if [[ "$TARGET" == "global" ]]; then
  OPENCODE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
else
  OPENCODE_DIR="$(pwd)/.opencode"
fi

SKILLS_DIR="$OPENCODE_DIR/skills"
COMMANDS_DIR="$OPENCODE_DIR/commands"
OPENCODE_JSON="$OPENCODE_DIR/opencode.json"
ASSETS_DIR="$SCRIPT_DIR/assets"

echo "==> caveopen installer"
echo "    mode:   $MODE"
echo "    target: $TARGET ($OPENCODE_DIR)"
echo ""

# ── npm install ────────────────────────────────────────────────────────────
if [[ "$SKIP_PKG" == false ]]; then
  if [[ -d "$SCRIPT_DIR/src" && -f "$SCRIPT_DIR/package.json" ]]; then
    echo "==> Installing caveopen from local repo..."
    npm install -g "$SCRIPT_DIR"
  else
    echo "==> Installing caveopen from npm..."
    npm install -g caveopen
  fi

  # cavemem peer dep — only if mode includes it
  if [[ "$MODE" == "all" || "$MODE" == "cavemem" ]]; then
    echo "==> Installing cavemem peer dep..."
    npm install -g cavemem || {
      echo "warn: cavemem install failed — cavemem hooks will be disabled until installed"
    }
  fi
fi

# ── Create dirs ────────────────────────────────────────────────────────────
mkdir -p "$SKILLS_DIR" "$COMMANDS_DIR"

# ── Copy skill assets ──────────────────────────────────────────────────────
echo "==> Copying skills..."

copy_skill() {
  local name="$1"
  local src="$ASSETS_DIR/skills/$name"
  if [[ -d "$src" ]]; then
    mkdir -p "$SKILLS_DIR/$name"
    cp "$src/SKILL.md" "$SKILLS_DIR/$name/SKILL.md"
    echo "    skills/$name"
  fi
}

if [[ "$MODE" == "all" || "$MODE" == "caveman" ]]; then
  copy_skill "caveman"
fi

if [[ "$MODE" == "all" || "$MODE" == "cavekit" ]]; then
  copy_skill "ck-spec"
  copy_skill "ck-build"
  copy_skill "ck-check"
  copy_skill "ck-caveman"
  copy_skill "ck-backprop"
fi

# ── Copy command assets ────────────────────────────────────────────────────
echo "==> Copying commands..."

copy_command() {
  local name="$1"
  local src="$ASSETS_DIR/commands/$name"
  if [[ -f "$src" ]]; then
    cp "$src" "$COMMANDS_DIR/$name"
    echo "    commands/$name"
  fi
}

if [[ "$MODE" == "all" || "$MODE" == "caveman" ]]; then
  copy_command "caveman.md"
  copy_command "caveman-commit.md"
  copy_command "caveman-review.md"
  copy_command "caveman-compress.md"
fi

if [[ "$MODE" == "all" || "$MODE" == "cavekit" ]]; then
  copy_command "ck-spec.md"
  copy_command "ck-build.md"
  copy_command "ck-check.md"
fi

# ── Merge opencode.json ────────────────────────────────────────────────────
echo "==> Updating $OPENCODE_JSON..."

# Write a minimal opencode.json if it doesn't exist
if [[ ! -f "$OPENCODE_JSON" ]]; then
  cat > "$OPENCODE_JSON" <<EOF
{
  "plugin": [],
  "mcp": {}
}
EOF
fi

# Use node to merge the plugin entry and (optionally) MCP entry
node - "$OPENCODE_JSON" "$MODE" <<'NODEEOF'
const fs = require("fs")
const path = require("path")

const [,, jsonPath, mode] = process.argv
const raw = fs.readFileSync(jsonPath, "utf8")
let config

try {
  config = JSON.parse(raw)
} catch {
  console.error("Failed to parse", jsonPath)
  process.exit(1)
}

if (!Array.isArray(config.plugin)) config.plugin = []
if (!config.mcp || typeof config.mcp !== "object") config.mcp = {}

// Add caveopen plugin entry if not already present
const hasPlugin = config.plugin.some(
  (p) => (Array.isArray(p) ? p[0] : p) === "caveopen"
)
if (!hasPlugin) {
  config.plugin.push(["caveopen", { mode }])
}

// Add cavemem MCP entry if mode includes cavemem
if (mode === "all" || mode === "cavemem") {
  if (!config.mcp.cavemem) {
    config.mcp.cavemem = {
      type: "local",
      command: ["npx", "cavemem", "mcp"],
    }
  }
}

fs.writeFileSync(jsonPath, JSON.stringify(config, null, 2) + "\n")
console.log("    updated", jsonPath)
NODEEOF

echo ""
echo "==> Done. Restart OpenCode to activate caveopen."
if [[ "$MODE" == "all" || "$MODE" == "cavekit" ]]; then
  echo ""
  echo "    Tip: run /ck-spec <idea> in a project to create SPEC.md."
fi
