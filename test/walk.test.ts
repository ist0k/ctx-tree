import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Matcher } from '../src/ignore.js'
import { render } from '../src/render.js'
import { walk } from '../src/walk.js'
import { makeFixture, trySymlink, type Fixture } from './helpers.js'

let fixture: Fixture | undefined

afterEach(async () => {
  await fixture?.cleanup()
  fixture = undefined
})

interface RunOptions {
  readonly maxDepth?: number
  readonly useDefaults?: boolean
  readonly readGitignore?: boolean
  readonly extraPatterns?: readonly string[]
  readonly rootGitignore?: string
}

async function run(spec: Record<string, string>, options: RunOptions = {}) {
  fixture = await makeFixture(spec)
  const matcher = Matcher.create({
    useDefaults: options.useDefaults ?? false,
    extraPatterns: options.extraPatterns ?? [],
    rootGitignore: options.rootGitignore ?? spec['.gitignore'],
  })
  const result = await walk({
    root: fixture.root,
    maxDepth: options.maxDepth,
    readGitignore: options.readGitignore ?? true,
    matcher,
  })
  // The root name is a random temp directory, so normalize it for snapshots.
  const text = render(result.root, { ascii: false }).replace(
    /^.*\/$/m,
    'root/',
  )
  return { result, text, root: fixture.root }
}

describe('walk', () => {
  it('lists a simple tree with directories first', async () => {
    const { text } = await run({
      'README.md': '',
      'package.json': '',
      'src/main.ts': '',
      'src/util.ts': '',
      'docs/guide.md': '',
    })
    expect(text).toBe(
      [
        'root/',
        '├── docs/',
        '│   └── guide.md',
        '├── src/',
        '│   ├── main.ts',
        '│   └── util.ts',
        '├── package.json',
        '└── README.md',
      ].join('\n'),
    )
  })

  it('sorts numerically and case-insensitively', async () => {
    const { text } = await run({
      'a2.ts': '',
      'a10.ts': '',
      'a1.ts': '',
      'B.ts': '',
      'a.ts': '',
    })
    expect(text.split('\n').slice(1)).toEqual([
      '├── a.ts',
      '├── a1.ts',
      '├── a2.ts',
      '├── a10.ts',
      '└── B.ts',
    ])
  })

  it('keeps empty directories', async () => {
    const { text, result } = await run({ 'empty/': '', 'a.ts': '' })
    expect(text).toBe(['root/', '├── empty/', '└── a.ts'].join('\n'))
    expect(result.dirs).toBe(1)
    expect(result.files).toBe(1)
  })

  it('shows hidden files by default', async () => {
    const { text } = await run({ '.env.example': '', '.github/workflows/ci.yml': '' })
    expect(text).toContain('.env.example')
    expect(text).toContain('.github/')
  })

  it('counts files, dirs and ignored entries', async () => {
    const { result } = await run(
      { 'src/a.ts': '', 'src/b.ts': '', 'dist/out.js': '', 'logo.png': '' },
      { useDefaults: true },
    )
    expect(result.files).toBe(2)
    expect(result.dirs).toBe(1)
    expect(result.ignored).toBe(2)
    expect(result.errors).toEqual([])
  })

  it('prunes ignored directories instead of descending', async () => {
    const { text } = await run(
      { 'node_modules/pkg/index.js': '', 'src/a.ts': '' },
      { useDefaults: true },
    )
    expect(text).not.toContain('node_modules')
    expect(text).toContain('src/')
  })
})

describe('walk with .gitignore', () => {
  it('applies the root .gitignore', async () => {
    const { text } = await run({ '.gitignore': 'secret.txt\n', 'secret.txt': '', 'a.ts': '' })
    expect(text).not.toContain('secret.txt')
    expect(text).toContain('.gitignore')
  })

  it('applies nested .gitignore files', async () => {
    const { text } = await run({
      'packages/app/.gitignore': 'local.txt\n',
      'packages/app/local.txt': '',
      'packages/app/main.ts': '',
      'packages/other/local.txt': '',
    })
    expect(text).toContain('packages/')
    expect(text).toContain('main.ts')
    expect(text).toContain('other/')
    // `local.txt` survives under `other/` but not under `app/`.
    expect(text.match(/local\.txt/g)).toHaveLength(1)
  })

  it('ignores nested .gitignore files when disabled', async () => {
    const { text } = await run(
      { 'pkg/.gitignore': 'local.txt\n', 'pkg/local.txt': '' },
      { readGitignore: false },
    )
    expect(text).toContain('local.txt')
  })

  it('cannot resurrect a file inside an ignored directory', async () => {
    const { text } = await run({
      '.gitignore': 'build/\n!build/keep.txt\n',
      'build/keep.txt': '',
      'a.ts': '',
    })
    expect(text).not.toContain('build')
  })

  it('always hides .git', async () => {
    const { text } = await run({ '.git/HEAD': '', 'a.ts': '' })
    expect(text).not.toContain('.git/')
  })
})

describe('walk with --depth', () => {
  it('lists only the top level at depth 1', async () => {
    const { text } = await run({ 'src/deep/a.ts': '', 'b.ts': '' }, { maxDepth: 1 })
    expect(text).toBe(['root/', '├── src/', '│   └── …', '└── b.ts'].join('\n'))
  })

  it('marks truncation two levels down', async () => {
    const { text } = await run({ 'src/deep/a.ts': '', 'src/b.ts': '' }, { maxDepth: 2 })
    expect(text).toBe(
      ['root/', '└── src/', '    ├── deep/', '    │   └── …', '    └── b.ts'].join('\n'),
    )
  })

  it('collapses everything at depth 0', async () => {
    const { text } = await run({ 'a.ts': '' }, { maxDepth: 0 })
    expect(text).toBe(['root/', '└── …'].join('\n'))
  })

  it('does not mark truncation when the tree is shallower than the limit', async () => {
    const { text } = await run({ 'src/a.ts': '' }, { maxDepth: 5 })
    expect(text).not.toContain('…')
  })
})

describe('walk with symlinks', () => {
  it('marks a symlink without descending into it', async () => {
    fixture = await makeFixture({ 'real/a.ts': '', 'b.ts': '' })
    const linked = await trySymlink(
      path.join(fixture.root, 'real'),
      path.join(fixture.root, 'link'),
      'dir',
    )
    if (!linked) return

    const result = await walk({
      root: fixture.root,
      readGitignore: true,
      matcher: Matcher.create({ useDefaults: false, extraPatterns: [] }),
    })
    const text = render(result.root, { ascii: false })
    // The target is printed relative to the root, never as a machine-specific
    // absolute path.
    expect(text).toContain('link/ -> real')
    expect(text).not.toContain(fixture.root)
    // The target is listed once, under `real/`, not again under `link/`.
    expect(text.match(/a\.ts/g)).toHaveLength(1)
  })
})

describe('walk error handling', () => {
  it('reports a missing root instead of throwing', async () => {
    fixture = await makeFixture({ 'a.ts': '' })
    const result = await walk({
      root: path.join(fixture.root, 'does-not-exist'),
      readGitignore: true,
      matcher: Matcher.create({ useDefaults: false, extraPatterns: [] }),
    })
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.code).toBe('ENOENT')
    expect(result.files).toBe(0)
  })
})
