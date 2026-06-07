---
name: ck-backprop
description: Six-step bug backpropagation protocol for cavekit v4. Use when a bug is discovered, a test fails, or a §V invariant is violated.
---

# ck-backprop — Bug → §B + §V Protocol

Six-step protocol for propagating a discovered bug back into the spec. Every bug is an opportunity to strengthen the spec so the same class of failure can't happen silently again.

---

## When to Use

- A test fails or a §V invariant is found to be violated
- A runtime bug is discovered
- A code review uncovers a logic error
- After any failed `/ck:build` execution

---

## Six-Step Protocol

### Step 1 — Identify root cause
Do not just describe the symptom. Trace to the actual root cause:
- What assumption was wrong?
- What invariant was missing or too weak?
- What interface was misspecified?

State the root cause in one sentence, caveman-encoded.

### Step 2 — Add §B entry
Append a row to the §B BUGS table in SPEC.md:
```
| <next-id> | <YYYY-MM-DD> | <root cause, caveman encoded> | <fix applied or "pending"> |
```
If the fix is not yet applied, write "pending" and update it after Step 6.

### Step 3 — Add or strengthen §V invariant
The bug should have been caught by a §V invariant. Either:
- Add a new `! MUST` invariant that would catch this class of bug, or
- Strengthen an existing §V item that was too weak

Write the invariant so it is independently testable (i.e., a test can be written directly from it).

### Step 4 — Check §I for interface misspecification
If the bug involved an interface (API, file format, CLI arg, env var):
- Review the relevant §I entry
- Update or add the §I entry to reflect the correct contract

### Step 5 — Apply fix
Implement the code fix. After applying:
- Verify the new/updated §V invariant now holds
- Run existing tests to confirm no regression

### Step 6 — Mark §T
- If this bug maps to an existing §T task, mark it `x`
- If the fix requires new work, add a §T task (status `.`) with a `cites` referencing the new §V item

---

## Output Format

After running the protocol, report:

```
§B.n  root-cause (caveman)
§V.n  new/updated invariant
§I.n  updated interface (if applicable)
fix:  <description of code change>
```

One line per item. Caveman-encode if caveman mode is active.
