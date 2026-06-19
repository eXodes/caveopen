---
description: Create, amend, or backprop bug into SPEC.md. Sole mutator of spec.
argument-hint: "[bug: <description> | amend <§X.n> | from-code | <idea>]"
---

Invoke the `spec` skill with argument: $ARGUMENTS

Follow its protocol exactly:

- `bug: <description>` → backprop protocol (§B entry + §V invariant + §T update)
- `amend §X.n` → targeted amendment of named section/item
- `from-code` → distill spec by reading the codebase
- `<idea>` → create new SPEC.md from the idea

If SPEC.md does not exist and no `from-code` or idea given, ask user for one-line goal to seed §G.
