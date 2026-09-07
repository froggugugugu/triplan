/// <reference types="vitest" />

import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // 重量ベンダーを名前付きチャンクへ分離する（の負債解消）。
        // ルート単位の遅延ロード（App.tsxのReact.lazy）と組み合わせ、初回表示は
        // フレームワークコア＋対象ページのみ、AG Grid/Rechartsは使用ページで初めて読む
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('ag-grid')) return 'vendor-ag-grid'
          if (id.includes('recharts') || id.includes('d3-')) {
            return 'vendor-charts'
          }
          return undefined
        },
      },
    },
    // 既定500KBの警告閾値を1000KBへ引き上げる。残る大チャンクはAG Grid単体
    // （さらなる分割は読み込み順に利点がない）とフレームワークコアのみで、
    // どちらも上記の遅延ロード・分離適用後の値。1000KB超が再出現したら退行として扱う
    chunkSizeWarningLimit: 1000,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    // server/ は独立したpackage.json/依存関係を持つため、ルートのテスト実行対象から除外する
    // （npm workspaces化はしない設計、非公開の設計文書）
    exclude: ['node_modules/**', 'e2e/**', 'e2e-postgres/**', 'server/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // ツール生データの出力先は testreport/ 配下に統一する（.claude/quality-gates.md）
      reportsDirectory: 'testreport/coverage',
      exclude: [
        'node_modules/',
        'src/test/',
        'e2e/',
        'e2e-postgres/',
        'server/',
      ],
    },
  },
})
