# Per-worktree colony boards

## Summary

Today the colony board is one per project: every worktree of a project opens the
same cards, the same nanny chat and the same event log, so a board opened inside a
feature worktree shows and fights with the work started from the main checkout.

After this change a board belongs to exactly one **worktree path**. The main
checkout's board is the project root's board and keeps every existing card. A board
opened in a feature worktree starts empty, shows only its own cards, has its own
nanny and its own log, and cuts its forks from — and merges them back into — that
worktree's branch. `colony.toml` (stages, caps, automerge, report, cleanup) stays
shared per project.

## Clarifications

- Q: What is the scope key of a board? -> A: The worktree path, not the branch name. Cards, the nanny session and the board event log each belong to exactly one worktree path. (user)
- Q: What happens to the existing cards? -> A: The main checkout is the board for the project root and keeps today's cards; tasks already stored under the project root stay on the main board, no migration loss. (user)
- Q: What does a board started in a worktree look like? -> A: It begins empty, shows only its own cards, and its default `base` is that worktree's branch: forks are cut from it and merged back into it. A board in the main checkout defaults to the main branch, as today. An explicit `base` on a card still wins. (user)
- Q: Is `colony.toml` split too? -> A: No. Stages, caps and automerge stay shared per project; only cards, nanny and log are split. (user)
- Q: Which board does a card's own worktree resolve to (a lane, or the user opening a card's chat, which selects that worktree in the sidebar)? -> A: The board the card is on. A worktree the colony cut for a card is never a board of its own; only worktrees no card owns are. (assumed — otherwise opening any card's chat flips the panel to an empty board, and a lane calling `colony_board` with its cwd gets the wrong board)
- Q: Are stage caps counted per board or across the project? -> A: Per board. Each board admits up to the stage's cap on its own. (assumed — the board is the unit being split; a cross-board count would make one worktree's board starve another's with nothing on either board to show why)
- Q: What if a worktree board's tree is on a detached HEAD when a card is released with no explicit `base`? -> A: Release refuses with a reason on the card ("name a base") rather than silently falling back to the main branch. (assumed — landing a fork on main when the user started it from a feature tree is the exact bug this task removes)

## User Stories

### US1 (P1) — A worktree has its own board

As a user working in a feature worktree, I open the colony and see only the cards
I started there.

- Given a project with cards on the main board, When I open the colony with a feature worktree selected, Then the board is empty and none of the main board's cards show.
- Given two feature worktrees A and B of one project, When I add a card on A's board, Then it shows on A's board and not on B's or the main board.
- Given a card on A's board, When I go back to the main checkout, Then the main board is exactly as it was.

### US2 (P1) — Forks land on the worktree they were started from

As a user, a card I start from a feature worktree's board is cut from that
worktree's branch and merged back into it, never into main.

- Given a board in worktree `feat/x`, When a card with no `base` is released, Then its branch is cut from `feat/x` and its recorded base is `feat/x`.
- Given that card reaches `done` and merges, Then `feat/x` moves and the main branch does not.
- Given a card with an explicit `base` on a worktree board, When it is released, Then that base is used.
- Given the main board, When a card with no `base` is released, Then it is cut from the main branch, as today.

### US3 (P1) — Existing boards keep working

- Given `colony.json` and `colony-events.json` written before this change, When the app starts, Then every existing card, the existing nanny and the existing log are on the main checkout's board, and running cards keep running.

### US4 (P2) — One nanny per board

- Given the main board has a nanny, When I ask for the nanny on worktree A's board, Then a separate session is minted in worktree A, and asking again returns the same one.
- Given a card on A's board moves on its own, Then only A's nanny is told.

### US5 (P2) — Agents address a board by path

- Given an agent calls a `colony_*` tool with a feature worktree's path (or a path inside it), Then the tool acts on that worktree's board.
- Given an agent calls it with the project root, Then it acts on the main board.
- Given a lane calls it with its own card worktree's path, Then it acts on the board that card is on.

### US6 (P3) — A card's chat does not move the board

- Given the colony panel shows worktree A's board, When I open one of its cards' chats (which selects the card's worktree), Then the panel still shows A's board.

## Functional Requirements

- FR1 Every task records the board (worktree path) it belongs to. A task without one belongs to its project root's board.
- FR2 Reading a board returns only the tasks of that board; a task never appears on two boards.
- FR3 The event log is recorded and read per board, and trimmed per board.
- FR4 The nanny is stored per board path; the existing per-project entry is the main board's nanny. A worktree board's nanny session lives in that worktree.
- FR5 Any path handed to the board (IPC or MCP) resolves to a board: its worktree top-level; if a task's own worktree, that task's board; otherwise the worktree itself.
- FR6 Releasing a card with no explicit `base` on a non-root board uses the branch checked out in the board's worktree; on the main board, today's default. The resolved base is stored on the card.
- FR7 Merge, cleanup, reconcile-merged, reconcile-landed, clear-done, dependency checks, conflict checks and the release sweep all operate on one board's tasks.
- FR8 Dependencies may only name tasks on the same board.
- FR9 Card names stay unique across the whole project (the name is the branch's last segment and branches are project-wide).
- FR10 Stage config, skills, worktree location (`<root>/.worktrees/`), provisioning and step reports stay per project root.
- FR11 The renderer shows the board of the selected worktree (or the project root when none), and every colony command (nanny, new task, clear done, tabs) acts on that board.
- FR12 The nanny's opener and skill name the board path she manages and tell her to pass it to every `colony_*` call.

## Key Entities

- **Board** — identified by a worktree path. The project root's path is the main board. Has tasks, one nanny, one log; shares the project's `colony.toml`.
- **ColonyTask** — gains `board` (worktree path). `project` keeps meaning repo root.
- **BoardEvent** — gains `board`.
- **Nanny record** — `nannies[boardPath] = sessionId`.

## Success Criteria

- Two worktrees of one project each hold different cards; neither board shows the other's.
- Adding, running and merging cards on a worktree board leaves the main board's cards, nanny and log unchanged.
- A card merged from a worktree board lands on that worktree's branch; the main branch does not move.
- Each board's nanny is a distinct session.
- A `colony.json` from before the change loads with every card, nanny and event on the main board.
- Unit tests cover board keying, path→board resolution and the base default; `pnpm gate` passes.

## Out of Scope

- Splitting `colony.toml`, skills or step-report location per worktree.
- Moving existing cards between boards, or a UI to pick a board other than the one the selected worktree implies.
- The ideas tab (`.floe/tasks` folders): it stays per project root, and an idea sent from it still lands on the main board.
- Remote-backend (host) boards beyond what already works for the root.
- The stale `separate-colony-by-worktree` worktree: not reused, not removed.

## Assumptions

- A1 Main board key = project root path exactly as the store already holds it (`repoRoot()` spelling); no path rewriting of old records.
- A2 New tasks and events always carry `board`; readers fall back to `project` when it is absent.
- A3 Caps per board (see Clarifications).
- A4 A config write (automerge/report toggle) repaints other boards of the project via their 2 s poll, not a push.
- A5 Base is resolved at release, not at add: the board worktree's branch can change while a card waits in the backlog.
- A6 Worktree board holding base must be clean for the merge to fast-forward — the same rule the main checkout has today.
