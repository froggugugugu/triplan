/**
 * デモデータ生成メイン関数
 *
 * 全エンティティを整合性を保って一括生成する。
 */
import {
  CATEGORY_DEFAULT_COLORS,
  MASTER_DATA,
} from '@/shared/data/tech-tag-master'
import type {
  AiUsageEntry,
  AiUsageMemberAllocation,
  AssignmentEntry,
  BudgetAdjustment,
  BudgetBreakdown,
  Company,
  Database,
  Division,
  DivisionBudget,
  EffortEntry,
  Member,
  PersonnelPlanEntry,
  PhaseDependency,
  PhaseSettings,
  PhaseSettingsEntry,
  Project,
  ProjectProgressEntry,
  SaasContract,
  ScheduleEntry,
  Section,
  SkillEvaluation,
  SkillRoadmapGoal,
  TechTag,
  TechTagCategory,
  TechTagSubCategory,
  WbsSettingsEntry,
} from '@/shared/types'
import { createDefaultPhaseSettings } from '@/shared/types/schedule'
import {
  DEFAULT_EFFORT_COLUMN_COLORS,
  type WbsSettings,
} from '@/shared/types/wbs-settings'
import { calcSectionExpectedRevenue } from '@/shared/utils/budget-utils'
import {
  formatDateOnly,
  getIsoWeeksInRange,
} from '@/shared/utils/iso-week-utils'

import { DEMO_DIVISIONS, DEMO_MEMBERS, DEMO_SECTIONS } from './demo-members'
import { DEMO_PROJECTS } from './demo-projects'

export interface DemoDataResult {
  database: Database
}

/**
 * デモ用の完了日を年度内に分散させる（年度開始4/1から2週間刻み、年度末でクランプ）。
 * 完了日が無いと `calcWbsProgressAtDate` が「日付不明＝常に完了」として扱い、
 * EV曲線が週によらずフラットになるため、デモでも段階的に立ち上がるようにする
 * （非公開の設計文書）。
 */
function demoCompletionDate(fiscalYear: number, index: number): string {
  const candidate = new Date(fiscalYear, 3, 1 + index * 14)
  const fiscalYearEnd = new Date(fiscalYear + 1, 2, 31)
  return formatDateOnly(candidate > fiscalYearEnd ? fiscalYearEnd : candidate)
}

/**
 * デモデータを生成
 * @param fiscalYear 対象年度（デフォルト: 2025）
 */
