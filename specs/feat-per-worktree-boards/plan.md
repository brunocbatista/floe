# Plan — per-worktree colony boards

## Technical Context

- Electron main (TypeScript, `node --test`), renderer React. State in `<dataDir>/colony.json` (`store.ts`) and `<dataDir>/colony-events.json` (`events.ts`), both mtime-cached JSON.
- Today every board-scoped function takes `project` (repo root) and uses it for three different things: the **partition key** (`listTasks`, `listEvents`, `nannies`, `ticking`, `pushBoard`), the **config root** (`colonyConfig`, `listSkills`, `setProjectAutomerge`) and the **git root** (`createWorktree`, `mergeWorktree`, `deleteBranch`, `isMergedInto`, `defaultBranch`, `teardownWorktree`, `provisionWorktree`, `reportsDirFor`).
- This change splits the first one off: a **board** key (worktree path). `project` keeps meaning repo root everywhere it is used for config and git.
- Git merge already supports a base checked out in a linked worktree (`holderOf` in `mergeWorktree`/`undoMerge`), and `createWorktree(root, branch, { base })` writes `.gw-base` — so the merge path needs no git change, only the right `base`.

## Conventions check (AGENTS.md)

- Agent first: no new tool needed; every `colony_*` tool that takes `project` resolves it to a board (FR5). Update the tool `project` descriptions ("a worktree path selects that worktree's board"). `mcpServer.test.ts` tool list unchanged.
- Keyboard first: no new UI; the board follows the selected worktree. Existing commands keep their keys.
- Gate: `pnpm gate` (CRAP ≤ 30). New branches in `releaseTask` push its complexity — extract the base default into its own tested function.
- Tests that shell out to git: none added. Runner tests stub git at the module seam (`checkedOutBranch` gets a stub); `resolveBoard`'s pure part is tested without git.
- Plugins: no new `ipcMain.handle`; existing colony handlers change signatures only.

## Design

### D1. Data model (store.ts, events.ts)

- `ColonyTask.board?: string` — the worktree path of the board. Unset = `project`.
- `BoardEvent.board?: string`, same fallback.
- `export const boardOf = (t: { board?: string; project: string }): string => t.board ?? t.project` in `store.ts`; `events.ts` imports it.
- `NewTask.board?: string`; `addTask` writes `board: task.board ?? task.project` (A2: always written on new records).
- `listTasks(board)` filters `boardOf(t) === board`. Old records (no `board`, `project` = root) land on the root board — migration free (US3).
- New `projectTasks(project)` filters `t.project === project`; `freeName(project, …)` uses it so names stay unique project-wide (FR9). `freeName`'s signature is unchanged; `addTask`/`updateTask` keep passing `task.project`.
- `dependencyProblem(board, …)` — callers pass `boardOf(task)` / the resolved board (FR8).
- `nannies` record: key is the board path. `getNanny(board)`/`setNanny(board, …)` unchanged in shape; the old root key is the main board's nanny (FR4).
- `events.ts`: `recordEvent` trims by `boardOf(e) === boardOf(event)`; `listEvents(board)` filters by `boardOf`. Callers pass `board`.

Decision: new field, not repurposing `project`.
Rationale: `project` is the git/config root at ~30 call sites; rewriting it to a worktree path would need a root lookup at each, and old records already hold the root, so a new optional field with a `project` fallback is the zero-migration path.
Alternative: `project` = board path + `rootOf()` everywhere — rejected, larger diff, every git call becomes a lookup.

### D2. Path → board resolution (FR5)

