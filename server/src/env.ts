import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1, 'DATABASE_URLは必須です'),
  JWT_ACCESS_SECRET: z
    .string()
    .min(16, 'JWT_ACCESS_SECRETは16文字以上にしてください'),
  JWT_REFRESH_PEPPER: z
    .string()
    .min(16, 'JWT_REFRESH_PEPPERは16文字以上にしてください'),
  JWT_ACCESS_TTL_MIN: z.coerce.number().int().positive().default(15),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  // 外部完了同期Webhookの認証シークレット（Phase 2）。
  // 外部ツールのWebhook設定URLに ?secret=<この値> として埋め込む。
  // 未設定時は受信エンドポイント自体が無効（全て401）＝消極的な機能有効化
  TASK_WEBHOOK_SECRET: z.string().min(16).optional(),
  // AsanaアダプタのAPIフェッチ用アクセストークン（イベント通知にタスク詳細が
  // 載らないため受信後にAsana APIへ取りに行く。未設定時はasanaソースを無効化）
  ASANA_ACCESS_TOKEN: z.string().min(1).optional(),
  // BacklogのWebhook受信で「完了」とみなす状態名（カンマ区切り、既定「完了」）。
  // Backlogの状態名は言語・カスタム設定依存のため、カスタム完了状態を使う組織向け
  TASK_WEBHOOK_BACKLOG_DONE_STATUSES: z.string().min(1).optional(),
  // 日次ダイジェストの送信時刻（"HH:MM"、サーバーローカル時刻）。
  // 未設定時は内蔵スケジューラ自体が無効（手動送信APIは常に使える）＝消極的な機能有効化
  NOTIFY_DIGEST_TIME: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'NOTIFY_DIGEST_TIMEはHH:MM形式')
    .optional(),
  // SSOプロバイダのclientSecretをAES-256-GCMで暗号化する鍵（64文字の16進数=32バイト）。
  // openssl rand -hex 32 で生成する
  SSO_ENCRYPTION_KEY: z
    .string()
    .regex(
      /^[0-9a-fA-F]{64}$/,
      'SSO_ENCRYPTION_KEYは64文字の16進数にしてください（openssl rand -hex 32）',
    ),
})

// 起動時にfail-fastさせる（不正な環境変数のままサーバーを起動させない）
const parsed = envSchema.safeParse(process.env)
if (!parsed.success) {
  console.error('環境変数の検証に失敗しました:')
  console.error(parsed.error.format())
  process.exit(1)
}

export const env = parsed.data
