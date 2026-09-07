import type { DataAdapter } from './data-adapter'
import { LocalJsonAdapter } from './local-json-adapter'
import { PostgresApiAdapter } from './postgres-api-adapter'

let cachedAdapter: DataAdapter | null = null

export interface PostgresAdapterConfig {
  /** 現在のアクセストークン（メモリ上のみ保持、useAuthStore.getState().accessToken由来） */
  getAccessToken: () => string | null
  /** 401検出時に1回だけ呼ばれる。trueを返せば新しいアクセストークンでリトライする */
  onUnauthorized: () => Promise<boolean>
}

/**
 * VITE_STORAGE_MODE（デプロイ時固定の環境変数、決定1）を見てアダプタを1つ選択する。
 * main.tsxから起動時に1回だけ呼ばれる想定（ARCH §3.1）。
 *
 * `infrastructure`は`stores`に依存しない（依存方向ルール、docs/development-patterns.md）ため、
 * postgresモードで必要なアクセストークン取得・401時再認証はcomposition root
 * （main.tsx）からDIで渡す。postgresモードでpostgresConfigを渡さずに呼ぶのは
 * 呼び出し側の配線漏れであり、明確なエラーを投げる（§12.4「接続断時のlocalモードへの
 * フォールバックはしない」という設計判断と同じ精神で、無言のフォールバックはしない）。
 */
export function getDataAdapter(
  postgresConfig?: PostgresAdapterConfig,
): DataAdapter {
  if (cachedAdapter) {
    return cachedAdapter
  }
  // RequireAuth.tsxと同じ判定極性（mode !== 'postgres'）にする。VITE_STORAGE_MODEが
  // 未設定・空文字・想定外の値のいずれでも安全にlocalへ倒す（明示的にpostgresを
  // 指定した場合のみpostgresConfigを要求する）
  const mode = import.meta.env.VITE_STORAGE_MODE ?? 'local'
  if (mode !== 'postgres') {
    cachedAdapter = new LocalJsonAdapter()
    return cachedAdapter
  }
  if (!postgresConfig) {
    throw new Error(
      'postgresモードのgetDataAdapter()にはgetAccessToken/onUnauthorizedの指定が必須です（main.tsxでの配線を確認してください）',
    )
  }
  cachedAdapter = new PostgresApiAdapter({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001',
    getAccessToken: postgresConfig.getAccessToken,
    onUnauthorized: postgresConfig.onUnauthorized,
  })
  return cachedAdapter
}

/** テスト用: キャッシュされたアダプタをリセットする */
export function resetDataAdapterForTesting(): void {
  cachedAdapter = null
}
