#!/usr/bin/env node
import process from 'node:process'
import { run, type Io } from './run.js'

/**
 * A headless machine without xsel is a normal environment, not a failure, so a
 * clipboard error only softens the status line.
 *
 * `clipboardy` is imported lazily to keep `--help` from paying for it.
 */
const io: Io = {
  out: (text) => void process.stdout.write(text),
  err: (text) => void process.stderr.write(text),
  copy: async (text) => {
    try {
      const { default: clipboard } = await import('clipboardy')
      await clipboard.write(text)
      return true
    } catch {
      return false
    }
  },
}

process.exitCode = await run(process.argv.slice(2), io)
