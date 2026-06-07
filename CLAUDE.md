# CLAUDE.md — OpenCode Plugin Project

## Project Overview

This project builds an integrated plugin for [OpenCode](https://opencode.ai), an open-source AI coding agent. Plugins hook into OpenCode's event system to extend behavior, add tools, integrate with external services, or modify the agent's defaults.

**Docs:** https://opencode.ai/docs/plugins  
**SDK:** https://opencode.ai/docs/sdk  
**Ecosystem:** https://opencode.ai/docs/ecosystem

---

## Tech Stack

- **Runtime:** Bun (used by OpenCode internally for plugin execution)
- **Language:** TypeScript (preferred) or JavaScript
- **Package:** `@opencode-ai/plugin` for types and the `tool` helper
- **SDK:** `@opencode-ai/sdk` for programmatic client access
- **Dependencies:** Declared in `.opencode/package.json`, installed via `bun install` at startup

---

## Key References

| Resource          | URL                                   |
| ----------------- | ------------------------------------- |
| Plugin docs       | https://opencode.ai/docs/plugins      |
| SDK docs          | https://opencode.ai/docs/sdk          |
| Config reference  | https://opencode.ai/docs/config       |
| Custom tools      | https://opencode.ai/docs/custom-tools |
| Community plugins | https://opencode.ai/docs/ecosystem    |
| GitHub repo       | https://github.com/anomalyco/opencode |
