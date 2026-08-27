import { describe, expect, it } from 'vitest'
import { render } from '../src/render.js'
import { sortNodes, type TreeNode } from '../src/walk.js'

function dir(name: string, children: TreeNode[] = [], truncated = false): TreeNode {
  return { name, relPath: name, isDir: true, children, truncated }
}

function file(name: string, linkTarget?: string): TreeNode {
  return { name, relPath: name, isDir: false, children: [], truncated: false, linkTarget }
}

const sample = dir('root', [
  dir('src', [file('main.ts'), file('util.ts')]),
  dir('empty'),
  file('package.json'),
])

describe('render', () => {
  it('draws box-drawing connectors by default', () => {
    expect(render(sample, { ascii: false })).toBe(
      [
        'root/',
        '├── src/',
        '│   ├── main.ts',
        '│   └── util.ts',
        '├── empty/',
        '└── package.json',
      ].join('\n'),
    )
  })

  it('draws ascii connectors when asked', () => {
    expect(render(sample, { ascii: true })).toBe(
      [
        'root/',
        '+-- src/',
        '|   +-- main.ts',
        '|   `-- util.ts',
        '+-- empty/',
        '`-- package.json',
      ].join('\n'),
    )
  })

  it('keeps the vertical bar for deep siblings', () => {
    const tree = dir('root', [dir('a', [dir('b', [file('c.ts')])]), file('d.ts')])
    expect(render(tree, { ascii: false })).toBe(
      ['root/', '├── a/', '│   └── b/', '│       └── c.ts', '└── d.ts'].join('\n'),
    )
  })

  it('marks truncated directories', () => {
    const tree = dir('root', [dir('src', [], true), file('a.ts')])
    expect(render(tree, { ascii: false })).toBe(
      ['root/', '├── src/', '│   └── …', '└── a.ts'].join('\n'),
    )
  })

  it('uses an ascii ellipsis in ascii mode', () => {
    const tree = dir('root', [dir('src', [], true)])
    expect(render(tree, { ascii: true })).toBe(['root/', '`-- src/', '    `-- ...'].join('\n'))
  })

  it('renders a truncated root', () => {
    const tree = dir('root', [], true)
    expect(render(tree, { ascii: false })).toBe(['root/', '└── …'].join('\n'))
  })

  it('renders an empty root', () => {
    expect(render(dir('root'), { ascii: false })).toBe('root/')
  })

  it('annotates symlinks', () => {
    const tree = dir('root', [file('link.ts', 'real.ts')])
    expect(render(tree, { ascii: false })).toBe(['root/', '└── link.ts -> real.ts'].join('\n'))
  })

  it('appends a slash to directories only', () => {
    const tree = dir('root', [dir('docs'), file('docs.md')])
    const lines = render(tree, { ascii: false }).split('\n')
    expect(lines[1]).toBe('├── docs/')
    expect(lines[2]).toBe('└── docs.md')
  })
})

describe('sortNodes', () => {
  it('puts directories before files', () => {
    const nodes = [file('a.ts'), dir('z')]
    sortNodes(nodes)
    expect(nodes.map((n) => n.name)).toEqual(['z', 'a.ts'])
  })

  it('sorts numerically', () => {
    const nodes = [file('a10'), file('a2'), file('a1')]
    sortNodes(nodes)
    expect(nodes.map((n) => n.name)).toEqual(['a1', 'a2', 'a10'])
  })

  it('ignores case', () => {
    const nodes = [file('b'), file('A'), file('a')]
    sortNodes(nodes)
    expect(nodes.map((n) => n.name)[2]).toBe('b')
  })
})
