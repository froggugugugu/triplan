import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // tsconfig.jsonの`paths: { "@/*": ["../src/*"] }`はtscとtsx（起動スクリプト）は
    // 自動解決するが、Vitestは独自のViteベース解決を使うため明示的なaliasが必要
    // （実際にVitest実行時に`Cannot find package '@/shared/types'`で発覚）
    alias: {
      '@': fileURLToPath(new URL('../src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // server/自身のテストのみを対象にする（../src/shared/配下のクライアント側テストや
    // ビルド成果物dist/を誤って拾わないようにする）
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_ACCESS_SECRET: 'test-access-secret-at-least-16-chars',
      JWT_REFRESH_PEPPER: 'test-refresh-pepper-at-least-16',
      JWT_ACCESS_TTL_MIN: '15',
      JWT_REFRESH_TTL_DAYS: '30',
      CORS_ORIGIN: 'http://localhost:5173',
      SSO_ENCRYPTION_KEY:
        'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
    },
  },
})
