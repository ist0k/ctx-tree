import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

export interface Fixture {
  readonly root: string
  cleanup(): Promise<void>
}

/**
 * Build a throwaway directory tree from a flat description.
 *
 * Keys ending in `/` become empty directories, everything else becomes a file
 * with the given contents. Parent directories are created automatically.
 */
export async function makeFixture(spec: Record<string, string>): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'ctx-tree-'))

  for (const [key, value] of Object.entries(spec)) {
    const target = path.join(root, key)
    if (key.endsWith('/')) {
      await mkdir(target, { recursive: true })
      continue
    }
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, value, 'utf8')
  }

  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  }
}

/**
 * Create a symlink, reporting whether it worked.
 *
 * Windows refuses symlink creation without Developer Mode or elevation, so
 * tests skip instead of failing when this returns false.
 */
export async function trySymlink(
  target: string,
  linkPath: string,
  type: 'file' | 'dir',
): Promise<boolean> {
  try {
    await symlink(target, linkPath, type === 'dir' ? 'junction' : 'file')
    return true
  } catch {
    return false
  }
}
