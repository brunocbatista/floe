# Review (hardener) — per-worktree-boards

Second opinion unavailable (`codex` not on PATH; `opencode`: default provider 404, `github-copilot/*` "not licensed to use Copilot", free tier "can only be used from within OpenCode") — reviewed alone, adversarially.

## Verified

- Keying: `boardOf` (`board ?? project`) is the single legacy fallback; every runner/IPC/MCP site goes through it or `resolveBoard`. Legacy tasks, nannies (`nannies[root]`) and events land on the root board — root short-circuit in `resolveBoard` keeps the configured spelling the store already uses.
- Merge into a worktree board: probe against a real git fixture (`createWorktree` board `feat/x`, card cut with `base: feat/x`, `mergeWorktree`) → `ok`, `feat/x` == card tip, `main` unmoved.
- Gate: lint, test, crap pass; typecheck clean via `tsc` directly (gate stage fails only because `pnpm` is absent in this sandbox — same as the architect lane saw).

## Findings, most severe first

1. **Pre-existing, not this diff — every colony merge refuses in repos that do not gitignore `.gw-*`.** `git.ts` `mergeWorktree` → `isDirty(target)` / `isDirty(holder, MERGE_TOLERATES)` count the untracked `.gw-base`/`.gw-note`/`.gw-desc` markers `createWorktree` writes. Probe without `.gw-*` ignored: `"feat/card" has uncommitted changes — commit or stash first`. Floe's own repo does not ignore them (`git status` shows `?? .gw-base`). A worktree board adds a second hit (the holder tree has markers too). Fixture tests hide it by ignoring `.gw-*`. Affects the main board equally, lives in `git.ts` (untouched here) → follow-up, not sent back. Fix: tolerate `.gw-*` in both `isDirty` calls (`uncommittedWork` already does).
2. **Fixed — detached-HEAD refusal was not on the card when released by hand.** Spec clarification: "Release refuses with a reason on the card". `releaseTask` threw from `forkBase`; only `sweepReleases` wrote `warn`, so IPC/MCP releases left the card clean. Now `releaseTask` writes `warn` and pushes before rethrowing; a successful release clears a stale `warn`. Test asserts it.
3. **Hypothesis — worktree outside `<root>/` silently forks from main.** `rootOfBoard = projectFor(board) ?? board`: a worktree not under a configured root makes `project === board`, so `forkBase` returns `undefined` (main) and `createWorktree` nests `.worktrees/` inside that worktree. Floe cuts every worktree under `<root>/.worktrees/`, so only hand-made trees hit it. Old `projectRoot` misresolved the project the same way; the new consequence is the base. Upgrade path: derive project from `git rev-parse --git-common-dir` in `resolveBoard`.
4. **Hypothesis — symlinked configured root.** `resolveBoard` uses git's realpath toplevel; a root configured as `/tmp/x` makes worktree boards `/private/tmp/x/...`, `projectFor` misses → same as 3. Old `projectRoot` tried realpath and raw spelling. App-wide pre-existing class (sidebar worktree paths are git-spelled too).
5. **Note — a removed board worktree orphans its cards.** Cards keep ticking/merging into its branch with no UI that selects that path. Out of spec scope; follow-up if worktree removal should refuse or move cards.

## Decisions

- 1, 3, 4, 5 recorded, not sent back: pre-existing or outside the files/scope this task owns; none blocks the acceptance criteria in a repo that ignores `.gw-*`.

Verdict: pass.
