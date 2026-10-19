# Refactor — per-worktree boards

Verdict: **skip**. No code changed.

## What was looked at

Full diff vs `master` merge-base: store, events, runner, index IPC, mcpServer colony tools, preload, renderer (useColony, ColonyBoard, ColonyLog, panels, registry).

## Why nothing

- The board key is one idea with one owner: `boardOf` (store.ts) is the single place the legacy fallback (`board ?? project`) lives; every runner/IPC/MCP site goes through it. `resolveBoard` is the single entry from an arbitrary path. No scattered branching, no mirrored state.
- `project` vs `board` are two distinct, needed coordinates (config/git root vs card partition), not duplication.
- Renderer filters on the resolved `e.board`; same rule in three listeners, one line each — a helper would add indirection without removing a branch.

## Considered, not worth it now

- **Normalize `board` on read** (fill `board = project` in `store.read()` / events `read()`), make `ColonyTask.board` required, drop `boardOf`. Removes the optional field and ~40 `boardOf(x)` calls. Cost: touches every call site plus the cache path for a one-line helper that already centralizes the rule. Revisit only if a second legacy fallback appears on the task shape.
- `registry.ts` uses `c.board ?? c.project` five times; `App.tsx` already sets `board` whenever `project` is set, so the `?? c.project` is redundant but harmless. Not worth a commit.

## Checks

`node --test src/main/colony/*.test.ts` — 78 pass, 0 fail.
