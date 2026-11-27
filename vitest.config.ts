import { resolve } from 'node:path'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

const alias = { '@shared': resolve('src/shared') }

export default defineConfig({
  resolve: { alias },
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/main/nucleo/**/*.ts', 'src/shared/**/*.ts'],
      exclude: ['src/main/nucleo/portas.ts', 'src/shared/**/tipos*.ts'],
      thresholds: { lines: 90, branches: 90 },
      reporter: ['text-summary', 'json-summary'],
    },
    projects: [
      {
        resolve: { alias },
        test: { name: 'unidade', include: ['tests/unidade/**/*.test.ts'], environment: 'node' },
      },
      {
        resolve: { alias },
        test: { name: 'integracao', include: ['tests/integracao/**/*.test.ts'], environment: 'node' },
      },
      {
        resolve: { alias, conditions: ['browser'] },
        plugins: [svelte()],
        test: { name: 'componentes', include: ['tests/componentes/**/*.test.ts'], environment: 'happy-dom' },
      },
    ],
  },
})
