---
description: Fresh-context evaluator — grade completed build output against §V + §T accept
argument-hint: "[§T.n | --diff]"
---

Run the ck-eval skill with the following argument:

$ARGUMENTS

Invoke the `ck-eval` skill. **Cold load only — do not read session or build history.**

Scope:

- `§T.n` → evaluate specific task
- `--diff` → prompt user to paste diff, then grade
- _(no argument)_ → evaluate all tasks marked `~` or `x` since last commit (`!`git diff HEAD~1``)

Grade each cited §V invariant (PASS / FAIL / PARTIAL / RUNNABLE) and each §T `accept` column criteria. Show evidence citations for every verdict. End with one-line action.
