import type { MouseEvent } from 'react'
import { IconPlay, IconStop } from './icons'
import type { OpenFn } from './panels'
import type { ProjectCommand } from '../../main/commands'
import type { CommandRunState, Commands } from './useCommands'
import { Spinner } from './Spinner'

function bytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  return `${Math.round(n / 1024 ** 2)} MB`
}

/** "3h ago" — re-read on render, which is precise enough for a finished run. */
function ago(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}

function dur(ms: number): string {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

/**
 * The row's note: the memory while it runs, how it ended once it has, and the
 * breaker's reason when auto-restart gave up — which outranks the exit code,
 * because "exit 1" is the symptom and the loop is the story. The run's length
 * goes to the tooltip: on one line there is room for the outcome, not its story.
 */
function note(run?: CommandRunState): { text: string; err?: true } | undefined {
  if (!run) return undefined
  if (run.state === 'crash-looping') return { text: run.reason ?? 'crash looping', err: true }
  if (run.state === 'running') return run.rss ? { text: bytes(run.rss) } : undefined
  if (run.state === 'starting') return { text: 'starting…' }
  if (run.state === 'stopping') return { text: 'stopping…' }
  if (run.exitCode == null) return undefined
  const parts = [`exit ${run.exitCode}`]
  if (run.endedAt != null) parts.push(ago(run.endedAt))
  return { text: parts.join(' · '), err: run.exitCode === 0 ? undefined : true }
}

/** Whether a state has (or is about to have) a live process. */
function isLive(state: CommandRunState['state'] | undefined): boolean {
  return state === 'running' || state === 'starting'
}

/**
 * The worktree's processes, one line each: state mark, name, note, one button.
 * The row under the cursor opens to its full command line.
 *
 * Rows are plain buttons so the lane's own cursor walks them (see rowsOf in
 * App) — the pane has no keyboard handling of its own. The ▶/■ beside each row
 * and the Run all / Stop all pair are spans with a button role rather than
 * nested buttons: a real button would enter the cursor's row list, and every
 * command would then own an extra stop the cursor had to walk past.
 */
export function CommandsPane({
  commands,
  worktreePath,
  onOpen,
  onCommand
}: {
  commands: Commands
  worktreePath?: string
  onOpen: OpenFn
  onCommand?: (id: string) => void
}): JSX.Element {
  const { list, runOf } = commands

  if (commands.error) return <p className="empty error">{commands.error}</p>
  if (commands.loading && !list.length) return <p className="empty">Loading…</p>
  if (!list.length)
    return <p className="empty">No commands yet — press a, or edit commands.toml.</p>

  /* Up first, then everything else, with a heading before each block.
     Flattened into ONE list — a heading is an entry like any row — so the
     row markup is not nested a map inside a map.
     Grouped on the same predicate the row uses to pick its spinner, so the
     block a command lands in and the mark it carries cannot disagree.
     `stopping` sits with the stopped and says so in its note. */
  const live = (c: ProjectCommand): boolean => isLive(runOf(c.id)?.state)
  type Item = { head: string; n: number } | { cmd: ProjectCommand }
  const rows: Item[] = []
  let up = 0
  for (const group of ['running', 'stopped']) {
    const block = list.filter((c) => live(c) === (group === 'running'))
    if (!block.length) continue
    if (group === 'running') up = block.length
    rows.push({ head: group, n: block.length })
    for (const cmd of block) rows.push({ cmd })
  }
  const canRun = list.some((c) => !live(c) && runOf(c.id)?.state !== 'stopping')

  // Keep the focus (and the cursor) where it is: the pair is pressed, not walked to.
  const press = (enabled: boolean, id: string) => (e: MouseEvent) => {
    e.preventDefault()
    if (enabled) onCommand?.(id)
  }

  return (
    <div className="cmd-pane">
      <div className="cmd-bar">
        <span className="cmd-count">
          {up}/{list.length} running
        </span>
        <span className="cmd-all">
          <span
            className="cmd-all-btn"
            role="button"
            tabIndex={-1}
            aria-disabled={!canRun}
            title="Run every stopped command (⇧R)"
            onMouseDown={press(canRun, 'command.runAll')}
          >
            <IconPlay size={11} />
            <span className="cmd-all-word">all</span>
            <kbd>⇧R</kbd>
          </span>
          <span
            className="cmd-all-btn"
            role="button"
            tabIndex={-1}
            aria-disabled={!up}
            title="Stop every running command (⇧S)"
            onMouseDown={press(up > 0, 'command.stopAll')}
          >
            <IconStop size={11} />
            <span className="cmd-all-word">all</span>
            <kbd>⇧S</kbd>
          </span>
        </span>
      </div>
      {rows.map((r) => {
        if ('head' in r)
          return (
            <div className="group-label" key={`head:${r.head}`}>
              {r.head.toUpperCase()} <span className="group-n">{r.n}</span>
            </div>
          )
        const c = r.cmd
        const run = runOf(c.id)
        const state = run?.state ?? 'idle'
        const on = isLive(state)
        const n = note(run)
        const ran = run?.durationMs != null && !on ? ` · ran ${dur(run.durationMs)}` : ''
        return (
          <button
            key={c.id}
            className="row cmd-row"
            data-command={c.id}
            data-live={on || undefined}
            title={c.command + ran}
            onClick={() => onOpen({ kind: 'cmdlog', sub: `${worktreePath ?? ''}#${c.id}` })}
          >
            {/* Running turns; anything else is a still dot coloured by how it
                ended, so a command that died and one still serving differ. */}
            {on ? (
              <Spinner />
            ) : (
              <span
                className={
                  'dot' + (state === 'crash-looping' || (run?.exitCode ?? 0) !== 0 ? ' dot-err' : '')
                }
              />
            )}
            <span className="row-name">
              {c.name}
              {c.scope === 'project' && <span className="cmd-scope">project</span>}
            </span>
            <span className="cmd-note" data-err={n?.err}>
              {n?.text}
            </span>
            {/* One toggle. Restart has no button: `r` on a running row restarts. */}
            {on || state === 'stopping' ? (
              <span
                className="cmd-act"
                data-act="stop"
                role="button"
                aria-disabled={!on}
                title="Stop (s)"
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (on) commands.stop(c.id)
                }}
              >
                <IconStop size={12} />
              </span>
            ) : (
              <span
                className="cmd-act"
                data-act="run"
                role="button"
                title="Run (r)"
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  commands.start(c.id)
                }}
              >
                <IconPlay size={12} />
              </span>
            )}
            {c.command !== c.name && <span className="cmd-full">{c.command}</span>}
          </button>
        )
      })}
    </div>
  )
}