export function generateDemoData(fiscalYear = 2025): DemoDataResult {
  const now = new Date().toISOString()

  // ── 1. 技術タグ（MASTER_DATA からシード） ──
  const techTagCategories: TechTagCategory[] = []
  const techTagSubCategories: TechTagSubCategory[] = []
  const techTags: TechTag[] = []
  const tagLookup = new Map<string, string>() // tagName → tagId

  for (const [ci, masterCat] of MASTER_DATA.entries()) {
    const catId = crypto.randomUUID()
    techTagCategories.push({
      id: catId,
      name: masterCat.name,
      sortOrder: ci,
      createdAt: now,
      updatedAt: now,
    })

    const defaultColor = CATEGORY_DEFAULT_COLORS[masterCat.name] ?? '#6b7280'

    for (const [si, masterSub] of masterCat.subCategories.entries()) {
      const subId = crypto.randomUUID()
      techTagSubCategories.push({
        id: subId,
        categoryId: catId,
        name: masterSub.name,
        sortOrder: si,
        createdAt: now,
        updatedAt: now,
      })

      for (const masterTag of masterSub.tags) {
        const tagId = crypto.randomUUID()
        techTags.push({
          id: tagId,
          name: masterTag.name,
          color: defaultColor,
          categoryId: catId,
          subCategoryId: subId,
          note: masterTag.note ?? null,
          createdAt: now,
          updatedAt: now,
        })
        tagLookup.set(masterTag.name, tagId)
      }
    }
  }

  // ── 2. 組織 ──
  const divisionLookup = new Map<string, string>()
  const divisions: Division[] = DEMO_DIVISIONS.map((d, i) => {
    const id = crypto.randomUUID()
    divisionLookup.set(d.key, id)
    return {
      id,
      name: d.name,
      sortOrder: i,
      createdAt: now,
      updatedAt: now,
    }
  })

  const sectionLookup = new Map<string, string>()
  const sections: Section[] = DEMO_SECTIONS.map((s, i) => {
    const id = crypto.randomUUID()
    sectionLookup.set(s.key, id)
    const divisionId = divisionLookup.get(s.divisionKey)
    if (!divisionId) throw new Error(`Division not found: ${s.divisionKey}`)
    return {
      id,
      divisionId,
      name: s.name,
      sortOrder: i,
      createdAt: now,
      updatedAt: now,
    }
  })

  // ── 2c. 所属会社（全社共通マスタ） ──
  // 「自社」＝内部リソース（isInternal: true）と、協力会社2社を生成する。
  // 協力会社は所属会社管理・契約単価（Member.contractUnitPriceHistory）機能のデモに使用する
  const COMPANY_DEFS = [
    { key: 'self', name: '自社', isInternal: true },
    { key: 'partner-a', name: 'パートナーズ株式会社A', isInternal: false },
    { key: 'partner-b', name: 'テックブリッジ株式会社', isInternal: false },
  ] as const

  const companyLookup = new Map<string, string>()
  const companies: Company[] = COMPANY_DEFS.map((c, i) => {
    const id = crypto.randomUUID()
    companyLookup.set(c.key, id)
    return {
      id,
      name: c.name,
      sortOrder: i,
      isInternal: c.isInternal,
      createdAt: now,
      updatedAt: now,
    }
  })

  // ── 3. メンバー ──
  // 4名に1名（index%4===3）を協力会社の契約要員とし、companyId・契約単価履歴を割り当てる。
  // それ以外（companyId=null）は自社（内部リソース）扱い
  const members: Member[] = DEMO_MEMBERS.map((m, i) => {
    const sectionId = sectionLookup.get(m.sectionKey)
    if (!sectionId) throw new Error(`Section not found: ${m.sectionKey}`)

    const techTagIds = m.tagNames
      .map((name) => tagLookup.get(name))
      .filter((id): id is string => id !== undefined)

    const isContracted = i % 4 === 3
    const companyId = isContracted
      ? (companyLookup.get(
          Math.floor(i / 4) % 2 === 0 ? 'partner-a' : 'partner-b',
        ) ?? null)
      : null
    // 契約単価は見積単価（unitPriceHistory）よりやや低い水準（自社マージン控除後）とする
    const contractUnitPriceHistory = companyId
      ? [
          {
            effectiveFrom: `${fiscalYear}-04`,
            amount: Math.round(m.unitPrice * 0.85),
          },
        ]
      : []

    return {
      id: crypto.randomUUID(),
      name: m.name,
      sectionId,
      companyId,
      role: m.role,
      isActive: true,
      techTagIds,
      startDate: `${fiscalYear}-04-01`,
      endDate: null,
      unitPriceHistory: [
        { effectiveFrom: `${fiscalYear}-04`, amount: m.unitPrice },
      ],
      contractUnitPriceHistory,
      createdAt: now,
      updatedAt: now,
    }
  })

  // ── 4. 案件（level-0 → level-1 → level-2） ──
  const projects: Project[] = []
  const projectTaskIds = new Map<string, string[]>() // projectCode → leaf taskIds
  const projectIdByCode = new Map<string, string>()

  // 部門一覧を順番に割り当てる（決定論的なローテーション）。EVM対象条件②
  // （divisionIdが選択中部門と一致）を満たすルートプロジェクトが確実に生成されるようにする
  const divisionIds = DEMO_DIVISIONS.map((d) =>
    divisionLookup.get(d.key),
  ).filter((id): id is string => Boolean(id))

  DEMO_PROJECTS.forEach((def, defIndex) => {
    const projectId = crypto.randomUUID()
    projectIdByCode.set(def.code, projectId)
    const divisionId = divisionIds[defIndex % divisionIds.length] ?? null

    projects.push({
      id: projectId,
      code: def.code,
      name: def.name,
      description: def.description,
      parentId: null,
      level: 0,
      status: def.status,
      confidence: def.confidence,
      divisionId,
      completed: false,
      createdAt: now,
      updatedAt: now,
    })

    const leafTaskIds: string[] = []
    // WBS完了フラグのデモ用カウンタ。最下層タスク（level-2）の
    // 約2/3を完了済みとし、進捗率ロールアップ表示が非自明な値になるようにする
    let leafIndex = 0
    for (const task of def.tasks) {
      const taskId = crypto.randomUUID()
      projects.push({
        id: taskId,
        code: `${def.code}-${task.codeSuffix}`,
        name: task.name,
        parentId: projectId,
        level: 1,
        status: def.status,
        confidence: def.confidence,
        completed: false,
        createdAt: now,
        updatedAt: now,
      })

      // level-2 サブタスク
      for (const subTask of task.subTasks) {
        const subTaskId = crypto.randomUUID()
        leafTaskIds.push(subTaskId)
        const isSubTaskCompleted = leafIndex % 3 !== 0
        projects.push({
          id: subTaskId,
          code: `${def.code}-${task.codeSuffix}-${subTask.codeSuffix}`,
          name: subTask.name,
          parentId: taskId,
          level: 2,
          status: def.status,
          confidence: def.confidence,
          completed: isSubTaskCompleted,
          completedAt: isSubTaskCompleted
            ? demoCompletionDate(fiscalYear, leafIndex)
            : null,
          createdAt: now,
          updatedAt: now,
        })
        leafIndex++
      }
    }
    projectTaskIds.set(def.code, leafTaskIds)
  })

  // ── 5. WBS設定 ──
  const wbsSettingsMap: Record<string, WbsSettings> = {}

  for (const def of DEMO_PROJECTS) {
    const projectId = projectIdByCode.get(def.code)
    if (!projectId) continue

    const effortColumns = Array.from({ length: 10 }, (_, i) => {
      const col = def.wbsColumns[i]
      return {
        id: `effort-${i + 1}`,
        displayName: col?.displayName ?? `工数${i + 1}`,
        enabled: i < def.wbsColumns.length,
        order: i,
        backgroundColor: DEFAULT_EFFORT_COLUMN_COLORS[i],
        ...(col
          ? {
              techTagIds: col.tagNames
                .map((n) => tagLookup.get(n))
                .filter((id): id is string => id !== undefined),
            }
          : {}),
      }
    })

    wbsSettingsMap[projectId] = {
      effortColumns,
      lastModified: now,
    }
  }

  // ── 6. 工数 ──
  const efforts: EffortEntry[] = []

  for (const def of DEMO_PROJECTS) {
    const taskIds = projectTaskIds.get(def.code) ?? []
    const enabledCount = def.wbsColumns.length

    for (const taskId of taskIds) {
      for (let ci = 0; ci < enabledCount; ci++) {
        // タスクと列に応じた妥当な工数値（1.0〜15.0人月）
        const base = 2.0 + ((taskId.charCodeAt(0) + ci * 7) % 13)
        efforts.push({
          id: crypto.randomUUID(),
          projectId: taskId,
          columnId: `effort-${ci + 1}`,
          value: Math.round(base * 10) / 10,
        })
      }
    }
  }

  // ── 7. スケジュール設定（デフォルト5工程） ──
  const scheduleSettingsMap: Record<string, PhaseSettings> = {}

  for (const def of DEMO_PROJECTS) {
    const projectId = projectIdByCode.get(def.code)
    if (!projectId) continue
    scheduleSettingsMap[projectId] = createDefaultPhaseSettings()
  }

  // ── 8. スケジュールエントリ ──
  const scheduleEntries: ScheduleEntry[] = []

  for (const def of DEMO_PROJECTS) {
    const projectId = projectIdByCode.get(def.code)
    if (!projectId) continue

    const totalMonths = def.endFiscalMonth - def.startFiscalMonth + 1
    const phases = 5
    const monthsPerPhase = Math.max(1, Math.floor(totalMonths / phases))

    for (let p = 0; p < phases; p++) {
      const phaseStartFM = def.startFiscalMonth + p * monthsPerPhase
      const phaseEndFM =
        p < phases - 1
          ? def.startFiscalMonth + (p + 1) * monthsPerPhase - 1
          : def.endFiscalMonth

      if (phaseStartFM > 12 || phaseEndFM > 12) continue

      const pStartCal = fiscalMonthToCalendarMonth(phaseStartFM)
      const pStartYear = phaseStartFM <= 9 ? fiscalYear : fiscalYear + 1
      const pEndCal = fiscalMonthToCalendarMonth(phaseEndFM)
      const pEndYear = phaseEndFM <= 9 ? fiscalYear : fiscalYear + 1

      scheduleEntries.push({
        id: crypto.randomUUID(),
        projectId,
        phaseKey: `phase-${p + 1}`,
        startDate: `${pStartYear}-${String(pStartCal).padStart(2, '0')}-01`,
        endDate: lastDayOfMonth(pEndYear, pEndCal),
      })
    }
  }

  // ── 8b. 案件×週次進捗率（EVMデモ用） ──
  // スケジュールを持つルートプロジェクトに、ステータスに応じた右肩上がりの
  // 進捗率サンプルを決定論的に生成する（実行時刻に依存しない固定値）
  const projectProgressEntries: ProjectProgressEntry[] = []
  for (const def of DEMO_PROJECTS) {
    const projectId = projectIdByCode.get(def.code)
    if (!projectId) continue
    const projectSchedule = scheduleEntries.filter(
      (e) => e.projectId === projectId,
    )
    if (projectSchedule.length === 0) continue

    let overallStart = projectSchedule[0]?.startDate as string
    let overallEnd = projectSchedule[0]?.endDate as string
    for (const entry of projectSchedule) {
      if (entry.startDate < overallStart) overallStart = entry.startDate
      if (entry.endDate > overallEnd) overallEnd = entry.endDate
    }
    const weekKeys = getIsoWeeksInRange(overallStart, overallEnd)
    if (weekKeys.length === 0) continue

    const targetProgress =
      def.status === 'completed' ? 1 : def.status === 'active' ? 0.6 : 0.1
    const sampleCount = Math.min(weekKeys.length, 8)
    const weeklyProgress: Record<string, number> = {}
    for (let i = 0; i < sampleCount; i++) {
      const weekIndex = Math.round(
        (i / Math.max(1, sampleCount - 1)) * (weekKeys.length - 1),
      )
      const weekKey = weekKeys[weekIndex]
      if (!weekKey) continue
      weeklyProgress[weekKey] =
        Math.round(((i + 1) / sampleCount) * targetProgress * 100) / 100
    }
    if (Object.keys(weeklyProgress).length === 0) continue

    projectProgressEntries.push({
      id: crypto.randomUUID(),
      projectId,
      weeklyProgress,
      createdAt: now,
      updatedAt: now,
    })
  }

  // ── 9. 工程依存関係（FS チェーン） ──
  const dependencies: PhaseDependency[] = []

  for (const def of DEMO_PROJECTS) {
    const projectId = projectIdByCode.get(def.code)
    if (!projectId) continue

    // 生成されたスケジュールエントリのフェーズキーを取得
    const projectEntries = scheduleEntries.filter(
      (e) => e.projectId === projectId,
    )
    const phaseKeys = projectEntries.map((e) => e.phaseKey).sort()

    for (let i = 0; i < phaseKeys.length - 1; i++) {
      const fromKey = phaseKeys[i]
      const toKey = phaseKeys[i + 1]
      if (!fromKey || !toKey) continue
      dependencies.push({
        id: crypto.randomUUID(),
        projectId,
        fromPhaseKey: fromKey,
        toPhaseKey: toKey,
        dependencyType: 'FS',
      })
    }
  }

  // ── 10. アサイン ──
  const assignments: AssignmentEntry[] = []
  // メンバーの月別合計を追跡
  const memberMonthTotals = new Map<string, number>() // `${memberId}:${monthKey}` → total

  function getMemberMonthTotal(memberId: string, monthKey: string): number {
    return memberMonthTotals.get(`${memberId}:${monthKey}`) ?? 0
  }

  function addMemberMonthValue(
    memberId: string,
    monthKey: string,
    value: number,
  ) {
    const key = `${memberId}:${monthKey}`
    memberMonthTotals.set(key, (memberMonthTotals.get(key) ?? 0) + value)
  }

  for (const def of DEMO_PROJECTS) {
    const projectId = projectIdByCode.get(def.code)
    const taskIds = projectTaskIds.get(def.code)
    if (!projectId || !taskIds) continue

    // WBS列のtechTagIdsを取得
    const wbsSettings = wbsSettingsMap[projectId]
    const enabledColumns =
      wbsSettings?.effortColumns.filter((c) => c.enabled) ?? []
    const projectTagIds = new Set(
      enabledColumns.flatMap((c) => c.techTagIds ?? []),
    )

    // メンバーをスコアリング
    const scoredMembers = members.map((m) => {
      const memberTagIds = new Set(m.techTagIds ?? [])
      let score = 0
      for (const tagId of projectTagIds) {
        if (memberTagIds.has(tagId)) score++
      }
      return { member: m, score }
    })
    scoredMembers.sort((a, b) => b.score - a.score)

    // スコア > 0 のメンバーを候補として取得
    const candidates = scoredMembers.filter((s) => s.score > 0)

    // アクティブ月のmonthKeyリストを生成
    const activeMonths: string[] = []
    for (let fm = def.startFiscalMonth; fm <= def.endFiscalMonth; fm++) {
      const cal = fiscalMonthToCalendarMonth(fm)
      const year = fm <= 9 ? fiscalYear : fiscalYear + 1
      activeMonths.push(`${year}-${String(cal).padStart(2, '0')}`)
    }

    // 各タスクに2〜4名アサイン
    for (let ti = 0; ti < taskIds.length; ti++) {
      const taskId = taskIds[ti]
      if (!taskId) continue
      const assignCount = Math.min(candidates.length, 2 + (ti % 3))

      // タスクごとに候補をローテーション（同じメンバーが全タスクに集中しないように）
      const offset = ti * 2
      for (let ai = 0; ai < assignCount; ai++) {
        const candidate = candidates[(offset + ai) % candidates.length]
        if (!candidate) continue

        const memberId = candidate.member.id
        const monthlyValues: Record<string, number> = {}

        // 各月にアサイン値を設定
        const assignValue = ai === 0 ? 0.3 : ai === 1 ? 0.2 : 0.1
        for (const monthKey of activeMonths) {
          const currentTotal = getMemberMonthTotal(memberId, monthKey)
          const available = Math.round((1.0 - currentTotal) * 10) / 10
          if (available >= 0.1) {
            const value = Math.min(assignValue, available)
            // 0.1刻みに丸める
            const rounded = Math.round(value * 10) / 10
            if (rounded > 0) {
              monthlyValues[monthKey] = rounded
              addMemberMonthValue(memberId, monthKey, rounded)
            }
          }
        }

        if (Object.keys(monthlyValues).length > 0) {
          assignments.push({
            id: crypto.randomUUID(),
            projectId,
            taskId,
            memberId,
            monthlyValues,
            createdAt: now,
            updatedAt: now,
          })
        }
      }
    }
  }

  // ── 11. システム設定（概算単価・係数・為替レート） ──
  const estimatedUnitPrice = 80 // 万円/人月（概算単価のデモ既定値）
  const defaultCoefficient = 1.2
  // 確度Aの金融系案件(P002)はリスク係数を高め、未着手・確度Cの案件(P008)は保守的な係数にする
  const projectCoefficients: Record<string, number> = {}
  const p002Id = projectIdByCode.get('P002')
  const p008Id = projectIdByCode.get('P008')
  if (p002Id) projectCoefficients[p002Id] = 1.3
  if (p008Id) projectCoefficients[p008Id] = 1.1
  const exchangeRateHistory = [{ effectiveFrom: `${fiscalYear}-04`, rate: 150 }]

  // ── 12. 部門予算（BudgetBreakdown・AI利用費・SaaS費用・DivisionBudget・その他予算変更） ──
  const divisionMonthKeys: string[] = []
  for (let fm = 1; fm <= 12; fm++) {
    const cal = fiscalMonthToCalendarMonth(fm)
    const year = fm <= 9 ? fiscalYear : fiscalYear + 1
    divisionMonthKeys.push(`${year}-${String(cal).padStart(2, '0')}`)
  }

  // 部門所属メンバー（sectionId→divisionId経由）を部門ごとにグルーピング
  const sectionDivisionMap = new Map(sections.map((s) => [s.id, s.divisionId]))
  const divisionMembersMap = new Map<string, Member[]>()
  for (const member of members) {
    const divisionId = member.sectionId
      ? sectionDivisionMap.get(member.sectionId)
      : undefined
    if (!divisionId) continue
    const list = divisionMembersMap.get(divisionId) ?? []
    list.push(member)
    divisionMembersMap.set(divisionId, list)
  }

  // 部門ごとの予算デモ計画（1案件をBudgetBreakdownで手動計上し、残りはWBS概算側の集計対象として残す）
  const DIVISION_BUDGET_PLANS = [
    {
      divisionKey: 'tech-solutions',
      linkedProjectCode: 'P001',
      linkedProjectLabel: 'ECサイトリニューアル 人件費',
      generalExpenseLabel: '事業部一般経費（消耗品・書籍等）',
      saasContracts: [
        {
          name: 'GitHub Enterprise',
          contractType: 'monthly' as const,
          amount: 25,
          headcount: 20,
          unitPrice: 1.25,
          paymentCycle: 'monthly' as const,
        },
        {
          name: 'Datadog',
          contractType: 'annual' as const,
          amount: 180,
          headcount: null,
          unitPrice: null,
          paymentCycle: 'annual' as const,
        },
      ],
    },
    {
      divisionKey: 'digital-innovation',
      linkedProjectCode: 'P002',
      linkedProjectLabel: '金融機関向け口座管理システム 人件費',
      generalExpenseLabel: '事業部一般経費（消耗品・書籍等）',
      saasContracts: [
        {
          name: 'Figma Organization',
          contractType: 'monthly' as const,
          amount: 15,
          headcount: 15,
          unitPrice: 1.0,
          paymentCycle: 'monthly' as const,
        },
        {
          name: 'Notion Enterprise',
          contractType: 'annual' as const,
          amount: 90,
          headcount: null,
          unitPrice: null,
          paymentCycle: 'annual' as const,
        },
      ],
    },
  ]

  const divisionBudgets: DivisionBudget[] = []
  const budgetBreakdowns: BudgetBreakdown[] = []
  const budgetAdjustments: BudgetAdjustment[] = []
  const aiUsageEntries: AiUsageEntry[] = []
  const aiUsageMemberAllocations: AiUsageMemberAllocation[] = []
  const saasContracts: SaasContract[] = []
  const personnelPlans: PersonnelPlanEntry[] = []

  for (const plan of DIVISION_BUDGET_PLANS) {
    const divisionId = divisionLookup.get(plan.divisionKey)
    if (!divisionId) continue
    const budgetId = crypto.randomUUID()
    const linkedProjectId = projectIdByCode.get(plan.linkedProjectCode)

    // 部門の人件費見込実績（BudgetActualDashboardのgetPersonnelCostと同一計算式）を算出し、
    // project_personnel予算額をそれに揃える（固定額だと予算総額と実績合計の桁が乖離し、
    // 消化率が数百%になる非現実的なデモ状態になってしまうため）
    const divisionMembersForCost = divisionMembersMap.get(divisionId) ?? []
    const personnelCost = calcSectionExpectedRevenue(
      divisionMembersForCost,
      getMemberMonthTotal,
      fiscalYear,
      4,
    )
    const projectPersonnelBudget = Math.round(personnelCost * 1.05)

    // 案件予算内訳（1件は案件リンクありでWBS概算側の二重計上除外を実演、他はrequirements10相当の付帯費用）
    budgetBreakdowns.push(
      {
        id: crypto.randomUUID(),
        budgetId,
        category: 'project_personnel',
        label: plan.linkedProjectLabel,
        amount: projectPersonnelBudget,
        estimateAmount: Math.round(projectPersonnelBudget / 1.2),
        coefficient: 1.2,
        projectId: linkedProjectId ?? null,
        recordedAt: `${fiscalYear}-04-01`,
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        budgetId,
        category: 'project_expense',
        label: '外部ツール・API利用料',
        amount: 120,
        projectId: linkedProjectId ?? null,
        recordedAt: `${fiscalYear}-04-01`,
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        budgetId,
        category: 'general_expense',
        label: plan.generalExpenseLabel,
        amount: 60,
        projectId: null,
        recordedAt: `${fiscalYear}-04-01`,
        createdAt: now,
        actualRecords: [
          {
            id: crypto.randomUUID(),
            purchasedAt: `${fiscalYear}-05-10`,
            itemLabel: '技術書籍・オンライン学習教材',
            amount: 8,
            note: null,
          },
          {
            id: crypto.randomUUID(),
            purchasedAt: `${fiscalYear}-07-15`,
            itemLabel: 'チーム懇親会費',
            amount: 5,
            note: null,
          },
        ],
      },
    )

    // その他予算変更（増額・減額の両方を実演）
    budgetAdjustments.push(
      {
        id: crypto.randomUUID(),
        budgetId,
        amount: 50,
        adjustmentType: 'increase',
        reason: '追加要員のための緊急予算増額',
        adjustedAt: `${fiscalYear}-06-01`,
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        budgetId,
        amount: 20,
        adjustmentType: 'decrease',
        reason: '一部スコープ縮小に伴う予算返還',
        adjustedAt: `${fiscalYear}-09-01`,
        createdAt: now,
      },
    )

    // AI利用費（部門全体、年度内12ヶ月分。予算＄500・実績は月ごとに変動させる）
    for (let fm = 0; fm < 12; fm++) {
      const monthKey = divisionMonthKeys[fm]
      if (!monthKey) continue
      const budgetAmount = 500
      const actualAmount = Math.max(0, 500 - (fm % 4) * 40)
      aiUsageEntries.push({
        id: crypto.randomUUID(),
        divisionId,
        sectionId: null,
        fiscalYear,
        month: monthKey,
        budgetAmount,
        actualAmount,
      })
    }

    // AI利用費のメンバー別配分（部門所属メンバーのうち代表3名、年度内12ヶ月分）
    const divisionMembers = divisionMembersMap.get(divisionId) ?? []
    const allocationMembers = divisionMembers.slice(0, 3)
    for (const member of allocationMembers) {
      for (let fm = 0; fm < 12; fm++) {
        const monthKey = divisionMonthKeys[fm]
        if (!monthKey) continue
        aiUsageMemberAllocations.push({
          id: crypto.randomUUID(),
          divisionId,
          fiscalYear,
          month: monthKey,
          memberId: member.id,
          monthlyBudget: 150,
          bufferAmount: 30,
          actualAmount: 120,
          bufferActualAmount: 10,
        })
      }
    }

    // SaaS契約（部門ごとに2件）
    for (const c of plan.saasContracts) {
      saasContracts.push({
        id: crypto.randomUUID(),
        name: c.name,
        divisionId,
        contractType: c.contractType,
        amount: c.amount,
        headcount: c.headcount,
        unitPrice: c.unitPrice,
        amountHistory: [],
        paymentCycle: c.paymentCycle,
        contractStartDate: `${fiscalYear}-04-01`,
        nextRenewalDate: `${fiscalYear + 1}-04-01`,
        note: null,
        createdAt: now,
        updatedAt: now,
      })
    }

    // DivisionBudget.initialAmount = 内訳合計 + AI利用費予算合計(万円換算) + SaaS年間コスト合計
    // （budget-store.tsのcalcAutoInitialAmountと同一の計算式をここでも踏襲する）
    const rate = exchangeRateHistory[0]?.rate ?? 0
    const breakdownTotal = budgetBreakdowns
      .filter((b) => b.budgetId === budgetId)
      .reduce((sum, b) => sum + b.amount, 0)
    const aiUsageBudgetTotal = aiUsageEntries
      .filter((e) => e.divisionId === divisionId && e.fiscalYear === fiscalYear)
      .reduce((sum, e) => sum + (e.budgetAmount * rate) / 10000, 0)
    const saasTotal = saasContracts
      .filter((c) => c.divisionId === divisionId)
      .reduce(
        (sum, c) =>
          sum + (c.paymentCycle === 'monthly' ? c.amount * 12 : c.amount),
        0,
      )

    divisionBudgets.push({
      id: budgetId,
      divisionId,
      fiscalYear,
      initialAmount: breakdownTotal + aiUsageBudgetTotal + saasTotal,
      createdAt: now,
      updatedAt: now,
    })

    // ── 13. 人員計画（4固定区分） ──
    const internalCount = divisionMembers.filter((m) => !m.companyId).length
    const externalCount = divisionMembers.length - internalCount
    const monthlyInternal: Record<string, number> = {}
    const monthlyExternal: Record<string, number> = {}
    const monthlyPlannedInternal: Record<string, number> = {}
    const monthlyPlannedExternal: Record<string, number> = {}
    const realizedPlannedInternal: Record<string, number> = {}
    const realizedPlannedExternal: Record<string, number> = {}
    for (let fm = 1; fm <= 12; fm++) {
      const monthKey = divisionMonthKeys[fm - 1]
      if (!monthKey) continue
      monthlyInternal[monthKey] = internalCount
      monthlyExternal[monthKey] = externalCount
      monthlyPlannedInternal[monthKey] = fm <= 6 ? 0 : 1
      monthlyPlannedExternal[monthKey] = fm <= 9 ? 0 : 1
      realizedPlannedInternal[monthKey] = fm <= 8 ? 0 : 1
      realizedPlannedExternal[monthKey] = fm <= 10 ? 0 : 1
    }

    personnelPlans.push(
      {
        id: crypto.randomUUID(),
        divisionId,
        fiscalYear,
        category: 'personnel_internal',
        monthlyHeadcount: monthlyInternal,
        monthlyRealizedHeadcount: {},
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        divisionId,
        fiscalYear,
        category: 'personnel_external',
        monthlyHeadcount: monthlyExternal,
        monthlyRealizedHeadcount: {},
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        divisionId,
        fiscalYear,
        category: 'planned_internal',
        monthlyHeadcount: monthlyPlannedInternal,
        monthlyRealizedHeadcount: realizedPlannedInternal,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        divisionId,
        fiscalYear,
        category: 'planned_external',
        monthlyHeadcount: monthlyPlannedExternal,
        monthlyRealizedHeadcount: realizedPlannedExternal,
        createdAt: now,
        updatedAt: now,
      },
    )
  }

  // ── 14. スキル・成長記録（SkillEvaluation・SkillRoadmapGoal） ──
  // 実行時刻(now)からの相対月数で評価日を算出し、定期評価レビュー（3ヶ月サイクル）の
  // 「見直し要」「見直し不要」の両方の状態がデモ上に混在するようにする（意図的にnew Date()依存）
  function isoDateMonthsAgo(nowIso: string, monthsAgo: number): string {
    const d = new Date(nowIso)
    d.setMonth(d.getMonth() - monthsAgo)
    return d.toISOString().slice(0, 10)
  }

  function isoDateTimeMonthsAgo(nowIso: string, monthsAgo: number): string {
    const d = new Date(nowIso)
    d.setMonth(d.getMonth() - monthsAgo)
    return d.toISOString()
  }

  const skillEvaluations: SkillEvaluation[] = []
  const skillRoadmapGoals: SkillRoadmapGoal[] = []

  let evaluatedMemberIndex = 0
  members.forEach((member, i) => {
    if (i % 3 !== 0) return
    const techTagId = member.techTagIds?.[0]
    if (!techTagId) return

    const isRecentlyUpdated = evaluatedMemberIndex % 2 === 0
    evaluatedMemberIndex++

    // 自己評価: none→beginner は全員共通の初回評価（8ヶ月前）
    skillEvaluations.push({
      id: crypto.randomUUID(),
      memberId: member.id,
      techTagId,
      evaluatorType: 'self',
      beforeLevel: 'none',
      afterLevel: 'beginner',
      evaluatedAt: isoDateMonthsAgo(now, 8),
      note: null,
      createdAt: now,
    })

    if (isRecentlyUpdated) {
      // 直近1ヶ月以内に追加評価あり → 定期評価レビューの対象外（見直し不要）
      skillEvaluations.push({
        id: crypto.randomUUID(),
        memberId: member.id,
        techTagId,
        evaluatorType: 'self',
        beforeLevel: 'beginner',
        afterLevel: 'intermediate',
        evaluatedAt: isoDateMonthsAgo(now, 1),
        note: null,
        createdAt: now,
      })

      skillRoadmapGoals.push({
        id: crypto.randomUUID(),
        memberId: member.id,
        techTagId,
        targetLevel: 'advanced',
        targetDate: `${fiscalYear + 1}-03`,
        note: null,
        createdAt: isoDateTimeMonthsAgo(now, 1),
      })
    }
    // isRecentlyUpdated=false の場合は8ヶ月前の評価が最新のまま
    // → isSkillEvaluationStale（3ヶ月サイクル）により「見直し要」として検出される

    // 上長評価は3名に1名（i%9===0）に付与し、評価者区分のバリエーションを持たせる
    if (i % 9 === 0) {
      skillEvaluations.push({
        id: crypto.randomUUID(),
        memberId: member.id,
        techTagId,
        evaluatorType: 'manager',
        beforeLevel: 'none',
        afterLevel: 'beginner',
        evaluatedAt: isoDateMonthsAgo(now, 6),
        note: null,
        createdAt: now,
      })
    }
  })

  // ── WBS列設定・工程設定をエンティティ配列へ変換（17ストアのDataAdapter配線・第11弾。
  // wbs-settings-store/schedule-settings-storeはDataAdapter経由の永続化に移行しており、
  // Database.wbsColumnSettingsEntries/scheduleSettingsEntries（案件×1レコード）として保持する） ──
  const wbsColumnSettingsEntries: WbsSettingsEntry[] = Object.entries(
    wbsSettingsMap,
  ).map(([projectId, settings]) => ({
    id: crypto.randomUUID(),
    projectId,
    effortColumns: settings.effortColumns,
    levelColors: settings.levelColors,
    lastModified: settings.lastModified,
  }))
  const scheduleSettingsEntries: PhaseSettingsEntry[] = Object.entries(
    scheduleSettingsMap,
  ).map(([projectId, settings]) => ({
    id: crypto.randomUUID(),
    projectId,
    phases: settings.phases,
    lastModified: settings.lastModified,
  }))

  // ── Database構築 ──
  const database: Database = {
    version: '1.0.0',
    fiscalYear,
    estimatedUnitPrice,
    defaultCoefficient,
    projectCoefficients,
    exchangeRateHistory,
    projects,
    members,
    efforts,
    scheduleEntries,
    dependencies,
    scheduleSettingsEntries,
    wbsColumnSettingsEntries,
    assignments,
    projectProgressEntries,
    techTags,
    techTagCategories,
    techTagSubCategories,
    divisions,
    sections,
    companies,
    divisionBudgets,
    budgetAdjustments,
    budgetBreakdowns,
    aiUsageEntries,
    aiUsageMemberAllocations,
    saasContracts,
    personnelPlans,
    skillEvaluations,
    skillRoadmapGoals,
    metadata: {
      lastModified: now,
      createdBy: 'demo-data-generator',
      version: '1.0.0',
    },
  }

  return { database }
}

/** 年度月(1=4月, 12=3月)をカレンダー月(1〜12)に変換 */
function fiscalMonthToCalendarMonth(fiscalMonth: number): number {
  return ((fiscalMonth + 2) % 12) + 1
}

/** 指定年月の最終日を YYYY-MM-DD で返す */
function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(year, month, 0)
  return `${year}-${String(month).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
