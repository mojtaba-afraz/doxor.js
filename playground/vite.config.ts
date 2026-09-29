import { defineConfig } from 'vite'

const source = decodeURIComponent(new URL('../src/index.ts', import.meta.url).pathname)

// The playground imports the library source directly, so it always shows the current main branch.
export default defineConfig({
  base: './',
  resolve: { alias: { 'doxor.js': source } },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
})
