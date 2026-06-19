# CAVEKIT_HOOKS_CONFIG_INJECTION.md — Runtime Injection via `config` Hook for cavekit

Analysis of whether `assets/` content (agents, skills, commands) can be injected at runtime via plugin hooks, eliminating the need for `npx caveopen init` to copy files locally.

**Conclusion: `npx caveopen init` is not required.** Commands and agents inject via the `config` hook at startup. Skills write on first `session.created` (idempotent). `FORMAT.md` is already handled by `/ck:init` (registered via `config` hook), which users run per-project when starting SDD work.

---

## Summary

| Asset type    | Runtime injection             | Mechanism                                                 | Verdict          |
| ------------- | ----------------------------- | --------------------------------------------------------- | ---------------- |
| **Commands**  | ✅ Full                       | `config` hook → `config.command`                          | **Do it**        |
| **Agents**    | ✅ Full                       | `config` hook → `config.agent`                            | **Do it**        |
| **Skills**    | ⚡ Write-on-demand            | `session.created` → write to `~/.config/opencode/skills/` | **Do it**        |
| **FORMAT.md** | ✅ Per-project via `/ck:init` | `config` hook registers command                           | **Already done** |

---

## Why Each Decision

### Commands — fully injectable

OpenCode resolves commands from two sources:

1. `opencode.json` `command` key
2. Markdown files in `.opencode/commands/` or `~/.config/opencode/commands/`

The `config` hook fires once at startup and can mutate the resolved config before OpenCode applies it. The plugin already uses this pattern in `src/modules/cavekit/hooks/set-config.ts` to register `/ck:init`.

Extension: read every `assets/commands/*.md` at plugin startup, parse frontmatter (`description`, `agent`, `model`, `argument-hint`) + body (template), inject into `config.command`:

```ts
config: async (config) => {
  config.command ??= {};
  for (const [name, def] of parsedCommandAssets) {
    config.command[name] = {
      template: def.body,
      description: def.description,
      ...(def.agent && { agent: def.agent }),
      ...(def.model && { model: def.model }),
    };
  }
};
```

Commands registered this way appear in TUI autocomplete and are interceptable via `command.execute.before` — identical behavior to file-based commands.

**One gap:** `argument-hint` frontmatter field. The `config.command` schema does not expose an `argumentHint` property — this field is markdown-file-only. Caveman commands use it for level autocomplete. Functional impact: command still works, hint just won't surface in TUI typeahead.

---

### Agents — fully injectable

Agents can be defined inline in `opencode.json` `agent` key. The `prompt` field accepts a plain string (not only `{file:...}`), so the bundled `.agent.md` body can be inlined directly.

Parse `assets/agents/*.agent.md`: strip YAML frontmatter, use remaining body as `prompt` string, frontmatter fields map to agent config properties:

```ts
config: async (config) => {
  config.agent ??= {};
  for (const [name, def] of parsedAgentAssets) {
    config.agent[name] = {
      description: def.description,
      mode: def.mode ?? "subagent",
      prompt: def.body,
      permission: def.permission,
      ...(def.model && { model: def.model }),
    };
  }
};
```

Injected agents behave identically to file-defined agents: appear in `@` autocomplete, are invocable via Task tool, respect permissions.

**No gaps.** All agent frontmatter fields map 1:1 to `config.agent` schema.

---

### Skills — write-on-demand

Skills are filesystem-driven with no plugin API to register them. OpenCode's `skill` tool discovers `SKILL.md` files by walking these paths at startup:

```
.opencode/skills/<name>/SKILL.md
~/.config/opencode/skills/<name>/SKILL.md
.claude/skills/<name>/SKILL.md
~/.claude/skills/<name>/SKILL.md
.agents/skills/<name>/SKILL.md
~/.agents/skills/<name>/SKILL.md
```

