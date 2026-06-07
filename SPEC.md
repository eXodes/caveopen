# SPEC

## §G GOAL
npm pkg `caveopen`: OpenCode plugin port of caveman + cavekit v4 + cavemem. Per-module opt-in via `modes` option (comma-sep list).

## §C CONSTRAINTS
- runtime Bun (OpenCode plugin exec). TS strict, ES2022, NodeNext.
- dep: `@opencode-ai/plugin` ^1.16.2 only. peer: `cavemem` ≥1.0.0 optional.
- single npm pkg, single plugin entry. modules compose, ⊥ separate plugins.
- ⊥ Claude Code dependency. ⊥ v3.x Hunt lifecycle. ⊥ caveman-code/cavegemma.
- assets shipped in pkg: `assets/skills/*`, `assets/commands/*`, `assets/FORMAT.md`.
- build: `tsc` → `dist/`. MIT.

## §I INTERFACES
- export: default `PluginModule { id: "caveopen", server: Plugin }`
- config: `opencode.json` → npm form: `"caveopen"` or `["caveopen", { "modes": "..." }]`; OpenCode loads `dist/caveopen.js` from installed pkg. default all 3 active (omit `modes` or `"modes": ""`). comma-sep, order ⊥ matter.
- bin: `npx caveopen init [--modes M] [--project] [--global]` → add npm form to opencode.json `plugin[]` + copy assets (V40,V41). `--project` → `.opencode/` scope. `--global` → `~/.config/opencode/` (default).
- cmd: `/caveman [lite|full|ultra|wenyan-lite|wenyan-full|wenyan-ultra]` → activate (default full). `/caveman off` → deactivate. NL triggers: `activate/enable/use caveman`, `deactivate/disable/turn off caveman`.
- cmd: `/ck:init` → copy FORMAT.md → project root via `command.execute.before` + `client.session.prompt(noReply:true)` (V90).
- file: `~/.caveman/.caveman-history.jsonl` ← per-assistant-msg `{ts, session_id, mode, output_tokens, est_saved_tokens}`.
- shell: `cavemem hook run <name> --ide opencode` ← stdin JSON. names: `session-start`, `user-prompt-submit`, `post-tool-use`, `stop`, `session-end`.
- hooks used: `experimental.chat.system.transform`, `chat.message`, `event`, `tool.execute.after`, `command.execute.before`, `experimental.session.compacting`, `experimental.text.complete` (V92), `experimental.provider.small_model` (V60), `dispose` (V39).
- hooks ⊥ used (explicit): `tool.definition` (V93), `chat.params` (V94), `chat.headers`, `config`.
- hooks reserved/opt-in: `permission.ask` (V95).

