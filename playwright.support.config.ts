import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e', testMatch: 'supportAccess.spec.ts', workers: 1,
  use: { baseURL: 'http://localhost:3517', viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npx tsx src/tests/supportAccess.test.ts --serve', cwd: './server', url: 'http://127.0.0.1:4317/api/health', timeout: 60000 },
    { command: 'npx vite preview --host 127.0.0.1 --port 3517 --strictPort', url: 'http://localhost:3517/taskwise/', timeout: 60000 },
  ],
})
