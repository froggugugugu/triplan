import { and, eq } from 'drizzle-orm'
import type {
  AssignmentEntry,
  BudgetBreakdown,
  Member,
  Project,
  ProjectBaseline,
  ProjectTreeNode,
} from '@/shared/types'
import {
  type AlertSeverity,
  type AppAlert,
  type BaselineStaleAlertInput,
  type BillingAcceptanceAlertInput,
  collectBaselineStaleAlerts,
  collectBillingAcceptanceAlerts,
  collectCapacityAlerts,
  collectDueDateAlerts,
  collectRiskDueDateAlerts,
  collectSaasRenewalAlerts,
  collectUpcomingDueDateAlerts,
  type DueDateAlertInput,
  sortAlerts,
} from '@/shared/utils/alert-utils'
import {
  calcProjectEstimateBudget,
  getFiscalYearMonthKeys,
} from '@/shared/utils/budget-utils'
import { computeProjectTotalEffort } from '@/shared/utils/effort-utils'
import { resolveProgressRateAtWeek } from '@/shared/utils/evm-utils'
import { formatDateOnly, getIsoWeekKey } from '@/shared/utils/iso-week-utils'
import {
  calcProjectProfitability,
  isProjectBudgetOverrun,
} from '@/shared/utils/profitability-utils'
import { db } from '../db/client.js'
import {
  appSettings,
  assignments,
  billingMilestones,
  budgetBreakdowns,
  efforts,
  members,
  notificationChannels,
  notificationLogs,
  projectBaselines,
  projectProgressEntries,
  projects,
  riskEntries,
  saasContracts,
  scheduleEntries,
  wbsColumnSettingsEntries,
} from '../db/schema.js'
import type { NotificationMessage } from './message.js'
import { type SendOptions, sendToChannel } from './sender.js'

/**
 * 日次ダイジェスト（Phase 3 Phase C、非公開の設計文書）。
 * アラートセンターの判定（`shared/utils/alert-utils.ts`の純関数群）をサーバーから再利用し、
 * 当日のアラート一覧を重大度順に1通へまとめて送る。
 *
 * Phase Cで入力構築が単純な3種（①納期超過・遅延予測 ②SaaS更新期限 ③稼働超過）、
 * Phase Dで残り2種（④ベースライン乖離 ⑤予算超過）を実装し、画面のアラートセンターと
 * 同じ5系統＋αのうち金額を伴わない形で全種をダイジェストへ集約する。
 * ⑤予算超過のみ、決定事項7（通知文面に具体的な金額を含めない）のため画面と文面を変え、
 * 消化率（%）だけを載せる。
 */

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

/** ダイジェスト本文に載せるアラートの上限（超過分は「ほかN件」に丸める） */
const DIGEST_LINE_LIMIT = 20

type ProjectRow = typeof projects.$inferSelect

/**
 * projects行からトップレベル案件のツリーノードを組み立てる（クライアントの
 * getProjectTreeと同じ親子解決。進捗率の工数加重ロールアップに使う）。
 * drizzle行はProjectのZod出力型とnull/Date表現が異なるが、進捗算出が参照するのは
 * id/completed/completedAt/childrenのみのため構造的に互換
 */
export function buildProjectTree(
  rows: ProjectRow[],
  root: ProjectRow,
): ProjectTreeNode {
  const byParent = new Map<string, ProjectRow[]>()
  for (const row of rows) {
    if (row.parentId === null) continue
    const list = byParent.get(row.parentId) ?? []
    list.push(row)
    byParent.set(row.parentId, list)
  }
  const build = (row: ProjectRow, depth: number): ProjectTreeNode => ({
    ...(row as unknown as Project),
    children: (byParent.get(row.id) ?? []).map((c) => build(c, depth + 1)),
    depth,
  })
  return build(root, 0)
}

/** 今日からフォールバックの年度（4月始まり）を導出する。appSettings未初期化時に使う */
function fallbackFiscalYear(now: Date): number {
  return now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1
}

