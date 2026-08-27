import type { WalkResult } from './walk.js'

export interface Summary {
  readonly files: number
  readonly dirs: number
  readonly ignored: number
  readonly errors: number
}

export function summarize(result: WalkResult): Summary {
  return {
    files: result.files,
    dirs: result.dirs,
    ignored: result.ignored,
    errors: result.errors.length,
  }
}

/** One-line status for stderr, e.g. `42 files, 8 dirs, 311 hidden`. */
export function formatSummary(summary: Summary): string {
  const parts = [plural(summary.files, 'file'), plural(summary.dirs, 'dir')]
  if (summary.ignored > 0) parts.push(`${summary.ignored} hidden`)
  if (summary.errors > 0) parts.push(plural(summary.errors, 'unreadable dir'))
  return parts.join(', ')
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}
