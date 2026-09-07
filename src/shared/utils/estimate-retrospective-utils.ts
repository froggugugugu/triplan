import type { AssignmentEntry, EstimateSnapshot, Member } from '@/shared/types'
import { getLatestFpSnapshot } from '@/shared/utils/estimate-snapshot-utils'
import { calcAcAtWeek } from '@/shared/utils/evm-utils'
import { roundEffortDays } from '@/shared/utils/function-point-utils'
import { getIsoWeekKey } from '@/shared/utils/iso-week-utils'
import { calcErrorRatio, isWithinCone } from '@/shared/utils/uncertainty-cone'

/** "YYYY-MM"（ローカル日付基準） */
function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/**
 * 現在の実績工数（人日）。対象案件の全アサインについて**当月以前**の月の
 * `actualMonthlyValues?.[m] ?? monthlyValues[m]`（ACと同じ解決規則＝未入力は計画どおり）を
 * 合算し、人日/人月を掛ける。削除済みメンバーのアサインは除外する。
 * 「現在日時」は引数注入（alert-utilsの流儀）
 */
export function calcActualEffortDays(
  projectId: string,
  assignments: readonly AssignmentEntry[],
  members: readonly Member[],
  workdaysPerMonth: number,
  now: Date,
): number {
  const memberIds = new Set(members.map((m) => m.id))
  const currentMonth = monthKeyOf(now)
  let months = 0
  for (const assignment of assignments) {
    if (assignment.projectId !== projectId) continue
    if (!memberIds.has(assignment.memberId)) continue
    const keys = new Set([
      ...Object.keys(assignment.monthlyValues),
      ...Object.keys(assignment.actualMonthlyValues ?? {}),
    ])
    for (const month of keys) {
      if (month > currentMonth) continue
      months +=
        assignment.actualMonthlyValues?.[month] ??
        assignment.monthlyValues[month] ??
        0
    }
  }
  return roundEffortDays(months * workdaysPerMonth)
}

/** 現在の実コスト（万円）。EVMのACと同じ算出（当週で評価） */
export function calcActualCostAmount(
  projectId: string,
  assignments: AssignmentEntry[],
  members: Member[],
  now: Date,
): number {
  return calcAcAtWeek(getIsoWeekKey(now), assignments, members, projectId)
}

export interface ActualReference {
  effortDays: number
  amount: number
  /** 完了時の記録（`method='actual'`）から採った場合true。無ければ現在の実績 */
  fromCompletedRecord: boolean
}

/**
 * 振り返りで比較対象にする「実績」。完了時の記録（`method='actual'`の版）があれば
 * それを採り（以後、現在の集計で動かない）、無ければ現在の実績を使う
 */
export function resolveActualReference(
  snapshots: readonly EstimateSnapshot[],
  current: { effortDays: number; amount: number },
): ActualReference {
  const completed = [...snapshots]
    .filter((s) => s.method === 'actual')
    .sort((a, b) => b.version - a.version)[0]
  if (completed) {
    return {
      effortDays: completed.effortDays,
      amount: completed.amount,
      fromCompletedRecord: true,
    }
  }
  return { ...current, fromCompletedRecord: false }
}

export interface EstimateRetrospectiveRow {
  snapshot: EstimateSnapshot
  /** 実績工数 ÷ 見積工数（見積0はnull） */
  effortRatio: number | null
  /** 実績金額 ÷ 見積金額（見積0はnull） */
  amountRatio: number | null
  /** 金額の誤差比が段階の幅に収まるか（判定不能はnull） */
  withinCone: boolean | null
}

/**
 * 版ごとの「実績÷見積」と「幅に収まったか」。実績の記録（`actual`）自体は比較対象なので
 * 行に含めない
 */
export function buildRetrospectiveRows(
  snapshots: readonly EstimateSnapshot[],
  actual: { effortDays: number; amount: number },
): EstimateRetrospectiveRow[] {
  return [...snapshots]
    .filter((s) => s.method !== 'actual')
    .sort((a, b) => a.version - b.version)
    .map((snapshot) => {
      const effortRatio = calcErrorRatio(actual.effortDays, snapshot.effortDays)
      const amountRatio = calcErrorRatio(actual.amount, snapshot.amount)
      return {
        snapshot,
        effortRatio,
        amountRatio,
        withinCone:
          amountRatio === null
            ? null
            : isWithinCone(amountRatio, snapshot.stage),
      }
    })
}

/**
 * 実績 人時/FP = 実績人日 × 時間/日 ÷ 最新のFP版のtotalFp
 * （CRで増えた機能を含めて比較するため「最新」を採る）。FP版が無い・totalFp=0はnull
 */
export function calcActualHoursPerFp(
  projectId: string,
  snapshots: readonly EstimateSnapshot[],
  actualEffortDays: number,
  hoursPerDay: number,
): number | null {
  const latestFp = getLatestFpSnapshot(snapshots, projectId)
  const totalFp = latestFp?.fp?.totalFp ?? 0
  if (totalFp <= 0) return null
  return Math.round(((actualEffortDays * hoursPerDay) / totalFp) * 100) / 100
}

/** 中央値（偶数件は中央2つの平均）。空配列はnull */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const lower = sorted[mid - 1]
  const upper = sorted[mid]
  if (upper === undefined) return null
  if (sorted.length % 2 === 1 || lower === undefined) return upper
  return (lower + upper) / 2
}

export interface CalibrationHint {
  /** 実績とFP版の両方を持つ完了案件の数 */
  sampleCount: number
  /** それらの「実績 人時/FP」の中央値（0件はnull） */
  medianHoursPerFp: number | null
}

/**
 * 校正ヒント: 完了時の記録（`actual`）と FP版を両方持つ案件について
 * 「実績 人時/FP」（実績人日 × 記録時の時間/日 ÷ 最新FP版のtotalFp）の中央値。
 * 全社設定の人時/FPを自社の実績へ寄せる入口
 */
export function calcCalibrationHint(
  snapshots: readonly EstimateSnapshot[],
): CalibrationHint {
  const byProject = new Map<string, EstimateSnapshot[]>()
  for (const s of snapshots) {
    const list = byProject.get(s.projectId)
    if (list) list.push(s)
    else byProject.set(s.projectId, [s])
  }
  const samples: number[] = []
  for (const [projectId, list] of byProject) {
    const actual = list
      .filter((s) => s.method === 'actual')
      .sort((a, b) => b.version - a.version)[0]
    if (!actual) continue
    const value = calcActualHoursPerFp(
      projectId,
      list,
      actual.effortDays,
      actual.basis.hoursPerDay,
    )
    if (value !== null) samples.push(value)
  }
  return { sampleCount: samples.length, medianHoursPerFp: median(samples) }
}