/**
 * DBから判定入力を組み立て、当日のアラート一覧を重大度順で返す。
 * 判定ロジック自体はクライアントのアラートセンターと同一の純関数を使う
 * （二重実装しない＝画面とダイジェストの判定が食い違わない）
 */
export async function collectServerAlerts(now: Date): Promise<AppAlert[]> {
  const [
    projectRows,
    effortRows,
    scheduleRows,
    progressRows,
    wbsSettingsRows,
    memberRows,
    assignmentRows,
    saasRows,
    baselineRows,
    breakdownRows,
    billingMilestoneRows,
    riskEntryRows,
    [settingsRow],
  ] = await Promise.all([
    db.select().from(projects),
    db.select().from(efforts),
    db.select().from(scheduleEntries),
    db.select().from(projectProgressEntries),
    db.select().from(wbsColumnSettingsEntries),
    db.select().from(members),
    db.select().from(assignments),
    db.select().from(saasContracts),
    db.select().from(projectBaselines),
    db.select().from(budgetBreakdowns),
    db.select().from(billingMilestones),
    db.select().from(riskEntries),
    db.select().from(appSettings).limit(1),
  ])

  const today = formatDateOnly(now)
  const currentWeek = getIsoWeekKey(now)

  const settingsByProject = new Map(
    wbsSettingsRows.map((r) => [r.projectId, r.effortColumns]),
  )
  const enabledColumnIds = (projectId: string): string[] => {
    const columns = settingsByProject.get(projectId)
    // 設定レコードが無い案件はデフォルト設定（最初の3列が有効）へフォールバック
    if (!columns || columns.length === 0) {
      return ['effort-1', 'effort-2', 'effort-3']
    }
    return columns.filter((c) => c.enabled).map((c) => c.id)
  }

  const effortEntries = effortRows.map((e) => ({
    id: e.id,
    projectId: e.projectId,
    columnId: e.columnId,
    value: e.value,
  }))

  const estimatedUnitPrice = settingsRow?.estimatedUnitPrice ?? 0
  const defaultCoefficient = settingsRow?.defaultCoefficient ?? 1
  const projectCoefficients = settingsRow?.projectCoefficients ?? {}
  const workdaysPerMonth = settingsRow?.workdaysPerMonth ?? 20
  const baselineStaleThreshold =
    settingsRow?.baselineStaleThreshold ?? undefined

  // 案件別損益の入力（drizzle行はZod出力型とnull/undefined表現が異なるが、
  // 参照フィールドは構造的に互換）
  const profitAssignments = assignmentRows as unknown as AssignmentEntry[]
  const profitMembers = memberRows as unknown as Member[]
  const profitBreakdowns = breakdownRows as unknown as BudgetBreakdown[]

  const roots = projectRows.filter((p) => p.level === 0)
  const dueDateInputs: DueDateAlertInput[] = []
  const baselineInputs: BaselineStaleAlertInput[] = []
  const overrunAlerts: AppAlert[] = []
  for (const project of roots) {
    const node = buildProjectTree(projectRows, project)
    const columnIds = enabledColumnIds(project.id)

    // ①納期: 進捗率はEV・画面と同じ解決順（週次手入力優先→WBS完了チェックの工数加重）
    const weeklyProgress =
      progressRows.find((e) => e.projectId === project.id)?.weeklyProgress ?? {}
    const progressRate = resolveProgressRateAtWeek(
      currentWeek,
      weeklyProgress,
      {
        node,
        columnIds,
        efforts: effortEntries,
      },
    )
    const scheduleStart = scheduleRows
      .filter((e) => e.projectId === project.id)
      .reduce<string | null>(
        (min, e) => (min === null || e.startDate < min ? e.startDate : min),
        null,
      )
    dueDateInputs.push({
      id: project.id,
      name: project.name,
      masterDueDate: project.masterDueDate,
      status: project.status as 'not_started' | 'active' | 'completed',
      scheduleStart,
      progressRate,
    })

    // ④ベースライン乖離: 現行BAC（WBS工数×概算単価×係数、画面と同一の算出）
    const totalEffortDays =
      computeProjectTotalEffort([node], columnIds, effortEntries).get(
        project.id,
      ) ?? 0
    baselineInputs.push({
      projectId: project.id,
      name: project.name,
      currentBac: calcProjectEstimateBudget(
        totalEffortDays / workdaysPerMonth,
        estimatedUnitPrice,
        projectCoefficients[project.id] ?? defaultCoefficient,
      ),
    })

    // ⑤予算超過: 判定・閾値（80%/100%）は画面と同一関数を使うが、文面は決定事項7
    // （通知に具体的な金額を含めない）のため消化率（%）のみの独自メッセージにする
    const profitability = calcProjectProfitability(
      { id: project.id, contractAmount: project.contractAmount },
      profitAssignments,
      profitMembers,
      profitBreakdowns,
      now,
    )
    const overrunInput = {
      projectId: project.id,
      name: project.name,
      contractAmount: profitability.contractAmount,
      actualCostTotal: profitability.actualCostTotal,
    }
    if (isProjectBudgetOverrun(overrunInput)) {
      const rate = Math.round(
        (overrunInput.actualCostTotal / overrunInput.contractAmount) * 100,
      )
      overrunAlerts.push({
        key: `budget-overrun-${project.id}`,
        severity: rate >= 100 ? 'critical' : 'warning',
        category: '予算',
        message: `「${project.name}」の実コストが受注金額の${rate}%に達しています（金額の詳細は本ツールで確認）`,
      })
    }
  }

  const fiscalYear = settingsRow?.fiscalYear ?? fallbackFiscalYear(now)
  const monthKeys = getFiscalYearMonthKeys(fiscalYear)
  const capacityMembers = memberRows.map((m) => ({
    id: m.id,
    name: m.name,
    capacityRatio: m.capacityRatio ?? undefined,
  }))
  const capacityAssignments = assignmentRows.map((a) => ({
    memberId: a.memberId,
    monthlyValues: a.monthlyValues,
  }))

  const saasInputs = saasRows.map((s) => ({
    id: s.id,
    name: s.name,
    plan: s.plan,
    nextRenewalDate: s.nextRenewalDate,
  }))

  // ⑥検収予定日の接近・経過（事前リマインド。文面に金額を含めない＝決定事項7に整合）。
  // 削除済み案件への参照（弱参照）は案件名を解決できないためスキップする
  const rootNameById = new Map(roots.map((p) => [p.id, p.name]))
  const billingAcceptanceInputs: BillingAcceptanceAlertInput[] =
    billingMilestoneRows.flatMap((m) => {
      const projectName = rootNameById.get(m.projectId)
      if (!projectName) return []
      return [
        {
          id: m.id,
          label: m.label,
          projectName,
          plannedAcceptanceDate: m.plannedAcceptanceDate,
          status: m.status as BillingAcceptanceAlertInput['status'],
        },
      ]
    })

  // ⑦リスクの対応期限（非公開の設計文書）。文面に金額を含めない
  const riskAlertInputs = riskEntryRows.flatMap((r) => {
    const projectName = rootNameById.get(r.projectId)
    if (!projectName) return []
    return [
      {
        id: r.id,
        title: r.title,
        projectName,
        status: r.status as 'open' | 'realized' | 'closed',
        dueDate: r.dueDate ?? null,
      },
    ]
  })

  return sortAlerts([
    ...collectDueDateAlerts(dueDateInputs, today),
    ...collectUpcomingDueDateAlerts(dueDateInputs, today),
    ...collectBillingAcceptanceAlerts(billingAcceptanceInputs, today),
    ...collectRiskDueDateAlerts(riskAlertInputs, today),
    ...overrunAlerts,
    ...collectBaselineStaleAlerts(
      baselineInputs,
      baselineRows as unknown as ProjectBaseline[],
      baselineStaleThreshold,
    ),
    ...collectSaasRenewalAlerts(saasInputs, now),
    ...collectCapacityAlerts(capacityMembers, capacityAssignments, monthKeys),
  ])
}

