---
name: ck-build
description: Plan and execute tasks from SPEC.md using cavekit v4 build skill. Use when asked to build, implement, or execute spec tasks.
---

# ck-build — Plan → Execute Skill

Implements tasks from `SPEC.md §T`. Reads the spec, plans the implementation, executes, and backprops failures.

---

## Preconditions

Before running, verify:
1. `SPEC.md` exists at project root. If not, tell user to run `/ck:spec` first.
2. `FORMAT.md` exists at project root. If not, run `ck_init` tool.
3. The target §T task exists and is in `.` (pending) status.

---

## Invocation

```
/ck:build §T.n      — build a specific task by ID
/ck:build --next    — build the next pending task (first . status in §T)
/ck:build --all     — build all pending tasks in order
```

---

## Protocol

### 1. Read SPEC.md
Load all sections. Identify the target task(s) from §T.

### 2. Identify cites
Each §T task lists `cites` referencing §V invariants and §I interfaces this task must satisfy. Collect those and treat them as acceptance criteria.

### 3. Plan
Write a concise implementation plan. Include:
- Files to create/modify
- Key decisions or trade-offs
- How each cited §V invariant will be satisfied

Present the plan to the user. If `--all` or the task is non-trivial, wait for confirmation before executing. If the task is simple and isolated, proceed directly.

### 4. Execute
Implement the plan. After implementation:
- Run relevant tests or checks
- Verify each cited §V invariant holds

### 5. Update §T
Mark the completed task as `x`. If partially done, mark `~`.

### 6. Backprop on failure
If execution fails or a §V invariant is violated:
1. Run `/ck:spec bug: <description>` protocol automatically (add §B entry, add/update §V)
2. Fix and re-attempt
3. If the fix requires spec changes, amend first via ck-spec skill

---

## Constraints

- Never implement beyond what the spec task requires
- If a task's `cites` reference §V items, those invariants are the contract — treat them as hard constraints, not suggestions
- Do not modify §T task descriptions — only update status column
