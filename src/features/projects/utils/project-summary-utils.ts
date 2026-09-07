import type { ProjectBaseline } from '@/shared/types/project-baseline'
import type { RiskLevel, RiskStatus } from '@/shared/types/risk'
import {
  type CapacityAlertMemberInput,
  collectBudgetOverrunAlerts,
  collectCapacityAlerts,
  collectDueDateAlerts,
} from '@/shared/utils/alert-utils'
import { calcConsumptionRate } from '@/shared/utils/budget-utils'
import {
  type EvmWeekPoint,
  isBaselineStale,
  SUMMARY_BUDGET_PROGRESS_GAP_THRESHOLD,
  SUMMARY_SPI_WARNING_THRESHOLD,
} from '@/shared/utils/evm-utils'
import { calcBillingAllocationGap } from './billing-milestone-utils'

// 既定閾値の実体はshared/utils/evm-utils.ts（全社設定のフォールバックとして
// stores/budget-storeからも参照するため）。本モジュール利用者向けにリエクスポートする
export { SUMMARY_BUDGET_PROGRESS_GAP_THRESHOLD, SUMMARY_SPI_WARNING_THRESHOLD }

/**
 * プロジェクトサマリー統合ビューの判定ルール（非公開の設計文書）。
 *
 * - 全て決定論的な純関数。「現在日時」は引数注入（today/currentMonth）
 * - 判定に必要な入力が無いルールは**黙ってスキップ**する（誤報より取りこぼし＝
 *   alert-utilsの流儀を踏襲。受注額未設定・進捗未記録の案件で警告を乱発しない）
 * - 既存の判定実装（collectDueDateAlerts/collectCapacityAlerts/
 *   collectBudgetOverrunAlerts/isBaselineStale/calcBillingAllocationGap）を再利用し、
 *   新規ロジックはR4（予算先行）・R5（SPI低下）のみ
 */

export interface SummaryJudgment {
  /** Reactのkey・重複排除用の一意キー */
  key: string
  severity: 'critical' | 'warning'
  /** 分類ラベル（納期／予算／EVM／商流／要員） */
  category: string
  message: string
  /** 金額情報を含む判定。金額非表示（financials:read無し・表示トグルOFF）時はUIから除外する */
  financial: boolean
}

export interface SummaryJudgmentInput {
  project: {
    id: string
    name: string
    status: 'not_started' | 'active' | 'completed'
    masterDueDate?: string | null
  }
  /** 判定基準日（YYYY-MM-DD） */
  today: string
  /** スケジュールの全体開始日（遅延予測用）。無ければnull */
  scheduleStart: string | null
  /** 現在の進捗率（0.0〜1.0）。進捗ソース（完了チェック・週次手入力）が無い場合はnull */
  progressRate: number | null
  /** 受注金額（万円）。未設定はnull */
  contractAmount: number | null
  /** 現行BAC（WBS積み上げ→予算枠フォールバック後、万円）。0以下=未確定 */
  currentBac: number
  /** 実コスト合計（万円、実人件費＋実付帯費用） */
  actualCostTotal: number
  /** 直近週のSPI（EV/PV）。算出不能（PV=0・EVM対象外）はnull */
  spi: number | null
  /** 有効なベースライン（未凍結はnull） */
  baseline: ProjectBaseline | null
  /** 請求マイルストンの配分合計（万円） */
  billingAllocatedTotal: number
  /** 体制メンバー（本プロジェクトにアサインがあるメンバー） */
  teamMembers: CapacityAlertMemberInput[]
  /** 全アサイン（他案件込み。稼働超過はメンバーの月合計で判定するため） */
  assignments: { memberId: string; monthlyValues: Record<string, number> }[]
  /** 稼働超過を見る対象月（YYYY-MM、通常は当月） */
  currentMonth: string
  /**
   * リスク登録簿（R9用、非公開の設計文書）。
   * 未指定（undefined）は後方互換でR9を判定しない
   */
  risks?: { probability: RiskLevel; impact: RiskLevel; status: RiskStatus }[]
  /** R6の乖離閾値（既定: evm-utilsのBASELINE_STALE_THRESHOLD=0.1） */
  baselineStaleThreshold?: number
  /** R4の閾値（既定: SUMMARY_BUDGET_PROGRESS_GAP_THRESHOLD=0.15） */
  budgetProgressGapThreshold?: number
  /** R5の閾値（既定: SUMMARY_SPI_WARNING_THRESHOLD=0.9） */
  spiWarningThreshold?: number
}

const SEVERITY_ORDER: Record<SummaryJudgment['severity'], number> = {
  critical: 0,
  warning: 1,
}

/** 既存アラート（AppAlert）を判定へ変換する。info（本判定では未使用）は除外 */
function toJudgment(
  alert: {
    key: string
    severity: 'critical' | 'warning' | 'info'
    category: string
    message: string
  },
  financial: boolean,
): SummaryJudgment | null {
  if (alert.severity === 'info') return null
  return {
    key: alert.key,
    severity: alert.severity,
    category: alert.category,
    message: alert.message,
    financial,
  }
}

