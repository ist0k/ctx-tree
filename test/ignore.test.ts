import { describe, expect, it } from 'vitest'
import { Matcher } from '../src/ignore.js'
import { toPosix } from '../src/ignore.js'

function matcher(overrides: Partial<Parameters<typeof Matcher.create>[0]> = {}) {
  return Matcher.create({
    useDefaults: true,
    extraPatterns: [],
    ...overrides,
  })
}

describe('toPosix', () => {
  it('converts windows separators', () => {
    expect(toPosix('src\\lib\\a.ts')).toBe('src/lib/a.ts')
  })

  it('leaves posix paths alone', () => {
    expect(toPosix('src/lib/a.ts')).toBe('src/lib/a.ts')
  })
})

describe('built-in noise list', () => {
  it('hides dependency and build directories', () => {
    const m = matcher()
    expect(m.ignores('node_modules', true)).toBe(true)
    expect(m.ignores('dist', true)).toBe(true)
    expect(m.ignores('coverage', true)).toBe(true)
    expect(m.ignores('__pycache__', true)).toBe(true)
  })

  it('hides nested dependency directories', () => {
    const m = matcher()
    expect(m.ignores('packages/app/node_modules', true)).toBe(true)
  })

  it('keeps bin and obj visible', () => {
    const m = matcher()
    expect(m.ignores('bin', true)).toBe(false)
    expect(m.ignores('obj', true)).toBe(false)
  })

  it('hides lock files but keeps manifests', () => {
    const m = matcher()
    expect(m.ignores('package-lock.json', false)).toBe(true)
    expect(m.ignores('pnpm-lock.yaml', false)).toBe(true)
    expect(m.ignores('package.json', false)).toBe(false)
  })

  it('hides binaries and media', () => {
    const m = matcher()
    expect(m.ignores('assets/logo.png', false)).toBe(true)
    expect(m.ignores('assets/icon.svg', false)).toBe(true)
    expect(m.ignores('app.exe', false)).toBe(true)
    expect(m.ignores('src/main.ts', false)).toBe(false)
  })

  it('can be turned off entirely', () => {
    const m = matcher({ useDefaults: false })
    expect(m.ignores('node_modules', true)).toBe(false)
    expect(m.ignores('dist', true)).toBe(false)
  })
})

describe('directory vs file distinction', () => {
  it('matches a trailing-slash pattern only against directories', () => {
    const m = matcher({ useDefaults: false, extraPatterns: ['logs/'] })
    expect(m.ignores('logs', true)).toBe(true)
    expect(m.ignores('logs', false)).toBe(false)
  })
})

describe('.git', () => {
  it('is always ignored', () => {
    const m = matcher({ useDefaults: false })
    expect(m.ignores('.git', true)).toBe(true)
  })

  it('cannot be resurrected by a negation', () => {
    const m = matcher({ useDefaults: false, extraPatterns: ['!.git'] })
    expect(m.ignores('.git', true)).toBe(true)
  })
})

describe('root .gitignore', () => {
  it('applies its patterns', () => {
    const m = matcher({ useDefaults: false, rootGitignore: 'secret.txt\ndraft/\n' })
    expect(m.ignores('secret.txt', false)).toBe(true)
    expect(m.ignores('draft', true)).toBe(true)
  })

  it('handles CRLF line endings', () => {
    const m = matcher({ useDefaults: false, rootGitignore: 'secret.txt\r\ndraft/\r\n' })
    expect(m.ignores('secret.txt', false)).toBe(true)
    expect(m.ignores('draft', true)).toBe(true)
  })

  it('handles a UTF-8 BOM on the first pattern', () => {
    const m = matcher({ useDefaults: false, rootGitignore: '\uFEFFsecret.txt\n' })
    expect(m.ignores('secret.txt', false)).toBe(true)
  })

  it('skips comments and blank lines', () => {
    const m = matcher({ useDefaults: false, rootGitignore: '# a comment\n\nsecret.txt\n' })
    expect(m.ignores('# a comment', false)).toBe(false)
    expect(m.ignores('secret.txt', false)).toBe(true)
  })

  it('outranks the built-in noise list via negation', () => {
    const m = matcher({ rootGitignore: '!*.svg\n' })
    expect(m.ignores('logo.svg', false)).toBe(false)
    expect(m.ignores('logo.png', false)).toBe(true)
  })

  it('respects root anchoring', () => {
    const m = matcher({ useDefaults: false, rootGitignore: '/build/\n' })
    expect(m.ignores('build', true)).toBe(true)
    expect(m.ignores('packages/app/build', true)).toBe(false)
  })
})

describe('.git/info/exclude', () => {
  it('applies but loses to .gitignore negations', () => {
    const m = matcher({
      useDefaults: false,
      gitInfoExclude: 'notes.md\n',
      rootGitignore: '!notes.md\n',
    })
    expect(m.ignores('notes.md', false)).toBe(false)
  })
})

describe('nested .gitignore', () => {
  it('applies relative to its own directory', () => {
    const m = matcher({ useDefaults: false }).withNested('packages/app', 'local.txt\n')
    expect(m.ignores('packages/app/local.txt', false)).toBe(true)
    expect(m.ignores('local.txt', false)).toBe(false)
    expect(m.ignores('packages/other/local.txt', false)).toBe(false)
  })

  it('can negate a parent rule for its own subtree', () => {
    const m = matcher({ useDefaults: false, rootGitignore: '*.log\n' }).withNested(
      'packages/app',
      '!keep.log\n',
    )
    expect(m.ignores('packages/app/keep.log', false)).toBe(false)
    expect(m.ignores('packages/other/keep.log', false)).toBe(true)
  })

  it('never judges its own base directory', () => {
    const m = matcher({ useDefaults: false }).withNested('packages/app', '*\n')
    expect(m.ignores('packages/app', true)).toBe(false)
  })

  it('loses to --exclude', () => {
    const m = matcher({ useDefaults: false, extraPatterns: ['*.md'] }).withNested(
      'docs',
      '!readme.md\n',
    )
    expect(m.ignores('docs/readme.md', false)).toBe(true)
  })
})

describe('--exclude', () => {
  it('adds patterns on top of everything else', () => {
    const m = matcher({ extraPatterns: ['*.md', 'scratch/'] })
    expect(m.ignores('README.md', false)).toBe(true)
    expect(m.ignores('scratch', true)).toBe(true)
  })

  it('can resurrect something the built-in list hides', () => {
    const m = matcher({ extraPatterns: ['!*.png'] })
    expect(m.ignores('logo.png', false)).toBe(false)
  })
})

describe('test()', () => {
  it('reports which layer and pattern decided', () => {
    const verdict = matcher().test('node_modules', true)
    expect(verdict.ignored).toBe(true)
    expect(verdict.source).toBe('built-in')
    expect(verdict.pattern).toBe('node_modules/')
  })

  it('reports nothing when no rule matched', () => {
    const verdict = matcher().test('src/main.ts', false)
    expect(verdict).toEqual({ ignored: false })
  })
})
