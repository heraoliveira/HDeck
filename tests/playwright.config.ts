import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 5 * 60_000,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  outputDir: '../test-results',
  use: { trace: 'off', video: 'retain-on-failure' },
  projects: [
    { name: 'provas', testMatch: 'provas/**/*.spec.ts', timeout: 30 * 60_000 },
    { name: 'seguranca', testMatch: 'seguranca/**/*.spec.ts' },
    { name: 'e2e', testMatch: 'e2e/**/*.spec.ts' },
  ],
})
