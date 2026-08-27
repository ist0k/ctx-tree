import ignore, { type Ignore } from 'ignore'
import { ALWAYS_IGNORE, DEFAULT_IGNORE } from './defaults.js'

/**
 * One layer of ignore rules, scoped to a directory.
 *
 * `base` is a posix-style path relative to the walk root; `''` means the root
 * itself. A layer only judges paths that live under its own base, which is what
 * makes nested `.gitignore` files work.
 */
interface Layer {
  readonly base: string
  readonly ig: Ignore
  /** Label used by `explain`, e.g. `.gitignore` or `--exclude`. */
  readonly source: string
}

export interface Verdict {
  readonly ignored: boolean
  /** Which layer decided, `undefined` when nothing matched. */
  readonly source?: string | undefined
  /** The gitignore pattern that decided, `undefined` when nothing matched. */
  readonly pattern?: string | undefined
}

export interface MatcherOptions {
  /** Apply the built-in noise list. */
  readonly useDefaults: boolean
  /** Extra patterns from `--exclude`, highest precedence. */
  readonly extraPatterns: readonly string[]
  /** Contents of the root `.gitignore`, if it was read. */
  readonly rootGitignore?: string | undefined
  /** Contents of `.git/info/exclude`, if it was read. */
  readonly gitInfoExclude?: string | undefined
}

/**
 * Strip a UTF-8 BOM. `ignore` would otherwise treat it as part of the first
 * pattern, silently breaking the top line of every BOM-encoded `.gitignore`.
 */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfe_ff ? text.slice(1) : text
}

function layer(base: string, source: string, patterns: readonly string[] | string): Layer {
  const ig = ignore({ allowRelativePaths: false })
  ig.add(typeof patterns === 'string' ? stripBom(patterns) : [...patterns])
  return { base, ig, source }
}

/**
 * Layered gitignore matcher.
 *
 * Precedence follows gitignore(5), highest wins:
 *   1. `--exclude` from the command line
 *   2. `.gitignore` files, deeper ones beating shallower ones
 *   3. `.git/info/exclude`
 *   4. the built-in noise list
 *
 * Putting the built-in list last is what lets a project resurrect something we
 * hide by default: `!*.svg` in `.gitignore` wins over our `*.svg`.
 *
 * `.git/` is handled outside the layers and cannot be negated.
 */
export class Matcher {
  /** Ordered lowest precedence first; evaluation walks it backwards. */
  private readonly layers: readonly Layer[]
  private readonly always: Ignore

  private constructor(layers: readonly Layer[], always: Ignore) {
    this.layers = layers
    this.always = always
  }

  static create(options: MatcherOptions): Matcher {
    const always = ignore({ allowRelativePaths: false })
    always.add([...ALWAYS_IGNORE])

    const layers: Layer[] = []
    if (options.useDefaults) {
      layers.push(layer('', 'built-in', DEFAULT_IGNORE))
    }
    if (options.gitInfoExclude) {
      layers.push(layer('', '.git/info/exclude', options.gitInfoExclude))
    }
    if (options.rootGitignore) {
      layers.push(layer('', '.gitignore', options.rootGitignore))
    }
    if (options.extraPatterns.length > 0) {
      layers.push(layer('', '--exclude', options.extraPatterns))
    }
    return new Matcher(layers, always)
  }

  /**
   * Return a matcher that also honours a `.gitignore` found inside `dir`.
   *
   * `dir` is a posix path relative to the walk root, without a trailing slash.
   * The new layer slots in just below `--exclude` so command-line patterns keep
   * the last word, and above every shallower `.gitignore`.
   */
  withNested(dir: string, content: string): Matcher {
    const nested = layer(dir, `${dir}/.gitignore`, content)
    const cliIndex = this.layers.findIndex((l) => l.source === '--exclude')
    if (cliIndex === -1) {
      return new Matcher([...this.layers, nested], this.always)
    }
    return new Matcher(
      [...this.layers.slice(0, cliIndex), nested, ...this.layers.slice(cliIndex)],
      this.always,
    )
  }

  /**
   * Decide whether an entry is ignored.
   *
   * `relPath` is a posix path relative to the walk root. `isDir` matters:
   * `ignore` only matches a `dist/` pattern against a path that ends in a
   * slash, so directories must be marked as such.
   */
  test(relPath: string, isDir: boolean): Verdict {
    const subject = isDir ? `${relPath}/` : relPath

    if (this.always.ignores(subject)) {
      return { ignored: true, source: 'always', pattern: '.git/' }
    }

    for (let i = this.layers.length - 1; i >= 0; i -= 1) {
      const current = this.layers[i]!
      const scoped = scopeTo(current.base, subject)
      if (scoped === undefined) continue

      const result = current.ig.test(scoped)
      if (result.ignored) {
        return { ignored: true, source: current.source, pattern: result.rule?.pattern }
      }
      if (result.unignored) {
        return { ignored: false, source: current.source, pattern: result.rule?.pattern }
      }
    }

    return { ignored: false }
  }

  ignores(relPath: string, isDir: boolean): boolean {
    return this.test(relPath, isDir).ignored
  }
}

/**
 * Re-base a root-relative path onto a layer's base directory.
 *
 * Returns `undefined` when the path is outside the layer's scope, or when it
 * *is* the base directory (nothing left to match, and `ignore` throws on an
 * empty pathname).
 */
function scopeTo(base: string, subject: string): string | undefined {
  if (base === '') return subject
  const prefix = `${base}/`
  if (!subject.startsWith(prefix)) return undefined
  const rest = subject.slice(prefix.length)
  return rest === '' ? undefined : rest
}

/** Convert a possibly-Windows relative path to the posix form `ignore` expects. */
export function toPosix(relPath: string): string {
  return relPath.replaceAll('\\', '/')
}
