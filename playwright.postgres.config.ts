import { defineConfig, devices } from '@playwright/test'
import { E2E_PG_ENV } from './e2e-postgres/global-setup'

/**
 * postgresモードのブラウザE2E（第5〜6回評価の負債解消）。
 * localモードのE2E（playwright.config.ts）とは独立に、使い捨てDB＋実APIサーバー＋
 * VITE_STORAGE_MODE=postgresのViteを起動して、ログイン〜CRUD〜リロード永続化の
 * ブラウザ経路を検証する。実行: `npm run e2e:postgres`（Docker必須）
 */
export default defineConfig({
  testDir: './e2e-postgres',
  testMatch: '**/*.spec.ts',
  globalSetup: './e2e-postgres/global-setup.ts',
  globalTeardown: './e2e-postgres/global-teardown.ts',
  timeout: 60000,
  // 単一DBを共有するためワーカーは1（テスト間のデータ独立性より基盤の単純さを優先）
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'testreport/e2e-postgres' }]],
  use: {
    baseURL: 'http://localhost:5373',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npx tsx src/index.ts',
      cwd: './server',
      url: 'http://localhost:3101/api/health',
      reuseExistingServer: false,
      timeout: 60000,
      env: E2E_PG_ENV,
    },
    {
      command: 'npx vite --port 5373 --strictPort',
      url: 'http://localhost:5373',
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        VITE_STORAGE_MODE: 'postgres',
        VITE_API_BASE_URL: 'http://localhost:3101',
      },
    },
  ],
})