/**
 * 8ルールを評価し、該当した判定を重大度順（critical→warning）に返す。
 */
export function evaluateSummaryJudgments(
  input: SummaryJudgmentInput,
): SummaryJudgment[] {
  const {
    project,
    today,
    scheduleStart,
    progressRate,
    contractAmount,
    currentBac,
    actualCostTotal,
    spi,
    baseline,
    billingAllocatedTotal,
    teamMembers,
    assignments,
    currentMonth,
    budgetProgressGapThreshold = SUMMARY_BUDGET_PROGRESS_GAP_THRESHOLD,
    spiWarningThreshold = SUMMARY_SPI_WARNING_THRESHOLD,
  } = input

  const judgments: SummaryJudgment[] = []

  // R1 納期超過（critical）・R2 遅延予測（warning）: 既存判定をそのまま再利用
  for (const alert of collectDueDateAlerts(
    [
      {
        id: project.id,
        name: project.name,
        masterDueDate: project.masterDueDate,
        status: project.status,
        scheduleStart,
        // 進捗未記録（null）は0扱い=線形予測は行われない（collectDueDateAlerts側の仕様）
        progressRate: progressRate ?? 0,
      },
    ],
    today,
  )) {
    const judgment = toJudgment(alert, false)
    if (judgment) judgments.push(judgment)
  }

  // R3 予算超過（受注額比80%/100%）: 既存判定を再利用。受注額未設定は判定不能スキップ
  for (const alert of collectBudgetOverrunAlerts([
    {
      projectId: project.id,
      name: project.name,
      contractAmount: contractAmount ?? 0,
      actualCostTotal,
    },
  ])) {
    const judgment = toJudgment(alert, true)
    if (judgment) judgments.push(judgment)
  }

  // R4 予算先行: 消化率が進捗率を閾値超で上回る（分母は受注額優先→BACフォールバック）。
  // 完了済み案件は着地済みのため対象外（前倒し消化の警告は意思決定に使えない）
  const budgetDenominator =
    contractAmount != null && contractAmount > 0
      ? contractAmount
      : currentBac > 0
        ? currentBac
        : null
  if (
    project.status !== 'completed' &&
    progressRate !== null &&
    budgetDenominator !== null
  ) {
    const consumptionRatio =
      calcConsumptionRate(budgetDenominator, actualCostTotal) / 100
    const gap = consumptionRatio - progressRate
    // 閾値ちょうど（例: 15.0pt）は警告しない。0.45-0.30=0.15000000000000002のような
    // 浮動小数点誤差で境界値が誤発火しないようepsilonを許容する（development-patterns §3.2）
    if (gap > budgetProgressGapThreshold + 1e-9) {
      judgments.push({
        key: `budget-progress-gap-${project.id}`,
        severity: 'warning',
        category: '予算',
        message: `予算消化率${Math.round(consumptionRatio * 100)}%が進捗率${Math.round(progressRate * 100)}%を${Math.round(gap * 100)}pt上回っています（予算先行）`,
        financial: true,
      })
    }
  }

  // R5 SPI低下: 直近週のスケジュール効率が閾値未満。SPIは無次元の比率のため金額判定にしない
  if (project.status !== 'completed' && spi !== null) {
    if (spi < spiWarningThreshold) {
      judgments.push({
        key: `spi-low-${project.id}`,
        severity: 'warning',
        category: 'EVM',
        message: `SPI（スケジュール効率）が${spi.toFixed(2)}で計画を下回っています（閾値${spiWarningThreshold.toFixed(2)}）`,
        financial: false,
      })
    }
  }

  // R6 ベースライン乖離: 既存判定を再利用（未凍結はfalse=凍結を促すのは別UIの役割）
  if (isBaselineStale(currentBac, baseline, input.baselineStaleThreshold)) {
    judgments.push({
      key: `baseline-stale-${project.id}`,
      severity: 'warning',
      category: 'EVM',
      message:
        'WBS工数が凍結時から大きく変わっています。ベースラインを再凍結しないと進捗が実態より良く見えます',
      financial: true,
    })
  }

  // R7 配分ギャップ: マイルストン配分合計≠受注額。配分0件（運用未開始）はノイズ回避でスキップ
  const billingGap = calcBillingAllocationGap(
    contractAmount,
    billingAllocatedTotal,
  )
  if (
    billingGap !== null &&
    billingAllocatedTotal > 0 &&
    Math.abs(billingGap) >= 0.005
  ) {
    judgments.push({
      key: `billing-gap-${project.id}`,
      severity: 'warning',
      category: '商流',
      message: `請求マイルストンの配分合計（${Math.round(billingAllocatedTotal)}万円）が受注額（${Math.round(contractAmount ?? 0)}万円）と一致していません（差${Math.round(billingGap)}万円）`,
      financial: true,
    })
  }

  // R8 稼働超過: 体制メンバーの当月合計（他案件込み）が稼働率上限超。既存判定を再利用
  for (const alert of collectCapacityAlerts(teamMembers, assignments, [
    currentMonth,
  ])) {
    const judgment = toJudgment(alert, false)
    if (judgment) judgments.push(judgment)
  }

  // R9 重大リスク: 確率高×影響高のopenリスクが存在する（非公開の設計文書）。
  // realized（顕在化）は既に他の判定（納期・予算等）へ実害として現れる段階、
  // closedは決着済みのため、事前警戒の対象はopenのみ
  const criticalOpenRisks = (input.risks ?? []).filter(
    (r) =>
      r.status === 'open' && r.probability === 'high' && r.impact === 'high',
  ).length
  if (criticalOpenRisks > 0) {
    judgments.push({
      key: `risk-critical-${project.id}`,
      severity: 'warning',
      category: 'リスク',
      message: `重大リスク（発生確率:高×影響:高）が${criticalOpenRisks}件、監視中のままです`,
      financial: false,
    })
  }

  return judgments.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  )
}

