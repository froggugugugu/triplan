import { describe, expect, it } from 'vitest'
import type { AssignmentEntry } from '@/shared/types/assignment'
import type { Member } from '@/shared/types/member'
import type { ProjectTreeNode } from '@/shared/types/project'
import {
  buildDivisionBudgetCsvRows,
  buildMemberUtilizationCsvRows,
  buildProjectFinanceCsvRows,
} from '../report-csv'

const PROJECT_ID = crypto.randomUUID()
const TASK_ID = crypto.randomUUID()
const MEMBER_ID = crypto.randomUUID()
const DIVISION_ID = crypto.randomUUID()

function makeNode(overrides: Partial<ProjectTreeNode> = {}): ProjectTreeNode {
  return {
    id: PROJECT_ID,
    code: 'P001',
    name: 'テスト案件',
    parentId: null,
    level: 0,
    status: 'active',
    confidence: null,
    completed: false,
    createdAt: '2025-04-01T00:00:00.000Z',
    updatedAt: '2025-04-01T00:00:00.000Z',
    children: [],
    depth: 0,
    ...overrides,
  }
}

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: MEMBER_ID,
    name: 'テスト太郎',
    sectionId: null,
    companyId: null,
    role: 'SE',
    isActive: true,
    techTagIds: [],
    startDate: null,
    endDate: null,
    unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
    contractUnitPriceHistory: [],
    createdAt: '2025-04-01T00:00:00.000Z',
    updatedAt: '2025-04-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeAssignment(
  overrides: Partial<AssignmentEntry> = {},
): AssignmentEntry {
  return {
    id: crypto.randomUUID(),
    projectId: PROJECT_ID,
    taskId: TASK_ID,
    memberId: MEMBER_ID,
    monthlyValues: {},
    createdAt: '2025-04-01T00:00:00.000Z',
    updatedAt: '2025-04-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('buildProjectFinanceCsvRows', () => {
  const task = makeNode({
    id: TASK_ID,
    code: 'P001-01',
    level: 1,
    parentId: PROJECT_ID,
    completed: true,
    completedAt: '2025-05-01',
  })
  const root = makeNode({
    divisionId: DIVISION_ID,
    clientName: '株式会社クライアント',
    contractType: '請負',
    masterDueDate: '2026-03-31',
    contractAmount: 500,
    children: [task],
  })

  const baseInput = {
    projectTree: [root],
    divisions: [{ id: DIVISION_ID, name: '開発部' }],
    // 20人日 → 1人月 × 単価100 × 係数1 = 100万円
    efforts: [
      {
        id: crypto.randomUUID(),
        projectId: TASK_ID,
        columnId: 'effort-1',
        value: 20,
      },
    ],
    getColumnIds: () => ['effort-1'],
    estimatedUnitPrice: 100,
    getCoefficient: () => 1,
    // 2025-04に1.0人月 × 単価100 → 基準日2025-06-15時点で4月は全額経過 = 100万円
    assignments: [makeAssignment({ monthlyValues: { '2025-04': 1.0 } })],
    members: [makeMember()],
    budgetBreakdowns: [],
    referenceDate: new Date(2025, 5, 15),
  }

  it('ヘッダー行と案件行を構築し、既存ロジックと同じ数値を出す', () => {
    const rows = buildProjectFinanceCsvRows(baseInput)
    expect(rows).toHaveLength(2)
    expect(rows[0]?.[0]).toBe('コード')
    const [
      code,
      name,
      division,
      client,
      contractType,
      dueDate,
      contractAmount,
      estimate,
      personnel,
      expense,
      costTotal,
      grossProfit,
      profitRate,
      progress,
    ] = rows[1] as (string | number | null)[]
    expect(code).toBe('P001')
    expect(name).toBe('テスト案件')
    expect(division).toBe('開発部')
    expect(client).toBe('株式会社クライアント')
    expect(contractType).toBe('請負')
    expect(dueDate).toBe('2026-03-31')
    expect(contractAmount).toBe(500)
    expect(estimate).toBe(100)
    expect(personnel).toBe(100)
    expect(expense).toBe(0)
    expect(costTotal).toBe(100)
    expect(grossProfit).toBe(400)
    expect(profitRate).toBe(80)
    // タスク1件（完了済み）→ 進捗率100%
    expect(progress).toBe(100)
  })

  it('原価4区分: costBreakdownByProjectIdを渡すと4区分＋配賦後利益が出力される', () => {
    const rows = buildProjectFinanceCsvRows({
      ...baseInput,
      costBreakdownByProjectId: new Map([
        [
          PROJECT_ID,
          {
            laborCost: 60,
            subcontractCost: 40,
            directExpense: 0,
            allocatedOverhead: 30,
          },
        ],
      ]),
    })
    const row = rows[1] as (string | number | null)[]
    expect(rows[0]?.slice(-5)).toEqual([
      '労務費(万円)',
      '外注費(万円)',
      '直接経費(万円)',
      '間接費配賦(万円)',
      '配賦後利益(万円)',
    ])
    // 配賦後利益 = 粗利400 − 間接費配賦30
    expect(row.slice(-5)).toEqual([60, 40, 0, 30, 370])
  })

  it('反証: costBreakdownByProjectId省略時は4区分＋配賦後利益が空欄（既存呼び出しの後方互換）', () => {
    const rows = buildProjectFinanceCsvRows(baseInput)
    const row = rows[1] as (string | number | null)[]
    expect(row.slice(-5)).toEqual([null, null, null, null, null])
  })

  // 反証: 受注金額未設定の案件で粗利0・利益率0を出すと「利益ゼロの案件」と誤読される
  it('反証: 受注金額未設定の案件は受注金額・粗利・利益率を空欄にする', () => {
    const rows = buildProjectFinanceCsvRows({
      ...baseInput,
      projectTree: [makeNode({ contractAmount: null, children: [task] })],
    })
    const row = rows[1] as (string | number | null)[]
    expect(row[6]).toBeNull() // 受注金額
    expect(row[11]).toBeNull() // 粗利
    expect(row[12]).toBeNull() // 利益率
  })

  it('案件が0件でもヘッダー行のみを返す', () => {
    expect(
      buildProjectFinanceCsvRows({ ...baseInput, projectTree: [] }),
    ).toHaveLength(1)
  })

  // 反証: 人月換算日数の設定化（P0-a）。設定値が概算予算の算出へ反映される
  it('反証: workdaysPerMonthの設定変更が概算予算(万円)へ反映される（P0-a設定化）', () => {
    const rowsDefault = buildProjectFinanceCsvRows({ ...baseInput })
    const rowsHalf = buildProjectFinanceCsvRows({
      ...baseInput,
      workdaysPerMonth: 10,
    })
    const budgetDefault = (rowsDefault[1] as (string | number | null)[])[7]
    const budgetHalf = (rowsHalf[1] as (string | number | null)[])[7]
    // 1人月あたり日数を半分にすると人月数が倍になり、概算予算も増える
    expect(typeof budgetDefault).toBe('number')
    expect(budgetHalf as number).toBeGreaterThan(budgetDefault as number)
    // 省略時は従来の固定値20と同一（後方互換）
    const rowsExplicit20 = buildProjectFinanceCsvRows({
      ...baseInput,
      workdaysPerMonth: 20,
    })
    expect((rowsExplicit20[1] as (string | number | null)[])[7]).toBe(
      budgetDefault,
    )
  })
})

