---
description: Write a git commit message compressed in Caveman style
argument-hint: "[scope]"
---

Write a conventional git commit message for the staged changes, using Caveman compression.

Scope (optional): {{args}}

Steps:
1. Read the staged diff (use the shell tool: `git diff --cached`)
2. Identify the change type (feat/fix/refactor/chore/docs/test/perf)
3. Write a commit message:
   - **Subject line**: `<type>(<scope>): <caveman-encoded summary>` — max 72 chars, no period
   - **Body** (if changes are non-trivial): key changes only, caveman-encoded, bullet list
4. Output the full commit message in a code block

Rules:
- Drop articles, filler, hedging from the subject line
- Use `→` for "leads to", `!` for critical/breaking changes
- Breaking changes: add `!` after type: `feat!(<scope>):`
- If no staged changes, say so and stop
