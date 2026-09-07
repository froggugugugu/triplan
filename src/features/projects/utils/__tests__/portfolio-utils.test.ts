import { describe, expect, it } from 'vitest'
import type {
  AssignmentEntry,
  BillingMilestone,
  Member,
  ProjectProgressEntry,
  ProjectTreeNode,
} from '@/shared/types'
import { getIsoWeekKey } from '@/shared/utils/iso-week-utils'
import {
  type BuildPortfolioRowsInput,
  buildPortfolioRows,
} from '../portfolio-utils'

const NOW = '2026-08-01T00:00:00.000Z'
/** 判定基準日: 2026-08-20（ローカル日付で構築＝タイムゾーン起因のズレを避ける） */
const REFERENCE = new Date(2026, 7, 20)
const CURRENT_WEEK = getIsoWeekKey(REFERENCE)

function makeRootNode(
  overrides: Partial<ProjectTreeNode> = {},
): ProjectTreeNode {
  return {
    id: 'p1',
    code: 'P001',
    name: 'テスト案件',
    parentId: null,
    level: 0,
    status: 'active',
    confidence: null,
    completed: false,
    createdAt: NOW,
    updatedAt: NOW,
    children: [],
    depth: 0,
    ...overrides,
  }
}

function makeProgressEntry(
  projectId: string,
  progressRate: number,
): ProjectProgressEntry {
  return {
    id: `00000000-0000-4000-8000-0000000000${projectId.length}1`,
    projectId,
    weeklyProgress: { [CURRENT_WEEK]: progressRate },
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function makeMilestone(
  projectId: string,
  amount: number,
  id = 'm1',
): BillingMilestone {
  return {
    id,
    projectId,
    label: '中間金',
    amount,
    plannedAcceptanceDate: '2026-09-30',
    status: 'planned',
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function makeMember(id: string, name: string): Member {
  return {
    id,
    name,
    sectionId: null,
    role: 'PM',
    isActive: true,
    startDate: null,
    endDate: null,
    unitPriceHistory: [],
    techTagIds: [],
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function makeAssignment(
  projectId: string,
  memberId: string,
  monthlyValues: Record<string, number>,
  id = 'a1',
): AssignmentEntry {
  return {
    id,
    projectId,
    taskId: `${projectId}-task`,
    memberId,
    monthlyValues,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function baseInput(
  overrides: Partial<BuildPortfolioRowsInput> = {},
): BuildPortfolioRowsInput {
  return {
    rootNodes: [],
    divisions: [],
    scheduleEntries: [],
    efforts: [],
    progressEntries: [],
    projectBaselines: [],
    budgetBreakdowns: [],
    billingMilestones: [],
    assignments: [],
    members: [],
    referenceDate: REFERENCE,
    fiscalYear: 2026,
    fiscalYearStartMonth: 4,
    estimatedUnitPrice: 100,
    workdaysPerMonth: 20,
    canViewFinancials: true,
    getEnabledColumnIds: () => ['effort-1'],
    getCoefficient: () => 1,
    ...overrides,
  }
}

describe('buildPortfolioRows', () => {
  it('納期超過の案件がcriticalとして先頭に来て、問題の無い案件はgoodになる', () => {
    const overdue = makeRootNode({
      id: 'p-over',
      code: 'P100',
      name: '炎上案件',
      masterDueDate: '2026-08-19',
      contractAmount: 1000,
    })
    const healthy = makeRootNode({ id: 'p-ok', code: 'P200', name: '順調案件' })
    const rows = buildPortfolioRows(
      baseInput({
        rootNodes: [healthy, overdue],
        progressEntries: [makeProgressEntry('p-ok', 0.5)],
      }),
    )
    expect(rows.map((r) => r.projectId)).toEqual(['p-over', 'p-ok'])
    expect(rows[0]?.overall).toBe('critical')
    expect(
      rows[0]?.judgments.some((j) => j.key.startsWith('due-overdue')),
    ).toBe(true)
    expect(rows[1]?.overall).toBe('good')
    expect(rows[1]?.judgments).toHaveLength(0)
    expect(rows[1]?.progressRate).toBe(0.5)
  })

  it('完了済みの案件は行にしない（反証: 過去案件がポートフォリオを埋めない）', () => {
    const done = makeRootNode({
      id: 'p-done',
      status: 'completed',
      masterDueDate: '2000-01-01',
      contractAmount: 1000,
    })
    expect(buildPortfolioRows(baseInput({ rootNodes: [done] }))).toHaveLength(0)
  })

  it('判定材料（進捗・BAC・受注額）が全て無い案件はunknownで末尾に回る', () => {
    const empty = makeRootNode({ id: 'p-empty', code: 'P001' })
    const healthy = makeRootNode({ id: 'p-ok', code: 'P900' })
    const rows = buildPortfolioRows(
      baseInput({
        rootNodes: [empty, healthy],
        progressEntries: [makeProgressEntry('p-ok', 0.3)],
      }),
    )
    // コード順ならP001が先だが、unknownはgoodより後ろに回る
    expect(rows.map((r) => r.projectId)).toEqual(['p-ok', 'p-empty'])
    expect(rows[1]?.overall).toBe('unknown')
  })

  it('金額非表示では金額系判定（R7配分ギャップ等）が除外され、overallも非金額判定のみから導出される', () => {
    const project = makeRootNode({
      id: 'p-gap',
      contractAmount: 100,
    })
    const input = {
      rootNodes: [project],
      billingMilestones: [makeMilestone('p-gap', 50)],
    }
    const visible = buildPortfolioRows(
      baseInput({ ...input, canViewFinancials: true }),
    )
    expect(visible[0]?.overall).toBe('warning')
    expect(
      visible[0]?.judgments.some((j) => j.key.startsWith('billing-gap')),
    ).toBe(true)

    const masked = buildPortfolioRows(
      baseInput({ ...input, canViewFinancials: false }),
    )
    expect(masked[0]?.overall).toBe('good')
    expect(masked[0]?.judgments).toHaveLength(0)
  })

  it('同じoverall内は指摘件数の多い順→コード昇順の決定論ソート（入力順に依存しない）', () => {
    // X: R7（配分ギャップ）＋R8（稼働超過）の2件、Y/Z: R7のみ1件
    const x = makeRootNode({ id: 'p-x', code: 'P020', contractAmount: 100 })
    const y = makeRootNode({ id: 'p-y', code: 'P010', contractAmount: 100 })
    const z = makeRootNode({ id: 'p-z', code: 'P005', contractAmount: 100 })
    const member = makeMember('mem-1', '過負荷さん')
    const input = baseInput({
      rootNodes: [y, x, z],
      billingMilestones: [
        makeMilestone('p-x', 50, 'm-x'),
        makeMilestone('p-y', 50, 'm-y'),
        makeMilestone('p-z', 50, 'm-z'),
      ],
      members: [member],
      assignments: [
        // 当月（2026-08）合計1.5人月 > 上限1.0 → R8はXのみに付く
        makeAssignment('p-x', 'mem-1', { '2026-08': 1.5 }, 'a-x'),
      ],
    })
    const rows = buildPortfolioRows(input)
    expect(rows.map((r) => r.code)).toEqual(['P020', 'P005', 'P010'])
    expect(rows[0]?.judgments).toHaveLength(2)
  })

  it('リスク登録簿のR9（重大リスク）がポートフォリオの判定にも乗る（判定エンジン単一実装の反証）', () => {
    const project = makeRootNode({ id: 'p-risk', contractAmount: 100 })
    const rows = buildPortfolioRows(
      baseInput({
        rootNodes: [project],
        riskEntries: [
          {
            id: '00000000-0000-4000-8000-0000000000r1'.replace('r', 'a'),
            projectId: 'p-risk',
            title: '重大リスク',
            probability: 'high',
            impact: 'high',
            status: 'open',
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
      }),
    )
    expect(rows[0]?.overall).toBe('warning')
    expect(
      rows[0]?.judgments.some((j) => j.key.startsWith('risk-critical')),
    ).toBe(true)
  })

  it('担当部門名を解決し、部門マスタに無いdivisionId（削除済み）はnullにする', () => {
    const withDiv = makeRootNode({
      id: 'p-d1',
      code: 'P001',
      divisionId: 'div-1',
      contractAmount: 100,
    })
    const orphan = makeRootNode({
      id: 'p-d2',
      code: 'P002',
      divisionId: 'div-gone',
      contractAmount: 100,
    })
    const rows = buildPortfolioRows(
      baseInput({
        rootNodes: [withDiv, orphan],
        divisions: [{ id: 'div-1', name: '開発部' }],
      }),
    )
    expect(rows.find((r) => r.projectId === 'p-d1')?.divisionName).toBe(
      '開発部',
    )
    expect(rows.find((r) => r.projectId === 'p-d2')?.divisionName).toBeNull()
  })
})
