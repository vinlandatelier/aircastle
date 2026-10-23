---
name: worktree
description: Start work in a dedicated Git worktree and remove it when finished.
disable-model-invocation: true
---

# Worktree

- Start new work in a separate Git worktree on a `<scope>/<what>` branch, such as `feat/content-search` or `fix/schema-defaults`.
- Make edits, run checks, and commit there.
- Before declaring done, return to the main checkout and remove the clean worktree with `git worktree remove`. Preserve the branch and any uncommitted work; never force removal.