export type SummaryOverallStatus = 'good' | 'warning' | 'critical'

/** 総合判定は該当ルールの最悪値（critical > warning > 良好） */
export function deriveOverallStatus(
  judgments: SummaryJudgment[],
): SummaryOverallStatus {
  if (judgments.some((j) => j.severity === 'critical')) return 'critical'
  if (judgments.length > 0) return 'warning'
  return 'good'
}

/**
 * 判定材料の有無。進捗ソース・BAC・受注額のいずれも無い案件は「判定不能」バッジを出す
 * （良好と表示すると「まだ何も入力していないだけ」の案件を健全と誤認させるため）。
 * 進捗率0は「記録あり（0%）」なので判定可能として扱う。
 */
export function hasSummaryEvaluationBasis(input: {
  progressRate: number | null
  currentBac: number
  contractAmount: number | null
}): boolean {
  return (
    input.progressRate !== null ||
    input.currentBac > 0 ||
    (input.contractAmount ?? 0) > 0
  )
}

/** 金額非表示時は金額情報を含む判定（financial=true）を除外する */
export function filterJudgmentsByFinancialVisibility(
  judgments: SummaryJudgment[],
  canViewFinancials: boolean,
): SummaryJudgment[] {
  if (canViewFinancials) return judgments
  return judgments.filter((j) => !j.financial)
}

/**
 * EVM週次系列から「今日以前の直近週」のSPI（EV/PV）・CPI（EV/AC）を算出する。
 * 分母0は算出不能（null、ゼロ除算回避）。丸めは小数2桁（Math.round、決定論）。
 * 週キーはゼロ埋めISO週番号（"YYYY-Www"）のため文字列比較で時系列順になる。
 */
export function calcCurrentEvmIndices(
  series: EvmWeekPoint[],
  todayWeekKey: string,
): { spi: number | null; cpi: number | null } {
  let latest: EvmWeekPoint | null = null
  for (const point of series) {
    if (point.week > todayWeekKey) continue
    if (!latest || point.week > latest.week) latest = point
  }
  if (!latest) return { spi: null, cpi: null }
  const round2 = (value: number) => Math.round(value * 100) / 100
  return {
    spi: latest.pv > 0 ? round2(latest.ev / latest.pv) : null,
    cpi: latest.ac > 0 ? round2(latest.ev / latest.ac) : null,
  }
}

export interface ProjectTeamRow {
  memberId: string
  name: string
  role: string
  /** 稼働率上限（未設定=1.0） */
  capacityRatio: number
  /** 当月の本プロジェクト配分（計画、人月） */
  currentMonthAllocation: number
  /** 対象月範囲の本プロジェクト配分合計（計画、人月） */
  fiscalYearTotal: number
}

/**
 * 体制テーブルの行データを構築する（本プロジェクトのアサインをメンバー単位に合算）。
 * 配分は計画（monthlyValues）ベース＝既存アラートセンターの稼働超過判定と同じ軸。
 * 削除済みメンバーのアサイン・対象月範囲で配分が全て0のメンバーは含めない。名前順。
 */
export function buildProjectTeamRows(
  projectId: string,
  assignments: {
    projectId: string
    memberId: string
    monthlyValues: Record<string, number>
  }[],
  members: {
    id: string
    name: string
    role: string
    capacityRatio?: number
  }[],
  monthKeys: string[],
  currentMonth: string,
): ProjectTeamRow[] {
  const memberById = new Map(members.map((m) => [m.id, m]))
  const rowByMemberId = new Map<string, ProjectTeamRow>()

  for (const assignment of assignments) {
    if (assignment.projectId !== projectId) continue
    const member = memberById.get(assignment.memberId)
    if (!member) continue

    let row = rowByMemberId.get(member.id)
    if (!row) {
      row = {
        memberId: member.id,
        name: member.name,
        role: member.role,
        capacityRatio: member.capacityRatio ?? 1,
        currentMonthAllocation: 0,
        fiscalYearTotal: 0,
      }
      rowByMemberId.set(member.id, row)
    }
    row.currentMonthAllocation += assignment.monthlyValues[currentMonth] ?? 0
    for (const month of monthKeys) {
      row.fiscalYearTotal += assignment.monthlyValues[month] ?? 0
    }
  }

  return [...rowByMemberId.values()]
    .filter((r) => r.fiscalYearTotal > 0 || r.currentMonthAllocation > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
}
