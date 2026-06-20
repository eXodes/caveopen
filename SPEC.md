# SPEC

## §G GOAL
Port caveman + cavekit v4 + cavemem → OpenCode native plugin (skills/commands/agents/hooks). 1 plugin, 3 composable modules.

## §C CONSTRAINTS
- lang: TypeScript → ESM. OpenCode runs Bun internally; build = Node + tsc.
- runtime dep: `@opencode-ai/plugin` ^1.16.2 only.
- `cavemem` optional peer dep (>=1.0.0). absent → skip graceful. integration CLI-only: spawn `cavemem hook run <name>`, stdin JSON / stdout JSON. ⊥ `@cavemem/*` import.
- module isolation: caveman | cavekit | cavemem each self-contained.
- build: `tsc && copyfiles -u 1 "src/**/*.md" dist`. skills/commands/agents/FORMAT.md → dist/.
- test: node runner, `--experimental-test-module-mocks`, glob `dist/test/**/*.test.js`.
- mode/state files ∈ `~/.caveman/` (⊥ repo).

## §I INTERFACES
- plugin: `CaveOpenPlugin` default export. opts `{ modes?: ("caveman"|"cavekit"|"cavemem")[], cavemem?: { skipPriorContext?: boolean } }`. no modes → all 3.
- pkg exports: `.` `./caveman` `./cavekit` `./cavemem`. bin `caveopen` → dist/cli.js.
- cli: `caveopen init [--modes M] [--project|--global] [--dry-run]` → npm-form plugin entry to opencode.json(c) + copy assets.
- cmd: `/ck:init` → copy assets/FORMAT.md → cwd/FORMAT.md.
- cmd: `/caveman-stats [--all] [--since Nd]` → session stats (+lifetime if flag).
- cmd: `/caveman lite|full|ultra|wenyan-lite|wenyan-full|wenyan-ultra|off` → mode switch.
- file: `~/.caveman/.caveman-active` mode flag · `.caveman-history.jsonl` token log · `.caveman-statusline-suffix` badge.
- file: `SPEC.md` (cavekit workflow) · `FORMAT.md` schema.
- OpenCode hooks used: `experimental.chat.system.transform`, `event`, `chat.message`, `tool.execute.after`, `command.execute.before`, `config`.
- cavemem hook names: session-start, user-prompt-submit, post-tool-use, stop, session-end.

## §V INVARIANTS
V1: caveman ruleset & cavemem priorContext → 1 `output.system.push()` (single slot). ⊥ spill system[2]. applyCaching caches system[0..1] only.
V2: mergeHooks collect same-key handlers → array, run sequential. scope = `event` & `command.execute.before`. ⊥ touch `experimental.chat.system.transform`.
V3: ∀ module → expose `<Module>Plugin` (standalone, own transform) & `<module>Hooks(ctx)`. ⊥ route standalone transform → combined path.
V4: cavemem absent → skip graceful, ⊥ throw. ⊥ `@cavemem/*` import. talk via spawn `cavemem hook run <name>` only.
V5: cavemem idle write (session.idle) ! last-assistant text non-empty before write. phantom/empty idle → ⊥ write.
V6: combinedSystemTransform push iff ≥1 non-null provider. provider added iff mode active.
V7: getCavememSystemPriorContext → null when skipPriorContext | ⊥ sessionID | empty ctx.
V8: initSession: hasSession → no-op resolve. concurrent caller → share pending promise (⊥ double INSERT). cavemem INSERT OR IGNORE → first-wins.
V9: runCavememHook: spawn err | empty stdout | bad JSON → null. else `hookSpecificOutput.additionalContext ?? null`.
V10: readModeFlag → null when file absent | mode ∉ {lite,full,ultra,wenyan-lite,wenyan-full,wenyan-ultra}.
V11: caveman session.created: defaultMode `off` → removeModeFlag. else writeModeFlag(default) iff flag unset (⊥ overwrite live mode).
V12: getSessionTokens sum assistant msgs only. output==0 → null.
V13: cli plugin entry = npm-form (`"caveopen"` | `["caveopen",{modes}]`). ⊥ `./...` path form.
V14: cli entry idempotent — dedup existing caveopen (string|array) pre-push. preserve other plugin entries.
V15: stripJsonc preserve `//` & `/*` inside quoted strings. parseJsonc = strip comments + trailing commas → JSON.parse.
V16: splicePluginArray/spliceMcpCavemem preserve surrounding JSONC comments + sibling keys. missing target key → throw.
V17: tui config write ⊥ contain `mcp` key. spliceMcpCavemem output ⊥ double comma.
V18: ck:init: existed → "overwritten" label; else "copied". ∀ case → copy file.
V19: cuid → first char letter, [a-z0-9], default len 24. id prefixes `prt_` `ses_` `msg_`.
V20: derivesSavings: mode null → {0,0}. else savedTok=round(out*ratio), savedUsd=cost*ratio, ratio∈SAVINGS_RATIO. ?(ratios upstream-sourced, unverified)

## §T TASKS
Only cli.ts tested. ∀ other module untested → tasks = §V coverage.

id|status|task|cites
T1|.|test mergeHooks fan-in sequential|V2
T2|.|test combinedSystemTransform single-slot + skip-empty|V1,V6
T3|.|test getCavememSystemPriorContext null paths|V7
T4|.|test initSession pending dedup + hasSession no-op|V8
T5|.|test runCavememHook spawn/empty/parse fallbacks|V9
T6|.|test readModeFlag + isValidMode|V10
T7|.|test caveman session.created activation logic|V11
T8|.|test getSessionTokens assistant-only + null|V12
T9|.|test derivesSavings + formatStats ratios|V20
T10|.|test parseHistory + aggregateHistory skip-malformed|I.cmd
T11|.|test caveman message mode-switch + phrases|V10
T12|.|test cuid format + prefixes|V19
T13|.|test cavemem graceful-absence (bin missing)|V4
T14|.|test ck:init copy/overwrite label|V18

## §B BUGS
id|date|cause|fix
