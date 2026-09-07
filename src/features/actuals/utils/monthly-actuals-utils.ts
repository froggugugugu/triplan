import type { AssignmentEntry } from '@/shared/types/assignment'
import type { Member } from '@/shared/types/member'
import type { Project } from '@/shared/types/project'

/**
 * 月次実績メンテナンス画面（P1-a）の行モデル構築・状態導出の純関数群。
 * AG Grid系コンポーネントはjsdomでの検証信頼性が低いため、テスト対象のロジックを
 * ここへ集約する（非公開の設計文書）。
 */

/** 実績セルの状態（DESIGN §4.2） */
export type ActualCellStatus = 'planned' | 'overridden' | 'zeroActual'

export interface MonthlyActualsDetailRow {
  kind: 'detail'
  /** AG Grid行ID: assignmentId */
  id: string
  assignmentId: string
  memberId: string
  memberName: string
  projectId: string
  projectLabel: string
  taskId: string
  taskName: string
  /** 対象月の計画値（キー欠落は0） */
  planned: number
  /**
   * 対象月の実績の明示入力値。undefined=キー欠落（計画どおり）。
   * 0は「実働ゼロ」の明示値でありundefinedとは別状態（DESIGN §4.2の核心）
   */
  actual: number | undefined
  /** 表示・集計に使う解決済み実績（actual ?? planned） */
  effectiveActual: number
  /** 実績−計画（解決済み実績ベース） */
  variance: number
  status: ActualCellStatus
}

export interface MonthlyActualsMemberRow {
  kind: 'member'
  /** AG Grid行ID: `member-${memberId}` */
  id: string
  memberId: string
  memberName: string
  role: string
  /** 対象月の解決済み実績合計 */
  actualTotal: number
  /** 対象月の計画合計 */
  plannedTotal: number
  capacityRatio: number
  /** 実績合計が稼働率上限を超えているか（警告表示のみ。ブロックしない） */
  isOverCapacity: boolean
}

export type MonthlyActualsRow =
  | MonthlyActualsMemberRow
  | MonthlyActualsDetailRow

/** 浮動小数点の丸め誤差で稼働超過と誤検知しないための許容誤差（既存規約と同一） */
const CAPACITY_EPSILON = 0.001

export function deriveActualCellStatus(
  actual: number | undefined,
): ActualCellStatus {
  if (actual === undefined) return 'planned'
  if (actual === 0) return 'zeroActual'
  return 'overridden'
}

/**
 * 対象月の行モデルを構築する。
 * 対象行 = 計画（monthlyValues）に対象月の値がある、または実績（actualMonthlyValues）に
 * 対象月の明示入力があるアサイン（計画0×実績なしの行は出さない）。
 * 並びは担当者名→プロジェクトコード→タスク名（決定論的）。
 */
export function buildMonthlyActualsRows(
  month: string,
  assignments: AssignmentEntry[],
  members: Member[],
  projects: Project[],
): MonthlyActualsRow[] {
  const memberById = new Map(members.map((m) => [m.id, m]))
  const projectById = new Map(projects.map((p) => [p.id, p]))

  const details: MonthlyActualsDetailRow[] = []
  for (const a of assignments) {
    const planned = a.monthlyValues[month] ?? 0
    const actual = a.actualMonthlyValues?.[month]
    if (planned === 0 && actual === undefined) continue

    const member = memberById.get(a.memberId)
    if (!member) continue // 削除済みメンバーのアサインは対象外（防御的）
    const task = projectById.get(a.taskId)
    const rootProject = findRootProject(a.projectId, projectById)

    const effectiveActual = actual ?? planned
    details.push({
      kind: 'detail',
      id: a.id,
      assignmentId: a.id,
      memberId: a.memberId,
      memberName: member.name,
      projectId: a.projectId,
      projectLabel: rootProject
        ? `${rootProject.code} ${rootProject.name}`
        : '（不明なプロジェクト）',
      taskId: a.taskId,
      taskName: task?.name ?? '（不明なタスク）',
      planned,
      actual,
      effectiveActual,
      variance: effectiveActual - planned,
      status: deriveActualCellStatus(actual),
    })
  }

  details.sort(
    (a, b) =>
      a.memberName.localeCompare(b.memberName, 'ja') ||
      a.projectLabel.localeCompare(b.projectLabel, 'ja') ||
      a.taskName.localeCompare(b.taskName, 'ja'),
  )

  // 担当者グループ行を挿入する
  const rows: MonthlyActualsRow[] = []
  let currentMemberId: string | null = null
  for (const d of details) {
    if (d.memberId !== currentMemberId) {
      currentMemberId = d.memberId
      const member = memberById.get(d.memberId)
      const memberDetails = details.filter((x) => x.memberId === d.memberId)
      const actualTotal = memberDetails.reduce(
        (sum, x) => sum + x.effectiveActual,
        0,
      )
      const plannedTotal = memberDetails.reduce((sum, x) => sum + x.planned, 0)
      const capacityRatio = member?.capacityRatio ?? 1
      rows.push({
        kind: 'member',
        id: `member-${d.memberId}`,
        memberId: d.memberId,
        memberName: d.memberName,
        role: member?.role ?? '',
        actualTotal,
        plannedTotal,
        capacityRatio,
        isOverCapacity: actualTotal > capacityRatio + CAPACITY_EPSILON,
      })
    }
    rows.push(d)
  }
  return rows
}

/** 進捗サマリー（ヘッダ表示用） */
export interface MonthlyActualsSummary {
  totalRows: number
  plannedRows: number
  overriddenRows: number
}

export function summarizeMonthlyActuals(
  rows: MonthlyActualsRow[],
): MonthlyActualsSummary {
  const details = rows.filter(
    (r): r is MonthlyActualsDetailRow => r.kind === 'detail',
  )
  return {
    totalRows: details.length,
    plannedRows: details.filter((d) => d.status === 'planned').length,
    overriddenRows: details.filter((d) => d.status !== 'planned').length,
  }
}

/** タスクidから親を辿ってトップレベル（level 0）のプロジェクトを求める */
function findRootProject(
  projectId: string,
  projectById: Map<string, Project>,
): Project | undefined {
  let current = projectById.get(projectId)
  let guard = 0
  while (current?.parentId && guard < 10) {
    const parent = projectById.get(current.parentId)
    if (!parent) break
    current = parent
    guard++
  }
  return current
}

/** "YYYY-MM" を1ヶ月進める/戻す */
export function shiftMonthKey(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) return month
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * 既定の対象月（前月）。月初に先月分を確定する実務動線に合わせる（DESIGN §4.3）。
 * 「現在日時」はテスト容易性のため引数注入
 */
export function getDefaultTargetMonth(now: Date): string {
  return shiftMonthKey(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    -1,
  )
}

/** "YYYY-MM" → "YYYY年M月" 表示 */
export function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) return month
  return `${y}年${m}月`
}
