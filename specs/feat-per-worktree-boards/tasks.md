# Tasks — per-worktree colony boards

Top to bottom. `[P]` = can run beside its neighbours (different files). Tests first.

## Store and log

- [ ] T1 Tests: board keying in the store — two boards of one project (`project: '/p'`, `board: '/p/.worktrees/a'` and `'/p/.worktrees/b'`) each list only their own tasks; a task added with no `board` lists on `'/p'`; an old-shape record (no `board`, written straight into `colony.json`) lists on `'/p'`; `freeName` is unique across both boards; `dependencyProblem` refuses an id from the other board; `getNanny`/`setNanny` per board, root key untouched; `boardKeyFor(cardWorktree)` returns the card's board, any other path returns itself. — `src/main/colony/store.test.ts`
- [ ] T2 Implement D1 + `boardKeyFor` (D2): `board` on `ColonyTask`/`NewTask`, `boardOf`, `listTasks(board)`, `projectTasks`, `freeName` via `projectTasks`, `addTask` writes `board`, `updateTask`'s `dependencyProblem(boardOf(task), …)`; header comment. — `src/main/colony/store.ts`
- [ ] T3 Tests: events per board — `listEvents` per board, trim per board, old record without `board` reads on the root. — `src/main/colony/events.test.ts` (new, beside the file; pattern from `store.test.ts`)
- [ ] T4 Implement events `board` field, `recordEvent` trim and `listEvents` by `boardOf`. — `src/main/colony/events.ts`

## Runner

- [ ] T5 Tests (runner seam): add `checkedOutBranch` and `repoRoot` to the git stub. Cover: a card released on a worktree board with no `base` is cut from the board worktree's branch and stores it; an explicit `base` wins; the main board passes `base: undefined` as today; a detached board HEAD refuses the release; `tick` on board A never starts a card on board B, and caps count per board; `boardFor(a)` shows only A's cards and carries `board`; `nannyFor(a)` and `nannyFor(root)` are distinct sessions, A's in A's path; a merge on board A records its event on A, pushes `{ project: root, board: A }`, nudges only A's nanny; `reconcileColony` ticks each board. Update existing tests whose assertions change shape (e.g. `pushBoard` payload, nanny opener text). — `src/main/colony/runner.test.ts`
- [ ] T6 Implement D2 (`resolveBoard`, `rootOfBoard`), D3 (board-keyed runner) and D4 (`forkBase` in `releaseTask`). — `src/main/colony/runner.ts`
- [ ] T7 `Board.board: string`. — `src/shared/colony.ts`

## Boundaries

- [ ] T8 Tests: MCP colony tools resolve a worktree path to its board — `colony_add_task` with a worktree path lands on that board, `colony_board` with the root does not show it. Follow how `mcpServer.test.ts` already exercises colony tools; if it has none, cover `resolveBoard` in runner.test.ts instead and note it. — `src/main/mcpServer.test.ts`
- [ ] T9 Implement D6 in the colony tool registrars and `colonyAddTaskTool`/`colonyUpdateTaskTool`; update `project` and `base` descriptions. — `src/main/mcpServer.ts`
- [ ] T10 Implement D5 in `registerColonyIpc`. — `src/main/index.ts`
- [ ] T11 [P] Preload: param names, `onEvent` payload `board`. — `src/preload/api.ts` (and its type file if the payload type lives elsewhere)
- [ ] T12 [P] Skills text (D7). — `src/main/config/colonySkills.ts`
- [ ] T13 Fix type fallout in `taskFolderDeps.ts` only if the compiler asks; behaviour stays on the root board. — `src/main/taskFolderDeps.ts`

## Renderer

- [ ] T14 `CommandContext.board`; set it in `ctxRef.current`; pass `board` to the colony panel. — `src/renderer/src/commands.ts`, `src/renderer/src/App.tsx`, `src/renderer/src/panels.tsx`
- [ ] T15 `useColony(path)` filters pushes on `e.board`; `ColonyBoard` takes `board` for `useColony`/`useBoardEvents`. — `src/renderer/src/useColony.ts`, `src/renderer/src/ColonyBoard.tsx`
- [ ] T16 `ColonyLog` listener filters on `e.board`. — `src/renderer/src/ColonyLog.tsx`
- [ ] T17 Colony commands send `c.board ?? c.project` (nanny, new, clearDone, automerge, report). — `src/renderer/src/registry.ts`

## Docs and done

- [ ] T18 [P] Update `specs/colony/spec.md` (D9): per-worktree board, Q3 note, new decision row.
- [ ] T19 `pnpm gate` green.
- [ ] T20 Drive the real app (`pnpm dev`): main board unchanged; select a feature worktree → empty board; add + release a card there → its branch's `.gw-base` is the worktree's branch; open the card's chat → panel stays on the worktree board; the nanny on each board is a different session.
