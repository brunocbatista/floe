// Turn a free-form worktree name (which may contain spaces, capitals, accents
// or punctuation) into a valid git branch slug. Casing is kept, so issue keys
// like "FLOE-123" survive; accents stripped; any run of non-alphanumeric
// characters collapsed to a single hyphen, with namespacing slashes preserved
// (e.g. "My Feature / Sub Task" → "My-Feature/Sub-Task").
// Pass { preserveCase: false } to lowercase it.
// Always yields a usable ref, or '' when nothing usable remains.
export function slugifyBranch(name: string, opts?: { preserveCase?: boolean }): string {
  const preserveCase = opts?.preserveCase ?? true
  let s = name.normalize('NFKD').replace(/\p{M}/gu, '') // drop combining accents (café → cafe)
  if (!preserveCase) s = s.toLowerCase()
  const allowed = preserveCase ? /[^a-zA-Z0-9/]+/g : /[^a-z0-9/]+/g
  return s
    .replace(allowed, '-') // anything but alnum or slash → hyphen
    .replace(/\/{2,}/g, '/') // no empty path segments
    .replace(/-{2,}/g, '-') // collapse repeated hyphens
    .replace(/(^|\/)-+/g, '$1') // no leading hyphen per segment
    .replace(/-+(\/|$)/g, '$1') // no trailing hyphen per segment
    .replace(/^\/+|\/+$/g, '') // no leading/trailing slash
}
