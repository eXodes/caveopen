---
description: Read-only drift report — check codebase against SPEC.md
argument-hint: "[§V | §I | §T | --all]"
---

Run the ck-check skill with the following argument:

{{args}}

Invoke the `ck-check` skill. Scope:

- `§V` → invariant check only
- `§I` → interface check only
- `§T` → task status check only
- `--all` or _(no argument)_ → full drift report across all sections

Output is read-only — no files are modified. Report violations, drift, and unverifiable items. If no drift: `§V §I §T ✅ no drift`.
