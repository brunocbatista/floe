---
name: fix
description: Solve a Floe problem by racing several candidate fixes. Use when the user runs /fix <problem> or asks to find the best way to fix something in Floe. Analyzes the problem, writes a reproduction, fans out 5+ Floe sessions (one worktree each, mixed harnesses) that each implement a different approach, scores them against the gate and Floe's principles, and recommends the winner. Takes the problem description as argument.
---

# Fix — race candidate fixes, keep the best

The argument is the problem, in the user's words. No argument → ask for it and stop.

Lanes are Floe sessions, never the native Agent tool (a hook blocks it, and detached subagents
are invisible on the Floe screen). Each lane gets its own worktree so lanes never collide.

## Steps

Run in order. Stop and report at the first step that cannot complete.

### 1. Analyze
- Read the code paths the problem touches. Find the root cause, or list the candidate causes
  when it is not certain.
- Write a **reproduction**: a failing test beside the file (`*.test.ts`), or, for renderer-only
  bugs that `node --test` cannot load, an exact CDP/manual script. Confirm it fails.
- Commit nothing yet. Record in 5 lines or fewer: symptom, root cause (or hypotheses), the
  reproduction, and what "fixed" means.

### 2. Plan scenarios — at least 5
Each scenario is a genuinely different approach, not a variation in style. Draw from:
different root-cause hypotheses, different layers (main / preload / renderer / shared),
minimal patch vs. structural fix, fixing at the source vs. at the consumer. Give each a code
(`S1`…`Sn`), a slug and one sentence. Drop duplicates and add new ones until 5 distinct remain.

### 3. Fan out
For each scenario, in one batch of parallel tool calls:
- `mcp__floe__create_worktree` on this project, branch `fix/<problem-slug>-s<n>`, base = the
  current branch, `premise` = the brief below (it also skips the setup interview).
- `mcp__floe__create_session` in that worktree, `select: false`, `mode: skip`.

Then send each lane its prompt with `mcp__floe__send_message(wait: true)`, all in one batch.
Harness parity: run at least one lane on `harness: codex`. The rest default to claude.

Lane brief (premise + prompt):
```
## Goal
Fix: <problem>. Approach <Sn>: <one sentence>. Stay on this approach even if another looks better;
say so in the report instead.
## Context
Root cause / hypotheses: <...>. Reproduction: <test path or script>.
## Constraints
AGENTS.md applies: keyboard first, agent first (MCP tooling for any new action), harness parity,
outline-chip UI with light-theme override, CRAP ≤ 30. Tests that run git use temp fixtures with
GIT_CEILING_DIRECTORIES. Touch only what this approach needs.
## Done when
The reproduction passes, `pnpm gate` passes, the work is committed on this branch.
Reply with exactly:
APPROACH: <Sn> <slug>
REPRO: pass|fail
GATE: pass|fail (<first failing step>)
DIFF: <files changed> files, +<added>/-<removed>
CHANGES: <3 lines max>
RISKS: <what this could break>
VERDICT: <would you ship this, one line>
```

### 4. Verify each lane yourself
Do not trust the reports. For each branch:
- `git diff --stat <base>...fix/<slug>-s<n>` and read the diff.
- Run the reproduction and `pnpm gate` in that worktree. A lane whose report disagrees with
  your run is scored on your run.

### 5. Score
Disqualify any lane with a failing reproduction or gate. Rank the rest by, in order:
1. Fixes the root cause, not just the symptom.
2. Follows Floe's principles (keyboard first, agent first, harness parity, UI conventions).
3. Smallest diff and lowest complexity for the same result.
4. Fewest risks to adjacent features.

For the top two, get a second opinion from the other harness:
`codex exec --sandbox read-only "<review prompt with the diff range>" < /dev/null`
(stdin must be closed or it hangs). Ask for findings only, most severe first, with file:line.

### 6. Report and stop
Give the user a table: `Sn`, approach, repro, gate, diff size, verdict. Then the recommended
lane with the reason in two sentences or fewer, and the review findings that still apply.

Do not merge, close sessions or remove worktrees without the user's go-ahead. On approval:
- Apply the winner with `mcp__floe__merge_worktree` (or cherry-pick into the current branch
  when it was not the base).
- Close the losing lanes with `mcp__floe__close_session` and `mcp__floe__remove_worktree`.
  Ask before removing a worktree that has uncommitted changes.

## Notes
- If fewer than 5 lanes can be created (provisioning fails, a harness is down), continue with
  the ones that started and say which failed and why.
- A lane that times out or goes off-scope is disqualified, not retried.
- When the reproduction can only be checked in the running app, drive it via CDP
  (`FLOE_CDP_PORT`) in the lane's worktree rather than trusting typecheck.
