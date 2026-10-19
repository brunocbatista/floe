// Turning `#001` into the task it names: the task folder of the project the
// message is written from. See shared/taskRefs.ts for the block it feeds.

import { join } from 'node:path'
import type { TaskRef } from '../shared/taskRefs'
import { projectFor } from './config/projectStore'
import { readTaskFolder } from './taskFolders'

/** The task a number names in this worktree's project, or null. */
export function resolveTaskRef(ref: string, worktreePath: string): TaskRef | null {
  const root = projectFor(worktreePath)
  if (!root) return null
  try {
    const t = readTaskFolder(root, ref, () => undefined)
    return { number: t.number, title: t.title, status: t.status, path: join(root, t.dir) }
  } catch {
    return null
  }
}
