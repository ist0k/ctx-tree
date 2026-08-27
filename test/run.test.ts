import { afterEach, describe, expect, it } from 'vitest'
import { EXIT_FAIL, EXIT_OK, EXIT_USAGE, run, VERSION, type Io } from '../src/run.js'
import { makeFixture, type Fixture } from './helpers.js'

let fixture: Fixture | undefined

afterEach(async () => {
  await fixture?.cleanup()
  fixture = undefined
})

interface Capture extends Io {
  readonly stdout: () => string
  readonly stderr: () => string
  readonly copied: () => string | undefined
}

function capture(clipboardWorks = true): Capture {
  let out = ''
  let err = ''
  let copied: string | undefined
  return {
    out: (text) => {
      out += text
    },
    err: (text) => {
      err += text
    },
    copy: async (text) => {
      if (!clipboardWorks) return false
      copied = text
      return true
    },
    stdout: () => out,
    stderr: () => err,
    copied: () => copied,
  }
}

const PROJECT: Record<string, string> = {
  '.gitignore': 'secret.env\n',
  'package.json': '{}',
  'README.md': '# demo',
  'secret.env': 'TOKEN=1',
  'src/main.ts': '',
  'src/lib/util.ts': '',
  'dist/bundle.js': '',
  'node_modules/dep/index.js': '',
  'assets/logo.png': '',
}

describe('run', () => {
  it('prints a filtered tree and copies it', async () => {
    fixture = await makeFixture(PROJECT)
    const io = capture()
    const code = await run([fixture.root], io)

    expect(code).toBe(EXIT_OK)
    const lines = io.stdout().trimEnd().split('\n')
    expect(lines.slice(1)).toEqual([
      // `assets/` stays even though its only file is hidden: knowing the
      // directory exists is signal, and pruning it would hide real structure.
      '├── assets/',
      '├── src/',
      '│   ├── lib/',
      '│   │   └── util.ts',
      '│   └── main.ts',
      '├── .gitignore',
      '├── package.json',
      '└── README.md',
    ])
    // Copied text matches stdout minus the trailing newline.
    expect(io.copied()).toBe(io.stdout().trimEnd())
    expect(io.stderr()).toContain('copied to clipboard')
  })

  it('keeps a directory whose only file is hidden', async () => {
    fixture = await makeFixture(PROJECT)
    const io = capture()
    await run([fixture.root], io)
    expect(io.stdout()).toContain('assets/')
    expect(io.stdout()).not.toContain('logo.png')
  })

  it('reports the summary on stderr, never on stdout', async () => {
    fixture = await makeFixture(PROJECT)
    const io = capture()
    await run([fixture.root], io)
    expect(io.stderr()).toMatch(/\d+ files?, \d+ dirs?/)
    expect(io.stdout()).not.toContain('files,')
  })

  it('counts hidden entries', async () => {
    fixture = await makeFixture(PROJECT)
    const io = capture()
    await run([fixture.root], io)
    expect(io.stderr()).toContain('hidden')
  })

  it('honours --no-copy', async () => {
    fixture = await makeFixture(PROJECT)
    const io = capture()
    await run([fixture.root, '--no-copy'], io)
    expect(io.copied()).toBeUndefined()
    expect(io.stderr()).not.toContain('clipboard')
  })

  it('still succeeds when the clipboard is unavailable', async () => {
    fixture = await makeFixture(PROJECT)
    const io = capture(false)
    const code = await run([fixture.root], io)
    expect(code).toBe(EXIT_OK)
    expect(io.stdout()).toContain('src/')
    expect(io.stderr()).toContain('clipboard unavailable')
  })

  it('suppresses the tree with --quiet', async () => {
    fixture = await makeFixture(PROJECT)
    const io = capture()
    const code = await run([fixture.root, '--quiet'], io)
    expect(code).toBe(EXIT_OK)
    expect(io.stdout()).toBe('')
    // The clipboard still receives the tree.
    expect(io.copied()).toContain('src/')
  })

  it('shows everything but .git with --all', async () => {
    fixture = await makeFixture({ ...PROJECT, '.git/HEAD': 'ref' })
    const io = capture()
    await run([fixture.root, '--all', '--no-copy'], io)
    const out = io.stdout()
    expect(out).toContain('node_modules/')
    expect(out).toContain('dist/')
    expect(out).toContain('secret.env')
    expect(out).toContain('logo.png')
    expect(out).not.toContain('.git/')
  })

  it('keeps .gitignore active when only the noise list is off', async () => {
    fixture = await makeFixture(PROJECT)
    const io = capture()
    await run([fixture.root, '--no-default-ignore', '--no-copy'], io)
    expect(io.stdout()).toContain('node_modules/')
    expect(io.stdout()).not.toContain('secret.env')
  })

  it('keeps the noise list active when only .gitignore is off', async () => {
    fixture = await makeFixture(PROJECT)
    const io = capture()
    await run([fixture.root, '--no-gitignore', '--no-copy'], io)
    expect(io.stdout()).toContain('secret.env')
    expect(io.stdout()).not.toContain('node_modules/')
  })

  it('applies repeated --exclude patterns', async () => {
    fixture = await makeFixture(PROJECT)
    const io = capture()
    await run([fixture.root, '-e', '*.md', '-e', 'src/', '--no-copy'], io)
    const out = io.stdout()
    expect(out).not.toContain('README.md')
    expect(out).not.toContain('src/')
    expect(out).toContain('package.json')
  })

  it('limits depth', async () => {
    fixture = await makeFixture(PROJECT)
    const io = capture()
    await run([fixture.root, '--depth', '1', '--no-copy'], io)
    const out = io.stdout()
    expect(out).toContain('src/')
    expect(out).not.toContain('main.ts')
    expect(out).toContain('…')
  })

  it('switches to ascii connectors', async () => {
    fixture = await makeFixture(PROJECT)
    const io = capture()
    await run([fixture.root, '--ascii', '--no-copy'], io)
    const out = io.stdout()
    expect(out).toContain('+-- ')
    expect(out).not.toContain('├')
  })

  it('defaults to the current directory', async () => {
    const io = capture()
    const code = await run(['--depth', '1', '--no-copy'], io)
    expect(code).toBe(EXIT_OK)
    expect(io.stdout().split('\n')[0]).toBe('ctx-tree/')
  })
})

