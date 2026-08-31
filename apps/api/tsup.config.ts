import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts'],
  format: 'esm',
  target: 'node20',
  clean: true,
  sourcemap: true,
  // workspace packages ship raw .ts (main: src/index.ts) — bundle them or node chokes on the .ts import
  noExternal: [/^@apti\//],
  // ...but nothing else: bundling CJS deps (pg, prisma) into ESM breaks their require()
  external: [/^[^.]/],
})
