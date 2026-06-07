---
name: ck-caveman
description: Cavekit-scoped caveman encoding utility. Use when writing or reviewing spec content that should be maximally compressed using caveman symbols.
---

# ck-caveman — Spec Encoding Utility

Applies caveman compression to spec content. Cavekit-scoped — intended for use within spec writing, not general conversation compression (use the `caveman` skill for that).

---

## Purpose

SPEC.md bodies should be compressed using caveman symbols for density. This skill helps encode or review spec content.

---

## Encoding Rules for Spec Bodies

Apply these substitutions in spec content:

| Replace | With |
|---|---|
| "leads to" / "results in" / "implies" | `→` |
| "caused by" / "comes from" | `←` |
| "therefore" | `∴` |
| "because" / "since" | `∵` |
| "for all" / "every" / "each" | `∀` |
| "there exists" / "some" / "at least one" | `∃` |
| "undefined" / "invalid" / "false" | `⊥` |
| "holds" / "true" / "valid" | `⊤` |
| "must not" / "never" | `! ¬` |
| "if and only if" | `↔` |
| "approximately" | `≈` |
| "not equal" | `≠` |
| articles (a/an/the) | _(drop)_ |
| "in order to" | _(drop)_ |
| "is a" / "is an" | `:` |

---

## Usage Modes

### Encode text
Take prose spec content and return compressed version using caveman symbols. Preserve all semantic content.

### Review spec
Read SPEC.md sections and flag items that could be further compressed without losing meaning.

### Validate symbols
Check that symbols used in SPEC.md are from the approved set and are used consistently.

---

## Encoding Example

**Before:**
> The API must return an error when the input is undefined or when the user is not authenticated.

**After:**
> `! API → error ∵ input=⊥ | user¬auth`

---

## Constraints

- Only compress — never change meaning
- §V invariants must remain independently testable after encoding
- §G goal must remain human-readable in one line
- Never use symbols not in the approved set (risk of ambiguity)
