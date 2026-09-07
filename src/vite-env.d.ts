/// <reference types="vite/client" />

interface ImportMetaEnv {
  // デプロイ時に固定する（決定1: 実行時UIトグルではない）。省略時は'local'
  readonly VITE_STORAGE_MODE?: 'local' | 'postgres'
  // postgresモード時のみ使用。APIサーバーのベースURL
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
