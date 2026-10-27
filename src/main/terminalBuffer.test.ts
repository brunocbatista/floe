import { test } from 'node:test'
import assert from 'node:assert/strict'
import headless from '@xterm/headless'
import {
  appendScrollback,
  disposeScrollback,
  newScrollback,
  onAltScreen,
  resizeScrollback,
  snapshotScrollback,
  type Scrollback
} from './terminalBuffer.ts'

const ENTER = '\x1b[?1049h'
const LEAVE = '\x1b[?1049l'

// Resolves once every chunk handed to the mirror so far is parsed.
const parsed = (sb: Scrollback): Promise<void> => new Promise((r) => sb.term.write('', r))

// What a panel of `cols` shows after writing `bytes` into a fresh xterm.
function render(bytes: string, cols: number, rows = 24): Promise<string[]> {
  const term = new headless.Terminal({ cols, rows, allowProposedApi: true })
  return new Promise((r) =>
    term.write(bytes, () => {
      const buf = term.buffer.active
      const lines: string[] = []
      for (let y = 0; y < buf.length; y++) lines.push(buf.getLine(y)!.translateToString(true))
      while (lines.length && !lines[lines.length - 1]) lines.pop()
      term.dispose()
      r(lines)
    })
  )
}

// A docker-compose style progress frame, drawn for 80 columns and redrawn in
// place by climbing back over it.
function progress(): string {
  const row = (name: string, state: string): string => ` ✓ ${name}`.padEnd(60) + state
  let out = '$ ssh box\r\n'
  for (let i = 0; i < 4; i++) {
    if (i) out += '\x1b[3A'
    out += [`[+] up ${i + 5}/8`, row('Image mosquitto:2.0', 'Pulled'), row('Container gateway-1', 'Started')]
      .map((l) => l + '\x1b[K\r\n')
      .join('')
  }
  return out + 'Connection to box closed.\r\n$ '
}

test('a progress frame drawn wide replays as its final state in a narrower panel', async () => {
  const sb = newScrollback(80, 24)
  appendScrollback(sb, progress())
  await parsed(sb)
  resizeScrollback(sb, 49, 24)

  const lines = await render(snapshotScrollback(sb), 49)
  assert.equal(lines.filter((l) => l.startsWith('[+] up')).length, 1, 'redraws must not stack')
  assert.equal(lines.find((l) => l.startsWith('[+] up')), '[+] up 8/8')
  assert.equal(lines[lines.length - 1], '$ ')
  disposeScrollback(sb)
})

test('bytes not parsed yet still reach the snapshot', () => {
  const sb = newScrollback(80, 24)
  appendScrollback(sb, 'hello')
  assert.equal(snapshotScrollback(sb), 'hello')
  disposeScrollback(sb)
})

test('an exited TUI leaves the normal screen behind', async () => {
  const sb = newScrollback(80, 24)
  appendScrollback(sb, '$ nvim\r\n' + ENTER + 'nvim frames'.repeat(100))
  await parsed(sb)
  assert.ok(onAltScreen(sb))

  appendScrollback(sb, LEAVE + '$ ')
  await parsed(sb)
  assert.equal(onAltScreen(sb), false)
  assert.deepEqual(await render(snapshotScrollback(sb), 80), ['$ nvim', '$ '])
  disposeScrollback(sb)
})

test('an empty terminal snapshots to nothing', async () => {
  const sb = newScrollback(80, 24)
  await parsed(sb)
  assert.equal(snapshotScrollback(sb), '')
  disposeScrollback(sb)
})
