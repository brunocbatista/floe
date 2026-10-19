// A task named in a message, and what the model actually receives.
//
// The `#` menu writes the task's NUMBER — `#001` — because that is how the tasks
// panel lists it. The number names nothing the model can open: the task is a
// folder in the project's MAIN checkout, which a session in another worktree
// cannot reach by a relative path. So it expands on the way out, exactly as a
// session reference does (see sessionRefs.ts), and every reader collapses the
// block back to `#001`.

export const TASK_TAG = 'floe-task'

/** A task, as the model needs to be told about it. */
export interface TaskRef {
  /** Three digits, zero-padded: `001`. */
  number: string
  title: string
  status: string
  /** Absolute path of the task folder. */
  path: string
}

const esc = (v: string): string => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
const unesc = (v: string): string => v.replace(/&quot;/g, '"').replace(/&amp;/g, '&')

/** One reference, wrapped so it can be found again in an echoed prompt. */
export function wrapTaskRef(ref: string, t: TaskRef): string {
  const line =
    `The user is pointing at Floe task ${t.number} "${t.title}" (status ${t.status}), ` +
    `folder ${t.path}. Read its task.md there, or use the floe MCP tool task_read with ref ${t.number}.`
  return `<${TASK_TAG} ref="${esc(ref)}" number="${esc(t.number)}">\n${line}\n</${TASK_TAG}>`
}

const BLOCK = new RegExp(`<${TASK_TAG} ref="([^"]*)"[^>]*>[\\s\\S]*?</${TASK_TAG}>`, 'g')

/** True when the text carries an expansion — i.e. it needs collapsing to read. */
export function hasTaskRef(text: string): boolean {
  return text.includes(`<${TASK_TAG} `)
}

/** Put an expanded prompt back the way it was typed. */
export function collapseTaskRefs(text: string): string {
  return text.replace(BLOCK, (_all, ref: string) => `#${unesc(ref)}`)
}

// Digits only, and a whole token: `#001,` keeps the sentence's comma and stays
// text, as does `#1a` or `issue#001`.
const TOKEN = /(^|\s)#(\d{1,4})(?=\s|$)/g

/** Replace every `#NNN` that names a known task with its address. */
export function expandTaskRefs(text: string, resolve: (ref: string) => TaskRef | null): string {
  return text.replace(TOKEN, (all, lead: string, ref: string) => {
    const found = resolve(ref)
    return found ? `${lead}${wrapTaskRef(ref, found)}` : all
  })
}
