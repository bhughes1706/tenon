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
  // Copy SQL migration files into dist/ so the deployed tarball (dist/) is self-contained.
  onSuccess: 'mkdir -p dist/migrations && cp migrations/* dist/migrations/',
})
