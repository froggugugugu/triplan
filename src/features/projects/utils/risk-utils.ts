import type { RiskEntry, RiskLevel, RiskStatus } from '@/shared/types'

/**
 * リスク登録簿の重大度導出と表示順（非公開の設計文書）。
 * すべて純関数。重大度は保存せず`probability`×`impact`から都度導出する
 * （導出値を保存すると評価変更との不整合が生じるため）。
 */

export type RiskSeverity = 'critical' | 'high' | 'medium' | 'low'

/** 重大度の決定論マップ（確率×影響の3×3） */
const SEVERITY_MATRIX: Record<RiskLevel, Record<RiskLevel, RiskSeverity>> = {
  high: { high: 'critical', medium: 'high', low: 'medium' },
  medium: { high: 'high', medium: 'medium', low: 'low' },
  low: { high: 'medium', medium: 'low', low: 'low' },
}

export function deriveRiskSeverity(
  probability: RiskLevel,
  impact: RiskLevel,
): RiskSeverity {
  return SEVERITY_MATRIX[probability][impact]
}

export const RISK_SEVERITY_ORDER: Record<RiskSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

export const RISK_SEVERITY_LABELS: Record<RiskSeverity, string> = {
  critical: '重大',
  high: '高',
  medium: '中',
  low: '低',
}

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  high: '高',
  medium: '中',
  low: '低',
}

export const RISK_STATUS_LABELS: Record<RiskStatus, string> = {
  open: '監視中',
  realized: '顕在化',
  closed: '解消',
}

/** open=0（監視対象が先頭）→ realized=1 → closed=2（決着済みは末尾） */
const STATUS_GROUP_ORDER: Record<RiskStatus, number> = {
  open: 0,
  realized: 1,
  closed: 2,
}

/**
 * 表示順の決定論ソート（入力順に依存しない）:
 * ①open → realized → closed ②重大度（critical→low）
 * ③対応期限昇順（null末尾） ④createdAt昇順 ⑤id
 */
export function sortRiskEntries(entries: readonly RiskEntry[]): RiskEntry[] {
  return [...entries].sort((a, b) => {
    const byStatus = STATUS_GROUP_ORDER[a.status] - STATUS_GROUP_ORDER[b.status]
    if (byStatus !== 0) return byStatus
    const bySeverity =
      RISK_SEVERITY_ORDER[deriveRiskSeverity(a.probability, a.impact)] -
      RISK_SEVERITY_ORDER[deriveRiskSeverity(b.probability, b.impact)]
    if (bySeverity !== 0) return bySeverity
    const aDue = a.dueDate ?? null
    const bDue = b.dueDate ?? null
    if (aDue !== bDue) {
      if (aDue === null) return 1
      if (bDue === null) return -1
      return aDue.localeCompare(bDue)
    }
    const byCreated = a.createdAt.localeCompare(b.createdAt)
    if (byCreated !== 0) return byCreated
    return a.id.localeCompare(b.id)
  })
}
