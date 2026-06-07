---
description: Compress a file or text selection using Caveman encoding
argument-hint: "<file> [lite|full|ultra]"
---

Compress the specified file using Caveman encoding.

Arguments: {{args}}

Parse the arguments:
- First token: file path (required)
- Second token: level (optional, default: `full`)

Steps:
1. Read the file at the specified path
2. Apply Caveman compression at the specified level (see caveman SKILL.md)
3. Output the compressed version in a code block
4. Show a token estimate: original word count → compressed word count → compression ratio

Do **not** write the compressed content back to the file unless the user explicitly confirms. Output only — let the user copy or confirm before saving.

If the file is code (not prose), compress only comments and docstrings, not code identifiers or logic.
