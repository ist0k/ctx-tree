import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { Matcher } from './ignore.js'
import { render } from './render.js'
import { formatSummary, summarize } from './stats.js'
import { LARGE_TREE_THRESHOLD, walk } from './walk.js'

export const VERSION = '0.1.0'

const HELP = `ctx-tree ${VERSION}

  Print a clean project file tree, ready to paste into an LLM chat.
  Respects .gitignore, skips build noise, copies the result to the clipboard.

Usage
  ctx-tree [path] [options]
  ctxt [path] [options]

Options
  -d, --depth <n>          limit tree depth
  -e, --exclude <pattern>  extra gitignore-style pattern (repeatable)
  -a, --all                only skip .git, show everything else
      --no-default-ignore  skip the built-in noise list
      --no-gitignore       do not read .gitignore files
      --no-copy            do not touch the clipboard
      --ascii              use +-- connectors instead of box drawing
  -q, --quiet              print the status line only
  -h, --help               show this help
  -v, --version            show the version

Examples
  ctx-tree                     current directory, copied to clipboard
  ctx-tree src --depth 2       shallow view of one directory
  ctx-tree -e "*.test.ts"      hide test files too
  ctx-tree --all --no-copy     everything except .git, stdout only

Notes
  The tree goes to stdout, status and warnings go to stderr, so
  \`ctx-tree > tree.txt\` gives you a clean file.
`

/** 0 success, 1 runtime failure, 2 bad usage. */
export const EXIT_OK = 0
export const EXIT_FAIL = 1
export const EXIT_USAGE = 2

/**
 * Everything the CLI touches outside of the filesystem.
 *
 * Injected so tests can capture output and skip the real clipboard, which
 * would otherwise clobber whatever the developer had copied.
 */
export interface Io {
  out(text: string): void
  err(text: string): void
  copy(text: string): Promise<boolean>
}

interface Options {
  readonly target: string
  readonly maxDepth: number | undefined
  readonly excludes: readonly string[]
  readonly useDefaults: boolean
  readonly useGitignore: boolean
  readonly copy: boolean
  readonly ascii: boolean
  readonly quiet: boolean
}

class UsageError extends Error {}

/** Thrown for `--help` and `--version`: print something and stop, successfully. */
class EarlyExit extends Error {
  constructor(readonly text: string) {
    super('early exit')
  }
}

function parse(argv: readonly string[]): Options {
  let values: {
    depth?: string | undefined
    exclude?: string[] | undefined
    all?: boolean | undefined
    'no-default-ignore'?: boolean | undefined
    'no-gitignore'?: boolean | undefined
    'no-copy'?: boolean | undefined
    ascii?: boolean | undefined
    quiet?: boolean | undefined
    help?: boolean | undefined
    version?: boolean | undefined
  }
  let positionals: string[]

  try {
    const parsed = parseArgs({
      args: [...argv],
      options: {
        depth: { type: 'string', short: 'd' },
        exclude: { type: 'string', short: 'e', multiple: true },
        all: { type: 'boolean', short: 'a' },
        'no-default-ignore': { type: 'boolean' },
        'no-gitignore': { type: 'boolean' },
        'no-copy': { type: 'boolean' },
        ascii: { type: 'boolean' },
        quiet: { type: 'boolean', short: 'q' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
      allowPositionals: true,
    })
    values = parsed.values
    positionals = parsed.positionals
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error))
  }

  if (values.help) throw new EarlyExit(HELP)
  if (values.version) throw new EarlyExit(`${VERSION}\n`)

  if (positionals.length > 1) {
    throw new UsageError(`expected at most one path, got ${positionals.length}`)
  }

  let maxDepth: number | undefined
  if (values.depth !== undefined) {
    const parsedDepth = Number(values.depth)
    if (!Number.isInteger(parsedDepth) || parsedDepth < 0) {
      throw new UsageError(`--depth expects a non-negative integer, got "${values.depth}"`)
    }
    maxDepth = parsedDepth
  }

  const all = values.all === true

  return {
    target: positionals[0] ?? '.',
    maxDepth,
    excludes: values.exclude ?? [],
    // `--all` implies both opt-outs. Keeping them independent would only raise
    // the question of which one wins.
    useDefaults: !all && values['no-default-ignore'] !== true,
    useGitignore: !all && values['no-gitignore'] !== true,
    copy: values['no-copy'] !== true,
    ascii: values.ascii === true,
    quiet: values.quiet === true,
  }
}

export async function run(argv: readonly string[], io: Io): Promise<number> {
  let options: Options
  try {
    options = parse(argv)
  } catch (error) {
    if (error instanceof EarlyExit) {
      io.out(error.text)
      return EXIT_OK
    }
    if (error instanceof UsageError) {
      io.err(`ctx-tree: ${error.message}\n\nRun \`ctx-tree --help\` for usage.\n`)
      return EXIT_USAGE
    }
    throw error
  }

  const root = path.resolve(options.target)

  try {
    if (!(await stat(root)).isDirectory()) {
      io.err(`ctx-tree: not a directory: ${options.target}\n`)
      return EXIT_FAIL
    }
  } catch {
    io.err(`ctx-tree: cannot read path: ${options.target}\n`)
    return EXIT_FAIL
  }

  const matcher = Matcher.create({
    useDefaults: options.useDefaults,
    extraPatterns: options.excludes,
    rootGitignore: options.useGitignore
      ? await readIfPresent(path.join(root, '.gitignore'))
      : undefined,
    gitInfoExclude: options.useGitignore
      ? await readIfPresent(path.join(root, '.git', 'info', 'exclude'))
      : undefined,
  })

  const result = await walk({
    root,
    maxDepth: options.maxDepth,
    readGitignore: options.useGitignore,
    matcher,
  })

  const tree = render(result.root, { ascii: options.ascii })
  const summary = summarize(result)
  const total = summary.files + summary.dirs

  if (!options.quiet) io.out(`${tree}\n`)

  if (total > LARGE_TREE_THRESHOLD) {
    io.err(`ctx-tree: ${total} entries is a lot for one prompt, consider --depth\n`)
  }
  for (const failure of result.errors) {
    io.err(`ctx-tree: cannot read ${failure.relPath || '.'} (${failure.code})\n`)
  }

  let status = formatSummary(summary)
  if (options.copy) {
    status += (await io.copy(tree)) ? ', copied to clipboard' : ', clipboard unavailable'
  }
  io.err(`${status}\n`)

  return EXIT_OK
}

async function readIfPresent(absPath: string): Promise<string | undefined> {
  try {
    return await readFile(absPath, 'utf8')
  } catch {
    return undefined
  }
}
