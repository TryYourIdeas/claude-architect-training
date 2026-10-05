import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  // All specs share one SQLite database, so they run one at a time to keep counters deterministic.
  workers: 1,
  fullyParallel: false,
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    // The chat test expects the assistant to be unconfigured, so the key is blanked for the run.
    env: { DB_PATH: './data/e2e.db', ANTHROPIC_API_KEY: '' },
  },
})
