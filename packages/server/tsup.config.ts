import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  // Bundle @tenon/core into the output so the target server is self-contained.
  // Native modules (better-sqlite3, sharp) stay external — they're installed on the target.
  noExternal: ['@tenon/core'],
})
