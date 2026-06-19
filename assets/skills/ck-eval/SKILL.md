---
name: ck-eval
description: |
  Fresh-context evaluator. Grades completed build output against §V invariants
  and §T accept criteria without seeing build history. Invoke after ck-build
  completes, or as a CI step. Triggers on: "eval this", "check my work",
  "ck-eval", "did I satisfy the spec", "grade this diff".
---

# eval — fresh-context evaluator

**COLD LOAD ONLY.** Do not read session history. Do not read prior tool outputs.
Load: SPEC.md + the diff (or file list) provided. Nothing else.

This is the generator/evaluator split. You are the evaluator.
You must not inherit the generator's assumptions or blind spots.

## WHY COLD

Generator marks own work done = victory declaration bias. Known failure mode.
Evaluator that saw the build inherits generator's anchoring → approves things it shouldn't.
Fresh context = independent grade.

## INPUTS

User provides one of:
- `git diff HEAD~1` or patch text
- List of changed files
- `ck-eval §T.n` — evaluate specific task

## STEPS

### 1. LOAD SPEC (cold)

Invoke `ck-caveman` skill and read `SPEC.md`. Parse §V and §T only.
Do NOT read code files beyond what's in the diff.

### 2. IDENTIFY SCOPE

From diff: which §T tasks are claimed complete (`~` → `x` or just changed)?
Which §V invariants do those tasks cite?

### 3. GRADE §V — per cited invariant

For each cited V<n>:

**If `→ cmd:` annotation present**: report it. Tell user to run it (you cannot run commands — you are evaluator, not executor). Mark as RUNNABLE.

**If no annotation**: grade from diff alone.
- Does the diff satisfy the invariant?
- PASS / FAIL / PARTIAL / CANNOT_DETERMINE
- Cite exact line from diff as evidence.

### 4. GRADE §T — accept criteria

For each task in scope:
- Read `accept` column.
- If `accept` = `.` or empty → WARN: no acceptance criteria defined. Cannot grade. Flag for `ck-spec` skill.
- If `accept` has criteria → does diff satisfy it? PASS / FAIL. Cite evidence.

### 5. VERDICT

```
## eval §T.2

§V grades (cited: V2, V3)
  V2 PASS: token.ts:14 uses `<=`. evidence: diff line +14.
  V3 RUNNABLE: → cmd: npm test (run to confirm)

§T.2 accept: "POST /x → 200 {id}, V2 passes"
  PARTIAL: diff adds route, V2 passes from code read, V3 unconfirmed pending cmd run.

VERDICT: PARTIAL — run V3 cmd before marking x.
```

Verdicts: **PASS** / **PARTIAL** / **FAIL** / **CANNOT_GRADE** (no accept criteria)

## OUTPUT RULES

- No praise. No "looks good". Binary per item.
- Every FAIL or PARTIAL → exact file:line citation.
- PASS still requires evidence cite — not just "seems fine".
- RUNNABLE items → tell user the command to run. Do not self-approve them.
- End with one-line action: what user should do next.

## NON-GOALS

- Zero writes. Never edits SPEC.md or code.
- Does not invoke `ck-build` or `ck-spec` skills.
- Does not run shell commands.
- Does not read files outside the diff.