There is no `config.skill` key, no `skill.register` hook, no plugin API surface for dynamic skill registration. The `skill` tool's `<available_skills>` list is built entirely from filesystem scan.

Skills must exist on disk — but the plugin writes them transparently on first `session.created`, targeting the scope that matches where it was declared. Idempotent, silent, no user action required: install the plugin, open OpenCode, skills are available.

**Write target:** determined at runtime by scope detection (see Implementation Plan). Global install → `~/.config/opencode/skills/`. Project install → `.opencode/skills/` in the worktree root.

---

## Implementation Plan

### `src/modules/caveopen/hooks/set-config.ts` (new shared module)

Central `config` hook for CaveOpen — replaces the per-module `set-config.ts` in cavekit and extends it to handle commands + agents:

```ts
import { readFileSync } from "fs";
import { join } from "path";
import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import { parseMarkdownAsset } from "../lib/parse-asset.js";

const ASSETS_DIR = join(import.meta.dir, "../../../../assets");

export function setConfig(ctx: PluginInput): NonNullable<Hooks["config"]> {
  const commands = loadAssets(join(ASSETS_DIR, "commands"));
  const agents = loadAssets(join(ASSETS_DIR, "agents"));

  return async (config) => {
    // Commands
    config.command ??= {};
    for (const [name, def] of commands) {
      if (!config.command[name]) {
        // don't override user-defined commands
        config.command[name] = {
          template: def.body,
          description: def.frontmatter.description,
          ...(def.frontmatter.agent && { agent: def.frontmatter.agent }),
          ...(def.frontmatter.model && { model: def.frontmatter.model }),
        };
      }
    }

    // Agents
    config.agent ??= {};
    for (const [name, def] of agents) {
      if (!config.agent[name]) {
        // don't override user-defined agents
        config.agent[name] = {
          description: def.frontmatter.description,
          mode: def.frontmatter.mode ?? "subagent",
          prompt: def.body,
          ...(def.frontmatter.permission && {
            permission: def.frontmatter.permission,
          }),
          ...(def.frontmatter.model && { model: def.frontmatter.model }),
        };
      }
    }

    // ck:init (existing cavekit command)
    config.command["ck:init"] ??= {
      template: "/ck:init",
      description:
        "Copy FORMAT.md (the SPEC.md schema) to the current project root",
    };
  };
}
```

**Non-override policy:** skip injection when key already exists in config. User-defined agents/commands take precedence — consistent with OpenCode's own load order semantics.

### `src/lib/parse-asset.ts` (new utility)

Lightweight YAML frontmatter parser for `.md` and `.agent.md` files. No external deps — split on `---` delimiter, parse key-value pairs for string/object fields used in agent/command frontmatter.

### Skills — write-on-demand via `session.created`

Skills write to the scope matching where the plugin is declared: global config → `~/.config/opencode/skills/`, project config → `.opencode/skills/` in the worktree root.

#### Scope detection

The plugin context provides `ctx.directory` (cwd) and `ctx.worktree`. Neither tells us directly which config file declared the plugin. Detection strategy: read the project `opencode.json` (walking up from `ctx.worktree` or `ctx.directory`) and check whether it lists caveopen in its `plugin` array. If yes → project scope. If not found or not listed → global scope.

```ts
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  readFileSync,
} from "fs";
import { join, dirname } from "path";
import os from "os";
import type { PluginInput } from "@opencode-ai/plugin";

const ASSETS_DIR = join(import.meta.dir, "../../../../assets");
const PLUGIN_NAMES = ["caveopen", "@caveopen/plugin"]; // all known package names

function resolveSkillsDir(ctx: PluginInput): string {
  const root = ctx.worktree ?? ctx.directory;
  const cfgPath = join(root, "opencode.json");

  if (existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
      const plugins: string[] = cfg.plugin ?? [];
      if (plugins.some((p) => PLUGIN_NAMES.includes(p))) {
        return join(root, ".opencode", "skills"); // project scope
      }
    } catch {
      // malformed JSON — fall through to global
    }
  }

  return join(os.homedir(), ".config", "opencode", "skills"); // global scope
}

export async function bootstrapSkills(ctx: PluginInput): Promise<void> {
  const skillsDst = resolveSkillsDir(ctx);
  const skillsDir = join(ASSETS_DIR, "skills");

  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const src = join(skillsDir, entry.name, "SKILL.md");
    const dst = join(skillsDst, entry.name, "SKILL.md");
    if (!existsSync(dst)) {
      mkdirSync(dirname(dst), { recursive: true });
      copyFileSync(src, dst);
    }
  }
}
```

