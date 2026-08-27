import type { TreeNode } from './walk.js'

export interface RenderOptions {
  /** Use `+--` style connectors instead of box-drawing characters. */
  readonly ascii: boolean
}

interface Glyphs {
  readonly tee: string
  readonly elbow: string
  readonly pipe: string
  readonly space: string
  readonly more: string
}

const UNICODE: Glyphs = {
  tee: '├── ',
  elbow: '└── ',
  pipe: '│   ',
  space: '    ',
  more: '…',
}

const ASCII: Glyphs = {
  tee: '+-- ',
  elbow: '`-- ',
  pipe: '|   ',
  space: '    ',
  more: '...',
}

/**
 * Render a tree as text.
 *
 * The first line is the root directory name with a trailing slash, so the
 * pasted block carries its own context. Directories keep the trailing slash
 * too — an LLM should not have to guess whether `docs` is a file.
 */
export function render(root: TreeNode, options: RenderOptions): string {
  const glyphs = options.ascii ? ASCII : UNICODE
  const lines: string[] = [`${root.name}/`]

  const walkChildren = (node: TreeNode, prefix: string): void => {
    const { children } = node
    for (const [index, child] of children.entries()) {
      const last = index === children.length - 1
      lines.push(`${prefix}${last ? glyphs.elbow : glyphs.tee}${label(child)}`)

      if (child.isDir) {
        const nextPrefix = `${prefix}${last ? glyphs.space : glyphs.pipe}`
        if (child.truncated) {
          // Show that the subtree was cut by --depth rather than empty.
          lines.push(`${nextPrefix}${glyphs.elbow}${glyphs.more}`)
        } else {
          walkChildren(child, nextPrefix)
        }
      }
    }
  }

  if (root.truncated) {
    lines.push(`${glyphs.elbow}${glyphs.more}`)
  } else {
    walkChildren(root, '')
  }

  return lines.join('\n')
}

function label(node: TreeNode): string {
  const name = node.isDir ? `${node.name}/` : node.name
  return node.linkTarget === undefined ? name : `${name} -> ${node.linkTarget}`
}
