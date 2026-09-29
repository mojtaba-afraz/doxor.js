import { defineConfig } from 'vite'

const source = decodeURIComponent(new URL('../src/index.ts', import.meta.url).pathname)

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      'doxor.js': source,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
})