- Pure, in `store.ts`: `boardKeyFor(top: string): string` — if some task has `worktreePath === top`, return `boardOf(thatTask)`; else `top`. (A card's worktree is never its own board — Clarifications.)
- Async, in `runner.ts`: `resolveBoard(path: string): Promise<{ board: string; project: string }>`:
  1. `top = (await repoRoot(path)) ?? path` (subdirectories → worktree top).
  2. `board = boardKeyFor(top)`.
  3. `project = rootOfBoard(board)`.
- Sync, in `runner.ts`: `rootOfBoard(board) = projectFor(board) ?? board` (`config/projectStore.ts`; longest configured prefix — worktrees live under `<root>/.worktrees/`). Used inside `boardFor`, `tick`, `pushBoard`, etc. where only the board key is in hand.

Decision: resolve at the IPC/MCP boundary; inside the runner everything is keyed by `board` and derives `project` from the task (`task.project`) or `rootOfBoard`.
Rationale: one async lookup per request, every internal function stays sync where it is sync today.

### D3. Runner (runner.ts)

Rename the parameter `project` → `board` in the board-scoped functions and fix their bodies:

| Function | Board-keyed part | Root part |
|---|---|---|
| `boardFor(board)` | `listTasks(board)` | `colonyConfig(rootOfBoard(board))`; return `{ project: root, board, … }` |
| `compactBoard(board)` | — | add `board` to the result |
| `tick(win, board)` | `ticking`, `listTasks(board)` → caps per board (A3) | `colonyConfig(root)` |
| `reconcileMerged(win, board)` | `listTasks(board)`, events | `isMergedInto(task.project, …)`, `colonyConfig(task.project)` |
| `reconcileLanded(win, board)` / `landedCards(board)` / `clearDone(win, board)` | `listTasks(board)` | `defaultBranch(root)`, `isMergedInto(root, …)` |
| `sweepReleases(win, board)` | `listTasks(board)` | — |
| `overlappingTasks(board)` | `listTasks(board)` | — |
| `pushBoard(win, board)` | sends `{ project: rootOfBoard(board), board }` | |
| `nannyFor(board)` | `getNanny(board)`; session `worktreePath: board` | |
| `nannyOpener(board)` | names the board path and tells her to pass it as `project` | |
| `nudgeNanny`/`flushNanny(…, board)` | `nannyNotes`/`nannyDue` keyed by board; `startTurn(win, id, board, …)` | |

Every call site that passes `task.project` as a board (`tick(win, task.project)`, `pushBoard(win, task.project)`, `recordEvent({ project })`, `nudgeNanny(win, task.project, …)`, `sweepReleases(win, task.project)`) switches to `boardOf(task)`; `recordEvent` gets `board: boardOf(task)` beside `project`. `undoTaskMerge` uses `boardOf(event)` for push/nudge, `event.project` for git. `reconcileColony` groups by `boardOf`.

### D4. Base default (FR6)

New exported `async function forkBase(task: ColonyTask): Promise<string | undefined>` in `runner.ts`:

```ts
if (task.base) return task.base
const board = boardOf(task)
if (board === task.project) return undefined          // main board: today's default
const branch = await checkedOutBranch(board)
if (!branch) throw new Error(`the board's worktree ${board} is on a detached HEAD — name a base for "${task.name}"`)
return branch
```

`releaseTask` calls it before `createWorktree(task.project, …, { base: await forkBase(task) })` and stores `base: forked ?? readBase(worktreePath)`. A throw reaches the caller (IPC/MCP error; the sweep already turns it into `warn`).

### D5. IPC (src/main/index.ts) and preload

- `colony:board(path)`, `colony:events(path)`, `colony:clearDone(path)`, `colony:nanny(path)`: `const { board } = await resolveBoard(path)` then call with `board`.
- `colony:add(task)`: `const { board, project } = await resolveBoard(task.project)`; `addTask({ ...task, project, board })`; push `board`.
- `colony:remove(id, path)`: read the task first, push `boardOf(task)`.
- `colony:release` / `colony:mergeTask` / `colony:hold` / `colony:undoMerge` / `colony:openReport`: id-based, unchanged.
- `colony:setAutomerge` / `colony:setReport(path, on)`: `project = (await resolveBoard(path)).project` for the config write; push the resolved board (other boards pick it up on their 2 s poll — A4).
- Preload `api.ts`: parameter names `project` → `path` with a one-line comment; the `onEvent` payload type gains `board`.
- `src/shared/colony.ts` `Board` gains `board: string`.

### D6. MCP (mcpServer.ts)

- `colony_board`, `colony_clear_done`, `colony_conflicts`, `colony_pending`: `const { board } = await resolveBoard(project)`; use `board` for every board-scoped call.
- `colony_add_task`: `const { board, project: root } = await resolveBoard(a.project)`; `dependencyProblem(board, …)`; `baseProblem(root, a.base)`; `addTask({ …a, project: root, board })`; push `board`.
- `colony_update_task`: `dependencyProblem` uses `boardOf(found)` (inside `updateTask`); push `boardOf(found)`.
- `colony_start_task`, `colony_remove_task`: push `boardOf(task)`.
- `colony_set_report`: config by resolved project.
- `project` arg descriptions: "The repo root (main board) or a worktree path (that worktree's board). A card's own worktree resolves to the board it is on."
- `taskFolderDeps.ts` (`cardLookup`, `startCard`): stays on the root board — `listTasks(root)` still finds root-board cards; `pushBoard(w, card.project)` is the root board. No change needed beyond type fallout.

### D7. Skills text (config/colonySkills.ts)

- Nanny: "one session per project" → "one session per board"; "Call `colony_board` with the project path" → "with the board path your opener names". Same for every `colony_*` call she makes.
- `colony-add-task`: "Call `colony_board` for the project" → "for the board (the path you were opened with)"; base default text: "Defaults to the board's branch — the main branch on the main checkout, the worktree's branch on a worktree board."
- `TASK_SETTINGS.base` description in mcpServer.ts: same default wording.

### D8. Renderer

- `App.tsx`: `const boardPath = worktrees.currentPath ?? projects.current?.path`; add `board?: string` to `CommandContext` (`commands.ts`) and set it in `ctxRef.current`. Pass `board={boardPath}` to `ColonyBoard` (panels.tsx `kind === 'colony'`) — panels.tsx receives it the way it receives `projects` (follow whichever prop path panels already use for `worktrees`).
- Card chats select the card's worktree; main resolves that path to the parent board (D2), so the panel does not flip (US6).
- `useColony(path)`: fetch `colony.board(path)`; event filter `e.board === (board?.board ?? path)`.
- `ColonyBoard.tsx` `useBoardEvents(path)` and `ColonyLog.tsx` listener: same filter on `e.board`.
- `ColonyBoard`: `project` prop keeps feeding `useTaskFolders(project)` (ideas tab stays per root — Out of Scope) and the tab/count store; `board` feeds `useColony` and `useBoardEvents`.
- `registry.ts` colony commands: `colony.nanny`, `colony.new`, `colony.clearDone`, `colony.automerge`, `colony.report` read `c.board ?? c.project` for the path they send. Tabs keep `c.project`.
- `useTaskFolders.ts` keeps filtering on `e.project` (root) — unchanged.

### D9. Docs

- `specs/colony/spec.md`: title/intro "one per project" → "one per worktree"; under Q3 note that state stays in `<dataDir>/colony.json` but each task is keyed by its board (worktree path), the root's board being the main checkout; add a decision row (next free D-number) stating this task's three user decisions.
- `store.ts` header comment: "keyed by project root" → "keyed by board (worktree path); the project root is the main checkout's board".

## Risks

- `projectFor` returns null for a board outside any configured project → `rootOfBoard` falls back to the board itself; `colonyConfig` then reads defaults. Acceptable: such a board was not openable before either.
- Path spelling (`/tmp` vs `/private/tmp`): `resolveBoard` uses `repoRoot()`, which is the spelling the store already holds for roots.
- A worktree board whose worktree is removed leaves orphan cards in `colony.json`; they are invisible (no board path to open). Not handled — same as removing a project today.
