import { readdir, readFile, readlink, stat } from 'node:fs/promises'
import path from 'node:path'
import type { Matcher } from './ignore.js'
import { toPosix } from './ignore.js'

export interface TreeNode {
  /** Base name as it appears on disk. */
  readonly name: string
  /** Posix path relative to the walk root. `''` for the root node. */
  readonly relPath: string
  readonly isDir: boolean
  /** Raw symlink target, set only for symlinks. */
  readonly linkTarget?: string | undefined
  /** Children, sorted. Always empty for files. */
  children: TreeNode[]
  /** True when `--depth` stopped us from listing this directory's contents. */
  truncated: boolean
}

export interface WalkOptions {
  readonly root: string
  /** Maximum depth of listed entries; `undefined` means unlimited. */
  readonly maxDepth?: number | undefined
  /** Whether to pick up nested `.gitignore` files while descending. */
  readonly readGitignore: boolean
  readonly matcher: Matcher
}

export interface WalkError {
  readonly relPath: string
  readonly code: string
}

export interface WalkResult {
  readonly root: TreeNode
  readonly files: number
  readonly dirs: number
  /** Number of entries hidden by ignore rules. */
  readonly ignored: number
  /** Unreadable directories, collected rather than thrown. */
  readonly errors: readonly WalkError[]
}

/** Warn past this many visible entries — usually a sign of a wrong path argument. */
export const LARGE_TREE_THRESHOLD = 20_000

/**
 * Walk a directory tree, pruning anything the matcher ignores.
 *
 * Pruning is what keeps this fast: an ignored `node_modules/` costs a single
 * `readdir` entry instead of a hundred thousand.
 */
export async function walk(options: WalkOptions): Promise<WalkResult> {
  const { root, maxDepth, readGitignore } = options
  const errors: WalkError[] = []
  let files = 0
  let dirs = 0
  let ignored = 0

  const rootNode: TreeNode = {
    name: path.basename(root) || root,
    relPath: '',
    isDir: true,
    children: [],
    truncated: false,
  }

  async function visit(
    node: TreeNode,
    absDir: string,
    depth: number,
    matcher: Matcher,
  ): Promise<void> {
    if (maxDepth !== undefined && depth > maxDepth) {
      // Flag it so the renderer can show the cut, instead of letting the
      // directory read as empty.
      node.truncated = true
      return
    }

    let entries
    try {
      entries = await readdir(absDir, { withFileTypes: true })
    } catch (error) {
      errors.push({ relPath: node.relPath, code: errorCode(error) })
      return
    }

    let localMatcher = matcher
    if (readGitignore && node.relPath !== '') {
      const nested = await readIfPresent(path.join(absDir, '.gitignore'))
      if (nested !== undefined) {
        localMatcher = matcher.withNested(node.relPath, nested)
      }
    }

    const descend: { node: TreeNode; abs: string }[] = []

    for (const entry of entries) {
      const abs = path.join(absDir, entry.name)
      const isSymlink = entry.isSymbolicLink()
      // Resolve symlinks only to choose the right glyph and the right ignore
      // semantics; we never descend into them, so no loop detection is needed.
      const isDir = isSymlink ? await isDirectory(abs) : entry.isDirectory()

      const relPath = node.relPath === '' ? entry.name : `${node.relPath}/${entry.name}`
      const posixRel = toPosix(relPath)

      if (localMatcher.ignores(posixRel, isDir)) {
        ignored += 1
        continue
      }

      const child: TreeNode = {
        name: entry.name,
        relPath: posixRel,
        isDir,
        children: [],
        truncated: false,
        linkTarget: isSymlink ? await readLinkTarget(abs) : undefined,
      }

      node.children.push(child)

      if (isDir) {
        dirs += 1
        if (!isSymlink) descend.push({ node: child, abs })
      } else {
        files += 1
      }
    }

    sortNodes(node.children)

    for (const item of descend) {
      await visit(item.node, item.abs, depth + 1, localMatcher)
    }
  }

  await visit(rootNode, root, 1, options.matcher)

  return { root: rootNode, files, dirs, ignored, errors }
}

/**
 * Directories first, then case-insensitive natural order.
 *
 * The locale is pinned to `en` deliberately: relying on the system locale would
 * make output, and therefore snapshot tests, differ between machines.
 */
export function sortNodes(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' })
  })
}

function errorCode(error: unknown): string {
  if (error !== null && typeof error === 'object' && 'code' in error) {
    return String((error as { code: unknown }).code)
  }
  return 'UNKNOWN'
}

async function isDirectory(absPath: string): Promise<boolean> {
  try {
    const info = await stat(absPath)
    return info.isDirectory()
  } catch {
    // Broken symlink. Treat it as a file so it still shows up in the tree.
    return false
  }
}

async function readLinkTarget(absPath: string): Promise<string | undefined> {
  try {
    return toPosix(await readlink(absPath))
  } catch {
    return undefined
  }
}

async function readIfPresent(absPath: string): Promise<string | undefined> {
  try {
    return await readFile(absPath, 'utf8')
  } catch {
    return undefined
  }
}
