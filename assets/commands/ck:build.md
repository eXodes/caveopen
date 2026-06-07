---
description: Plan and execute tasks from SPEC.md §T
argument-hint: "[§T.n | --next | --all]"
---

Run the ck-build skill with the following argument:

{{args}}

Invoke the `ck-build` skill. Target selection:

- `§T.n` → build task with ID n
- `--next` → build the first `.` (pending) task in §T
- `--all` → build all pending tasks in sequence
- _(no argument)_ → same as `--next`

Follow the ck-build skill protocol: read spec → identify cites → plan → confirm (if non-trivial) → execute → update §T → backprop on failure.
