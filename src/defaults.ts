/**
 * Built-in noise patterns, applied on top of `.gitignore`.
 *
 * Written in gitignore syntax and fed to the `ignore` package, so brace
 * expansion (`*.{png,jpg}`) is NOT available — git does not support it either.
 * Every extension has to be spelled out.
 *
 * Deliberately absent: `bin/` and `obj/`. They only mean "build output" in the
 * .NET world, and every real .NET project already lists them in `.gitignore`.
 * Elsewhere `bin/` is often hand-written scripts worth showing.
 */

/** Editors and non-git VCS metadata. */
const EDITOR: readonly string[] = [
  '.svn/',
  '.hg/',
  '.idea/',
  '.vs/',
  '.vscode/',
  '*.user',
  '*.suo',
  '*.userosscache',
  '*.sln.docstates',
  '*.swp',
  '*.swo',
  '*~',
]

/** Dependency directories and build output. */
const BUILD: readonly string[] = [
  'node_modules/',
  'bower_components/',
  'jspm_packages/',
  'vendor/',
  'dist/',
  'build/',
  'out/',
  'target/',
  '.next/',
  '.nuxt/',
  '.svelte-kit/',
  '.astro/',
  '.output/',
  '.vercel/',
  '.netlify/',
  '.turbo/',
  '.parcel-cache/',
  '.cache/',
  'coverage/',
  '.nyc_output/',
  '__pycache__/',
  '*.pyc',
  '*.pyo',
  '.pytest_cache/',
  '.mypy_cache/',
  '.ruff_cache/',
  '.venv/',
  'venv/',
  '.tox/',
  '*.egg-info/',
  '.gradle/',
  '.dart_tool/',
  'Pods/',
]

/** Lock files: huge, zero signal for structural context. */
const LOCKS: readonly string[] = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'bun.lock',
  'composer.lock',
  'Gemfile.lock',
  'poetry.lock',
  'uv.lock',
  'Cargo.lock',
  'go.sum',
]

/** Images, fonts, media, archives, compiled artifacts. */
const BINARY: readonly string[] = [
  // images
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.bmp',
  '*.tiff',
  '*.ico',
  '*.icns',
  '*.webp',
  '*.avif',
  '*.svg',
  '*.psd',
  '*.ai',
  // media
  '*.mp4',
  '*.webm',
  '*.mov',
  '*.avi',
  '*.mkv',
  '*.mp3',
  '*.wav',
  '*.ogg',
  '*.flac',
  // documents and archives
  '*.pdf',
  '*.zip',
  '*.tar',
  '*.gz',
  '*.tgz',
  '*.bz2',
  '*.xz',
  '*.7z',
  '*.rar',
  '*.jar',
  '*.war',
  // compiled artifacts
  '*.exe',
  '*.dll',
  '*.pdb',
  '*.so',
  '*.dylib',
  '*.o',
  '*.a',
  '*.lib',
  '*.obj',
  '*.class',
  '*.wasm',
  '*.node',
  // fonts
  '*.woff',
  '*.woff2',
  '*.ttf',
  '*.otf',
  '*.eot',
  // data blobs
  '*.sqlite',
  '*.sqlite3',
  '*.db',
  '*.mo',
]

/** OS junk, logs, scratch directories. */
const JUNK: readonly string[] = [
  '.DS_Store',
  '.AppleDouble',
  '.LSOverride',
  'Thumbs.db',
  'ehthumbs.db',
  'desktop.ini',
  '$RECYCLE.BIN/',
  '*.log',
  'logs/',
  'tmp/',
  'temp/',
  '.tmp/',
  '*.tmp',
  '*.bak',
  '*.orig',
  '*.rej',
]

/** The full built-in noise list, in gitignore syntax. */
export const DEFAULT_IGNORE: readonly string[] = [
  ...EDITOR,
  ...BUILD,
  ...LOCKS,
  ...BINARY,
  ...JUNK,
]

/** Always skipped, regardless of flags. Walking `.git/` is never useful. */
export const ALWAYS_IGNORE: readonly string[] = ['.git/']
