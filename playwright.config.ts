import { defineConfig, devices } from '@playwright/test'

// 既定は5173（docs/project.md記載のとおり）。他プロジェクトのdevサーバーが5173を
// 使用中の場合、E2E_PORT環境変数で空きポートへ切り替えられる
// （例: E2E_PORT=5273 npx playwright test）。--strictPortにより、指定ポートが
// 使用中なら別アプリへ接続してしまう前にViteの起動自体が失敗する
const port = Number(process.env.E2E_PORT ?? 5173)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
})
