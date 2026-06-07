---
name: ck-check
description: Read-only drift report against SPEC.md. Use when asked to check spec compliance, audit invariants, or verify the codebase matches the spec.
---

# ck-check — Drift Report Skill

**Read-only.** Compares the current codebase against `SPEC.md`. Reports violations and drift. Never modifies files.

---

## Preconditions

Requires `SPEC.md` at project root. If missing, tell user to run `/ck:spec` first.

---

## Invocation

```
/ck:check §V        — check invariants only
/ck:check §I        — check interfaces only
/ck:check §T        — check task status only
/ck:check --all     — full drift report (default)
```

---

## Protocol

### §V — Invariant Check

For each `! MUST` item in §V:
1. Assess whether the current code satisfies the invariant
2. Mark: ✅ holds · ❌ violated · ⚠️ cannot verify (no test coverage / ambiguous)

Report violations with:
- The §V item
- The specific code location or condition that violates it
- Suggested fix (do not apply — report only)

### §I — Interface Check

For each §I surface:
1. Verify it exists and matches the spec description
2. Flag: added interfaces not in §I, removed interfaces still in §I, signature mismatches

### §T — Task Status Check

1. List all `x` tasks — confirm they are actually complete (check the code)
2. List all `~` tasks — note what's in progress
3. List all `.` tasks — remaining work
4. Flag any task marked `x` where the implementation appears missing or broken

### --all

Run all three checks. Produce a summary table:

```
Section | Status | Issues
§V      | ❌     | 2 violated, 1 unverifiable
§I      | ✅     | all present
§T      | ⚠️     | 1 task marked x but implementation missing
```

---

## Output Rules

- **Never modify** any file — output is report only
- Keep the report concise: list violations, not what's passing (unless `--all` summary)
- Caveman-encode the output if caveman mode is active
- If no drift found: single line `§V §I §T ✅ no drift`
