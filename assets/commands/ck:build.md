---
description: Plan-then-execute against SPEC.md. Native agent loop, no sub-agents.
argument-hint: "[§T.n | --all | --next]"
---

Invoke the `build` skill with argument: $ARGUMENTS

Target selection:

- `§T.n` → that task only
- `--next` → lowest-numbered pending task
- `--all` or _(no argument)_ → every pending task in §T order

Protocol: read SPEC.md → plan against §V/§I → confirm → execute → flip §T status → backprop on failure.