describe('buildMemberUtilizationCsvRows', () => {
  const months = ['2025-04', '2025-05']
  const projects = [
    { id: PROJECT_ID, name: 'テスト案件', parentId: null },
    { id: TASK_ID, name: '設計タスク', parentId: PROJECT_ID },
  ]

  it('メンバー×プロジェクトの計画・実績行と(合計)行を構築する', () => {
    const rows = buildMemberUtilizationCsvRows({
      members: [makeMember()],
      assignments: [
        makeAssignment({
          monthlyValues: { '2025-04': 1.0, '2025-05': 0.5 },
          actualMonthlyValues: { '2025-04': 0.8 },
        }),
      ],
      projects,
      monthKeys: months,
    })
    // ヘッダー + 案件行(計画/実績) + 合計行(計画/実績)
    expect(rows).toHaveLength(5)
    const planRow = rows[1] as (string | number)[]
    expect(planRow[2]).toBe('テスト案件')
    expect(planRow[3]).toBe('計画')
    expect(planRow[4]).toBe(1.0)
    expect(planRow[6]).toBe(1.5)
    const actualRow = rows[2] as (string | number)[]
    expect(actualRow[3]).toBe('実績')
    // 実績: 4月は例外入力0.8、5月は未入力→計画値0.5（無操作＝計画どおり）
    expect(actualRow[4]).toBe(0.8)
    expect(actualRow[5]).toBe(0.5)
    expect(actualRow[6]).toBe(1.3)
  })

  it('プロジェクト名はタスク直付けのアサインでもルート名へ解決する', () => {
    const rows = buildMemberUtilizationCsvRows({
      members: [makeMember()],
      assignments: [
        makeAssignment({
          projectId: TASK_ID,
          monthlyValues: { '2025-04': 0.5 },
        }),
      ],
      projects,
      monthKeys: months,
    })
    expect((rows[1] as string[])[2]).toBe('テスト案件')
  })

  // 反証: アサインの無いメンバーの空行が並ぶと帳票が読めなくなる
  it('反証: アサインの無いメンバーは出力しない', () => {
    const rows = buildMemberUtilizationCsvRows({
      members: [
        makeMember(),
        makeMember({ id: crypto.randomUUID(), name: '無配分' }),
      ],
      assignments: [makeAssignment({ monthlyValues: { '2025-04': 0.5 } })],
      projects,
      monthKeys: months,
    })
    expect(rows.some((r) => r[0] === '無配分')).toBe(false)
  })

  // 反証: 対象期間外の月の値を列へ混ぜない
  it('反証: monthKeysに無い月の配分は集計に含めない', () => {
    const rows = buildMemberUtilizationCsvRows({
      members: [makeMember()],
      assignments: [
        makeAssignment({ monthlyValues: { '2025-04': 0.5, '2026-04': 1.0 } }),
      ],
      projects,
      monthKeys: months,
    })
    const planRow = rows[1] as (string | number)[]
    expect(planRow[6]).toBe(0.5)
  })
})

