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
- cmd: `/ck:init` → copy assets/FORMAT.md → ctx.directory/FORMAT.md (session root; ⊥ process.cwd()).
- cmd: `/caveman-stats [--all] [--since Nd]` → session stats (+lifetime if flag).
- cmd: `/caveman lite|full|ultra|wenyan-lite|wenyan-full|wenyan-ultra|off` → mode switch.
- file: `~/.caveman/.caveman-active` mode flag · `.caveman-history.jsonl` token log · `.caveman-statusline-suffix` badge.
- file: `SPEC.md` (cavekit workflow) · `FORMAT.md` schema.
- OpenCode hooks used: `experimental.chat.system.transform`, `event`, `chat.message`, `tool.execute.after`, `command.execute.before`, `config`.
- cavemem hook names: session-start, user-prompt-submit, post-tool-use, stop, session-end.

## §R RESEARCH
id|topic|finding|source
R1|opencode cache window|applyCaching() marks first 2 system msgs + last 2 msgs ephemeral; assembly merges → 2 system slots. V1 confirmed.|deepwiki.com/sst/opencode/4.3-system-prompts-and-context · packages/opencode/src/provider/transform.ts
R2|cavemem store|local SQLite+FTS5, session-boundary hooks, sync write. `Storage.createSession()` = `INSERT OR IGNORE INTO sessions(id,ide,cwd,started_at,metadata) VALUES(?,?,?,?,?)` → first-wins CONFIRMED. SQLite serializes writes; ⊥ app-level concurrency guard in cavemem. CaveOpen `hasSession`+pending-promise = spawn optimization (⊥ correctness req).|cavemem 0.2.1 dist/chunk-T35V7EPZ.js Storage.createSession · dist/index.js sessionStart handler
R3|caveman savings (upstream)|upstream hook reads ~/.claude/projects/<hash>/<session>.jsonl for real token counts; savings still estimated via ratio on real output. hook decision:"block" → model ⊥ execute stats. CaveOpen ⊥ read this JSONL — OpenCode stores sessions in own SQLite ≠ Claude Code format|github.com/JuliusBrussee/caveman /skills/caveman-stats/SKILL.md
R4|opencode msg tokens|Info.metadata.assistant has {tokens:{input,output,reasoning,cache:{read,write}},cost} per assistant msg. client.session.messages({path:{id:sessionID}}) → real per-msg data. command.execute.before: input.sessionID + client closure → fetch real session totals for /caveman-stats|github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/message.ts
R5|caveman-stats impl alts|Alt-A: client.session.messages() in command.execute.before → real tokens, 1 call, ⊥ own log needed. Alt-B: message.updated event → in-memory accumulate. Alt-C: keep SAVINGS_RATIO heuristic (current). savings estimate ∈ all alts still needs ratio (baseline unknowable)|opencode.ai/docs/sdk#sessions · opencode.ai/docs/plugins#events
R6|CC spec multi-scope|CC v1.0.0 scope def = "a noun" (singular). multi-scope ⊥ in spec — ecosystem convention only. delimiters: `,` `/` `\`|conventionalcommits.org/en/v1.0.0
R7|tooling multi-scope support|conventional-changelog #232 open ⊥ shipped. release-please ⊥ split multi-scope → renders verbatim. commitlint scope-enum accepts `,`/`/`/`\`|github.com/conventional-changelog/conventional-changelog/issues/232
R8|release-notes action current state|`.github/actions/release-notes` line 63: `SCOPE=caveman,cavekit` → `**caveman,cavekit**:` — ugly ⊥ broken. fix: split `IFS=','` → emit 1 `ENTRY` per scope → `- **caveman**: desc (hash)` + `- **cavekit**: desc (hash)`. each scope gets own release line.|local:.github/actions/release-notes/action.yaml:63
R9|cavemem session-start source skip|sessionStart: if `input.source` set & `!== "startup"` → returns `""` (⊥ prior-ctx). separate from CaveOpen `skipPriorContext` config.|cavemem 0.2.1 dist/index.js sessionStart()
R10|tool.execute.after signature|input:{tool,sessionID,callID,args:any} output:{title:string,output:string,metadata:any}. output typed `string` → `""` valid ⊥ null|github.com/anomalyco/opencode/blob/dev/packages/plugin/src/index.ts
R11|tool output.output by type|standard tools (read/bash/glob/grep): output=content. task/agent tools: output=`""`, summary→title. `??` passes `""` through; `\|\|` falls back. [B2,V28]|SPEC.md §B B2 · src/test/cavemem-tool.test.ts
R12|Plugin.trigger sequencing|iterates hooks array, calls each fn(input,output) load-order. sequential, ⊥ short-circuit unless hook throws|github.com/anomalyco/opencode/blob/dev/packages/opencode/src/plugin/index.ts
R13|agent .md locations|global: `~/.config/opencode/agents/`; project: `.opencode/agents/`. filename = agent name|opencode.ai/docs/agents
R14|agent .md frontmatter keys|`description`(required), `mode`, `model`, `temperature`, `top_p`, `steps`, `hidden`, `disable`, `permission`, `color`. body = system prompt|opencode.ai/docs/agents
R15|agent permission keys|`read` `edit`(covers write/edit/apply_patch) `glob` `grep` `list` `bash` `task` `external_directory` `todowrite` `webfetch` `websearch` `lsp` `skill` `question` `doom_loop`. values: `allow`\|`ask`\|`deny`|opencode.ai/docs/agents#permissions
R16|agent permission object syntax|`read` `edit` `glob` `grep` `list` `bash` `task` `external_directory` `lsp` `skill` accept `{glob→action}`. rest: shorthand only. last-match-wins → `"*"` first, specifics after|opencode.ai/docs/permissions#granular-rules
R17|bash permission granular|`{"*":"ask","git *":"allow","git push *":"deny"}`. pattern matches parsed cmd incl args. `"git status"` ≠ `"git status *"` (latter req'd when args present)|opencode.ai/docs/permissions
R18|permission.task|controls subagents agent invokes via Task tool. glob, last-match-wins. `deny` removes subagent from Task tool desc. users can `@` invoke regardless|opencode.ai/docs/agents#task-permissions
R19|tools field deprecated|`tools` deprecated v1.1.1 → replaced by `permission`. `tools:{bash:false}` = `permission:{bash:"deny"}`. still supported compat|opencode.ai/docs/agents#tools-deprecated, opencode.ai/docs/permissions
R20|agent mode & hidden|`mode`: `primary`\|`subagent`\|`all` (default). `hidden:true` → hides from `@` autocomplete; Task can still invoke if `permission.task` allows|opencode.ai/docs/agents#mode
R21|permission inheritance|agent `permission` merges w/ global config; agent rules take precedence|opencode.ai/docs/permissions#agents
R22|cavecrew-* format|existing agents correct: `permission` frontmatter w/ object-syntax bash. ⊥ legacy `tools` field. ⊥ change needed|assets/agents/*.agent.md (local, verified)

## §V INVARIANTS
V1: [combined path · CaveOpenPlugin] caveman ruleset & cavemem priorContext → 1 `output.system.push()` (single slot). ⊥ spill system[2]. applyCaching caches system[0..1] only. [R1]
V2: mergeHooks merges ALL same-key handlers → array, run sequential — incl `experimental.chat.system.transform`. caveopen overwrites that key post-merge w/ combinedSystemTransform (→V21). `event` & `command.execute.before` stay merged.
V3: ∀ module → expose `<Module>Plugin` (standalone, own transform) & `<module>Hooks(ctx)`. ⊥ route standalone transform → combined path.
V4: cavemem absent → skip graceful, ⊥ throw. ⊥ `@cavemem/*` import. talk via spawn `cavemem hook run <name>` only.
V5: cavemem idle write (session.idle) ! getLastAssistantText returns non-empty str before write. phantom/empty idle → ⊥ write. [turn-summary.ts:15]
V6: combinedSystemTransform push iff ≥1 non-null provider. provider added iff mode active.
V7: getCavememSystemPriorContext → null when skipPriorContext | ⊥ sessionID | empty ctx.
V8: initSession: hasSession → no-op resolve. concurrent caller → share pending promise (⊥ double INSERT). cavemem INSERT OR IGNORE → first-wins. [R2]
V9: runCavememHook: spawn err | empty stdout | bad JSON → null. else `hookSpecificOutput.additionalContext ?? null`.
V10: readModeFlag → null when file absent | mode ∉ {lite,full,ultra,wenyan-lite,wenyan-full,wenyan-ultra}.
V11: caveman session.created: defaultMode `off` → removeModeFlag; else writeModeFlag(default) iff flag unset (⊥ overwrite live mode). NOTE: readConfig hardcoded `full` → `off` branch unreachable until config wired. [config.ts:76-77]
V12: getSessionTokens sum assistant msgs only. output==0 → null.
V13: cli plugin entry = npm-form (`"caveopen"` | `["caveopen",{modes}]`). ⊥ `./...` path form.
V14: cli entry idempotent — dedup existing caveopen (string|array) pre-push. preserve other plugin entries.
V15: stripJsonc preserve `//` & `/*` inside quoted strings. parseJsonc = strip comments + trailing commas → JSON.parse.
V16: splicePluginArray/spliceMcpCavemem preserve surrounding JSONC comments + sibling keys. missing target key → throw.
V17: spliceMcpCavemem output ⊥ double comma. [tui write ⊥ impl — block commented cli.ts:338-377]
V18: ck:init: existed → "overwritten" label; else "copied". ∀ case → copy file.
V19: cuid → first char letter, [a-z0-9], default len 24. id prefixes `prt_` `ses_` `msg_`.
V20: derivesSavings: mode null → {0,0}. else savedTok=round(out*ratio), savedUsd=cost*ratio, ratio∈SAVINGS_RATIO. ?[R3,R5: heuristic; Alt-A via R4 → real counts, ⊥ eliminates ratio]
V21: caveopen.ts ! overwrite merged `experimental.chat.system.transform` w/ combinedSystemTransform when providers≥1. ⊥ leave mergeHooks sequential runner (double-push → V1 break). [caveopen.ts:71-73]
V22: runCavememHook ! guard stdin write err (`proc.stdin.on('error')`). cavemem bin absent → ⊥ unhandled EPIPE/throw. [runner.ts:14]
V23: `command.execute.before` handlers ! guard `output.parts.length > 0` before `output.parts[0]` access. ⊥ TypeError on empty parts. [cavekit/hooks/command.ts:39]
V24: `/caveman` mode switch ! backed by `command.execute.before` handler. Verified: OpenCode routes slash cmds → `command.execute.before` only; `chat.message` ⊥ fire for slash input. Handler calls `parseCavemanArg(args)`: empty→`full`, `off`→remove flag, valid mode via `isValidMode`→write flag, invalid→null (no-op). `chat.message` handles natural-lang activation/deactivation only.
V25: ck:init ! push output part when initial output.parts empty: {id:partId(), messageID:messageId(), sessionID, type:"text", text:<copy_result_text>}. Silent copy ⊥ allowed. [cavekit/hooks/command.ts:25]
V26: ck:init ! catch fs.copyFile failure → push error part w/ path & msg. Source-absent ⊥ propagate uncaught. [cavekit/hooks/command.ts:22]
V27: ∀ directory fallback call sites ! use ctx.directory (⊥ process.cwd()). ctx.directory=session root; process.cwd()=process launch dir (may differ). Covers eager-init (tool.ts:21, message.ts:21) & session-created handler (session-init.ts:48).
V28: `toolExecuteAfterHook` ! use `output.output || output.title` (⊥ `??`). Task/agent tools return `output.output=""` — `??` passes `""` through; `||` falls back to title. [B2]
V29: cli plugin entry ! use `@latest` tag (`"caveopen@latest"` | `["caveopen@latest",{…}]`). bare `"caveopen"` → npm ⊥ re-resolve latest. dedup ! match `==="caveopen"` | `startsWith("caveopen@")` prefix (⊥ exact str only). [B3]

## §T TASKS
Only cli.ts tested. ∀ other module untested → tasks = §V coverage.

id|status|task|cites
T1|x|test mergeHooks fan-in sequential|V2
T2|x|test combinedSystemTransform single-slot + skip-empty|V1,V6
T3|x|test getCavememSystemPriorContext null paths|V7
T4|x|test initSession pending dedup + hasSession no-op|V8
T5|x|test runCavememHook spawn/empty/parse fallbacks|V9
T6|x|test readModeFlag + isValidMode|V10
T7|x|test caveman session.created activation logic|V11
T8|x|test getSessionTokens assistant-only + null|V12
T9|x|test derivesSavings + formatStats ratios|V20
T10|x|test parseHistory + aggregateHistory skip-malformed|I.cmd
T11|x|test caveman message mode-switch + phrases|V10
T12|x|test cuid format + prefixes|V19
T13|x|test cavemem graceful-absence (bin missing)|V4
T14|x|test ck:init copy/overwrite label|V18
T15|x|test combinedSystemTransform overwrites merged transform key — ⊥ double-push|V21
T16|x|test runCavememHook stdin-error guard — cavemem bin absent ⊥ throw|V22
T17|x|impl V22 stdin-error noop guard in `runner.ts` + V23 parts-length guard in `cavekit/hooks/command.ts`|V22,V23
T18|x|verified `chat.message` ⊥ fire for slash cmds; impl `parseCavemanArg` + `command.execute.before` caveman handler; removed dead `parseModeCommand` from message.ts|V24
T19|x|fix multi-scope in `.github/actions/release-notes/action.yaml`: split `SCOPE` on `,` → emit 1 `ENTRY` per scope → `- **caveman**: desc (hash)` + `- **cavekit**: desc (hash)`|R6,R7,R8
T20|x|test V25/V26: ck:init empty-parts fallback + fs.copyFile error handling|V25,V26
T21|x|test & fix V27: cavemem eager-init uses ctx.directory ⊥ process.cwd()|V27
T22|x|fix session-init.ts:48: process.cwd() → ctx.directory in handleSessionCreated|V27
T23|x|assess & fix cavekit/hooks/command.ts:14: process.cwd() → ctx.directory for FORMAT.md dest (ctx.directory=session root ≠ process launch dir)|V27
T24|x|fix tool.ts:31 `output.output ?? output.title` → `output.output \|\| output.title` + test empty-string fallback|V28
T25|x|fix cli.ts:280: entry `"caveopen"` → `"caveopen@latest"` + fix dedup (lines 264–270) to match `startsWith("caveopen@")` \| `==="caveopen"`|V29

## §B BUGS
id|date|cause|fix
B1|2026-06-21|session-init.ts:48 fallback uses process.cwd() ⊥ ctx.directory|V27
B2|2026-06-24|`??` ⊥ `\|\|` in `tool_response` → Task/agent `output.output=""` → empty observation → cavemem drops|V28
B3|2026-06-26|cli entry `"caveopen"` bare ⊥ version tag → npm resolves cached/pinned, ⊥ latest on re-init|V29
