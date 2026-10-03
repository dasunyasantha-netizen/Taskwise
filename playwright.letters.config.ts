import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e', testMatch: 'letterThread.spec.ts', workers: 1,
  use: { baseURL: 'http://localhost:3529', serviceWorkers: 'block', trace: 'retain-on-failure' },
  webServer: { command: 'npx vite preview --host 127.0.0.1 --port 3529 --strictPort', url: 'http://localhost:3529/taskwise/', timeout: 60000 },
})
