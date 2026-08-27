import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  dts: false,
  sourcemap: false,
  treeshake: true,
  // `ignore` lives in devDependencies, so it gets inlined into the bundle.
  // `clipboardy` must stay external: it resolves its fallback binaries
  // (fallbacks/windows/clipboard_*.exe, fallbacks/linux/xsel) relative to
  // `import.meta.url`, which breaks the moment the package is bundled.
  deps: {
    neverBundle: ['clipboardy'],
  },
})
