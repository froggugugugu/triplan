import type { AuthenticatedUser } from '../auth/plugin.js'
import type { db } from '../db/client.js'
import { auditLogs } from '../db/schema.js'
import type { FieldChange } from './diff.js'

/**
 * 監査証跡の記録。
 *
 * **業務操作と同一トランザクションで呼ぶ**こと（`db`ではなく`tx`を渡す）。
 * 通知（fire-and-forget）と違い、監査は記録漏れを許容すると証跡として使えないため、
 * 業務INSERT/UPDATEが成功して監査だけ失敗する状態を作らない。
 */

/** `db`とトランザクション（`tx`）の両方を受けるための最小形 */
type Executor = Pick<typeof db, 'insert'>

export interface AuditEntry {
  entity: string
  entityId: string
  action: 'create' | 'update' | 'delete'
  /**
   * create=null（作成値は現レコードを見れば分かる）／
   * update=変更フィールドの差分／delete=削除直前の行全体
   */
  changes?: Record<string, FieldChange> | Record<string, unknown> | null
}

/**
 * 監査ログを追記する。エントリが空なら何もしない
 * （値が変わらなかった更新でログを増やさないため、呼び出し側が空配列を渡しうる）。
 */
export async function recordAudit(
  executor: Executor,
  user: AuthenticatedUser | undefined,
  entries: readonly AuditEntry[],
): Promise<void> {
  if (entries.length === 0) return
  await executor.insert(auditLogs).values(
    entries.map((entry) => ({
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      // usersが削除されても誰の操作か辿れるよう、idとメールの両方を残す
      actorId: user?.id ?? null,
      actorEmail: user?.email ?? null,
      changes: entry.changes ?? null,
    })),
  )
}

/**
 * ルートパス（`/api/projects`）からエンティティ名（`projects`）を導出する。
 * `registerCrudRoutes`の呼び出し側が別途エンティティ名を持たないため、pathから引く。
 */
export function entityNameFromPath(path: string): string {
  return path.replace(/^\/api\//, '')
}
