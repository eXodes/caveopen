---
description: Design-improvement pass. Shrink one shallow interface, hide one decision.
argument-hint: "[<module path> | --pick]"
---

Invoke the `deepen` skill with argument: $ARGUMENTS

Protocol: pick shallowest module → diagnose defect (file:line) → research deeper pattern → propose §I/§V/§T edits → verify behavior held (tests green before & after).

- No argument or `--pick` → agent selects worst offender from spec-touched modules
- `<module path>` → target that specific module

⊥ change behavior. ⊥ deepen more than one module per pass. ⊥ run mid-feature.
