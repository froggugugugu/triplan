import { describe, expect, it } from 'vitest'
import { generateDemoData } from '@/shared/data/demo-data'
import { DatabaseSchema } from '@/shared/types/database'

describe('generateDemoData', () => {
  const result = generateDemoData(2025)
  const { database } = result

  it('DatabaseSchema の Zod バリデーションを通過する', () => {
    const parsed = DatabaseSchema.safeParse(database)
    if (!parsed.success) {
      console.error(parsed.error.issues.slice(0, 5))
    }
    expect(parsed.success).toBe(true)
  })

  it('メンバー数が28名', () => {
    expect(database.members).toHaveLength(28)
  })

  it('ルートプロジェクト数が10件', () => {
    const roots = database.projects.filter((p) => p.level === 0)
    expect(roots).toHaveLength(10)
  })

  it('子タスクが存在する（level=1）', () => {
    const tasks = database.projects.filter((p) => p.level === 1)
    expect(tasks.length).toBeGreaterThanOrEqual(20)
  })

  it('サブタスクが存在する（level=2、各level-1に4〜6件）', () => {
    const level1Tasks = database.projects.filter((p) => p.level === 1)
    const level2Tasks = database.projects.filter((p) => p.level === 2)
    expect(level2Tasks.length).toBeGreaterThanOrEqual(level1Tasks.length * 4)

    for (const l1 of level1Tasks) {
      const children = level2Tasks.filter((p) => p.parentId === l1.id)
      expect(children.length).toBeGreaterThanOrEqual(4)
      expect(children.length).toBeLessThanOrEqual(6)
    }
  })

  it('技術タグカテゴリ数が17', () => {
    expect(database.techTagCategories).toHaveLength(17)
  })

  it('全メンバーの月次アサイン合計が1.0以下', () => {
    const assignments = database.assignments ?? []
    const monthTotals = new Map<string, number>()

    for (const a of assignments) {
      for (const [monthKey, value] of Object.entries(a.monthlyValues)) {
        const key = `${a.memberId}:${monthKey}`
        monthTotals.set(key, (monthTotals.get(key) ?? 0) + value)
      }
    }

    for (const [, total] of monthTotals) {
      expect(total).toBeLessThanOrEqual(1.0 + 0.001) // 浮動小数点誤差許容
    }
  })

  it('全 member.techTagIds が実在する techTag を参照', () => {
    const tagIds = new Set((database.techTags ?? []).map((t) => t.id))
    for (const member of database.members) {
      for (const tagId of member.techTagIds ?? []) {
        expect(tagIds.has(tagId)).toBe(true)
      }
    }
  })

  it('全 assignment の projectId/taskId/memberId が実在', () => {
    const projectIds = new Set(database.projects.map((p) => p.id))
    const memberIds = new Set(database.members.map((m) => m.id))

    for (const a of database.assignments ?? []) {
      expect(projectIds.has(a.projectId)).toBe(true)
      expect(projectIds.has(a.taskId)).toBe(true)
      expect(memberIds.has(a.memberId)).toBe(true)
    }
  })

  it('スケジュールの日付形式が YYYY-MM-DD', () => {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    for (const entry of database.scheduleEntries ?? []) {
      expect(entry.startDate).toMatch(dateRegex)
      expect(entry.endDate).toMatch(dateRegex)
    }
  })

  it('WBS設定が全ルートプロジェクトに存在', () => {
    const roots = database.projects.filter((p) => p.level === 0)
    const wbsColumnSettingsEntries = database.wbsColumnSettingsEntries ?? []
    for (const root of roots) {
      expect(
        wbsColumnSettingsEntries.some((e) => e.projectId === root.id),
      ).toBe(true)
    }
  })

  it('スケジュール設定が全ルートプロジェクトに存在', () => {
    const roots = database.projects.filter((p) => p.level === 0)
    const scheduleSettingsEntries = database.scheduleSettingsEntries ?? []
    for (const root of roots) {
      expect(scheduleSettingsEntries.some((e) => e.projectId === root.id)).toBe(
        true,
      )
    }
  })

  it('工数エントリが存在する', () => {
    expect((database.efforts ?? []).length).toBeGreaterThan(0)
  })

  it('組織が2部門・6課', () => {
    expect(database.divisions).toHaveLength(2)
    expect(database.sections).toHaveLength(6)
  })

  it('アサインエントリが存在する', () => {
    expect((database.assignments ?? []).length).toBeGreaterThan(0)
  })

  it('工程依存関係が存在する', () => {
    expect((database.dependencies ?? []).length).toBeGreaterThan(0)
  })

  it('fiscalYear パラメータが反映される', () => {
    expect(database.fiscalYear).toBe(2025)
    const result2024 = generateDemoData(2024)
    expect(result2024.database.fiscalYear).toBe(2024)
  })

  describe('EVM用デモデータ（完了日completedAt）', () => {
    const leaves = () => database.projects.filter((p) => p.level === 2)

    it('完了済みのサブタスクにはcompletedAtが設定される', () => {
      const completed = leaves().filter((p) => p.completed)
      expect(completed.length).toBeGreaterThan(0)
      for (const task of completed) {
        expect(task.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      }
    })

    // 反証: 未完了タスクに完了日が残っていると、EVが過大に算出される
    it('反証: 未完了のサブタスクのcompletedAtはnullである', () => {
      const pending = leaves().filter((p) => !p.completed)
      expect(pending.length).toBeGreaterThan(0)
      for (const task of pending) {
        expect(task.completedAt).toBeNull()
      }
    })

    // 反証: 完了日が全て同一だとEV曲線がフラットになり、EVMのデモとして機能しない
    it('反証: 完了日は複数の異なる日付に分散している', () => {
      const dates = new Set(
        leaves()
          .filter((p) => p.completed)
          .map((p) => p.completedAt),
      )
      expect(dates.size).toBeGreaterThan(1)
    })

    it('完了日は対象年度の期間内（4/1〜翌3/31）に収まる', () => {
      const outOfRange = leaves()
        .filter((p) => p.completed)
        .map((p) => p.completedAt as string)
        .filter((date) => date < '2025-04-01' || date > '2026-03-31')
      expect(outOfRange).toEqual([])
    })
  })

  describe('EVM用デモデータ（案件divisionId・週次進捗率）', () => {
    it('全ルートプロジェクトにdivisionIdが設定される（EVM対象条件②の前提）', () => {
      const roots = database.projects.filter((p) => p.level === 0)
      for (const root of roots) {
        expect(root.divisionId).toBeTruthy()
      }
    })

    it('divisionIdは実在するdivisionを参照する', () => {
      const divisionIds = new Set(database.divisions?.map((d) => d.id) ?? [])
      const roots = database.projects.filter((p) => p.level === 0)
      for (const root of roots) {
        expect(divisionIds.has(root.divisionId as string)).toBe(true)
      }
    })

    it('スケジュールを持つ全ルートプロジェクトにProjectProgressEntryが生成される', () => {
      const roots = database.projects.filter((p) => p.level === 0)
      const progressEntries = database.projectProgressEntries ?? []
      const progressProjectIds = new Set(
        progressEntries.map((e) => e.projectId),
      )
      for (const root of roots) {
        const hasSchedule = (database.scheduleEntries ?? []).some(
          (e) => e.projectId === root.id,
        )
        if (hasSchedule) {
          expect(progressProjectIds.has(root.id)).toBe(true)
        }
      }
    })

    it('ProjectProgressEntryのprojectIdは実在するプロジェクトを参照する', () => {
      const projectIds = new Set(database.projects.map((p) => p.id))
      for (const entry of database.projectProgressEntries ?? []) {
        expect(projectIds.has(entry.projectId)).toBe(true)
      }
    })

    it('反証: weeklyProgressの全値が0〜1の範囲に収まる', () => {
      for (const entry of database.projectProgressEntries ?? []) {
        for (const rate of Object.values(entry.weeklyProgress)) {
          expect(rate).toBeGreaterThanOrEqual(0)
          expect(rate).toBeLessThanOrEqual(1)
        }
      }
    })

    it('反証: weeklyProgressのキーがすべてISO週番号形式（YYYY-Www）', () => {
      const weekKeyRegex = /^\d{4}-W\d{2}$/
      for (const entry of database.projectProgressEntries ?? []) {
        for (const weekKey of Object.keys(entry.weeklyProgress)) {
          expect(weekKey).toMatch(weekKeyRegex)
        }
      }
    })

    it('反証: 各ProjectProgressEntryは少なくとも1週分のデータを持つ（空オブジェクトを生成しない）', () => {
      for (const entry of database.projectProgressEntries ?? []) {
        expect(Object.keys(entry.weeklyProgress).length).toBeGreaterThan(0)
      }
    })
  })

  describe('システム設定（概算単価・係数・為替レート）', () => {
    it('estimatedUnitPrice/defaultCoefficientが正の値で設定される', () => {
      expect(database.estimatedUnitPrice).toBeGreaterThan(0)
      expect(database.defaultCoefficient).toBeGreaterThan(0)
    })

    it('projectCoefficientsのキーは実在するプロジェクトを参照する', () => {
      const projectIds = new Set(database.projects.map((p) => p.id))
      for (const projectId of Object.keys(database.projectCoefficients ?? {})) {
        expect(projectIds.has(projectId)).toBe(true)
      }
    })

    it('反証: projectCoefficientsの値はすべて正の数', () => {
      for (const coefficient of Object.values(
        database.projectCoefficients ?? {},
      )) {
        expect(coefficient).toBeGreaterThan(0)
      }
    })

    it('exchangeRateHistoryが1件以上存在し、YYYY-MM形式・正のレートを持つ', () => {
      const history = database.exchangeRateHistory ?? []
      expect(history.length).toBeGreaterThan(0)
      for (const entry of history) {
        expect(entry.effectiveFrom).toMatch(/^\d{4}-\d{2}$/)
        expect(entry.rate).toBeGreaterThan(0)
      }
    })
  })

  describe('所属会社（Company）', () => {
    const companies = database.companies ?? []

    it('会社が1件以上生成される（内部リソース1件を含む）', () => {
      expect(companies.length).toBeGreaterThan(0)
      expect(companies.some((c) => c.isInternal)).toBe(true)
    })

    it('反証: companyIdを持つメンバーは実在する会社を参照する', () => {
      const companyIds = new Set(companies.map((c) => c.id))
      for (const member of database.members) {
        if (member.companyId) {
          expect(companyIds.has(member.companyId)).toBe(true)
        }
      }
    })

    it('反証: companyIdがnullのメンバーはcontractUnitPriceHistoryが空配列', () => {
      for (const member of database.members) {
        if (!member.companyId) {
          expect(member.contractUnitPriceHistory ?? []).toHaveLength(0)
        }
      }
    })

    it('companyIdを持つメンバーはcontractUnitPriceHistoryを1件以上持つ', () => {
      for (const member of database.members) {
        if (member.companyId) {
          expect(
            (member.contractUnitPriceHistory ?? []).length,
          ).toBeGreaterThan(0)
        }
      }
    })
  })

  describe('部門予算（DivisionBudget・BudgetBreakdown・BudgetAdjustment）', () => {
    it('全部門にDivisionBudgetが1件ずつ生成される', () => {
      const budgets = database.divisionBudgets ?? []
      expect(budgets).toHaveLength(database.divisions?.length ?? 0)
      for (const division of database.divisions ?? []) {
        expect(
          budgets.some(
            (b) =>
              b.divisionId === division.id &&
              b.fiscalYear === database.fiscalYear,
          ),
        ).toBe(true)
      }
    })

    it('BudgetBreakdownのbudgetIdは実在するDivisionBudgetを参照する', () => {
      const budgetIds = new Set(
        (database.divisionBudgets ?? []).map((b) => b.id),
      )
      for (const breakdown of database.budgetBreakdowns ?? []) {
        expect(budgetIds.has(breakdown.budgetId)).toBe(true)
      }
    })

    it('反証: BudgetBreakdownのprojectIdが設定されている場合は実在するプロジェクトを参照する', () => {
      const projectIds = new Set(database.projects.map((p) => p.id))
      for (const breakdown of database.budgetBreakdowns ?? []) {
        if (breakdown.projectId) {
          expect(projectIds.has(breakdown.projectId)).toBe(true)
        }
      }
    })

    it('general_expense区分のBudgetBreakdownはactualRecordsを1件以上持つ', () => {
      const generalExpenses = (database.budgetBreakdowns ?? []).filter(
        (b) => b.category === 'general_expense',
      )
      expect(generalExpenses.length).toBeGreaterThan(0)
      for (const b of generalExpenses) {
        expect((b.actualRecords ?? []).length).toBeGreaterThan(0)
      }
    })

    it('反証: actualRecordsの金額はすべて0以上、日付はYYYY-MM-DD形式', () => {
      for (const breakdown of database.budgetBreakdowns ?? []) {
        for (const record of breakdown.actualRecords ?? []) {
          expect(record.amount).toBeGreaterThanOrEqual(0)
          expect(record.purchasedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        }
      }
    })

    it('DivisionBudget.initialAmountは内訳合計+AI利用費予算合計+SaaS年間コスト合計と一致する', () => {
      const rate = database.exchangeRateHistory?.[0]?.rate ?? 0
      for (const budget of database.divisionBudgets ?? []) {
        const breakdownTotal = (database.budgetBreakdowns ?? [])
          .filter((b) => b.budgetId === budget.id)
          .reduce((sum, b) => sum + b.amount, 0)
        const aiUsageBudgetTotal = (database.aiUsageEntries ?? [])
          .filter(
            (e) =>
              e.divisionId === budget.divisionId &&
              e.fiscalYear === budget.fiscalYear,
          )
          .reduce(
            (sum, e) => sum + Math.round(e.budgetAmount * rate) / 10000,
            0,
          )
        const saasTotal = (database.saasContracts ?? [])
          .filter((c) => c.divisionId === budget.divisionId)
          .reduce(
            (sum, c) =>
              sum + (c.paymentCycle === 'monthly' ? c.amount * 12 : c.amount),
            0,
          )
        expect(budget.initialAmount).toBeCloseTo(
          breakdownTotal + aiUsageBudgetTotal + saasTotal,
          0,
        )
      }
    })

    it('反証: BudgetAdjustmentのamountは0以上、reasonは1文字以上、budgetIdは実在するDivisionBudgetを参照する', () => {
      const budgetIds = new Set(
        (database.divisionBudgets ?? []).map((b) => b.id),
      )
      for (const adjustment of database.budgetAdjustments ?? []) {
        expect(adjustment.amount).toBeGreaterThanOrEqual(0)
        expect(adjustment.reason.length).toBeGreaterThan(0)
        expect(budgetIds.has(adjustment.budgetId)).toBe(true)
      }
    })

    it('BudgetAdjustmentにincrease/decrease両方の区分が存在する', () => {
      const types = new Set(
        (database.budgetAdjustments ?? []).map((a) => a.adjustmentType),
      )
      expect(types.has('increase')).toBe(true)
      expect(types.has('decrease')).toBe(true)
    })
  })

  describe('AI利用費（AiUsageEntry・AiUsageMemberAllocation）', () => {
    it('全部門に年度内12ヶ月分のAiUsageEntryが生成される', () => {
      for (const division of database.divisions ?? []) {
        const entries = (database.aiUsageEntries ?? []).filter(
          (e) => e.divisionId === division.id,
        )
        expect(entries).toHaveLength(12)
      }
    })

    it('反証: AiUsageEntryのbudgetAmount/actualAmountは0以上', () => {
      for (const entry of database.aiUsageEntries ?? []) {
        expect(entry.budgetAmount).toBeGreaterThanOrEqual(0)
        expect(entry.actualAmount ?? 0).toBeGreaterThanOrEqual(0)
      }
    })

    it('AiUsageMemberAllocationのmemberId/divisionIdは実在するデータを参照する', () => {
      const memberIds = new Set(database.members.map((m) => m.id))
      const divisionIds = new Set((database.divisions ?? []).map((d) => d.id))
      for (const alloc of database.aiUsageMemberAllocations ?? []) {
        expect(memberIds.has(alloc.memberId)).toBe(true)
        expect(divisionIds.has(alloc.divisionId)).toBe(true)
      }
    })

    it('反証: 割当+バッファ割当の合計が個人予算+バッファの合計を超えない', () => {
      for (const alloc of database.aiUsageMemberAllocations ?? []) {
        expect(
          alloc.actualAmount + alloc.bufferActualAmount,
        ).toBeLessThanOrEqual(alloc.monthlyBudget + alloc.bufferAmount + 0.001)
      }
    })
  })

  describe('SaaS費用（SaasContract）', () => {
    it('全部門にSaaS契約が1件以上生成される', () => {
      for (const division of database.divisions ?? []) {
        const contracts = (database.saasContracts ?? []).filter(
          (c) => c.divisionId === division.id,
        )
        expect(contracts.length).toBeGreaterThan(0)
      }
    })

    it('反証: nextRenewalDateはcontractStartDate以降', () => {
      for (const contract of database.saasContracts ?? []) {
        expect(contract.nextRenewalDate >= contract.contractStartDate).toBe(
          true,
        )
      }
    })
  })

  describe('人員計画（PersonnelPlanEntry）', () => {
    it('全部門に4区分すべてが生成される', () => {
      for (const division of database.divisions ?? []) {
        const entries = (database.personnelPlans ?? []).filter(
          (p) => p.divisionId === division.id,
        )
        const categories = new Set(entries.map((p) => p.category))
        expect(categories).toEqual(
          new Set([
            'personnel_internal',
            'personnel_external',
            'planned_internal',
            'planned_external',
          ]),
        )
      }
    })

    it('反証: personnel_*区分はmonthlyRealizedHeadcountを持たない（自動算出のため生成時は空）', () => {
      for (const entry of database.personnelPlans ?? []) {
        if (entry.category.startsWith('personnel_')) {
          expect(
            Object.keys(entry.monthlyRealizedHeadcount ?? {}),
          ).toHaveLength(0)
        }
      }
    })

    it('反証: monthlyHeadcountの値はすべて0以上', () => {
      for (const entry of database.personnelPlans ?? []) {
        for (const value of Object.values(entry.monthlyHeadcount)) {
          expect(value).toBeGreaterThanOrEqual(0)
        }
      }
    })
  })

  describe('スキル・成長記録（SkillEvaluation・SkillRoadmapGoal）', () => {
    it('SkillEvaluationが1件以上生成される', () => {
      expect((database.skillEvaluations ?? []).length).toBeGreaterThan(0)
    })

    it('反証: memberId/techTagIdは実在し、techTagIdは対象メンバーが保有するタグ', () => {
      const memberById = new Map(database.members.map((m) => [m.id, m]))
      const tagIds = new Set((database.techTags ?? []).map((t) => t.id))
      for (const evaluation of database.skillEvaluations ?? []) {
        const member = memberById.get(evaluation.memberId)
        expect(member).toBeDefined()
        expect(tagIds.has(evaluation.techTagId)).toBe(true)
        expect(member?.techTagIds ?? []).toContain(evaluation.techTagId)
      }
    })

    it('反証: evaluatedAtはYYYY-MM-DD形式で未来日ではない', () => {
      const today = new Date().toISOString().slice(0, 10)
      for (const evaluation of database.skillEvaluations ?? []) {
        expect(evaluation.evaluatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(evaluation.evaluatedAt <= today).toBe(true)
      }
    })

    it('同一member×techTagId×evaluatorTypeの履歴はevaluatedAt昇順で、beforeLevelが直前のafterLevelと連続する', () => {
      const groups = new Map<
        string,
        { evaluatedAt: string; beforeLevel: string; afterLevel: string }[]
      >()
      for (const e of database.skillEvaluations ?? []) {
        const key = `${e.memberId}:${e.techTagId}:${e.evaluatorType}`
        const list = groups.get(key) ?? []
        list.push(e)
        groups.set(key, list)
      }
      for (const list of groups.values()) {
        const sorted = [...list].sort((a, b) =>
          a.evaluatedAt.localeCompare(b.evaluatedAt),
        )
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i]?.beforeLevel).toBe(sorted[i - 1]?.afterLevel)
        }
      }
    })

    it('SkillRoadmapGoalのmemberId/techTagIdは実在するデータを参照する', () => {
      const memberIds = new Set(database.members.map((m) => m.id))
      const tagIds = new Set((database.techTags ?? []).map((t) => t.id))
      for (const goal of database.skillRoadmapGoals ?? []) {
        expect(memberIds.has(goal.memberId)).toBe(true)
        expect(tagIds.has(goal.techTagId)).toBe(true)
      }
    })
  })

  it('生成結果は複数回呼び出しても同一fiscalYearに対して決定論的（乱数を使わない）', () => {
    const r1 = generateDemoData(2025)
    const r2 = generateDemoData(2025)
    // IDはcrypto.randomUUID()で毎回異なるため、件数と非ID値の一致で決定論性を確認する
    expect(r1.database.members.length).toBe(r2.database.members.length)
    expect(r1.database.divisionBudgets?.length).toBe(
      r2.database.divisionBudgets?.length,
    )
    expect(r1.database.divisionBudgets?.[0]?.initialAmount).toBe(
      r2.database.divisionBudgets?.[0]?.initialAmount,
    )
    expect(r1.database.skillEvaluations?.length).toBe(
      r2.database.skillEvaluations?.length,
    )
    expect(r1.database.personnelPlans?.length).toBe(
      r2.database.personnelPlans?.length,
    )
  })
})