## §V INVARIANTS
V1: composeHooks — same-key handlers both run, order a→b. `tool` maps merge. `auth|provider|config` last-write-wins.
V2: `modes` ! CSV of `caveman|cavekit|cavemem`; unknown val → console.warn + skip (⊥ throw); omit/empty/all-unknown → all 3 active.
V3: caveman mode nudge ! via system push (V12, V57); ⊥ per-turn synthetic part injection into user msg block. `activeMode` Map clears per-sid on `session.created` & mode change → static bytes per mode → V56 cache held.
V4: ∀ synthetic TextPart ! full shape: `id, sessionID, messageID, type:"text", synthetic:true, text`.
V5: history jsonl write best-effort, ⊥ throw to caller.
V6: ∀ cavemem hook call non-fatal. CLI missing → warn once, all hooks disabled (`ensureCavemem` cached).
V7: phantom-session guard — `session-start` ⊥ until first user message with body. `session.created` alone insufficient.
V8: `message.part.updated` text = full accumulated text → replace in map, ⊥ append.
V9: `session-end` only if `session-start` fired for that sid. idle/deleted flush buffered assistant text first.
V10: ∀ data → cavemem ! passed via spawn stdin as raw JSON; ⊥ shell invoked, ⊥ escape needed.
V11: asset read/copy failure → fallback string or error message, ⊥ crash plugin load.
V12: caveman SKILL.md rules pushed to system prompt ∀ LLM call when module active.
V18: src entry ! `src/caveopen.ts` (⊥ `index.ts`).
V21: JSONC strip ! remove block `/* */` + line `//` comments from raw before JSON.parse when config may be `.jsonc`.
V22: JSONC comment strip ! string-aware — ⊥ strip `//` or `/* */` tokens inside quoted strings.
V23: JSONC parse ! also strip trailing commas (`,` immediately before `}` or `]`, ignoring whitespace) after comment strip — `JSON.parse` rejects them.
V24: ∀ cmd registered via `command.execute.before` ! have matching `assets/commands/<name>.md`; CLI `cpSync(assets/commands)` copies all cmd assets.
V25: CLI ! copy `assets/FORMAT.md` → `$OPENCODE_DIR/FORMAT.md`; `cavekit.ts` probes `join(here,"../assets/FORMAT.md")` (npm) then `join(here,"FORMAT.md")` (V43). ⊥ sibling `assets/` outside plugin scope.
V26: `/caveman` no-arg → default mode `"full"`. NL `activate/enable/use caveman` no-arg → same.
V27: `activeMode` Map ! keyed by `sessionID` (`Map<string,string|null>`); ⊥ module-level shared. `session.created` ! clear only that sid entry. `reinforcementSent` Map ⊥ exists (T62 eliminated per-turn injection; system push makes injection gate obsolete). parallels V45.
V28: `/caveman-stats` ! registered as `command.execute.before` handler in `caveman.ts`; reads `~/.caveman/.caveman-history.jsonl`, aggregates (last entry per `session_id`), injects formatted stats via `client.session.prompt` with `noReply:true`; ⊥ rely on LLM reading `.md` asset (OpenCode ⊥ auto-load command assets).
V29: history jsonl write ! guard `info.tokens.output > 0` — skip zero-token `message.updated` events even if `time.completed` set; ⊥ write junk rows that corrupt aggregation.
V30: ∀ module dir resolution ! use `~/.{module}/` (⊥ `~/.config/{module}/`). caveman → `~/.caveman/`.
V31: `cli.ts` `cpSync(assets/commands)` → `$OPENCODE_DIR/commands/` copies ∀ cmd assets (⊥ filtered per module); install.sh per-block cavekit copy superseded by V40 CLI; install.sh removed (T87).
V32: `caveman.ts` SKILL_PATH ! `join(here, "../../skills/caveman/SKILL.md")` → resolves to `$OPENCODE_DIR/skills/caveman/SKILL.md`; ⊥ `../assets/skills/` (sibling path invalid after install; install copies skills → `$OPENCODE_DIR/skills/`, ⊥ `$PLUGINS_DIR/assets/`).
V33: `assets/commands/caveman-stats.md` ! reference `~/.caveman/.caveman-history.jsonl`; ⊥ `~/.config/caveman/`. ⊥ project-source `.opencode/commands/` copy — `.opencode/` is install destination, ⊥ plugin repo artifact.
V34: `message.updated` user msg text ! read from `info.parts` (filter `type:"text"`, join) — ⊥ `info.summary?.body` (⊥ populated for user msgs in OpenCode).
V35: `tool.execute.after` → `runHook("post-tool-use")` ⊥ unless `startedSessions.has(sessionID)` — cavemem `addObservation` calls `ensureSession(id)` which always writes `ide:'unknown'+cwd:null`; `INSERT OR IGNORE` prevents correction once row exists → real `session-start` is no-op.
V36: GH publish workflow triggers `on: push: tags: ['v*.*.*']` only; ⊥ PR trigger; ⊥ branch push trigger for publish; ⊥ manual dispatch required.
V37: npm token ∈ GH secret `NPM_TOKEN`; ⊥ hardcoded in any file.
V38: `runHook` ! async (⊥ `execSync`); spawn child via `execFile`/`spawn` with promise + timeout kill; ⊥ block event loop. `ensureCavemem` check ⊥ `execSync` either — use `spawnSync` stdio:pipe, result cached.
V39: `session-end` ! fire for ∀ `startedSessions` on abrupt process exit; `process.on('exit'|'SIGTERM'|'SIGINT')` handler in `cavemem` → sync flush (execSync ok in signal context) → re-raise original signal (remove handler + `process.kill(process.pid, sig)`); ⊥ `process.exit(0)` (swallows OpenCode shutdown + other plugins' signal handlers). register handlers once; cleanup via `dispose`.
V40: `npx caveopen init [--modes M] [--project|--global]` → detect opencode.json/jsonc (V19 logic), strip JSONC (V21–V23 logic), add `"caveopen"` or `["caveopen",{"modes":"M"}]` to `plugin[]`; ⊥ duplicate if entry already present; write back; ⊥ path form injected.
V41: CLI (V40) ! also copy `assets/skills/**` → `$OPENCODE_DIR/skills/`, `assets/commands/**` → `$OPENCODE_DIR/commands/`, `assets/FORMAT.md` → `$OPENCODE_DIR/FORMAT.md`; asset src = pkg own `assets/` (resolved from `import.meta.url`); ⊥ curl (already installed by npx).
V42: `bin: {"caveopen":"dist/cli.js"}` ! present in package.json; `dist/cli.js` ∈ `files[]` via `dist` glob; ⊥ requires prior global install; `npx caveopen init` fetches from registry on-demand.
V43: ∀ runtime asset read (FORMAT.md, SKILL.md) ! `existsSync`-probe: try npm path `join(here,"../assets/<rel>")` first (works when `here`=`dist/`); fallback `join(here,"<rel>")` (installed to `$OPENCODE_DIR`); ⊥ single hardcoded path.
V44: `composeHooks` chain ! fault-isolate — ∀ same-key handler wrapped own try/catch; one module throw → warn + continue; ⊥ abort sibling handler. extends V1 (both still run a→b).
V45: caveman `activeMode` ! keyed by sessionID (`Map<string,string|null>`); ⊥ module-level shared `let`. set in session A ⊥ leak to session B reinforcement. clear sid entry on `session.created` & mode change. parallels V27.
V46: `~/.caveman/.caveman-history.jsonl` ! bounded — cap retained rows (size | last-N) on write | on `/caveman-stats` read; ⊥ unbounded append ∀ life of install.
V47: caveman history write ! async (`fs.promises.appendFile`); history dir `mkdir` cached once @ module init; ⊥ `appendFileSync`/`mkdirSync` in `event` hot path. caveman-side parallel of V38.
V48: cavemem ! ⊥ spawn new `cavemem` proc per `tool.execute.after`; batch observations + flush on `session.idle` | hold 1 long-lived proc + stream NDJSON stdin. proc-spawn-per-tool-call forbidden (perf).
V49: GH publish ! version-gated — tag `v*.*.*` IS version signal; `npm publish` runs only on matching tag push; ⊥ `npm view` guard needed (tag is deterministic gate). refines V36.
V50: version bump ! via `npm version <patch|minor|major>` only (auto-commits package.json + creates tag); release: `npm version patch && git push --follow-tags`; ⊥ manual package.json version edit for releases; ⊥ publish without matching tag.
V51: `release.yml` workflow_dispatch: inputs `commit` (string, required) + `bump` (enum `patch|minor|major`, default `patch`); ⊥ auto-trigger (⊥ push, ⊥ PR); manual dispatch only.
V52: release job: checkout default branch (fetch-depth:0); compute `NEW_VERSION` from current package.json + bump via `npm version $bump --no-git-tag-version` (parse stdout `v\d+.\d+.\d+`, ⊥ write to disk); `git checkout .` reset; `git tag "v$NEW_VERSION" "${{ inputs.commit }}"` (tag points to exact input sha); `git push origin "v$NEW_VERSION"`.
V53: tag = version source of truth; publish.yml ! extract version from `GITHUB_REF` (`${GITHUB_REF#refs/tags/v}`); run `npm version $TAG_VERSION --no-git-tag-version` in publish job before `npm publish --tag latest`; ⊥ rely on package.json version in repo.
V54: release job `permissions: contents: write`; ⊥ git author config needed (⊥ commit); GITHUB_TOKEN sufficient.
V55: release ! fail-fast if tag `v$NEW_VERSION` already exists (git push rejects duplicate tag without `--force`; ⊥ silent overwrite).
V56: ∀ `experimental.chat.system.transform` push ! static + deterministic (same bytes, same order ∀ request) → preserve Anthropic prompt-cache prefix. OpenCode `ProviderTransform.applyCaching` sets `cacheControl:ephemeral` on first-2 system msgs + last-2 non-system msgs; cache = prefix match → ∀ per-request variance in cached prefix (tools|system|early msgs) busts cache + everything after. ⊥ inject per-turn-varying content (timestamps, recalled memory, counters, randomized text) into `output.system[]`. caveman `rules` (SKILL.md read once @ init) + cavemem note (const) both compliant; cavemem ! inject recalled memory into prompt (uses MCP tools instead) — keep that way.
V57: caveman reinforcement (`chat.message` synthetic part, V3) ! either (a) persisted by OpenCode into session history → identical bytes replay ∀ subsequent request, | (b) ⊥ injected into per-turn user-msg block at all. risk: synthetic part ⊥ persisted → turn N sends it, turn N+1 rebuild omits (V3 gate blocks re-add) → user-msg block bytes ≠ cached → cache miss @ block + after. blast radius bounded (last user block; tools+system stay cached) + ≤1/session. prefer mode nudge in system push (V12, accept re-cache on mode change only) ⊥ per-turn message block. refines V3.
V58: caveman SKILL.md system push (V12) ! gated to main agent loop; ⊥ pushed to one-shot aux calls (title-gen, summary/compaction, `experimental.provider.small_model`) where ⊥ cache reuse → full ruleset token cost ∀ call. detect via transform `input.model` vs small-model ctx `?` | skip when call ⊥ interactive. refines V12.
V59: cavemem system note advertising memory tools (search, timeline, get_observations) ! consistent with actual cavemem MCP tool registration; tools provided by cavemem MCP server in opencode.json (⊥ plugin `tool:` hook). ⊥ gate note solely on `ensureCavemem()` (CLI `--version` probe — CLI presence ≠ MCP tools configured). MCP absent + note present → model told of nonexistent tools; CLI absent + MCP present → tools exist but note suppressed. gate note on MCP tool availability | doc CLI+MCP coupling requirement.
V60: `experimental.chat.system.transform` small-model skip ! register `experimental.provider.small_model` handler → capture model ID into module-scoped var; in transform: `if (capturedSmallModelId && input.model.id === capturedSmallModelId) return`; ⊥ typeof-string check or name-regex (input.model is Model object ≠ string → regex always ⊥ fires). refines V58.
V61: `assets/` ! include `skills/cavecrew/SKILL.md` (dispatch guide) AND `agents/cavecrew-investigator.agent.md`, `agents/cavecrew-builder.agent.md`, `agents/cavecrew-reviewer.agent.md` (OpenCode-adapted subagent defs). CLI copy: `skills/cavecrew/` → `$OPENCODE_DIR/skills/cavecrew/`; `agents/cavecrew-*.agent.md` → `$OPENCODE_DIR/agents/`. OpenCode `agents/*.md` native subagent support (mode:subagent, permission:, model:); translate CC `tools:[...]` → OpenCode `permission:` blocks; CC model shorthand `haiku` → `anthropic/claude-haiku-4-20250514`.
V62: `npm publish --tag latest`; ⊥ `--tag beta`; semver tag `v*.*.*` = gate (V36,V49,V50); ⊥ separate promotion step.
V63: `latest` dist-tag auto-set by publish.yml (V62); ⊥ manual `npm dist-tag add` step; README ⊥ doc promotion cmd.
V64: `assets/skills/` ! include `caveman-commit/SKILL.md`, `caveman-review/SKILL.md`, `caveman-compress/SKILL.md`, `caveman-help/SKILL.md`; CLI `cpSync(assets/skills)` copies all automatically.
V65: `assets/commands/caveman-commit.md`, `caveman-review.md`, `caveman-compress.md` ! thin wrappers invoking skill + `$ARGUMENTS`; ⊥ inline full skill content in command file.
V66: `assets/commands/caveman-help.md` ! exist; CLI `cpSync(assets/commands)` copies it.
V67: caveman-compress OpenCode SKILL.md ! ⊥ reference `scripts/__main__.py` (calls Anthropic API via Python subprocess — redundant when agent IS LLM); instead: agent compresses inline → self-validate checklist (∀ fenced code blocks byte-identical, ∀ backtick inline byte-identical, ∀ URLs unchanged, structure/frontmatter preserved) → fix only failing sections → retry ≤2 passes → report + abort if still failing → show diff → write only on user confirm.
V68: `assets/agents/*.agent.md` ⊥ `model:` frontmatter; model selection ! user-controlled via `opencode.json` `agents` config; README ! doc how to override model per-agent.
V69: `assets/skills/ck-eval/SKILL.md` ! exist; `ck:eval.md` cmd invokes `ck-eval` skill; CLI `cpSync(assets/skills)` copies it.
V70: README ⊥ document manual `npm version`/`git push --follow-tags` release steps; release ! via `release.yml` workflow_dispatch (V51,V52).
V71: `assets/agents/*.agent.md` ! have `name:` in frontmatter; value = filename stem (strip `.agent.md`); ⊥ omit → OpenCode ⊥ resolve agent by name.
V72: cli.ts write-back ! preserve original JSONC source; surgical replace `plugin[]` array value in raw text (locate `"plugin"` key, scan to array bounds, splice new array); ⊥ `JSON.stringify` full config when src=`.jsonc`; ∀ comments + formatting in non-plugin keys unchanged.
V73: cli.ts (V40) ! inject `mcp.cavemem = {type:"local",command:["npx","cavemem","mcp"]}` when cavemem mode included (default all); gate: ⊥ already present (idempotent); write path: if raw ∃ `"mcp"\s*:` key → splice `cavemem` entry into mcp object in raw text (⊥ full JSON.stringify, preserve JSONC); else → add to config obj before stringify.
V74: `spliceMcpCavemem` insertion ! detect trailing comma in inner content — `inner = raw.slice(objStart+1, objEnd)`; if `inner.trimEnd().endsWith(",")` → use plain `entryStr` (⊥ prepend `, `); if `inner.trim()==""` → `entryStr`; else → `, entryStr`. ⊥ produce double-comma `,,` when JSONC mcp entry ends with trailing comma → OpenCode JSON parse error. refines V73.
V75: CLI output ! structured per-step: `✓`/`✗`/`⚠` prefix (ANSI green/red/yellow when TTY; plain ✓/✗/⚠ ⊥ TTY); ∀ copy step → colored action label (⊥ `[BRACKET]` form anywhere in output) + rel-src-path + resolved dest path (V78); ∀ warn/error → stderr (⊥ stdout); final summary block: active modes, config path, `Run: opencode` hint; ⊥ bare "copied X" / "updated X" ⊥ path/symbol. `--dry-run` flag → print steps ⊥ write.
V76: CLI asset copy ! scoped to active modules; caveman → skills `caveman*/`, `cavecrew/`, cmds `caveman*.md`, agents `cavecrew-*.agent.md`; cavekit → skills `ck-*/`, cmds `ck:*.md`, `FORMAT.md`; cavemem → ⊥ extra assets; ⊥ flat `cpSync(assets/skills)` / `cpSync(assets/commands)` / `cpSync(assets/agents)` when modules ≠ all-3.
V77: `assets/skills/<dir>/SKILL.md` `name:` ! = dir name (e.g. dir `ck-spec` → `name: ck-spec`); ⊥ upstream short name (e.g. `spec`); ⊥ duplicate `name:` across dirs. parallel V71 for agents.
V78: CLI copy output ! per-file granularity; ∀ file copied → emit `{sym} {colored-label} {rel-src-path-from-assets/} → {dest_abs_path}`; `{rel-src-path-from-assets/}` = `relative(assetsDir, srcPath)` (e.g. `skills/caveman/SKILL.md`, `commands/caveman-commit.md`, `agents/cavecrew-builder.agent.md`); ⊥ `basename(destPath)` (strips dir prefix); colored-label = ANSI-colored token when TTY, plain text ⊥ TTY; file labels: dest ⊥ exist → `added` (green), dest existed → `updated` (yellow); config labels: plugin[] new entry → `registered` (green), plugin[] exist → `updated` (yellow); mcp new entry → `configured` (green), mcp exist → `updated` (yellow); ⊥ `[BRACKET]` form; ⊥ batch "copied N files"; order: one line per file in copy traversal order; active-mode scope (V76) means only mode-owned files listed.
V79: CLI ! copy `assets/FORMAT.md` → `join(opencodeDir,"plugins","caveopen","FORMAT.md")` (⊥ `join(opencodeDir,"FORMAT.md")`); `cavekit.ts` FORMAT_SRC fallback ! `join(here,"../FORMAT.md")` (⊥ `join(here,"FORMAT.md")`); scoped to plugin dir ∴ V43 probe consistent with install layout. supersedes V25 FORMAT dest + V43 FORMAT fallback.
V80: `assets/skills/ck-audit/SKILL.md` ! exist; `ck:audit.md` cmd = thin wrapper invoking ck-audit skill + $ARGUMENTS; ⊥ inline audit logic in cmd file; CLI `cpSync(assets/skills)` copies automatically. parallel V69.
V81: ∀ cmd with `command.execute.before` handler setting `output.parts` ! .md body = outcome description ⊥ imperative tool call; hook executes action directly; agent sees synthetic result; tool ⊥ required in agent toolset for cmd to function. Revises prior V81 (⊥ tool-delegation rule for hook-handled cmds).
V82: `copyFileWithState` ! 2 labels: `"added"` (dest ⊥ existed) | `"updated"` (dest existed); ∀ case → `copyFileSync` executes; ⊥ content-compare; ⊥ `"SKIPPED"`; ⊥ `"MODIFIED"`; ⊥ uppercase bracket tokens; label → `colorLabel(label)` for output (V78). idempotent run rewrites → stale assets ⊥ silently persist.
V83: integration test: call `CaveopenPlugin(mockPluginInput)` → assert `"ck_init" ∈ Object.keys(result.tool ?? {})`; ⊥ rely on TS compile alone; catches `applyPlugin` silent-swallow (OpenCode catches ∀ `Plugin` init throws → hooks ∅ ⊥ error); `mockPluginInput = { directory:"/tmp", project:{}, client:mockClient, $:null, worktree:null }`. companion V81.
V84: `scripts.test` ! ⊥ include `tsc`; runs node test runner only (assumes `dist/` built); `prepublishOnly`=`npm run build && npm test`; publish.yml steps: `npm ci` → `npm run build` → `npm test` → `npm version $TAG --no-git-tag-version` → `npm publish --ignore-scripts --tag beta`; ⊥ tsc invoked >1× per publish pipeline.
V85: cli.ts entry guard ! use `realpathSync(process.argv[1])` before comparing to `fileURLToPath(import.meta.url)`; bare `process.argv[1]` = symlink path when invoked via npm/npx bin → ⊥ match real path → `runCLI()` ⊥ called → silent no-op; wrap `realpathSync` in try/catch (ENOENT edge).
V86: CLI per-line output format ! `{sym} {colorAction}  {blue(type)} {name} → {blue(scope:type)} {name}` (assets) | `{sym} {colorAction}  {blue(type)} {name} → {blue(scope)} {blue(filename)}` (config); `type` ∈ `skills|commands|agents` (asset dest dir) | `plugin|mcp` (config); `name` = dir stem (skills), cmd filename stem incl. leading `/` (commands), agent stem (agents); scope = `global` (`--global`/default) | `project` (`--project`); blue = ANSI `\x1b[94m...\x1b[0m` when `isTTY`, plain text ⊥ TTY; action color unchanged (V78,V82): `added`/`registered`/`configured` → green, `updated` → yellow; ⊥ emit abs dest path in output; supersedes V78 `{rel-src-path} → {dest_abs_path}` format.
V87: CLI config output line ! `{sym} {colorAction}  {blue(type)} {name} → {blue(scope+":config")} {type}` where `type` ∈ `plugin|mcp` (plain, ⊥ blue); `scope+":config"` = e.g. `global:config` | `project:config`; ⊥ `{blue(scope)} {blue(cfgFilename)}` form; example: `✓ registered  plugin caveopen → global:config plugin`. supersedes §V86 config-line format.
V88: CLI FORMAT.md copy output ! `name = "caveopen/FORMAT.md"` (⊥ bare `"FORMAT.md"`); output: `{sym} {colorLabel}  plugins caveopen/FORMAT.md → {blue(scope+":plugins")} caveopen/FORMAT.md`; reflects actual dest subpath under `plugins/`; parallel B45 (bare basename strips context).
V89: `assets/README.md` ! exist; CLI copy → `join(opencodeDir,"plugins","caveopen","README.md")`; content = installed quick-ref (commands table per module, agents list, installed file tree, config snippet, links); ⊥ copy project root README.md (⊥ npm/dev detail); copy ∀ active module config (⊥ module-gated — always useful); output format: `{sym} {colorLabel}  plugins caveopen/README.md → {blue(scope+":plugins")} caveopen/README.md` (parallel V88).
V90: `/ck:init` `command.execute.before` ! call `client.session.prompt({path:{id:sessionID},body:{noReply:true,parts:[{id,sessionID,messageID,type:"text",synthetic:true,text:copyResult}]}})` (parallel V28); ⊥ set `output.parts`; `ck_init` tool ⊥ registered → remove from `cavekit.ts`; V83 integration test ! assert `"ck_init" ⊥ Object.keys(result.tool??{})`.
V91: `package.json` ! declare `"oc-plugin": ["server"]`; OpenCode v1.3.8+ `PluginLoader.loadExternal` gates server entrypoint discovery on this field; absent → `missing` warn + null load → `applyPlugin` skipped → 0 hooks registered (⊥ fatal → plugin shows active in status). v1 path calls `module.default.server(input, opts)` directly → ⊥ affected by extra named exports. ⊥ rely on legacy fallback (iterates ∀ exports → `parseModes` export called as Plugin → Hooks corrupted).
V92: `experimental.text.complete` ! preferred over `message.updated` for caveman history write + token count; fires once per generation with final `output.text` (⊥ incremental) → V29 zero-token guard ⊥ needed; replace `message.updated` assistant-text branch with `experimental.text.complete` handler; `input: {sessionID, messageID, partID}` + `output: {text}` → history row `{ts, session_id, mode, output_tokens: text.length_estimate, est_saved_tokens}`; ⊥ accumulate partial text in Map (V8 pattern obsolete for caveman).
V93: `tool.definition` ! ⊥ used for per-session caveman hints; `output.description` mutation varies by `input.toolID` only (⊥ sessionID) → static across sessions → cache-stable IF content const; but caveman mode active = per-session state → injecting caveman cues into description varies per request → busts tool-list cache prefix. system push (V12) already delivers mode nudge cache-stably. ⊥ register `tool.definition` handler in any caveopen module.
V94: `chat.params` ! ⊥ used; temperature/topP modification per caveman mode → inconsistent LLM behavior across sessions; sampling control = user's `opencode.json` model config (⊥ plugin concern); ⊥ register `chat.params` handler. negative invariant — prevent future misimplementation.
V95: `permission.ask` direct interceptor (⊥ `permission.asked` event) ! ⊥ default auto-allow any op; reserved for opt-in `trustedMode` config flag (`config: {trusted:true}` via `opencode.json` plugin tuple opts); when `trusted:true` → `permission.ask` handler: `if (input.tool === "read" || input.tool === "list") output.status = "allow"`; ⊥ auto-allow `write`/`bash`/`exec`; ⊥ implement until trustedMode T added to §T.
V96: `composeHooks` blocking-hook chain ! ⊥ swallow throw for `tool.execute.before` & `permission.ask`. HOOKS.md: throw in these stops op → later plugins ⊥ run for that call. V44 try/catch-warn-continue wrap (observable hooks) ⊥ apply here → swallowing defeats block (e.g. `.env` read guard per CLAUDE.md). chain bare: `await a(...)` (⊥ catch) → `await b(...)`; a throw → propagate + b skipped + op blocked. swallow-wrap retained ∀ observable keys (`event`,`tool.execute.after`,`chat.message`,etc). refines V44,V1.
V97: `composeHooks` `config` key ! chain mutator — run a then b on same `config` arg (both mutations accumulate); ⊥ last-write-wins (drops a's mutation; `config` is `(config)=>void` mutator ⊥ value). `auth`|`provider` stay last-write-wins (registration objects ⊥ mutators). refines V1.
V98: cavemem ! flush on `session.error` (parallel `session.idle`|`session.deleted`, V9): buffered `pendingObs` → `post-tool-use`, buffered assistant text → `stop`, then `session-end` if started. error path else strands obs + session-end (exit `flushSync` emits session-end ⊥ obs flush). extends V9.
V99: cavemem assistant-text capture ! via `experimental.text.complete` (parallel V92 caveman) — fires once w/ final `output.text`; drop `message.part.updated` Map accumulation (V8) + `message.updated` `time.completed` guard for cavemem `stop` turn_summary; `messageTexts` Map obsolete for cavemem. V8 retained only where still load-bearing.
V100: cavemem user-prompt capture ! via `chat.message` hook (structured `output.parts`, fires on user-msg arrival) ⊥ `message.updated` role===user filter + manual parts join. keep V7 deferred session-start (first body-bearing user msg) + V10 spawn-stdin + V34 parts-read (filter `type:"text"`, join). supersedes V34 read site (`message.updated`→`chat.message`).
V101: `experimental.session.compacting` ! registered (caveman): push active-mode reminder → `output.context` (⊥ replace `output.prompt`) → caveman framing survives compaction summary. content per-session-mode varies BUT compaction = one-shot summary call (⊥ cached prefix) → V56 static-bytes rule ⊥ apply. §I line ! reflect hook implemented (currently listed "used" but ⊥ registered in any module). cavemem ? push recent-obs note same hook (optional).
V102: caveman small-model gate (V60) ordering ! ⊥ rely on `experimental.provider.small_model` firing before first `experimental.chat.system.transform` — `capturedSmallModelId` null on early calls → id-match skip ⊥ fire that call. primary aux-call gate = `!input.sessionID` (V58, independent); id-match (V60) is secondary best-effort. ⊥ assert capture-before-transform order. documents V60 limit.

## §T TASKS
id|status|task|cites
T1|x|scaffold pkg, entry, composeHooks|V1,V2
T2|x|caveman module: system inject, mode parse, reinforce, token log|V3,V4,V5,V12
T3|x|cavekit module: /ck:init cmd + ck_init tool|V11,I
T4|x|cavemem module: lifecycle hooks → cavemem CLI|V6,V7,V8,V9,V10
T5|x|install.sh global/project + config merge|I
T6|x|tests: composeHooks chain/merge/last-write|V1
T7|x|tests: parseModeChange + reinforcement gate|V2,V3
T8|x|tests: cavemem phantom guard, flush, end-only-if-started|V7,V8,V9
T9|x|tests: shellEsc injection cases|V10
T10|x|caveman mode in-memory per-process only. ⊥ cross-session persist.|V3
T11|x|install.sh: curl path ⊥ npm. fetch assets direct from raw.githubusercontent.com/eXodes/caveopen/refs/heads/main. local-src path unchanged.|V13,I
T12|x|fix install.sh: `copy_command "ck-spec.md"` → `"ck:spec.md"`, same for ck-build.md→ck:build.md, ck-check.md→ck:check.md|V14
T13|x|fix install.sh: ⊥ push `["caveopen",{mode}]` to opencode.json; copy src/index.ts (local) or fetch $RAW_BASE/src/index.ts (curl) → $PLUGINS_DIR/caveopen.ts; merge pkg deps → $OPENCODE_DIR/package.json|V15
T14|x|fix install.sh: copy all src/*.ts → $PLUGINS_DIR/caveopen/; entry caveopen.ts (not flat caveopen.ts). local & curl paths both.|V16
T15|x|rename src/index.ts→caveopen.ts; update package.json exports→dist/caveopen.js; install.sh: remove shim block, register ./plugins/caveopen/caveopen.ts in plugin[]; update install tests (mod list caveopen⊥index; ⊥shim check; +plugin[] check)|V17,V18
T16|x|fix install.sh: detect `opencode.jsonc`; if found set OPENCODE_JSON to it; skip create-if-not-exists for `.jsonc` case|V19
T17|x|fix install.sh line 12: `${BASH_SOURCE[0]}` → `${BASH_SOURCE[0]:-$0}`|V20
T18|x|fix install.sh: strip JSONC block+line comments before JSON.parse in opencode.json merge node inline|V21
T19|x|fix install.sh: replace naive `//` regex with string-aware JSONC strip (char-walk, track quote+escape state)|V21,V22
T20|x|fix install.sh: after comment strip, remove trailing commas before `}` / `]` before JSON.parse|V23
T21|x|add assets/commands/ck:init.md + copy_command "ck:init.md" in cavekit block of install.sh|V24
T22|x|fix install.sh: `mkdir -p "$PLUGINS_DIR/assets"` + copy/curl `assets/FORMAT.md` → `$PLUGINS_DIR/assets/FORMAT.md` in both local & curl paths|V25
T23|x|fix caveman.ts:46 `?? "lite"` → `?? "full"`; update §I cmd doc; update test "defaults to lite"→"full"|V26
T24|x|fix caveman.ts: `reinforcementSent: boolean` → `Map<string,boolean>`; key all reads/writes by sessionID; `session.created` clears only that sid|V27
T25|x|rename config key `mode` → `modes`; parse CSV string → `Set<"caveman"\|"cavekit"\|"cavemem">`; unknown vals warn+skip; empty/omit → all 3; update install.sh `--mode` flag → `--modes`; update install.sh config merge to write `modes` key|V2,I
T26|x|fix caveman-stats: add `command.execute.before` handler for `/caveman-stats` in `caveman.ts`; reads history jsonl, aggregates last-entry-per-session, injects stats via `client.session.prompt({noReply:true})`; add `output_tokens > 0` guard to history write|V28,V29
T27|x|fix install.sh: copy `assets/FORMAT.md` → `$PLUGINS_DIR/caveopen/FORMAT.md` (⊥ `$PLUGINS_DIR/assets/`); fix `cavekit.ts` resolve: `join(here,"FORMAT.md")` (⊥ `../assets/FORMAT.md`)|V25
T28|x|fix caveman.ts:52 historyPath: `join(homedir(),".config","caveman")` → `join(homedir(),".caveman")`|V30
T29|x|fix caveman-stats.test.ts: stale `.config/caveman` comments + hPath join → `.caveman`|V30
T30|x|fix install.sh: add `copy_command "caveman-stats.md"` in caveman block (after `caveman-compress.md`)|V24,V28
T31|x|fix cavekit.ts:29: remove `&& command !== "ck-init"`; §I cmd: `/ck:init` only (⊥ `\| /ck-init`)|V24,I
T32|x|fix install.sh cavekit block: add `copy_command "ck:audit.md"` + `copy_command "ck:eval.md"`|V31,V24
T33|x|fix caveman.ts:9: `join(here,"../assets/skills/caveman/SKILL.md")` → `join(here,"../../skills/caveman/SKILL.md")`|V32
T34|x|fix `assets/commands/caveman-stats.md`: `~/.config/caveman/` → `~/.caveman/`; ⊥ project-source `.opencode/commands/` copy|V33,V30
T35|x|fix cavemem.ts user msg read: `info.summary?.body` → collect `info.parts.filter(p=>p.type==="text").map(p=>p.text??"").join(" ").trim()`|V34,V7
T36|x|fix cavemem.ts: add `if (!ensureCavemem()) return` guard to `experimental.chat.system.transform`|V6
T37|x|fix cavemem.ts `tool.execute.after`: add `if (!startedSessions.has(input.sessionID)) return` guard before `runHook("post-tool-use",...)`|V35
T38|x|fix `repository.url` in package.json: `exodes` → `eXodes`|-
T39|x|add `prepublishOnly: "npm run build && npm test"` to package.json scripts|-
T40|x|create `.github/workflows/publish.yml`: `on: push: branches: [main]` → checkout + setup-node (registry-url npmjs) + `npm ci` + `npm test` + `npm publish`; `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`|V36,V37
T41|x|add `publishConfig: { "access": "public" }` to package.json|-
T42|x|fix `runHook` → async `execFile` + Promise + timeout kill; fix `ensureCavemem` → `spawnSync` (⊥ `execSync`); ⊥ block event loop on any hook call|V38
T43|x|add `process.on('exit'\|'SIGTERM'\|'SIGINT')` in `cavemem` → sync `session-end` for all `startedSessions` not yet ended; re-raise signals after flush|V39
T44|x|add `bin: {"caveopen":"dist/cli.js"}` to package.json|V42
T45|x|create `src/cli.ts`: parse `--modes`/`--project`/`--global`; detect + read opencode.json/jsonc (reuse V19–V23 strip logic); add npm-form entry to `plugin[]`; copy assets from `import.meta.dirname/../assets/`; write back|V40,V41,V42
T46|x|update install.sh: add header comment `# deprecated for npm envs — prefer: npx caveopen init`; ⊥ remove path-form logic (still needed for curl-only env)|V40,I
T47|x|fix cavekit.ts FORMAT_SRC: probe `join(here,"../assets/FORMAT.md")` existsSync → fallback `join(here,"FORMAT.md")`|V43,V25
T48|x|fix caveman.ts SKILL_PATH: probe `join(here,"../assets/skills/caveman/SKILL.md")` existsSync → fallback `join(here,"../../skills/caveman/SKILL.md")`|V43,V32
T49|x|fix compose.ts: wrap each chained handler in own try/catch; warn on throw; sibling handler runs regardless|V44,V1
T50|x|fix caveman.ts: `activeMode: string\|null` → `Map<string,string\|null>`; key reads/writes by sessionID; clear sid on `session.created` & mode change|V45,V27
T51|x|fix caveman.ts: cap `.caveman-history.jsonl` (truncate to last-N | size cap) on write | on stats read|V46
T52|x|fix caveman.ts: `appendFileSync`→`fs.promises.appendFile`; cache history-dir mkdir once @ module init (⊥ per-event mkdirSync)|V47
T53|x|fix cavemem.ts: ⊥ spawn-per-`tool.execute.after`; batch observations + flush on idle | reuse 1 long-lived `cavemem` proc streaming NDJSON|V48
T54|x|fix cavemem.ts: signal handlers re-raise original signal after flush (⊥ `process.exit(0)`); register once; cleanup via `dispose`|V39
T55|x|fix publish.yml: gate `npm publish` on version change (tag trigger | `npm view` guard); skip when version unchanged|V49,V36
T56|x|update publish.yml: trigger `on: push: tags: ['v*.*.*']`; remove `npm view` guard call; remove `branches: [main]` trigger; checkout + setup-node + npm ci + npm test + npm publish unchanged|V36,V49,V50
T57|x|README: add Release section — `npm version patch\|minor\|major && git push --follow-tags`; note: tag push triggers GH publish workflow|V50
T58|x|create `.github/workflows/release.yml`: workflow_dispatch inputs; full checkout; npm version --no-git-tag-version to compute NEW_VERSION; git checkout . reset; `git tag v$NEW_VERSION $commit`; push tag|V51,V52,V54,V55
T59|x|update publish.yml: extract `TAG_VERSION=${GITHUB_REF#refs/tags/v}`; add `npm version $TAG_VERSION --no-git-tag-version` step before `npm publish`|V53
T60|x|verify: dispatch release.yml with known sha + patch → tag vX.Y.Z on exact input sha; publish.yml fires → npm publish uses tag version|V51,V52,V53
T61|x|audit ∀ system.transform push static+deterministic across requests; assert caveman+cavemem pushes const & ordered (compose a→b); doc cache-prefix rule in code comment|V56,V12,V1
T62|x|caveman reinforcement: confirm OpenCode persists `chat.message` synthetic part; if ⊥ → move mode nudge into system push (V12) | drop per-turn message injection; ⊥ leave non-persisted per-turn part|V57,V3
T63|x|gate caveman SKILL.md system push to main agent loop; skip aux/small-model calls (title, summary, compaction); detect via transform input.model|V58,V12
T64|x|gate cavemem memory-tools note on actual cavemem MCP tool availability (⊥ CLI-only `ensureCavemem`); doc cavemem MCP requirement in install + README|V59,V6
T65|x|fix caveman.ts: register `experimental.provider.small_model` → capture model ID; in `experimental.chat.system.transform` skip when `input.model.id === capturedSmallModelId` (⊥ typeof-string/name-regex)|V60,V58
T66|x|add `assets/skills/cavecrew/SKILL.md` + `assets/agents/cavecrew-{investigator,builder,reviewer}.agent.md` (OpenCode-adapted); update CLI + install.sh: copy skills/cavecrew/ → `$OPENCODE_DIR/skills/` and agents/cavecrew-*.agent.md → `$OPENCODE_DIR/agents/`|V61
T67|x|update publish.yml: `npm publish` → `npm publish --tag beta`|V62,V53
T68|x|README: add Promotion section — `npm dist-tag add caveopen@VERSION latest` after beta validation; note ⊥ auto-promoted by CI|V63
T69|x|add `assets/skills/caveman-commit/SKILL.md` (from upstream); add `copy_skill "caveman-commit"` to install.sh caveman block|V64
T70|x|add `assets/skills/caveman-review/SKILL.md` (from upstream); add `copy_skill "caveman-review"` to install.sh caveman block|V64
T71|x|add `assets/skills/caveman-compress/SKILL.md` (adapt: ⊥ `scripts/__main__.py`; add self-validate checklist + fix-loop ≤2 passes + diff+confirm before write); add `copy_skill "caveman-compress"` to install.sh caveman block|V64,V67
T72|x|add `assets/skills/caveman-help/SKILL.md` (from upstream); add `copy_skill "caveman-help"` to install.sh caveman block|V64
T73|x|refactor `assets/commands/caveman-commit.md` → thin wrapper invoking `caveman-commit` skill|V65
T74|x|refactor `assets/commands/caveman-review.md` → thin wrapper invoking `caveman-review` skill|V65
T75|x|refactor `assets/commands/caveman-compress.md` → thin wrapper invoking `caveman-compress` skill|V65
T76|x|add `assets/commands/caveman-help.md` (thin wrapper invoking `caveman-help` skill); add `copy_command "caveman-help.md"` to install.sh caveman block|V66
T77|x|rename `assets/agents/cavecrew-{investigator,builder,reviewer}.md` → `cavecrew-{investigator,builder,reviewer}.agent.md`; update install.sh `copy_agent` calls to `cavecrew-*.agent.md`|V61
T78|x|remove `model:` frontmatter from `assets/agents/cavecrew-{investigator,reviewer}.agent.md`; add README section documenting model override via `opencode.json` `agents` block|V68,V61
T79|x|fix install.sh cavekit block: add `copy_skill "ck-eval"`|V69
T80|x|remove `## Release` section from README (manual `npm version`/push steps); promote `### Promotion` → `## Promotion`|V70,V63
T81|x|add `name:` to frontmatter of all 3 `assets/agents/cavecrew-*.agent.md`; values: `cavecrew-investigator`, `cavecrew-builder`, `cavecrew-reviewer`|V71
T82|x|fix cli.ts:94: keep raw text; surgically replace `plugin[]` value in raw (char-scan to array bounds, splice new `JSON.stringify(newPlugins)` fragment); write modified raw; ⊥ `JSON.stringify(config)` roundtrip|V72
T83|x|fix install.sh node inline: same surgical `plugin[]` replace in raw JSONC; preserve comments on write-back|V72
T84|x|fix cli.ts: add `spliceMcpCavemem(raw, entry)` helper (char-scan to `"mcp"` key → inject `"cavemem":...` into object); inject when includeCavemem + `!config.mcp?.cavemem`; splice path for existing files, config-obj for new files|V73,V59
T85|x|fix `spliceMcpCavemem` trailing-comma: `const inner=raw.slice(objStart+1,objEnd)`; `insertion = inner.trim()==""||inner.trimEnd().endsWith(",") ? entryStr : ", "+entryStr`; add test: JSONC mcp with trailing comma → valid JSON output ⊥ double comma|V74
T86|x|improve cli.ts output: `isTTY` check → ANSI color symbols (`✓` green/`✗` red/`⚠` yellow) or plain symbols; wrap each step in `step(label, fn)` helper → print symbol+label+dest on success, ⚠+msg on warn, ✗+err+exit(1) on fatal; final summary: active modes, config path, `Run: opencode` hint; add `--dry-run` flag|V75
T87|x|remove `install.sh` entirely; all shell-based install work (T5,T11–T22,T27,T30,T32,T46,T79,T83) superseded by `npx caveopen init` CLI (T45,V40,V41)|V40,T46
T88|x|fix cli.ts: per-module asset copy; caveman→selective cpSync `caveman*/` + `cavecrew/` skill dirs + filter `caveman*.md` cmds + filter `cavecrew-*.agent.md` agents; cavekit→selective cpSync `ck-*/` skill dirs + filter `ck:*.md` cmds + copy FORMAT.md; ⊥ flat full-dir cpSync|V76,V41
T89|x|fix `name:` in ck-* SKILL.md files: ck-spec→`ck-spec`, ck-check→`ck-check`, ck-build→`ck-build`, ck-eval→`ck-eval`, ck-backprop→`ck-backprop`, ck-caveman→`ck-caveman`|V77
T90|x|cli.ts: per-file copy output with state indicator; before cpSync/copyFile → probe dest `existsSync`; if exists → compare content → `MODIFIED`\|`SKIPPED`; else → `ADDED`; emit `✓ [STATE] filename → dest_abs_path` per file; config mutation lines: `✓ [ADDED\|MODIFIED] plugin[] entry` + `✓ [ADDED\|MODIFIED] mcp.cavemem` with config path; ⊥ suppress SKIPPED (user sees idempotent run clearly)|V78,V75,V76
T91|x|fix cli.ts `copyFileWithState`: add `relative` to `node:path` import; line 259 `basename(destPath)` → `relative(assetsDir, srcPath)`|V78,B45
T92|x|fix cli.ts:324 FORMAT.md dest → `join(opencodeDir,"plugins","caveopen","FORMAT.md")`; fix cavekit.ts:10 fallback → `join(here,"../FORMAT.md")`|V79
T93|x|create `assets/skills/ck-audit/SKILL.md` (name:ck-audit, full audit logic extracted from `ck:audit.md`); refactor `ck:audit.md` → thin wrapper|V80,V69,V77
T94|x|fix `assets/commands/ck:init.md` body → invoke `ck_init` tool (⊥ prose instruction)|V81,V24
T95|x|fix `copyFileWithState`: remove content-compare; 2 states: `ADDED`\|`OVERWRITE`; ∀ existing dest → `copyFileSync` + emit `OVERWRITE`; remove `MODIFIED`+`SKIPPED`; update comment line 244|V82,V78
T96|x|integration test: `CaveopenPlugin(mockPluginInput)` → assert `"ck_init" ∈ Object.keys(result.tool ?? {})`; mock `PluginInput` w/ real `directory`; verify compose path propagates `tool` key end-to-end|V83,B50
T97|x|cli.ts: add `init` as required subcommand (`process.argv[2] === "init"` gate; unknown/missing subcommand → print usage + exit 1); update README `npx caveopen` → `npx caveopen init` ∀ invocation examples; ⊥ touch pkg name refs|V40,V42
T98|x|fix `assets/commands/ck:init.md`: remove tool-call instruction; body → "FORMAT.md copied to project root by plugin. No further action needed."|V81,B52
T99|x|fix cli.ts:399 entry guard: `import { realpathSync } from "node:fs"` + resolve symlinks via `realpathSync` before compare; wrap in try/catch (ENOENT)|V85,B53
T100|x|cli.ts: rm `[BRACKET]` form from ∀ `printOk` calls; add `colorLabel(label: string, type: "ok" \| "warn") → string` helper (green: `added`/`registered`/`configured`, yellow: `updated`); `copyFileWithState` state → `"added"\|"updated"` → emit `{sym} ${colorLabel} {rel} → {dest}`; plugin[] lines: `registered`\|`updated` colored; mcp.cavemem line: `configured`\|`updated` colored; update tests checking label format|V75,V78,V82
T101|x|cli.ts: replace per-file `{rel-src} → {dest_abs_path}` format w/ V86 format; add `grey(s)` helper (`\x1b[90m${s}\x1b[0m` when `isTTY`, else `s`); derive `type` from dest dir (`skills`\|`commands`\|`agents`); `name` = dir stem (skills), `/`+stem (commands), stem (agents); config lines: `grey("plugin")` + name → `grey(scope)` + `grey(filename)`; asset lines: `grey(type)` + name → `grey(\`${scope}:${type}\`)` + name; `scope` = `global`\|`project` from CLI flag; update tests|V86,V78,V75
T102|x|cli.ts: rename `grey(s)` → `blue(s)`; swap ANSI `\x1b[90m` → `\x1b[94m`; update ∀ call sites; update tests checking ANSI grey codes|V86
T103|x|fix cli.ts:262–264: config lines → `${colorLabel(pluginLabel, isTTY)}  ${g("plugin")} caveopen → ${g(scope+":config")} plugin` + `${colorLabel("configured", isTTY)}  ${g("mcp")} cavemem → ${g(scope+":config")} mcp`; dest `type` plain (⊥ `g()`); remove `g(cfgFile)` from output; update tests|V87
T104|x|fix cli.ts:354 `copyFileWithState` name arg `"FORMAT.md"` → `"caveopen/FORMAT.md"`; output becomes `✓ added  plugins caveopen/FORMAT.md → global:plugins caveopen/README.md`|V88,V79,B54
T105|x|create `assets/README.md`: installed quick-ref (commands per module, agents, file tree, config, links)|V89
T106|x|cli.ts: copy `assets/README.md` → `join(opencodeDir,"plugins","caveopen","README.md")`; alongside FORMAT.md copy (V79 block); same `copyFileWithState` + V88 output pattern|V89,V88,V79
T107|x|fix cavekit.ts: `command.execute.before` → call `client.session.prompt({path:{id:sessionID},body:{noReply:true,parts:[...]}})` with copy result (parallel V28); remove `ck_init` tool block; add `client` from `PluginInput` where needed|V90,V28
T108|x|update caveopen.test.ts V83 integration test: assert `"ck_init" ⊥ Object.keys(result.tool??{})` (⊥ assert ∈)|V90,V83
T109|x|fix root README.md cavekit Usage: rm line `"The \`ck_init\` tool is also callable by the agent directly (idempotent)."`|V90
T110|x|fix `assets/README.md` cavekit Hooks table: rm row `\| \`tool\` (\`ck_init\`) \| Agent calls \`ck_init\` tool \| ...\|`|V90
T111|x|fix `docs/PLAN.md` stale refs: rm `install.sh` curl block; `"mode"` → `"modes"`; rm `"all"` mode row; `~/.config/caveman/` → `~/.caveman/`; `src/index.ts` → `src/caveopen.ts` (entry + pkg struct); MCP cmd rm `caveman-shrink`; cavekit sketch rm `ck_init` tool block|V18,V2,V30,V87,V90
T112|x|update publish.yml: `npm publish --tag beta` → `npm publish --tag latest`|V62,V53
T113|x|README: rm `## Promotion` section|V63,V70
T114|x|add `"oc-plugin": ["server"]` to package.json|V91
T115|x|replace caveman `message.updated` assistant-text branch + V8 Map accumulation with `experimental.text.complete` handler; `input.sessionID`+`input.messageID`+`output.text` → history row write (V5,V47); remove `assistantTextMap` + `message.updated` guard; ⊥ touch `message.updated` branch if used by other modules|V92,V8,V47
T116|x|fix compose.ts: exclude `tool.execute.before` & `permission.ask` from try/catch swallow-wrap; chain bare (`await a`→`await b`) so throw propagates + blocks op + skips b; retain swallow-wrap ∀ observable keys; add test: blocking-hook throw propagates (⊥ caught)|V96,V44,V1
T117|x|fix compose.ts: `config` key → chain both mutators on same arg (run a, run b); keep `auth`\|`provider` last-write-wins; add test: two `config` mutators both apply|V97,V1
T118|x|fix cavemem.ts: add `session.error` to flush branch alongside idle/deleted (obs flush + assistant-text stop + session-end-if-started); add test: error event flushes pendingObs + session-end|V98,V9
T119|x|fix cavemem.ts: replace `message.part.updated`+`message.updated` assistant-text capture w/ `experimental.text.complete` handler → `stop` turn_summary; remove `messageTexts` Map + part-tracking; update tests|V99,V8,V92
T120|x|fix cavemem.ts: move user-prompt capture from `message.updated` role===user → `chat.message` hook; preserve V7 deferred session-start + V10 spawn-stdin + V34 parts-read; update tests|V100,V34,V7
T121|x|add `experimental.session.compacting` handler in caveman.ts: push active-mode reminder → `output.context` (⊥ replace prompt); update §I (hook implemented, ⊥ just listed); optional cavemem recent-obs push; add test: active mode → context push present|V101
T122|x|doc V60 small-model gate ordering limit in caveman.ts comment + verify `!input.sessionID` (V58) is primary aux gate; ⊥ assert capture-before-transform order|V102,V60

## §B BUGS
id|date|cause|fix
B1|2026-06-11|install.sh fetches `ck-spec.md`/`ck-build.md`/`ck-check.md`; assets/commands has `ck:spec.md`/`ck:build.md`/`ck:check.md` → 404|V14
B2|2026-06-11|install.sh pushes `["caveopen",{mode}]` to opencode.json `plugin[]` but caveopen ⊥ npm pkg → plugin never loads; fix: copy src/index.ts → plugins dir|V15
B3|2026-06-11|install.sh copies only `src/index.ts` → flat `caveopen.ts`; sibling imports (compose, caveman, cavekit, cavemem) ⊥ copied → runtime `MODULE_NOT_FOUND`; fix: copy all src/*.ts → `caveopen/` dir, entry `caveopen.ts`|V16
B4|2026-06-11|`plugins/caveopen.ts` shim exported `./caveopen/index.js`; Bun ESM ⊥ resolve `.js` when src is `.ts` (no compile); OpenCode ⊥ auto-register subdir via shim; `src/index.ts` ⊥ named `caveopen.ts` → entry path wrong|V17,V18
B5|2026-06-11|OPENCODE_JSON hardcoded `.json`; ⊥ check `.jsonc` → creates duplicate `opencode.json` alongside existing `opencode.jsonc`|V19
B6|2026-06-11|install.sh `BASH_SOURCE[0]` unbound under `set -u` when piped via `curl\|bash` → warn line 12|V20
B7|2026-06-11|install.sh node inline `JSON.parse()` rejects comments in `opencode.jsonc` → "Failed to parse" error|V21
B8|2026-06-11|T18 regex `//[^\n]*` strips `//` inside quoted strings (e.g. `"http://..."`) → malformed JSON after strip → "Failed to parse"|V22
B9|2026-06-11|`stripJsonc` strips comments only; `opencode.jsonc` has trailing commas (e.g. last prop before `}`) → `JSON.parse` rejects → "Failed to parse" persists after T19|V23
B10|2026-06-11|⊥ assets/commands/ck:init.md → OpenCode ⊥ list /ck:init in cmd palette; hook exec-only ⊥ discoverable. install.sh ⊥ copy_command "ck:init.md" in cavekit block|V24
B11|2026-06-11|`ck_init` resolves `join(here,"../assets/FORMAT.md")` → `$PLUGINS_DIR/assets/FORMAT.md`; install.sh ⊥ copy `assets/FORMAT.md` there → ENOENT on `/ck:init`|V25
B12|2026-06-11|`parseModeChange` no-arg fallback `?? "lite"` (caveman.ts:46); caveman plugin SKILL.md says "full (default)" → mismatch|V26
B13|2026-06-11|single `reinforcementSent` bool in closure shared by all concurrent sessions; `session.created` for any sid resets gate globally → session A re-injects on next msg after session B fires created|V27
B14|2026-06-11|`/caveman-stats` ⊥ functional in OpenCode: `assets/commands/caveman-stats.md` = Claude Code LLM-command model; OpenCode ⊥ auto-load `.md` assets for commands; ⊥ `command.execute.before` handler registered → command fires, no response; also `message.updated` writes rows with `output_tokens:0` (intermediate events with `time.completed` set) → corrupts aggregation|V28,V29
B15|2026-06-11|caveman.ts historyPath() uses `~/.config/caveman/`; test comments echo stale path; ∀ ! be `~/.{module}/`|V30
B16|2026-06-11|install.sh caveman block ⊥ `copy_command "caveman-stats.md"` → V28 `/caveman-stats` active but asset ⊥ installed → ⊥ discoverable in OpenCode palette|V24
B17|2026-06-11|`cavekit.ts:29` accepts `ck-init` alias; ⊥ `assets/commands/ck-init.md` → violates V24; `ck-init` ⊥ public cmd|V24
B18|2026-06-11|install.sh cavekit block copies 4 cmd files; `ck:audit.md` + `ck:eval.md` exist in `assets/commands/` but ⊥ copied → cmds ⊥ discoverable in palette|V31
B19|2026-06-11|`caveman.ts:9` SKILL_PATH `join(here,"../assets/skills/caveman/SKILL.md")` → `~/.config/opencode/plugins/assets/skills/…` (⊥ exist); install copies to `$OPENCODE_DIR/skills/caveman/` → `⊥ read SKILL.md` error on startup|V32
B20|2026-06-11|T28 fixed `caveman.ts` historyPath → `~/.caveman/` but ⊥ updated `assets/commands/caveman-stats.md` (still `~/.config/caveman/`); `.opencode/commands/caveman-stats.md` 0 bytes → ⊥ palette description|V33
B21|2026-06-11|cavemem.ts reads `info.summary?.body` for user msg text; OpenCode puts content in `info.parts[].text` → body always falsy → early return → session-start ⊥ fires (ide=unknown) + user-prompt-submit ⊥ fires; only post-tool-use reaches cavemem|V34
B22|2026-06-11|`experimental.chat.system.transform` ⊥ guarded by `ensureCavemem()` → model told "you have cavemem tools" when CLI absent|V6
B23|2026-06-11|`tool.execute.after` fires before deferred `session-start`; cavemem `addObservation` → `ensureSession(id)` → `INSERT OR IGNORE sessions(id,ide:'unknown',cwd:null)`; subsequent `session-start` with real `ide`/`cwd` is no-op → sessions always show `ide=unknown` + `cwd=null`|V35
B24|2026-06-11|`runHook` uses `execSync` (timeout:10s) + `ensureCavemem` uses `execSync` (timeout:3s) → every hook call blocks Bun event loop synchronously → OpenCode slow/laggy on startup & each turn|V38
B25|2026-06-11|no `process.on('exit'\|'SIGTERM'\|'SIGINT')` handler → abrupt OpenCode exit ⊥ fires `session.idle`/`session.deleted` → `session-end` ⊥ called → cavemem session record incomplete; in-flight `execSync` children SIGKILL'd by parent exit|V39
B26|2026-06-11|npm-loaded: `here`=`<pkg>/dist/`; V25 `join(here,"FORMAT.md")`→`dist/FORMAT.md` (⊥exist); V32 `join(here,"../../skills/caveman/SKILL.md")`→above pkg root (⊥exist); both paths path-form-only|V43
B27|2026-06-11|compose.ts chain `await chainPrev; await chainFn` no try/catch; caveman & cavemem share `event` + `experimental.chat.system.transform`; prev throw → fn never runs + whole hook rejects → one module failure silently disables sibling|V44
B28|2026-06-11|`activeMode` single module-level `let` (caveman.ts:36); activate in session A → session B reinforcement fires; same class as B13 but V27 fixed only `reinforcementSent`, ⊥ `activeMode`|V45
B29|2026-06-11|`.caveman-history.jsonl` append-only, no rotation; grows unbounded (1 row/assistant msg ∀ sessions ∀ install life); `/caveman-stats` re-reads whole file each call|V46
B30|2026-06-11|caveman.ts:171 `appendFileSync` + `historyPath()` `mkdirSync` run in `event` handler per completed assistant msg → sync IO blocks Bun loop; V38 governed cavemem only, caveman side unfixed|V47
B31|2026-06-11|cavemem `runHook` spawns new `cavemem` proc ∀ `tool.execute.after`; heavy-tool session → proc-create + runtime-start + SQLite-open per call → latency|V48
B32|2026-06-11|V39 signal handlers call `process.exit(0)` (⊥ re-raise, contradicts T43 "re-raise" intent) → pre-empts OpenCode shutdown + other plugins' SIGINT/SIGTERM handlers; ⊥ `dispose` cleanup|V39
B33|2026-06-11|publish.yml runs `npm publish` ∀ push main, no version-change guard; `version` static `0.0.0` → CI fails noisy on every doc/non-release commit once version live|V49
B34|2026-06-12|`caveman.ts:140`: `typeof input.model === "string"` always false (input.model is `Model` object) → `modelStr=""` → regex ⊥ fires → all calls incl. title-gen/summary/compaction get full SKILL.md pushed (V58 violated); name-regex fragile even if fixed; correct indicator = `experimental.provider.small_model` hook output model ID|V60
B35|2026-06-12|CaveOpen `assets/` missing `skills/cavecrew/SKILL.md` + `agents/cavecrew-*.md`; upstream caveman ships dispatch guide + 3 agent defs; CaveOpen ⊥ ported any; OpenCode native agents support (mode:subagent) → full port feasible|V61
B36|2026-06-12|V33 required `.opencode/commands/caveman-stats.md` in project source; `.opencode/` is user install target ⊥ plugin repo artifact → mirror never created, never needed|V33
B37|2026-06-13|T66 marked x but `assets/agents/cavecrew-{investigator,builder,reviewer}.md` ⊥ `.agent.md` ext (V61 mandates); install.sh `copy_agent` calls pass `.md` → copied to `$OPENCODE_DIR/agents/cavecrew-*.md` ⊥ `*.agent.md` → OpenCode ⊥ loads as subagents|V61
B38|2026-06-13|T57 added `## Release` section to README w/ manual `npm version patch && git push --follow-tags`; release automated via `release.yml` workflow_dispatch (V51,V52) → manual CLI steps misleading|V70
B39|2026-06-13|`cavecrew-{investigator,builder,reviewer}.agent.md` frontmatter ⊥ `name:` → OpenCode ⊥ reference agents by name|V71
B40|2026-06-13|cli.ts:94 `JSON.stringify(config)` after `parseJsonc` strips ∀ user JSONC comments on write; install.sh inline node has same pattern|V72
B41|2026-06-13|`cli.ts` (`npx caveopen`, V40) ⊥ injects `mcp.cavemem`; install.sh node inline does (line 296–301); cli.ts omits MCP step → plugin loads but model ⊥ shown memory tools (V59 note gated on mcp.cavemem presence)|V73
B42|2026-06-13|`spliceMcpCavemem` prepends `, ` regardless of trailing comma in JSONC mcp content; existing entry ending `,` + prepended `, ` → `,,` double comma → OpenCode JSON parse error on startup|V74
B43|2026-06-13|cli.ts flat `cpSync(assets/skills)` + `cpSync(assets/commands)` + `cpSync(assets/agents)` installs ∀ module assets ⊥ filtered by active modules; `--modes caveman` installs ck:* skills+cmds; `--modes cavekit` installs caveman* skills+cmds+agents|V76
B44|2026-06-13|ck-* SKILL.md `name:` = upstream short names (spec/check/build/eval/backprop/caveman) ⊥ dir names; cmds ref `ck-spec`/`ck-build`/etc. but ⊥ skill with those names → skill invocations fail; `ck-caveman` `name:caveman` conflicts with `caveman/SKILL.md` same name|V77
B45|2026-06-13|`copyFileWithState` uses `basename(destPath)` as label → strips dir prefix → ∀ SKILL.md files show same `SKILL.md` label; `skills/<dir>/SKILL.md` info lost → indistinguishable output|V78
B46|2026-06-13|CLI copies `assets/FORMAT.md` → `$OPENCODE_DIR/FORMAT.md` (config root ⊥ plugin scope); `cavekit.ts` fallback `join(here,"FORMAT.md")`=`dist/FORMAT.md` (⊥ exist) → ENOENT on `/ck:init` for non-npm installs|V79
B47|2026-06-13|`assets/skills/ck-audit/` dir created (T32) but SKILL.md never written; full audit logic inlined in `ck:audit.md` ⊥ thin wrapper → skill invocation fails (no SKILL.md)|V80
B48|2026-06-13|cmd asset body = prose "Copy FORMAT.md…" → agent acts manually ⊥ calls `ck_init` tool; `ck_init` registered + handles copy; V24 says cmd ↔ asset but ⊥ mandates tool delegation|V81
B49|2026-06-13|`copyFileWithState` skips identical files (`SKIPPED` state + `state !== "SKIPPED"` copy guard); upstream asset update ⊥ refreshed on re-run → stale files silently persist|V82
B50|2026-06-13|`ck_init` absent from LLM toolset; OpenCode `applyPlugin` silently swallows `CaveopenPlugin` init exceptions → entire hooks map incl. `tool.ck_init` never registered; no integration test verifies `ck_init` ∈ `plugin.list()[*].tool` at runtime|V83
B51|2026-06-14|`scripts.test`=`tsc && node --test`; `prepublishOnly`=`npm run build && npm test`; publish.yml runs `npm test` then `npm publish`(triggers prepublishOnly) → 3× tsc + 2× test per publish; pipeline ⊥ consistent w/ package scripts|V84
B52|2026-06-14|`ck:init.md` body says "Call `ck_init` tool"; tool ⊥ in agent tool ctx during cmd exec; `command.execute.before` hook already sets `output.parts` w/ copy result → agent call redundant + fails|V81
B53|2026-06-14|`process.argv[1]`=bin symlink (e.g. `.bin/caveopen`) ⊥ resolved real path → `fileURLToPath(import.meta.url) === process.argv[1]` ⊥ fires → `runCLI()` ⊥ called → ∀ `npx caveopen [init]` silent no-op|V85
B54|2026-06-14|cli.ts:354 `copyFileWithState(...,"plugins","FORMAT.md")` → output `✓ added  plugins FORMAT.md → global:plugins FORMAT.md`; bare name strips dest subpath context; ⊥ clear which file under `plugins/`; parallel B45 (skills SKILL.md same issue)|V88
B55|2026-06-14|`/ck:init` sets `output.parts` → LLM processes result + responds; ⊥ follow V28 `noReply:true` pattern; `ck_init` tool registered redundant; spec had duplicate V85 (ck_init-remains vs cli-entry-guard both labeled V85)|V90
B56|2026-06-14|`package.json` ⊥ `"oc-plugin": ["server"]` → OpenCode v1.3.8+ `PluginLoader` ⊥ finds server entrypoint → null load → `applyPlugin` skipped → hooks ⊥ registered; shows active in status (missing=warn ⊥ error)|V91
