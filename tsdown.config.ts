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
  // Pin the extension so `bin` in package.json stays stable. `.js` is already
  // unambiguous here because the package declares `"type": "module"`.
  outExtensions: () => ({ js: '.js' }),
  // `ignore` lives in devDependencies, so it gets inlined into the bundle.
  // `clipboardy` must stay external: it resolves its fallback binaries
  // (fallbacks/windows/clipboard_*.exe, fallbacks/linux/xsel) relative to
  // `import.meta.url`, which breaks the moment the package is bundled.
  deps: {
    neverBundle: ['clipboardy'],
    // `ignore` is the only thing we expect to inline; anything else showing up
    // here should fail the build rather than silently grow the bundle.
    onlyBundle: ['ignore'],
  },
})
