import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e', testMatch: 'fixedRoles.spec.ts', workers: 1,
  use: { baseURL: 'http://localhost:3527', viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npx tsx src/tests/fixedRoles.test.ts --serve', cwd: './server', url: 'http://127.0.0.1:4327/api/health', timeout: 60000 },
    { command: 'npx vite preview --host 127.0.0.1 --port 3527 --strictPort', url: 'http://localhost:3527/taskwise/', timeout: 60000 },
  ],
})
