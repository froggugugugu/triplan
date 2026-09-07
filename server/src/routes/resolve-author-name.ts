import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { users } from '../db/schema.js'

/**
 * 記録の投稿者名を**サーバー側で`req.user`からスタンプ**するための解決関数
 * （クライアント申告は採用しない＝なりすまし防止。monthlyCloseEventsと同じ整理）。
 * usersテーブルの表示名を優先し、見つからなければJWTのemailを使う。
 * 体制メモ・アサインスナップショット・見積スナップショットで共用する。
 */
export async function resolveAuthorName(
  user: { id: string; email: string } | undefined,
): Promise<string | null> {
  if (!user) return null
  const [row] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)
  return row?.name ?? user.email
}

/**
 * timestamp列へISO文字列がそのまま渡ると`value.toISOString is not a function`で500になる
 * （`Create*Schema`がcreatedAt/updatedAtを含む設計のため。projectBaselinesで同じ実バグを
 * 踏んでおり、docs/development-patterns.md §10に記録がある）。
 */
export function toDates(
  data: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  const converted: Record<string, unknown> = { ...data }
  for (const field of fields) {
    const value = converted[field]
    if (typeof value === 'string') converted[field] = new Date(value)
  }
  return converted
}
