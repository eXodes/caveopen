---
name: ck-audit
description: >
  Post-model-upgrade §V audit — classifies invariants as COMPUTATIONAL / INFERENTIAL /
  ADVISORY / DEAD / NEEDS TEST. Use after upgrading models or when §V has grown stale.
  Triggers on: "audit invariants", "classify §V", "ck-audit", "--trim" to show dead only.
---

# ck-audit — §V invariant classifier

**Read-only. Zero writes. Suggest only.**

## INPUTS

- `--trim` → show only DEAD + NEEDS TEST entries
- _(no argument)_ → full audit of all §V entries

## STEPS

### 1. LOAD

Invoke `ck-caveman` skill and read `SPEC.md §V`. Note today's date. Note §B entries (bug backlog — these mark invariants with precedent).

### 2. CLASSIFY each invariant

For each V<n> in §V, assign exactly one classification:

**COMPUTATIONAL** — invariant has a `→ cmd:` annotation. Deterministic, machine-verifiable sensor. Keep.

**INFERENTIAL** — no `→ cmd:` annotation but a test file references `V<n>` (grep test files). Human-written assertion exists. Keep.

**ADVISORY** — no annotation, no test reference, added < 30 days ago. Too new to remove. Watch.

**DEAD** — no annotation, no test reference, no §B entry, added ≥ 30 days ago. Removal candidate.

**NEEDS TEST** — no annotation, has §B entry (bug precedent), but no test yet. Add test.

### 3. OUTPUT FORMAT

```
§V audit
V1: COMPUTATIONAL → cmd: npm test   KEEP
V3: ADVISORY      no cmd, no test, 8d old   WATCH
V4: DEAD          no cmd, no test, no §B, 91d   REMOVE?
V7: NEEDS TEST    §B entry B3 (phantom session guard), no test   ADD TEST
```

One line per invariant. Include age in days for ADVISORY and DEAD.

### 4. SUMMARY

End with:
- Count per classification
- One suggested next step: `ck-spec amend §V` (to prune DEAD) or `ck-spec bug:` referencing NEEDS TEST entries

## OUTPUT RULES

- No editorializing. Classification only.
- Every DEAD entry must confirm: no `→ cmd:`, no test file grep hit, no §B row.
- Every NEEDS TEST entry must cite the §B row.
- `--trim` suppresses COMPUTATIONAL, INFERENTIAL, ADVISORY rows — show DEAD + NEEDS TEST only.

## NON-GOALS

- Zero writes to SPEC.md or any file.
- Does not run shell commands (reports `→ cmd:` annotations for user to run).
- Does not invoke `ck-build`, `ck-check`, or `ck-spec` skills.
