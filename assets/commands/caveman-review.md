---
description: Review staged or specified changes with Caveman-compressed output
argument-hint: "[file or ref]"
---

Review the changes specified, producing a Caveman-compressed code review.

Target: {{args}}

If no target is given, review staged changes (`git diff --cached`).
If a file path is given, review that file's changes.
If a git ref (branch/commit) is given, diff against HEAD.

Review format (all caveman-encoded):

**RISK**: [none|low|med|high] — one-line reason

**Issues** (if any):
- `<file>:<line>` `<severity>` — <issue, caveman-encoded>

Severity codes: `!` critical · `~` warning · `?` suggestion

**Summary**: one-line change description, caveman-encoded

Rules:
- Only list actual issues, not stylistic preferences
- `!` items are blocking — must fix before merge
- `~` items are recommended
- `?` items are optional improvements
- If no issues: `✅ LGTM` and summary only
