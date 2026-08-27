# ctx-tree

[![npm](https://img.shields.io/npm/v/@lefrui/ctx-tree)](https://www.npmjs.com/package/@lefrui/ctx-tree)
[![ci](https://github.com/ist0k/ctx-tree/actions/workflows/ci.yml/badge.svg)](https://github.com/ist0k/ctx-tree/actions/workflows/ci.yml)

Print a clean project file tree, ready to paste into an LLM chat.

Respects `.gitignore`, skips build noise, copies the result to your clipboard.

```
$ ctx-tree
my-app/
├── .github/
│   └── workflows/
│       └── ci.yml
├── src/
│   ├── lib/
│   │   └── util.ts
│   └── main.ts
├── test/
│   └── main.test.ts
├── .gitignore
├── package.json
├── README.md
└── tsconfig.json
14 files, 5 dirs, 3812 hidden, copied to clipboard
```

`node_modules/`, `dist/`, lock files and binaries are gone. The tree is already
on your clipboard, so the next step is Ctrl+V into the chat.

## Install

```sh
npm install -g @lefrui/ctx-tree
```

Or skip the install:

```sh
npx @lefrui/ctx-tree
```

Either way the command is `ctx-tree`, or `ctxt` for short. The package name is
scoped, the binaries are not.

Needs Node 20 or newer.

## Usage

```
ctx-tree [path] [options]
ctxt [path] [options]          # shorter alias, same thing

  -d, --depth <n>          limit tree depth
  -e, --exclude <pattern>  extra gitignore-style pattern (repeatable)
  -a, --all                only skip .git, show everything else
      --no-default-ignore  skip the built-in noise list
      --no-gitignore       do not read .gitignore files
      --no-copy            do not touch the clipboard
      --ascii              use +-- connectors instead of box drawing
  -q, --quiet              print the status line only
  -h, --help               show this help
  -v, --version            show the version
```

```sh
ctx-tree                      # current directory, copied to clipboard
ctx-tree src --depth 2        # shallow view of one directory
ctx-tree -e "*.test.ts"       # hide test files too
ctx-tree --all --no-copy      # everything except .git, stdout only
ctx-tree > tree.txt           # tree only; status goes to stderr
```

## What gets hidden

Four layers, highest precedence first:

1. `--exclude` patterns from the command line
2. `.gitignore` files, with deeper ones beating shallower ones
3. `.git/info/exclude`
4. a built-in noise list

`.git/` is always skipped and cannot be brought back.

The built-in list covers dependency directories (`node_modules/`, `vendor/`,
`.venv/`), build output (`dist/`, `build/`, `target/`, `.next/`), caches, lock
files, images, fonts, media, archives, compiled artifacts and OS junk.

Because the built-in list sits at the bottom, a project can override it. Adding
`!*.svg` to `.gitignore` brings SVG files back into the tree. Same effect
ad-hoc:

```sh
ctx-tree -e "!*.svg"
```

`bin/` and `obj/` are deliberately *not* in the list. They only mean "build
output" in .NET, where `.gitignore` already covers them, and elsewhere `bin/` is
usually hand-written scripts worth seeing.

One gitignore rule worth remembering: a file inside an ignored directory cannot
be un-ignored. If `build/` is excluded then `!build/keep.txt` does nothing —
that is how git behaves too. Use `--all` or `--no-default-ignore` instead.

## Details

Hidden files like `.github/` and `.env.example` are shown by default; they are
real context. Editor directories such as `.vscode/` are filtered by the noise
list, not by a blanket dotfile rule.

Directories carry a trailing `/` so nothing has to be guessed. Sorting is
directories first, then natural order pinned to the `en` locale, so output is
identical across machines.

`--depth` marks what it cut with `…`, rather than leaving a directory looking
empty:

```
├── src/
│   └── …
```

Symlinks are annotated with `->` and never followed, so no cycle can hang the
walk. Unreadable directories are reported on stderr and do not abort the run.

The tree goes to stdout; the status line, warnings and errors go to stderr. A
missing clipboard (headless Linux without `xsel`, for example) is not a failure:
the tree still prints and the exit code stays 0.

Exit codes: `0` success, `1` runtime failure, `2` bad usage.

## License

MIT