/**
 * チャンネルのminSeverityでアラートを絞り込み、ダイジェスト1通の文面を組み立てる
 * （純関数、テスト用にエクスポート）。対象0件の場合はnull＝送らない（ノイズ回避）
 */
export function buildDigestMessage(
  alerts: AppAlert[],
  minSeverity: AlertSeverity,
): NotificationMessage | null {
  const included = alerts.filter(
    (a) => SEVERITY_ORDER[a.severity] <= SEVERITY_ORDER[minSeverity],
  )
  if (included.length === 0) return null
  const lines = included
    .slice(0, DIGEST_LINE_LIMIT)
    .map((a) => `[${a.severity}] ${a.category}: ${a.message}`)
  if (included.length > DIGEST_LINE_LIMIT) {
    lines.push(`…ほか${included.length - DIGEST_LINE_LIMIT}件`)
  }
  return {
    title: `本日のアラート ${included.length}件`,
    // sortAlerts済みの前提で先頭が最重度
    severity: included[0]?.severity ?? 'info',
    lines,
  }
}

export interface DigestResult {
  /** 送信を試みたチャンネル数（成功・失敗を含む） */
  sent: number
  /** スキップしたチャンネル数（同日送信済み・対象アラート0件） */
  skipped: number
  /** 当日のアラート総数（絞り込み前） */
  alertCount: number
}

