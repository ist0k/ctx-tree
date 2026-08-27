import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Tests create real temp directories, keep them from stepping on each other.
    fileParallelism: true,
    testTimeout: 20_000,
  },
})
