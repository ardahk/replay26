# Replay 26 Worktree Notes

This directory tracks implementation handoffs and change records by phase/worktree. Keep new phase notes here so parallel branches can see what changed, why it changed, and which files are safe to build on.

## Documents

- [Phase 0/1 Handoff](./phase-0-1-handoff.md)
  - Covers the Next.js-first foundation, Temporal TypeScript workflows, simulator, initial API routes, and the rationale for avoiding Python.

- [Phase 2-4 Changes](./phase-2-4-changes.md)
  - Covers the process dashboard, read-model APIs, brewmaster/support agents, customer support models, demo seed script, and hardening changes.

## How to Add Future Notes

Use one Markdown file per substantial worktree or phase. Each note should include:

- Summary of what changed.
- Why those choices were made.
- Important files touched or added.
- Public API/interface changes.
- Verification performed.
- Known caveats and recommended next branches.
