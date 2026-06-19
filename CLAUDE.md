# CLAUDE.md — CaveOpen

Port of caveman + cavekit v4 + cavemem → OpenCode's native extension model (skills, commands, agents, plugin hooks).

**Repo:** https://github.com/eXodes/caveopen  
**Upstream:** JuliusBrussee/caveman · JuliusBrussee/cavekit · JuliusBrussee/cavemem  
**OpenCode:** https://github.com/anomalyco/opencode

---

## Repo Layout

```
src/
  caveopen.ts          # CaveOpenPlugin entry — composes all 3 modules
  cli.ts               # `caveopen init` CLI — writes opencode.json + copies assets
  hooks/
    system-transform.ts  # combinedSystemTransform (caveman+cavemem → one system[] slot)
  lib/
    merge-hooks.ts     # mergeHooks(...hookSets) — fans in same-key handlers sequentially
    cuid.ts
  modules/
    caveman/           # always-on caveman mode via session hooks
    cavekit/           # SPEC.md workflow — commands + config injection
    cavemem/           # persistent memory — session recall + turn-summary writes
assets/
  skills/              # SKILL.md files copied to dist/, installed by CLI
  commands/            # command .md files (slash commands)
  agents/              # agent .md files
docs/                  # hook reference, design notes — read before touching hooks
FORMAT.md              # SPEC.md caveman encoding rules (used by cavekit skills)
```

---

## Module → Hook Map

| Hook | caveman | cavekit | cavemem |
|---|---|---|---|
| `experimental.chat.system.transform` | push ruleset | — | push priorContext |
| `event` | `session.created`, `session.idle`, TUI | — | `session.created`, `session.idle`, `session.deleted` |
| `chat.message` | mode track | — | write-only |
| `tool.execute.after` | — | — | post-tool-use |
| `command.execute.before` | `/caveman-stats` | `/ck:init` | — |
| `config` | — | ✅ inject | — |

---

## Key Design Decisions — Do Not Break

### 1. `combinedSystemTransform` (src/hooks/system-transform.ts)

`mergeHooks` would push caveman ruleset → `system[1]` and cavemem priorContext → `system[2]`. OpenCode's `applyCaching()` only caches `system[0..1]`, so priorContext would miss cache every turn.

Fix: `caveopen.ts` replaces the merged pair with `combinedSystemTransform`, which concatenates all providers into one `system.push()` → single slot. Both stay in the cache window.

See `docs/CAVEOPEN_HOOKS.md` for full slot analysis.

### 2. `mergeHooks` (src/lib/merge-hooks.ts)

Collects same-key handlers across modules into arrays, runs sequentially. Used for `event` and `command.execute.before`. Does NOT handle `experimental.chat.system.transform` — that's replaced by `combinedSystemTransform` post-merge.

### 3. Module isolation

Each module (`caveman/`, `cavekit/`, `cavemem/`) exposes both `<Module>Plugin` (standalone) and `<module>Hooks(ctx)` (used by `CaveOpenPlugin`). Standalone plugins use their own individual transform. Do not move that transform into the combined path.

### 4. cavemem peer deps (optional)

`cavemem` is an optional peer dep. cavemem module must guard against its absence — skip gracefully if not installed. Integration is CLI-only (stdin/stdout via `cavemem hook run <name>`); no `@cavemem/*` imports needed.

### 5. `session.idle` guard

cavemem write hook fires on `session.idle`. Must check `messages.length > 0` before writing — phantom idle events on empty sessions must not produce memory writes.

---

## Build & Test

```bash
npm run build        # tsc + copyfiles assets → dist/
npm run typecheck    # tsc --noEmit
npm test             # node --experimental-test-module-mocks --test 'dist/test/**/*.test.js'
npm run prepublishOnly  # build + test (runs before publish)
```

Build copies `src/**/*.md` → `dist/` (skills, commands, agents land in `dist/modules/*/assets/`).

Runtime: TypeScript compiled to ESM. OpenCode executes via Bun internally; build tooling uses Node + tsc.

---

## CLI (`caveopen init`)

`src/cli.ts` — JSONC-aware. Writes plugin entry to `opencode.json` or `~/.config/opencode/opencode.json` and copies asset files. Supports `--modes`, `--project`/`--global`, `--dry-run`.

---

## OpenCode Primitives

- **Skills:** `SKILL.md` with `name` + `description` frontmatter
- **Commands:** `.md` with `description` + `argument-hint` frontmatter  
- **Agents:** `.agent.md` files
- **Plugins:** TS module exporting `Plugin` from `@opencode-ai/plugin`; declared in `opencode.json` under `plugins`
- **Hook types:** `import type { Plugin, Hooks } from "@opencode-ai/plugin"`

---

## References

| Topic | File |
|---|---|
| All hook signatures | `docs/HOOKS.md` |
| Cross-module hook design | `docs/CAVEOPEN_HOOKS.md` |
| caveman hooks | `docs/CAVEMAN_HOOKS.md` |
| cavemem hooks | `docs/CAVEMEM_HOOKS.md` |
| cavekit hooks | `docs/CAVEKIT_HOOKS.md` |
| Caching design | `docs/CACHING.md` |
| SPEC.md format | `FORMAT.md` |
| OpenCode plugin API | https://opencode.ai/docs/plugins |
