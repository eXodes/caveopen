---
name: ck-spec
description: Create or amend SPEC.md using cavekit v4 spec skill. Use when asked to write a spec, update a spec section, backprop a bug, or generate spec from existing code.
---

# ck-spec — Spec Mutator Skill

You are the **sole mutator** of `SPEC.md`. All spec creation, amendment, and backprop runs through this skill. Never edit SPEC.md outside this skill's protocol.

---

## SPEC.md Format

SPEC.md has exactly these sections, in this order:

```
§G GOAL          — one-line goal, caveman encoded
§C CONSTRAINTS   — non-negotiable bullets
§I INTERFACES    — external surfaces (cmd/api/file/env)
§V INVARIANTS    — numbered, testable, each line prefixed ! MUST
§T TASKS         — pipe table: id|status|task|cites
§B BUGS          — pipe table: id|date|cause|fix
```

See FORMAT.md (project root) for the full schema. If FORMAT.md is missing, run `ck_init` tool first.

Task status values: `x` (done) · `~` (in-progress) · `.` (pending)

---

## Invocation Modes

### `/ck:spec <idea>` — Create or expand
If SPEC.md doesn't exist, create it from scratch. If it exists, interpret `<idea>` as a new feature or requirement and add/amend the relevant sections. Never delete existing content unless explicitly instructed.

### `/ck:spec amend §X.n` — Targeted amendment
Amend a specific section or item. `§X` is the section letter (G/C/I/V/T/B), `.n` is the item index (optional). If `.n` is omitted, amend the whole section.

### `/ck:spec bug: <description>` — Bug backprop
1. Add a §B entry: `id | today's date | <root cause> | <fix applied>`
2. Add or update a §V invariant that would catch this class of bug in future
3. Mark related §T task as `x` if the fix was applied

### `/ck:spec from-code` — Generate spec from codebase
Read the project directory. Infer §G, §I, and §V from the existing code. Generate §T for obvious next tasks. Ask the user to confirm before writing.

---

## Writing Rules

- **§G**: One sentence, caveman-encoded (see caveman SKILL.md). Present tense. Start with a verb.
- **§C**: Bullet list. Each item is a hard constraint. No "should" — use "must" or "never".
- **§I**: Each interface on its own line. Format: `<type>: <name> — <description>`. Types: `cmd`, `api`, `file`, `env`.
- **§V**: Numbered list. Each item: `! MUST <testable assertion>`. Ensure each is independently verifiable.
- **§T**: Pipe table. Columns: `id | status | task | cites`. `cites` references §V or §I items this task satisfies.
- **§B**: Pipe table. Columns: `id | date | cause | fix`. Date: ISO 8601 (`YYYY-MM-DD`).

---

## Cavekit Caveman Encoding

Spec bodies use caveman symbols first-class. Prefer:
- `→` over "leads to" or "results in"
- `!` prefix for invariants (already required in §V)
- `∀` for "for all" in §V assertions
- `⊥` for undefined/invalid states

The §G goal line should be maximally compressed (target: one line, ≤12 words).
