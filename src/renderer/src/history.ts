// What you've already sent, oldest first — the ↑/↓ history in the composer.
//
// One list per worktree, keyed by its path: a branch is one piece of work, and
// the line you reach for is the one you typed on this branch, not the one from
// whichever project you had open before it. A worktree path separates project
// and branch in a single key, so that is the key.

const KEY = 'floe.history'

// ponytail: 100 entries per worktree, across at most 40 worktrees, in
// localStorage. Move it to the store if it ever has to survive a cleared
// browser profile.
const MAX = 100
const MAX_SCOPES = 40

/**
 * One sent message as the composer had it: the text with its paste rails, and
 * the pastes those rails stand for. Without the bodies a recalled message is
 * only the rails, and sending it again would send the rails (pastes.ts).
 */
export type Entry = { text: string; pastes?: string[] }

type Histories = Record<string, Entry[]>

const toEntry = (v: unknown): Entry | null => {
  if (typeof v === 'string') return { text: v }
  if (!v || typeof v !== 'object') return null
  const { text, pastes } = v as { text?: unknown; pastes?: unknown }
  if (typeof text !== 'string') return null
  const bodies = Array.isArray(pastes) ? pastes.filter((p): p is string => typeof p === 'string') : []
  return bodies.length ? { text, pastes: bodies } : { text }
}

const same = (a: Entry | undefined, b: Entry): boolean =>
  !!a && a.text === b.text && (a.pastes ?? []).join('\0') === (b.pastes ?? []).join('\0')

/**
 * Every list, by worktree path.
 *
 * The pre-scope shape was a flat array of strings; it is dropped on sight
 * rather than migrated, because there is no worktree to file it under. Entries
 * written before pastes were kept are plain strings, read as text alone.
 */
function read(): Histories {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([, v]) => Array.isArray(v))
        .map(([k, v]) => [k, (v as unknown[]).map(toEntry).filter((e): e is Entry => !!e)])
    )
  } catch {
    return {}
  }
}

/**
 * What ↑ walks in `scope`.
 *
 * Without a scope there is no history — same rule as a draft with no key: there
 * is nowhere to file the text, and picking somewhere would hand it to whichever
 * composer opened next.
 */
export function readHistory(scope?: string): Entry[] {
  if (!scope) return []
  return read()[scope] ?? []
}

/** Append, oldest first. Exported for the test; `pushHistory` is the real door. */
export function push(list: Entry[], text: string, pastes: string[] = []): Entry[] {
  const trimmed = text.trim()
  const entry: Entry = pastes.length ? { text: trimmed, pastes } : { text: trimmed }
  // Nothing to recall in an empty message, and repeating the last one only
  // makes you press ↑ twice to get past it.
  if (!trimmed || same(list[list.length - 1], entry)) return list
  return [...list, entry].slice(-MAX)
}

/** Append to one worktree's list. Exported for the test; `pushHistory` is the real door. */
export function put(all: Histories, scope: string, text: string, pastes: string[] = []): Histories {
  const list = push(all[scope] ?? [], text, pastes)
  // Nothing was added — don't write, and don't let a blank ⏎ count as touching
  // this worktree.
  if (!list.length || list === all[scope]) return all
  // The touched worktree is re-inserted rather than updated in place, so it
  // becomes the newest key and eviction takes the one untouched for longest.
  const rest = { ...all }
  delete rest[scope]
  const keys = Object.keys(rest)
  for (const old of keys.slice(0, Math.max(0, keys.length + 1 - MAX_SCOPES))) delete rest[old]
  return { ...rest, [scope]: list }
}

/**
 * Drop the paste bodies of the oldest entry still holding any, so a full
 * localStorage gives up old pastes before it gives up the whole history.
 * Exported for the test. Returns null when there is nothing left to drop.
 */
export function shed(all: Histories): Histories | null {
  for (const [scope, list] of Object.entries(all)) {
    const i = list.findIndex((e) => e.pastes?.length)
    if (i < 0) continue
    const next = [...list]
    next[i] = { text: list[i].text }
    return { ...all, [scope]: next }
  }
  return null
}

export function pushHistory(text: string, scope?: string, pastes: string[] = []): void {
  if (!scope) return
  let all: Histories | null = put(read(), scope, text, pastes)
  while (all) {
    try {
      localStorage.setItem(KEY, JSON.stringify(all))
      return
    } catch {
      /* quota or private mode — history is a convenience, never a requirement */
      all = shed(all)
    }
  }
}
