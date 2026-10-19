# Architecture review — per-worktree-boards

## Gates
| Gate | Command | Result |
|---|---|---|
| lint | `node scripts/gate.mjs` (oxlint src --deny-warnings) | pass |
| typecheck | `tsc --noEmit -p tsconfig.node.json --composite false`, same for `tsconfig.web.json` | pass (gate's own typecheck stage fails only because `pnpm` is not installed in this sandbox; tsc run directly is clean) |
| test | `node scripts/gate.mjs` (node --test src/**/*.test.ts) | pass |
| crap | `node scripts/gate.mjs` | pass, 0 of 1682 gated units over 30 |

## Placement
- Board key (`boardOf`, `listTasks(board)`, `projectTasks`, `boardKeyFor`) lives in `colony/store.ts`, the layer that owns partitioning. Events import it from there; no duplicate concept.
- `project` keeps meaning repo root (config, git); `board` is the partition. Old records with no `board` resolve to `project`, so existing tasks/nannies keep working with no migration.
- Path → board resolution (`resolveBoard`) is in runner and used by IPC and MCP; renderer only passes paths. No process boundary crossed.
- `freeName` stays project-wide, correct since names map to branches/worktrees.
- Spec updated (D38, Q3).

## Verdict
Fits. pass.
