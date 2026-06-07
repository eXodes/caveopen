---
description: Create or amend SPEC.md — the sole spec mutator in cavekit v4
argument-hint: "[bug: <desc> | amend §X.n | from-code | <idea>]"
---

Run the ck-spec skill with the following argument:

$ARGUMENTS

Invoke the `ck-spec` skill. Follow its protocol exactly based on the argument:

- `bug: <description>` → backprop protocol (§B entry + §V invariant + §T update)
- `amend §X.n` → targeted amendment of section §X, item n
- `from-code` → generate spec by reading the codebase
- `<idea>` (anything else) → create or expand SPEC.md with the idea

If SPEC.md does not exist and this is not a `from-code` or bare idea invocation, ask the user for a one-line goal to seed §G before proceeding.