describe('buildDivisionBudgetCsvRows', () => {
  it('部門×項目の行へ整形する（集計ロジック自体はbudget-store側でテスト済み）', () => {
    const rows = buildDivisionBudgetCsvRows(
      [
        {
          divisionName: '開発部',
          overview: {
            projectPersonnelTotal: 1000,
            projectExpenseTotal: 200,
            generalExpenseTotal: 300,
            aiUsageBudgetTotal: 50.4,
            saasCostTotal: 120,
            personnelPlanBudgetTotal: 800,
            projectWbsEstimateTotal: 400,
            grandTotal: 2870.4,
          },
        },
      ],
      2025,
    )
    expect(rows).toHaveLength(9)
    expect(rows[0]).toEqual(['部門', '年度', '項目', '金額(万円)'])
    expect(rows[1]?.[0]).toBe('開発部')
    expect(rows[1]?.[1]).toBe(2025)
    // 金額は整数へ丸める
    const aiRow = rows.find((r) => String(r[2]).includes('AI利用費'))
    expect(aiRow?.[3]).toBe(50)
    const totalRow = rows.find((r) => r[2] === '総合計')
    expect(totalRow?.[3]).toBe(2870)
  })

  it('部門0件でもヘッダー行のみを返す', () => {
    expect(buildDivisionBudgetCsvRows([], 2025)).toHaveLength(1)
  })
})
