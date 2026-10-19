# Tasks — per-worktree colony boards

Top to bottom. `[P]` = can run beside its neighbours (different files). Tests first.

## Store and log

- [x] T1 Tests: board keying in the store — two boards of one project (`project: '/p'`, `board: '/p/.worktrees/a'` and `'/p/.worktrees/b'`) each list only their own tasks; a task added with no `board` lists on `'/p'`; an old-shape record (no `board`, written straight into `colony.json`) lists on `'/p'`; `freeName` is unique across both boards; `dependencyProblem` refuses an id from the other board; `getNanny`/`setNanny` per board, root key untouched; `boardKeyFor(cardWorktree)` returns the card's board, any other path returns itself. — `src/main/colony/store.test.ts`
- [x] T2 Implement D1 + `boardKeyFor` (D2): `board` on `ColonyTask`/`NewTask`, `boardOf`, `listTasks(board)`, `projectTasks`, `freeName` via `projectTasks`, `addTask` writes `board`, `updateTask`'s `dependencyProblem(boardOf(task), …)`; header comment. — `src/main/colony/store.ts`
- [x] T3 Tests: events per board — `listEvents` per board, trim per board, old record without `board` reads on the root. — `src/main/colony/events.test.ts` (new, beside the file; pattern from `store.test.ts`)
- [x] T4 Implement events `board` field, `recordEvent` trim and `listEvents` by `boardOf`. — `src/main/colony/events.ts`

## Runner

- [x] T5 Tests (runner seam): add `checkedOutBranch` and `repoRoot` to the git stub. Cover: a card released on a worktree board with no `base` is cut from the board worktree's branch and stores it; an explicit `base` wins; the main board passes `base: undefined` as today; a detached board HEAD refuses the release; `tick` on board A never starts a card on board B, and caps count per board; `boardFor(a)` shows only A's cards and carries `board`; `nannyFor(a)` and `nannyFor(root)` are distinct sessions, A's in A's path; a merge on board A records its event on A, pushes `{ project: root, board: A }`, nudges only A's nanny; `reconcileColony` ticks each board. Update existing tests whose assertions change shape (e.g. `pushBoard` payload, nanny opener text). — `src/main/colony/runner.test.ts`
- [x] T6 Implement D2 (`resolveBoard`, `rootOfBoard`), D3 (board-keyed runner) and D4 (`forkBase` in `releaseTask`). — `src/main/colony/runner.ts`
- [x] T7 `Board.board: string`. — `src/shared/colony.ts`

## Boundaries

- [x] T8 Tests (mcpServer.test.ts only lists tool names, so `resolveBoard` is covered in runner.test.ts — root, worktree, subdir, card tree): MCP colony tools resolve a worktree path to its board — `colony_add_task` with a worktree path lands on that board, `colony_board` with the root does not show it. Follow how `mcpServer.test.ts` already exercises colony tools; if it has none, cover `resolveBoard` in runner.test.ts instead and note it. — `src/main/mcpServer.test.ts`
- [x] T9 Implement D6 in the colony tool registrars and `colonyAddTaskTool`/`colonyUpdateTaskTool`; update `project` and `base` descriptions. — `src/main/mcpServer.ts`
- [x] T10 Implement D5 in `registerColonyIpc`. — `src/main/index.ts`
- [x] T11 [P] Preload: param names, `onEvent` payload `board`. — `src/preload/api.ts` (and its type file if the payload type lives elsewhere)
- [x] T12 [P] Skills text (D7). — `src/main/config/colonySkills.ts`
- [x] T13 (no change needed) Fix type fallout in `taskFolderDeps.ts` only if the compiler asks; behaviour stays on the root board. — `src/main/taskFolderDeps.ts`

## Renderer

- [x] T14 `CommandContext.board`; set it in `ctxRef.current`; pass `board` to the colony panel. — `src/renderer/src/commands.ts`, `src/renderer/src/App.tsx`, `src/renderer/src/panels.tsx`
- [x] T15 `useColony(path)` filters pushes on `e.board`; `ColonyBoard` takes `board` for `useColony`/`useBoardEvents`. — `src/renderer/src/useColony.ts`, `src/renderer/src/ColonyBoard.tsx`
- [x] T16 `ColonyLog` listener filters on `e.board`. — `src/renderer/src/ColonyLog.tsx`
- [x] T17 Colony commands send `c.board ?? c.project` (nanny, new, clearDone, automerge, report). — `src/renderer/src/registry.ts`

## Docs and done

- [x] T18 [P] Update `specs/colony/spec.md` (D9): per-worktree board, Q3 note, new decision row.
- [x] T19 `pnpm gate` green — lint, test, crap pass via `node scripts/gate.mjs`; its typecheck stage hits `spawnSync pnpm ENOENT` in this shell (no pnpm on PATH), so both `tsc --noEmit -p tsconfig.{node,web}.json --composite false` were run directly: exit 0.
- [ ] T20 (not done — no pnpm/Electron in this lane's shell; left for QA) Drive the real app (`pnpm dev`): main board unchanged; select a feature worktree → empty board; add + release a card there → its branch's `.gw-base` is the worktree's branch; open the card's chat → panel stays on the worktree board; the nanny on each board is a different session.

## Found on the way

- `colony-feature` skill (`colonySkills.ts`, `specs/colony/skills/colony-feature.md`) still says `colony_board(project, …)`; with per-worktree boards the feature session should pass its parent worktree's path. Not changed — outside tasks.md.
- `reconcileBoards` (index.ts) now ticks every board that holds a card, not just project roots, so a config edit frees spots on worktree boards too (FR7).
- `colony:remove` no longer takes a path: it reads the card and pushes its board.
- runner.test `settle()` raised from 8 to 16 microtask turns: `releaseTask` awaits `forkBase` now, one more hop in the floated chain.
