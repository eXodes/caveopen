---
description: Drift detector. Diff SPEC.md against code. Read-only, zero writes.
argument-hint: "[§V | §I | §T | --all]"
---

Invoke the `check` skill with argument: $ARGUMENTS

Scope:

- `§V` → invariant check only (default)
- `§I` → interface check only
- `§T` → task status check only
- `--all` or _(no argument)_ → full drift report across all sections

Output is read-only. Reports violations, drift, unverifiable items. If no drift: `§V §I §T — no drift`.
