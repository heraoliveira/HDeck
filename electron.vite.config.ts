import { resolve } from 'node:path'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'electron-vite'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: shared },
    build: {
      externalizeDeps: true,
      rollupOptions: { input: { index: resolve('src/main/index.ts') } },
    },
  },
  preload: {
    resolve: { alias: shared },
    build: {
      // Preload com sandbox: true não aceita ESM; sai em CommonJS (ADR 0011).
      rollupOptions: {
        input: { shell: resolve('src/preload/shell.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: { alias: shared },
    plugins: [svelte()],
    build: { rollupOptions: { input: { index: resolve('src/renderer/index.html') } } },
  },
})
