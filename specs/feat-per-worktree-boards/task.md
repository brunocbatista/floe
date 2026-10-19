# per-worktree-boards

kind: feat

Colony board state is shared across every worktree of a project, so a board opened in a worktree shows and conflicts with the cards and nanny chat started in the main checkout. User's words: "restrict the colony state by worktree, colonies started in the main branch just will merge the created worktrees in the main branch. Colonies started in a specific worktree will merge the forks to this worktree."

Decisions already made with the user:
- Scope key is the WORKTREE PATH (not branch name). Cards, the nanny session and the board event log each belong to exactly one worktree path. The main checkout is the board for the project root and keeps today's existing cards (no migration loss: tasks already stored under the project root stay on the main board).
- A colony started in a worktree begins empty, shows only its own cards, and its default `base` is that worktree's branch: forks are cut from it and merged back into it. A colony started in the main checkout defaults base to the main branch, as today. An explicit `base` on a card still wins.
- colony.toml (stages, caps, automerge) stays shared per project. Only cards, nanny and log are split.

Where to look (starting points, not a design): src/main/colony/store.ts (`colony.json`, tasks keyed by `task.project`, `listTasks(project)`, `nannies` record), src/main/colony/events.ts (`listEvents(project)`), src/main/colony/report.ts (`reportsDirFor(project)` = <project>/.floe/colony/reports), src/main/colony/runner.ts (`boardFor`, `compactBoard`, `tick`, `reconcileMerged`, `nannyFor`, merge path), src/main/mcpServer.ts colony_* tools (they take a `project` path; a worktree path passed there must resolve to that worktree's board), and the renderer (useColony.ts, ColonyBoard.tsx, ColonyLog.tsx). Spec: specs/colony/spec.md (Q3 on where per-task state lives) should be updated to say the board is per worktree.

Acceptance: two worktrees of one project each hold different cards and neither sees the other's; the main checkout board is unaffected by a worktree board; a card merged from a worktree board lands on that worktree's branch, not main; the nanny per worktree is a separate session; existing tasks and nannies in colony.json keep working. Tests cover the keying and the base default.

Note: a worktree `separate-colony-by-worktree` already exists with no commits or sessions; reuse is up to the specifier, the board will create its own worktree for this card.
