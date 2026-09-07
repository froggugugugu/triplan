import type { ProjectBaseline } from '@/shared/types/project-baseline'
import { isContractRenewalWarning } from '@/shared/utils/budget-utils'
import { getActiveBaseline, isBaselineStale } from '@/shared/utils/evm-utils'
import { formatDateOnly } from '@/shared/utils/iso-week-utils'
import { isProjectBudgetOverrun } from '@/shared/utils/profitability-utils'

/**
 * アラートセンター（非公開の設計文書）のコアロジック。
 * 既存の散在する警告判定（SaaS更新・予算超過・ベースライン乖離）を1箇所に集約し、
 * 新規の判定（納期超過・遅延予測・稼働超過）を加えて重大度順に提示する。
 *
 * すべて純粋関数。判定に「現在日時」を使うものは必ず引数で受け取る
 * （テストから固定日を注入できるようにするため。development-patterns.md §10）。
 */

export type AlertSeverity = 'critical' | 'warning' | 'info'

export interface AppAlert {
  /** Reactのkey・重複排除用の一意キー（判定種別＋対象IDで構成） */
  key: string
  severity: AlertSeverity
  /** 分類ラベル（納期／予算／要員／EVM／SaaS 等） */
  category: string
  message: string
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

/** 重大度順（critical → warning → info）に並べ替える。同一重大度内は安定順 */
export function sortAlerts(alerts: AppAlert[]): AppAlert[] {
  return [...alerts].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  )
}

function parseDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function daysBetweenLocal(fromStr: string, toStr: string): number {
  const from = parseDateOnly(fromStr)
  const to = parseDateOnly(toStr)
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY)
}

function addDaysLocal(dateStr: string, days: number): string {
  const date = parseDateOnly(dateStr)
  date.setDate(date.getDate() + days)
  return formatDateOnly(date)
}

export interface DueDateAlertInput {
  id: string
  name: string
  /** 契約上のマスター納期（YYYY-MM-DD）。nullの案件は判定対象外 */
  masterDueDate: string | null | undefined
  status: 'not_started' | 'active' | 'completed'
  /** スケジュールの全体開始日（YYYY-MM-DD）。無い案件は遅延予測を行わない */
  scheduleStart: string | null
  /** 現在の進捗率（0.0〜1.0）。工数加重ロールアップまたは週次手入力の解決値 */
  progressRate: number
}

/**
 * マスター納期に対する超過・遅延リスクを判定する。
 *
 * - 納期超過（critical）: 今日がマスター納期を過ぎているのに完了していない
 * - 遅延予測（warning）: 進捗の線形予測で完了日が納期を超える見込み。
 *   予測完了日 = 開始日 + ceil(経過日数 ÷ 進捗率)。進捗率が0（未着手・予測不能）の
 *   場合は予測しない（開始直後の案件が常に警告になる誤報を避ける）
 */
export function collectDueDateAlerts(
  projects: DueDateAlertInput[],
  today: string,
): AppAlert[] {
  const alerts: AppAlert[] = []
  for (const project of projects) {
    if (!project.masterDueDate) continue
    if (project.status === 'completed') continue

    if (project.masterDueDate < today) {
      alerts.push({
        key: `due-overdue-${project.id}`,
        severity: 'critical',
        category: '納期',
        message: `「${project.name}」がマスター納期（${project.masterDueDate}）を超過しています`,
      })
      continue
    }

    if (!project.scheduleStart) continue
    if (project.progressRate <= 0 || project.progressRate >= 1) continue
    const elapsed = daysBetweenLocal(project.scheduleStart, today) + 1
    if (elapsed <= 0) continue
    const predictedTotalDays = Math.ceil(elapsed / project.progressRate)
    const predictedEnd = addDaysLocal(
      project.scheduleStart,
      predictedTotalDays - 1,
    )
    if (predictedEnd > project.masterDueDate) {
      alerts.push({
        key: `due-forecast-${project.id}`,
        severity: 'warning',
        category: '納期',
        message: `「${project.name}」は現在の進捗ペースだと完了見込みが${predictedEnd}となり、マスター納期（${project.masterDueDate}）を超える見込みです`,
      })
    }
  }
  return alerts
}

export interface CapacityAlertMemberInput {
  id: string
  name: string
  capacityRatio?: number
}

/** 稼働率上限の比較で浮動小数点の丸め誤差を吸収する許容値（assignment-utilsのisOverCapacityと同一基準） */
const CAPACITY_EPSILON = 1e-9

/**
 * メンバーごとの月次アサイン合計が稼働率上限（capacityRatio、未設定=1.0）を超えている月を
 * 検出する。超過月が複数ある場合は1メンバー1アラートにまとめる。
 */
