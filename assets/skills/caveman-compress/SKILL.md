---
name: caveman-compress
description: >
  Compress natural language memory files (CLAUDE.md, todos, preferences) into caveman format
  to save input tokens. Preserves all technical substance, code, URLs, and structure.
  Compressed version overwrites the original file. Human-readable backup saved as FILE.original.md.
  Trigger: /caveman-compress FILEPATH or "compress memory file".
argument-hint: "<file> [lite|full|ultra]"
---

Compress natural language files inline. No external scripts. Agent compresses, self-validates, shows diff, writes only on confirm.

## Trigger

`/caveman-compress <filepath>` or user asks to compress a memory file.

## Process

Parse `$ARGUMENTS`:
- First token: file path (required)
- Second token: compression level (optional, default: `full`)

Steps:

1. Read file at specified path.
2. Check file type — only `.md`, `.txt`, `.typ`, `.typst`, `.tex`, extensionless. Reject code files (`.py`, `.js`, `.ts`, `.json`, `.yaml`, `.yml`, `.toml`, `.env`, `.lock`, `.css`, `.html`, `.xml`, `.sql`, `.sh`). Report error and stop.
3. Save backup as `<filename>.original.md` before any changes.
4. **Compress inline** — apply caveman rules to prose content. Agent performs compression directly. No subprocess.
5. **Self-validate** — run checklist against compressed output (see below). On failure: fix only failing sections, recheck. Max **2 fix passes**. If still failing after 2 passes: report which checks failed, abort — do not write.
6. Show diff (original vs compressed).
7. Write compressed version to original file path **only after user confirms**.
8. Report: original word count → compressed word count → compression ratio.

## Compression Rules

### Remove

- Articles: a, an, the
- Filler: just, really, basically, actually, simply, essentially, generally
- Pleasantries: "sure", "certainly", "of course", "happy to", "I'd recommend"
- Hedging: "it might be worth", "you could consider", "it would be good to"
- Redundant phrasing: "in order to" → "to", "make sure to" → "ensure"
- Connective fluff: "however", "furthermore", "additionally", "in addition"

### Preserve EXACTLY (never modify)

- Fenced code blocks (` ``` ` delimited) — treat as read-only regions
- Inline code (`` `backtick content` ``) — byte-identical
- URLs and markdown links — byte-identical
- File paths (`/src/...`, `./config.yaml`)
- Commands (`npm install`, `git commit`)
- Technical terms, library/API names, protocols
- Proper nouns (project names, people, companies)
- Dates, version numbers, numeric values
- Environment variables (`$HOME`, `NODE_ENV`)
- Frontmatter/YAML headers

### Preserve Structure

- All markdown headings (compress body below, ⊥ heading text)
- Bullet/numbered list hierarchy
- Tables (compress cell text, keep structure)

### Compress

- Short synonyms: "big" ⊥ "extensive", "fix" ⊥ "implement a solution for"
- Fragments OK: "Run tests before commit" ⊥ "You should always run tests before committing"
- Drop "you should", "make sure to", "remember to" — state the action
- Merge redundant bullets that repeat same idea
- One example where multiple show same pattern

## Self-Validate Checklist

Run after each compression pass. All checks must pass before showing diff.

| # | Check | Pass condition |
|---|-------|----------------|
| 1 | Fenced code blocks | Every ` ``` `…` ``` ` block bytes identical to original |
| 2 | Inline code | Every `` `…` `` span bytes identical to original |
| 3 | URLs | Every URL (bare or in `[text](url)`) bytes identical to original |
| 4 | Frontmatter | YAML/TOML header block bytes identical to original |
| 5 | Structure | Heading count and nesting unchanged; list nesting preserved |
| 6 | File type | Output is not a code file (guard already done in step 2) |

On **any failure**: identify failing sections → fix only those → recheck. Max 2 fix passes total. If pass 2 still fails: report check IDs that failed + the offending diff lines → abort (⊥ write file).

## Example

Original:
> You should always make sure to run the test suite before pushing any changes to the main branch. This is important because it helps catch bugs early and prevents broken builds from being deployed to production.

Compressed:
> Run tests before push to main. Catch bugs early, prevent broken prod deploys.

## Boundaries

- Only compress natural language files (`.md`, `.txt`, `.typ`, `.typst`, `.tex`, extensionless)
- Never modify: `.py`, `.js`, `.ts`, `.json`, `.yaml`, `.yml`, `.toml`, `.env`, `.lock`, `.css`, `.html`, `.xml`, `.sql`, `.sh`
- Mixed content (prose + code): compress ONLY prose sections
- Unsure prose vs code: leave unchanged
- Never compress `FILE.original.md` (skip it)
- Backup written before overwrite, write only after user confirm