Called from the `event` handler in the caveman module (or a shared bootstrap module):

```ts
event: async ({ event }) => {
  if (event.type === "session.created") {
    await bootstrapSkills(ctx); // idempotent — skips existing files
  }
};
```

#### Scope behavior

| Plugin declared in                 | Skills written to            | Scope                      |
| ---------------------------------- | ---------------------------- | -------------------------- |
| `~/.config/opencode/opencode.json` | `~/.config/opencode/skills/` | All projects for this user |
| `./opencode.json` (project root)   | `./.opencode/skills/`        | This project only          |

**Idempotent:** skips files already on disk. Skills written once on first session, never overwritten — user edits persist.

**Edge case — declared in both:** project `opencode.json` wins (project scope check runs first). Skills land in `.opencode/skills/` for that project; the global install writes its own copy separately on any session without a project config reference.

**Edge case — `opencode.jsonc`:** detection reads `opencode.json` only. If project uses JSONC, JSON.parse will fail on comments. Strip comments before parse, or also probe `opencode.jsonc`.

---

## Migration Impact on `init`

`npx caveopen init` is eliminated. All assets handled automatically:

| What `init` did                                        | Replacement                                                                                                     |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Copy `assets/commands/*.md` to `.opencode/commands/`   | `config` hook injects at startup                                                                                |
| Copy `assets/agents/*.agent.md` to `.opencode/agents/` | `config` hook injects at startup                                                                                |
| Copy `assets/skills/*/SKILL.md` to `.opencode/skills/` | `session.created` writes to `~/.config/opencode/skills/` (global) or `.opencode/skills/` (project) on first run |
| Copy `FORMAT.md` to project root                       | `/ck:init` command (registered via `config` hook) — run once per project when starting SDD work                 |

`FORMAT.md` is intentionally per-project: it belongs in the repo alongside `SPEC.md`. Users run `/ck:init` once when starting cavekit SDD on a project, same as before. This is deliberate user action, not a setup burden.

---

## Known Limitations

**`argument-hint` not supported in config injection.** The `/caveman [level]` command uses `argument-hint` frontmatter to drive TUI typeahead for level values. This field has no equivalent in `config.command` schema — it is only honored when the command is defined as a markdown file. Affected commands: `caveman.md`, `caveman-stats.md`. All other behavior (template, routing, execution) is unaffected.

**Upstream tracking:** [anomalyco/opencode#9306](https://github.com/anomalyco/opencode/issues/9306) — `noReply` for command hooks. Unrelated but tracked in cavekit hooks.

**Plugin-injected agents not listed by `opencode agent create`.** That CLI command only reads from markdown files + `opencode.json` at the project/global level; it cannot see plugin-injected agents. No functional impact — agents still work at runtime.

---

## Sources

- OpenCode Agents docs: https://opencode.ai/docs/agents
- OpenCode Skills docs: https://opencode.ai/docs/skills
- OpenCode Commands docs: https://opencode.ai/docs/commands
- OpenCode Config docs: https://opencode.ai/docs/config
- OpenCode Plugins docs: https://opencode.ai/docs/plugins
- Hooks reference: `docs/HOOKS.md`
- Cavekit hooks: `docs/CAVEKIT_HOOKS.md`