describe('run argument errors', () => {
  it('prints help and exits successfully', async () => {
    const io = capture()
    const code = await run(['--help'], io)
    expect(code).toBe(EXIT_OK)
    expect(io.stdout()).toContain('Usage')
    expect(io.stderr()).toBe('')
  })

  it('prints the version', async () => {
    const io = capture()
    const code = await run(['-v'], io)
    expect(code).toBe(EXIT_OK)
    expect(io.stdout().trim()).toBe(VERSION)
  })

  it('rejects an unknown flag with exit 2', async () => {
    const io = capture()
    const code = await run(['--nope'], io)
    expect(code).toBe(EXIT_USAGE)
    expect(io.stderr()).toContain('ctx-tree:')
    expect(io.stdout()).toBe('')
  })

  it('rejects a non-numeric depth', async () => {
    const io = capture()
    expect(await run(['--depth', 'abc'], io)).toBe(EXIT_USAGE)
    expect(io.stderr()).toContain('non-negative integer')
  })

  it('rejects a negative depth', async () => {
    const io = capture()
    expect(await run(['--depth', '-1'], io)).toBe(EXIT_USAGE)
  })

  it('rejects more than one path', async () => {
    const io = capture()
    expect(await run(['a', 'b'], io)).toBe(EXIT_USAGE)
    expect(io.stderr()).toContain('at most one path')
  })

  it('fails on a missing path with exit 1', async () => {
    const io = capture()
    expect(await run(['./definitely-not-here'], io)).toBe(EXIT_FAIL)
    expect(io.stderr()).toContain('cannot read path')
  })

  it('fails when the path is a file', async () => {
    fixture = await makeFixture({ 'a.ts': '' })
    const io = capture()
    expect(await run([`${fixture.root}/a.ts`], io)).toBe(EXIT_FAIL)
    expect(io.stderr()).toContain('not a directory')
  })
})