export function collectCapacityAlerts(
  members: CapacityAlertMemberInput[],
  assignments: { memberId: string; monthlyValues: Record<string, number> }[],
  monthKeys: string[],
): AppAlert[] {
  const alerts: AppAlert[] = []
  for (const member of members) {
    const capacity = member.capacityRatio ?? 1
    const exceededMonths: string[] = []
    for (const month of monthKeys) {
      let total = 0
      for (const assignment of assignments) {
        if (assignment.memberId !== member.id) continue
        total += assignment.monthlyValues[month] ?? 0
      }
      if (total > capacity + CAPACITY_EPSILON) {
        exceededMonths.push(month)
      }
    }
    if (exceededMonths.length > 0) {
      alerts.push({
        key: `capacity-${member.id}`,
        severity: 'warning',
        category: '要員',
        message: `${member.name}のアサイン合計が稼働率上限（${capacity.toFixed(2)}）を超えています（${exceededMonths.join('、')}）`,
      })
    }
  }
  return alerts
}

export interface BaselineStaleAlertInput {
  projectId: string
  name: string
  /** 現行BAC（WBS工数×概算単価×係数） */
  currentBac: number
}

/**
 * 現行BACと有効ベースラインのBACが乖離している案件を検出する（再ベースラインの促進、
 * 非公開の設計文書）。未凍結の案件は対象外（isBaselineStaleに準拠）。
 */
export function collectBaselineStaleAlerts(
  projects: BaselineStaleAlertInput[],
  baselines: ProjectBaseline[],
  // 乖離閾値（比率）。省略時は従来の固定値0.1=±10%（P0-a設定化）
  thresholdRatio?: number,
): AppAlert[] {
  const alerts: AppAlert[] = []
  for (const project of projects) {
    const active = getActiveBaseline(baselines, project.projectId)
    if (!isBaselineStale(project.currentBac, active, thresholdRatio)) continue
    alerts.push({
      key: `baseline-stale-${project.projectId}`,
      severity: 'warning',
      category: 'EVM',
      message: `「${project.name}」のWBS工数が凍結時から大きく変わっています。ベースラインを再凍結しないと進捗が実態より良く見えます`,
    })
  }
  return alerts
}

export interface SaasRenewalAlertInput {
  id: string
  name: string
  plan?: string | null
  nextRenewalDate: string
}

/** SaaS契約の更新期限が近い（既定2ヶ月以内、超過含む）契約を検出する */
export function collectSaasRenewalAlerts(
  contracts: SaasRenewalAlertInput[],
  referenceDate: Date,
): AppAlert[] {
  const alerts: AppAlert[] = []
  for (const contract of contracts) {
    if (!isContractRenewalWarning(contract.nextRenewalDate, referenceDate)) {
      continue
    }
    const label = contract.plan
      ? `${contract.name}（${contract.plan}）`
      : contract.name
    alerts.push({
      key: `saas-renewal-${contract.id}`,
      severity: 'warning',
      category: 'SaaS',
      message: `SaaS契約「${label}」の次回更新日（${contract.nextRenewalDate}）が近づいています`,
    })
  }
  return alerts
}

export interface BudgetOverrunAlertInput {
  projectId: string
  name: string
  /** 受注金額（万円）。未設定（0以下）の案件は判定対象外 */
  contractAmount: number
  /** 実コスト合計（万円） */
  actualCostTotal: number
}

/**
 * 受注金額に対する実コスト消化率の警告。80%以上でwarning、100%以上（赤字圏）でcritical。
 */
export function collectBudgetOverrunAlerts(
  rows: BudgetOverrunAlertInput[],
): AppAlert[] {
  const alerts: AppAlert[] = []
  for (const row of rows) {
    if (!isProjectBudgetOverrun(row)) continue
    const rate = Math.round((row.actualCostTotal / row.contractAmount) * 100)
    alerts.push({
      key: `budget-overrun-${row.projectId}`,
      severity: rate >= 100 ? 'critical' : 'warning',
      category: '予算',
      message: `「${row.name}」の実コストが受注金額の${rate}%に達しています（実コスト${Math.round(row.actualCostTotal)}万円／受注${Math.round(row.contractAmount)}万円）`,
    })
  }
  return alerts
}

/**
 * 事前リマインドのリード日数（この日数以内に期日が来るものを知らせる）。
 * 【仮定】固定14日（2週間）。SaaS更新期限の固定2ヶ月と同じ運用とし、
 * 実運用で過不足が出たら全社設定へ昇格する（P0-aのパターン）
 */
export const DUE_SOON_THRESHOLD_DAYS = 14

export interface UpcomingDueDateAlertInput {
  id: string
  name: string
  masterDueDate: string | null | undefined
  status: 'not_started' | 'active' | 'completed'
}

/**
 * マスター納期の接近（info）: 納期のDUE_SOON_THRESHOLD_DAYS日前〜当日を知らせる。
 * 既存のcollectDueDateAlerts（超過critical・遅延予測warning）が「起きた／起きそうな
 * 問題」を扱うのに対し、こちらは問題の有無に関わらない事前リマインド。
 * 納期を過ぎた案件は超過（critical）側に任せて出さない（同一案件への二重通知を避ける）
 */
