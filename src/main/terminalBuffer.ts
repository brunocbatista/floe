// Replayable scrollback for a PTY.
//
// A raw byte window cannot be replayed faithfully: programs draw relative to
// the size the PTY had when they ran. docker compose, apt and every other
// progress UI redraw their frame with `ESC[nA`, so bytes recorded at 120
// columns and replayed into a 49-column panel wrap each row in two, the cursor
// climbs back only half the frame, and every redraw stacks under the last —
// the jumbled block left behind after an ssh session that ran one.
//
// So the scrollback is a headless xterm that parses the same bytes and is
// resized with the PTY. Re-opening serializes its screen: the rendered result,
// already reflowed to the current width, instead of the history that produced
// it. Alternate-screen frames need no special case either — a TUI that exited
// left the normal screen behind, and one still running serializes as such.

import * as headless from '@xterm/headless'
import * as serialize from '@xterm/addon-serialize'

// Both are CJS modules flagged __esModule. Node's ESM loader and the Electron
// build hand the module over as `default`; esbuild's CJS bundle (the headless
// daemon) does not, so take `default` when present and the namespace otherwise.
const { Terminal } = (headless as { default?: typeof headless }).default ?? headless
const { SerializeAddon } = (serialize as { default?: typeof serialize }).default ?? serialize

// Matches the renderer's xterm, which keeps its default of 1000 lines.
export const SCROLLBACK_LINES = 1000

export interface Scrollback {
  term: InstanceType<typeof Terminal>
  serializer: InstanceType<typeof SerializeAddon>
  // Chunks written but not parsed yet. xterm parses asynchronously, and these
  // bytes were already sent live to whichever panel was open — a snapshot taken
  // now must carry them, or a re-open in that window loses them.
  unparsed: string[]
}

export function newScrollback(cols: number, rows: number): Scrollback {
  const term = new Terminal({ cols, rows, scrollback: SCROLLBACK_LINES, allowProposedApi: true })
  const serializer = new SerializeAddon()
  term.loadAddon(serializer)
  return { term, serializer, unparsed: [] }
}

export function appendScrollback(sb: Scrollback, data: string): void {
  sb.unparsed.push(data)
  sb.term.write(data, () => void sb.unparsed.shift())
}

export function resizeScrollback(sb: Scrollback, cols: number, rows: number): void {
  sb.term.resize(cols, rows)
}

// Whether a TUI (nvim, lazygit) is drawing on the alternate screen.
export function onAltScreen(sb: Scrollback): boolean {
  return sb.term.buffer.active.type === 'alternate'
}

// The screen and its scrollback as bytes that repaint it on a terminal of the
// current size.
export function snapshotScrollback(sb: Scrollback): string {
  return sb.serializer.serialize() + sb.unparsed.join('')
}

export function disposeScrollback(sb: Scrollback): void {
  sb.term.dispose()
}
