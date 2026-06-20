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

## §R RESEARCH
id|topic|finding|source
R1|opencode cache window|applyCaching() marks first 2 system msgs + last 2 msgs ephemeral; assembly merges → 2 system slots. V1 confirmed.|deepwiki.com/sst/opencode/4.3-system-prompts-and-context · packages/opencode/src/provider/transform.ts
R2|cavemem store|local SQLite+FTS5, session-boundary hooks, sync write. session-start persists session row. exact INSERT OR IGNORE first-wins ⊥ shown in README ?|github.com/JuliusBrussee/cavemem
R3|caveman savings (upstream)|upstream hook reads ~/.claude/projects/<hash>/<session>.jsonl for real token counts; savings still estimated via ratio on real output. hook decision:"block" → model ⊥ execute stats. CaveOpen ⊥ read this JSONL — OpenCode stores sessions in own SQLite ≠ Claude Code format|github.com/JuliusBrussee/caveman /skills/caveman-stats/SKILL.md
R4|opencode msg tokens|Info.metadata.assistant has {tokens:{input,output,reasoning,cache:{read,write}},cost} per assistant msg. client.session.messages({path:{id:sessionID}}) → real per-msg data. command.execute.before: input.sessionID + client closure → fetch real session totals for /caveman-stats|github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/message.ts
R5|caveman-stats impl alts|Alt-A: client.session.messages() in command.execute.before → real tokens, 1 call, ⊥ own log needed. Alt-B: message.updated event → in-memory accumulate. Alt-C: keep SAVINGS_RATIO heuristic (current). savings estimate ∈ all alts still needs ratio (baseline unknowable)|opencode.ai/docs/sdk#sessions · opencode.ai/docs/plugins#events

## §V INVARIANTS
V1: [combined path · CaveOpenPlugin] caveman ruleset & cavemem priorContext → 1 `output.system.push()` (single slot). ⊥ spill system[2]. applyCaching caches system[0..1] only. [R1]
V2: mergeHooks merges ALL same-key handlers → array, run sequential — incl `experimental.chat.system.transform`. caveopen overwrites that key post-merge w/ combinedSystemTransform (→V21). `event` & `command.execute.before` stay merged.
V3: ∀ module → expose `<Module>Plugin` (standalone, own transform) & `<module>Hooks(ctx)`. ⊥ route standalone transform → combined path.
V4: cavemem absent → skip graceful, ⊥ throw. ⊥ `@cavemem/*` import. talk via spawn `cavemem hook run <name>` only.
V5: cavemem idle write (session.idle) ! last-assistant text non-empty before write. phantom/empty idle → ⊥ write.
V6: combinedSystemTransform push iff ≥1 non-null provider. provider added iff mode active.
V7: getCavememSystemPriorContext → null when skipPriorContext | ⊥ sessionID | empty ctx.
V8: initSession: hasSession → no-op resolve. concurrent caller → share pending promise (⊥ double INSERT). cavemem INSERT OR IGNORE → first-wins. ?[R2: SQLite+hooks confirmed; first-wins unverified]
V9: runCavememHook: spawn err | empty stdout | bad JSON → null. else `hookSpecificOutput.additionalContext ?? null`.
V10: readModeFlag → null when file absent | mode ∉ {lite,full,ultra,wenyan-lite,wenyan-full,wenyan-ultra}.
V11: caveman session.created: defaultMode `off` → removeModeFlag; else writeModeFlag(default) iff flag unset (⊥ overwrite live mode). NOTE: readConfig hardcoded `full` → `off` branch unreachable until config wired. [config.ts:76-77]
V12: getSessionTokens sum assistant msgs only. output==0 → null.
V13: cli plugin entry = npm-form (`"caveopen"` | `["caveopen",{modes}]`). ⊥ `./...` path form.
V14: cli entry idempotent — dedup existing caveopen (string|array) pre-push. preserve other plugin entries.
V15: stripJsonc preserve `//` & `/*` inside quoted strings. parseJsonc = strip comments + trailing commas → JSON.parse.
V16: splicePluginArray/spliceMcpCavemem preserve surrounding JSONC comments + sibling keys. missing target key → throw.
V17: tui config write ⊥ contain `mcp` key. spliceMcpCavemem output ⊥ double comma.
V18: ck:init: existed → "overwritten" label; else "copied". ∀ case → copy file.
V19: cuid → first char letter, [a-z0-9], default len 24. id prefixes `prt_` `ses_` `msg_`.
V20: derivesSavings: mode null → {0,0}. else savedTok=round(out*ratio), savedUsd=cost*ratio, ratio∈SAVINGS_RATIO. ?[R3,R5: heuristic; Alt-A via R4 → real counts, ⊥ eliminates ratio]
V21: caveopen.ts ! overwrite merged `experimental.chat.system.transform` w/ combinedSystemTransform when providers≥1. ⊥ leave mergeHooks sequential runner (double-push → V1 break). [caveopen.ts:71-73]
V22: runCavememHook ! guard stdin write err (`proc.stdin.on('error')`). cavemem bin absent → ⊥ unhandled EPIPE/throw. [runner.ts:14] ?[NOT IMPL — T17]
V23: `command.execute.before` handlers ! guard `output.parts.length > 0` before `output.parts[0]` access. ⊥ TypeError on empty parts. [cavekit/hooks/command.ts:29]
V24: `/caveman` mode switch ! backed by `command.execute.before` handler writing mode flag, ⊥ rely solely on `chat.message` for slash dispatch. ?[OpenCode: verify `chat.message` fires for slash cmd user input — if ⊥, add handler]

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
T15|.|test combinedSystemTransform overwrites merged transform key — ⊥ double-push|V21
T16|.|test runCavememHook stdin-error guard — cavemem bin absent ⊥ throw|V22
T17|.|impl V22 stdin-error noop guard in `runner.ts` + V23 parts-length guard in `cavekit/hooks/command.ts`|V22,V23
T18|.|verify OpenCode slash cmd fires `chat.message`; impl V24 `command.execute.before` caveman handler if ⊥|V24

## §B BUGS
id|date|cause|fix