export function collectUpcomingDueDateAlerts(
  projects: UpcomingDueDateAlertInput[],
  today: string,
): AppAlert[] {
  const alerts: AppAlert[] = []
  for (const project of projects) {
    if (!project.masterDueDate) continue
    if (project.status === 'completed') continue
    if (project.masterDueDate < today) continue
    const daysLeft = daysBetweenLocal(today, project.masterDueDate)
    if (daysLeft > DUE_SOON_THRESHOLD_DAYS) continue
    alerts.push({
      key: `due-soon-${project.id}`,
      severity: 'info',
      category: '納期',
      message:
        daysLeft === 0
          ? `「${project.name}」のマスター納期（${project.masterDueDate}）が本日です`
          : `「${project.name}」のマスター納期（${project.masterDueDate}）まであと${daysLeft}日です`,
    })
  }
  return alerts
}

export interface BillingAcceptanceAlertInput {
  id: string
  /** マイルストン名（"中間金"・"検収時" 等） */
  label: string
  projectName: string
  plannedAcceptanceDate: string
  status: 'planned' | 'accepted' | 'invoiced' | 'paid'
}

/**
 * 請求マイルストンの検収予定日の接近・経過を知らせる（金額は文面に含めない）。
 *
 * - 経過（warning）: 検収予定日を過ぎてもstatusがplannedのまま＝検収・売上計上が
 *   遅れている可能性。接近だけを見る設計だと予定日を過ぎた瞬間に通知が消え、
 *   最も危険な状態が無音になるため経過側を必ず持つ
 * - 接近（info）: DUE_SOON_THRESHOLD_DAYS日前〜当日
 *
 * 検収済以降（accepted/invoiced/paid）は請求・入金の追跡が商流ダイアログ側に
 * あるため対象外
 */
export function collectBillingAcceptanceAlerts(
  milestones: BillingAcceptanceAlertInput[],
  today: string,
): AppAlert[] {
  const alerts: AppAlert[] = []
  for (const milestone of milestones) {
    if (milestone.status !== 'planned') continue
    if (milestone.plannedAcceptanceDate < today) {
      alerts.push({
        key: `billing-overdue-${milestone.id}`,
        severity: 'warning',
        category: '商流',
        message: `「${milestone.projectName}」の請求マイルストン「${milestone.label}」が検収予定日（${milestone.plannedAcceptanceDate}）を過ぎても検収されていません`,
      })
      continue
    }
    const daysLeft = daysBetweenLocal(today, milestone.plannedAcceptanceDate)
    if (daysLeft > DUE_SOON_THRESHOLD_DAYS) continue
    alerts.push({
      key: `billing-soon-${milestone.id}`,
      severity: 'info',
      category: '商流',
      message:
        daysLeft === 0
          ? `「${milestone.projectName}」の請求マイルストン「${milestone.label}」の検収予定日（${milestone.plannedAcceptanceDate}）が本日です`
          : `「${milestone.projectName}」の請求マイルストン「${milestone.label}」の検収予定日（${milestone.plannedAcceptanceDate}）まであと${daysLeft}日です`,
    })
  }
  return alerts
}

export interface RiskDueDateAlertInput {
  id: string
  title: string
  projectName: string
  status: 'open' | 'realized' | 'closed'
  dueDate: string | null | undefined
}

/**
 * リスク登録簿の対応期限（非公開の設計文書）。
 *
 * - 期限超過（warning）: open/realizedのリスクが対応期限を過ぎている
 * - 期限接近（info）: DUE_SOON_THRESHOLD_DAYS日前〜当日
 *
 * closed（解消済み）と期限未設定のリスクは対象外。
 */
export function collectRiskDueDateAlerts(
  risks: RiskDueDateAlertInput[],
  today: string,
): AppAlert[] {
  const alerts: AppAlert[] = []
  for (const risk of risks) {
    if (risk.status === 'closed') continue
    if (!risk.dueDate) continue
    if (risk.dueDate < today) {
      alerts.push({
        key: `risk-overdue-${risk.id}`,
        severity: 'warning',
        category: 'リスク',
        message: `「${risk.projectName}」のリスク「${risk.title}」が対応期限（${risk.dueDate}）を過ぎています`,
      })
      continue
    }
    const daysLeft = daysBetweenLocal(today, risk.dueDate)
    if (daysLeft > DUE_SOON_THRESHOLD_DAYS) continue
    alerts.push({
      key: `risk-due-soon-${risk.id}`,
      severity: 'info',
      category: 'リスク',
      message:
        daysLeft === 0
          ? `「${risk.projectName}」のリスク「${risk.title}」の対応期限（${risk.dueDate}）が本日です`
          : `「${risk.projectName}」のリスク「${risk.title}」の対応期限（${risk.dueDate}）まであと${daysLeft}日です`,
    })
  }
  return alerts
}
