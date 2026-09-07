/**
 * 初回admin作成用CLIスクリプト。
 * 使い方: npm --prefix server run db:seed-admin -- --email=admin@example.com --name="管理者" --password="..."
 *
 * 既に同じメールのユーザーが居る場合は何もせず終了する。開発環境では
 * 「adminは居るがパスワードが分からない」状態になりやすいため、
 * `--reset-password` を付けたときだけパスワードの再設定を許す。
 *
 * オープンな自己登録エンドポイントは持たない設計（§12.2）のため、最初のadminは
 * このスクリプトで一度だけ作成する（Djangoのcreatesuperuser等と同じ役割）。
 *
 * `--role`（任意、既定admin）でロールを指定できる。既定がadminなのは本来の用途
 * （最初の管理者）を変えないため。ペルソナ別E2Eが5ロール分の
 * 利用者を種まきするのに使う。
 */
import { eq } from 'drizzle-orm'
import { hashPassword } from '../auth/password.js'
import { closeDb, db } from '../db/client.js'
import { users } from '../db/schema.js'

const ROLES = ['admin', 'manager', 'editor', 'viewer', 'partner'] as const
type Role = (typeof ROLES)[number]

function parseArgs(): {
  email: string
  name: string
  password: string
  role: Role
  /** 既存ユーザーのパスワードを再設定するか（--reset-password） */
  resetPassword: boolean
} {
  const args = new Map<string, string>()
  let resetPassword = false
  for (const arg of process.argv.slice(2)) {
    if (arg === '--reset-password') {
      resetPassword = true
      continue
    }
    const match = /^--([^=]+)=(.*)$/.exec(arg)
    if (match?.[1] && match[2] !== undefined) {
      args.set(match[1], match[2])
    }
  }
  const email = args.get('email')
  const name = args.get('name')
  const password = args.get('password')
  const role = (args.get('role') ?? 'admin') as Role
  if (!email || !name || !password) {
    console.error(
      '使い方: --email=<メール> --name=<氏名> --password=<8文字以上> [--role=<ロール>] を指定してください',
    )
    process.exit(1)
  }
  if (password.length < 8) {
    console.error('パスワードは8文字以上にしてください')
    process.exit(1)
  }
  if (!ROLES.includes(role)) {
    console.error(`--role は ${ROLES.join(' | ')} のいずれかを指定してください`)
    process.exit(1)
  }
  return { email, name, password, role, resetPassword }
}

async function main() {
  const { email, name, password, role, resetPassword } = parseArgs()

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (existing) {
    // 開発環境では「admin@example.comは居るがパスワードが分からない」状態に
    // なりやすい（作成時のパスワードを控えていない）。明示フラグのときだけ
    // 再設定を許す（何もフラグを付けなければ従来どおり何も変更しない）
    if (!resetPassword) {
      console.error(
        `${email} は既に登録されています（パスワードを設定し直すなら --reset-password を付けてください）`,
      )
      process.exit(1)
    }
    const newHash = await hashPassword(password)
    await db
      .update(users)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(users.id, existing.id))
    console.log('パスワードを再設定しました:', email)
    await closeDb()
    return
  }

  const passwordHash = await hashPassword(password)
  const [created] = await db
    .insert(users)
    .values({
      email,
      name,
      passwordHash,
      role,
      authProvider: 'local',
    })
    .returning({ id: users.id, email: users.email, role: users.role })

  console.log('ユーザーを作成しました:', created)
  await closeDb()
}

main().catch((error) => {
  console.error('ユーザー作成に失敗しました:', error)
  process.exit(1)
})
