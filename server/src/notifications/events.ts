import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { projects } from '../db/schema.js'
import { dispatchNotification } from './dispatch.js'
import type { NotificationMessage } from './message.js'

/**
 * 即時イベント通知（非公開の設計文書）。
 * サーバー側で確実に捕捉できる状態変化（月次締め・CR承認/却下）のみを対象にする。
 *
 * - fire-and-forget: 通知の遅延・失敗が業務処理（締めPOST・CR PATCH）のレスポンスを
 *   ブロック・失敗させないよう、呼び出し元はawaitしない（dispatch側が全例外を握る）
 * - 文面に具体的な金額を含めない（決定事項7: 件数・案件名・重大度まで。詳細はツールで見る）
 */

interface MonthlyCloseEventLike {
  month?: unknown
  action?: unknown
  actorName?: unknown
  reason?: unknown
}

/** 月次締め/解除イベントの通知文面（純関数、テスト用にエクスポート） */
export function buildMonthlyCloseMessage(
  event: MonthlyCloseEventLike,
): NotificationMessage {
  const month = String(event.month ?? '')
  const isClose = event.action === 'close'
  const lines: string[] = []
  if (typeof event.actorName === 'string' && event.actorName) {
    lines.push(`実行: ${event.actorName}`)
  }
  if (typeof event.reason === 'string' && event.reason) {
    lines.push(`理由: ${event.reason}`)
  }
  return {
    title: isClose ? `${month}を締めました` : `${month}の締めを解除しました`,
    // 解除（reopen）は締め済みの巻き戻しであり注意喚起の度合いが高い
    severity: isClose ? 'info' : 'warning',
    lines,
  }
}

interface ChangeRequestLike {
  title?: unknown
  status?: unknown
  newDueDate?: unknown
}

/** CR承認/却下の通知文面（純関数、テスト用にエクスポート）。金額は含めない */
export function buildChangeRequestDecisionMessage(
  changeRequest: ChangeRequestLike,
  projectName: string | null,
): NotificationMessage {
  const approved = changeRequest.status === 'approved'
  const lines: string[] = []
  if (projectName) lines.push(`プロジェクト: ${projectName}`)
  if (
    approved &&
    typeof changeRequest.newDueDate === 'string' &&
    changeRequest.newDueDate
  ) {
    lines.push(`新納期: ${changeRequest.newDueDate}`)
  }
  return {
    title: `変更要求を${approved ? '承認' : '却下'}: ${String(changeRequest.title ?? '')}`,
    severity: 'info',
    lines,
  }
}

/** 月次締めイベントのafterCreateから呼ぶ。awaitしない（fire-and-forget） */
export function fireMonthlyCloseNotification(
  row: Record<string, unknown>,
): void {
  void dispatchNotification('event', buildMonthlyCloseMessage(row))
}

/**
 * changeRequestsのafterUpdateから呼ぶ。pending→approved/rejectedの遷移時のみ通知する
 * （同一statusへの再PATCHや他フィールドの編集では再通知しない）。awaitしない
 */
export function fireChangeRequestNotification(
  updated: Record<string, unknown>,
  previous: Record<string, unknown> | undefined,
): void {
  const decided = updated.status === 'approved' || updated.status === 'rejected'
  if (!decided || previous?.status !== 'pending') return
  void (async () => {
    let projectName: string | null = null
    try {
      if (typeof updated.projectId === 'string') {
        const [project] = await db
          .select({ name: projects.name })
          .from(projects)
          .where(eq(projects.id, updated.projectId))
          .limit(1)
        projectName = project?.name ?? null
      }
    } catch {
      // プロジェクト名の解決失敗は通知自体を止めない（名前なしで送る）
    }
    await dispatchNotification(
      'event',
      buildChangeRequestDecisionMessage(updated, projectName),
    )
  })()
}