export interface DigestOptions extends SendOptions {
  now?: Date
  /** trueで同日再送防止をバイパスする（手動送信用） */
  force?: boolean
}

/**
 * ダイジェスト対象の全チャンネルへ当日のアラートまとめを送る。
 * - 同日再送防止: 当日中に成功したdigestログがあるチャンネルはスキップ（`force`で無効化）
 * - チャンネルごとにminSeverityで絞り込む（対象0件のチャンネルには送らない）
 * - 例外を外へ投げない（スケジューラ・手動APIの双方から安全に呼べる）
 */
export async function sendDailyDigest(
  options: DigestOptions = {},
): Promise<DigestResult> {
  const now = options.now ?? new Date()
  const result: DigestResult = { sent: 0, skipped: 0, alertCount: 0 }
  try {
    const channels = await db
      .select()
      .from(notificationChannels)
      .where(eq(notificationChannels.enabled, true))
    const targets = channels.filter((c) => c.notifyDigest)
    if (targets.length === 0) return result

    const alerts = await collectServerAlerts(now)
    result.alertCount = alerts.length

    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)
    const todayStartIso = todayStart.toISOString()

    for (const channel of targets) {
      if (!options.force) {
        // 同日再送防止はdigestログのみで判定する（テスト送信・イベント通知が
        // あってもダイジェストは抑止しない）
        const logs = await db
          .select({ sentAt: notificationLogs.sentAt })
          .from(notificationLogs)
          .where(
            and(
              eq(notificationLogs.channelId, channel.id),
              eq(notificationLogs.kind, 'digest'),
            ),
          )
        if (logs.some((l) => l.sentAt >= todayStartIso)) {
          result.skipped++
          continue
        }
      }
      const message = buildDigestMessage(alerts, channel.minSeverity)
      if (!message) {
        result.skipped++
        continue
      }
      const sendResult = await sendToChannel(channel, message, options)
      await db.insert(notificationLogs).values({
        sentAt: new Date().toISOString(),
        channelId: channel.id,
        kind: 'digest',
        subject: message.title,
        ok: sendResult.ok,
        detail: sendResult.detail,
      })
      result.sent++
    }
  } catch (error) {
    // スケジューラ・業務APIを巻き込まない（サーバーログにだけ痕跡を残す）
    console.error('[notifications] daily digest failed:', error)
  }
  return result
}
