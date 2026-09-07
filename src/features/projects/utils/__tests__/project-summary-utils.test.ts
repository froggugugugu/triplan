import { describe, expect, it } from 'vitest'
import type { ProjectBaseline } from '@/shared/types/project-baseline'
import type { EvmWeekPoint } from '@/shared/utils/evm-utils'
import {
  buildProjectTeamRows,
  calcCurrentEvmIndices,
  deriveOverallStatus,
  evaluateSummaryJudgments,
  filterJudgmentsByFinancialVisibility,
  hasSummaryEvaluationBasis,
  SUMMARY_BUDGET_PROGRESS_GAP_THRESHOLD,
  SUMMARY_SPI_WARNING_THRESHOLD,
  type SummaryJudgmentInput,
} from '../project-summary-utils'

/** 判定入力の最小ベース（各テストで必要なフィールドだけ上書きする） */
function baseInput(
  overrides: Partial<SummaryJudgmentInput> = {},
): SummaryJudgmentInput {
  return {
    project: {
      id: 'p1',
      name: 'テスト案件',
      status: 'active',
      masterDueDate: null,
    },
    today: '2026-08-20',
    scheduleStart: null,
    progressRate: null,
    contractAmount: null,
    currentBac: 0,
    actualCostTotal: 0,
    spi: null,
    baseline: null,
    billingAllocatedTotal: 0,
    teamMembers: [],
    assignments: [],
    currentMonth: '2026-08',
    ...overrides,
  }
}

function makeBaseline(bacAmount: number): ProjectBaseline {
  return {
    id: '00000000-0000-4000-8000-0000000000b1',
    projectId: 'p1',
    version: 1,
    approvedAt: '2026-04-01',
    reason: '当初計画',
    bacAmount,
    monthlyPlannedCost: {},
    plannedAllocations: [],
    createdAt: '2026-04-01T00:00:00.000Z',
  }
}

describe('evaluateSummaryJudgments', () => {
  describe('R1/R2 納期（既存collectDueDateAlertsの再利用）', () => {
    it('マスター納期を超過した未完了案件はcriticalになる', () => {
      const judgments = evaluateSummaryJudgments(
        baseInput({
          project: {
            id: 'p1',
            name: 'テスト案件',
            status: 'active',
            masterDueDate: '2026-08-19',
          },
        }),
      )
      const overdue = judgments.find((j) => j.key.startsWith('due-overdue'))
      expect(overdue?.severity).toBe('critical')
      expect(overdue?.financial).toBe(false)
    })

    it('納期当日は超過扱いにならない（境界値）', () => {
      const judgments = evaluateSummaryJudgments(
        baseInput({
          project: {
            id: 'p1',
            name: 'テスト案件',
            status: 'active',
            masterDueDate: '2026-08-20',
          },
        }),
      )
      expect(judgments.find((j) => j.key.startsWith('due-'))).toBeUndefined()
    })

    it('完了済み案件は納期超過でも対象外（反証: 誤報防止）', () => {
      const judgments = evaluateSummaryJudgments(
        baseInput({
          project: {
            id: 'p1',
            name: 'テスト案件',
            status: 'completed',
            masterDueDate: '2026-01-01',
          },
        }),
      )
      expect(judgments.find((j) => j.key.startsWith('due-'))).toBeUndefined()
    })
  })

  describe('R3 予算超過（受注額比）', () => {
    it('実コストが受注額の80%以上でwarning、100%以上でcritical', () => {
      const warning = evaluateSummaryJudgments(
        baseInput({ contractAmount: 100, actualCostTotal: 80 }),
      ).find((j) => j.key.startsWith('budget-overrun'))
      expect(warning?.severity).toBe('warning')
      expect(warning?.financial).toBe(true)

      const critical = evaluateSummaryJudgments(
        baseInput({ contractAmount: 100, actualCostTotal: 100 }),
      ).find((j) => j.key.startsWith('budget-overrun'))
      expect(critical?.severity).toBe('critical')
    })

    it('受注額未設定は判定不能としてスキップする（反証: 誤発火しない）', () => {
      const judgments = evaluateSummaryJudgments(
        baseInput({ contractAmount: null, actualCostTotal: 9999 }),
      )
      expect(
        judgments.find((j) => j.key.startsWith('budget-overrun')),
      ).toBeUndefined()
    })
  })

  describe('R4 予算先行（消化率−進捗率）', () => {
    it('消化率が進捗率を閾値超で上回るとwarning（分母は受注額優先）', () => {
      const judgments = evaluateSummaryJudgments(
        baseInput({
          contractAmount: 1000,
          actualCostTotal: 500, // 消化率50%
          progressRate: 0.3, // 進捗30% → gap 20pt > 15pt
        }),
      )
      const gap = judgments.find((j) => j.key === 'budget-progress-gap-p1')
      expect(gap?.severity).toBe('warning')
      expect(gap?.financial).toBe(true)
    })

    it('境界値: gapが閾値ちょうど（15.0pt）では警告しない', () => {
      const judgments = evaluateSummaryJudgments(
        baseInput({
          contractAmount: 1000,
          actualCostTotal: 450, // 消化率45%
          progressRate: 0.3, // gap 15.0pt ちょうど
        }),
      )
      expect(
        judgments.find((j) => j.key === 'budget-progress-gap-p1'),
      ).toBeUndefined()
    })

    it('受注額が無ければBAC（概算予算）を分母にする', () => {
      const judgments = evaluateSummaryJudgments(
        baseInput({
          contractAmount: null,
          currentBac: 1000,
          actualCostTotal: 500,
          progressRate: 0.3,
        }),
      )
      expect(
        judgments.find((j) => j.key === 'budget-progress-gap-p1'),
      ).toBeDefined()
    })

    it('反証: 受注額もBACも無い案件では発火しない（分母なし=判定不能）', () => {
      const judgments = evaluateSummaryJudgments(
        baseInput({
          contractAmount: null,
          currentBac: 0,
          actualCostTotal: 500,
          progressRate: 0.1,
        }),
      )
      expect(
        judgments.find((j) => j.key === 'budget-progress-gap-p1'),
      ).toBeUndefined()
    })

    it('反証: 進捗ソースが無い（progressRate=null）場合はスキップする', () => {
      const judgments = evaluateSummaryJudgments(
        baseInput({
          contractAmount: 1000,
          actualCostTotal: 900,
          progressRate: null,
        }),
      )
      expect(
        judgments.find((j) => j.key === 'budget-progress-gap-p1'),
      ).toBeUndefined()
    })

    it('反証: 完了済み案件では発火しない', () => {
      const judgments = evaluateSummaryJudgments(
        baseInput({
          project: {
            id: 'p1',
            name: 'テスト案件',
            status: 'completed',
            masterDueDate: null,
          },
          contractAmount: 1000,
          actualCostTotal: 900,
          progressRate: 0.3,
        }),
      )
      expect(
        judgments.find((j) => j.key === 'budget-progress-gap-p1'),
      ).toBeUndefined()
    })

    it('閾値は引数で上書きできる（設定値の反映）', () => {
      const judgments = evaluateSummaryJudgments(
        baseInput({
          contractAmount: 1000,
          actualCostTotal: 450,
          progressRate: 0.3, // gap 15pt
          budgetProgressGapThreshold: 0.1, // 閾値10ptなら発火する
        }),
      )
      expect(
        judgments.find((j) => j.key === 'budget-progress-gap-p1'),
      ).toBeDefined()
    })
  })

  describe('R5 SPI低下', () => {
    it('SPIが閾値未満でwarning（金額を含まない判定として扱う）', () => {
      const judgments = evaluateSummaryJudgments(baseInput({ spi: 0.89 }))
      const spi = judgments.find((j) => j.key === 'spi-low-p1')
      expect(spi?.severity).toBe('warning')
      expect(spi?.financial).toBe(false)
    })

    it('境界値: SPIが閾値ちょうど（0.90）では警告しない', () => {
      const judgments = evaluateSummaryJudgments(baseInput({ spi: 0.9 }))
      expect(judgments.find((j) => j.key === 'spi-low-p1')).toBeUndefined()
    })

    it('反証: SPIが算出不能（null）の案件ではスキップする', () => {
      const judgments = evaluateSummaryJudgments(baseInput({ spi: null }))
      expect(judgments.find((j) => j.key === 'spi-low-p1')).toBeUndefined()
    })

    it('反証: 完了済み案件では発火しない', () => {
      const judgments = evaluateSummaryJudgments(
        baseInput({
          project: {
            id: 'p1',
            name: 'テスト案件',
            status: 'completed',
            masterDueDate: null,
          },
          spi: 0.5,
        }),
      )
      expect(judgments.find((j) => j.key === 'spi-low-p1')).toBeUndefined()
    })
  })

  describe('R6 ベースライン乖離', () => {
    it('現行BACが凍結時から閾値超で乖離するとwarning', () => {
      const judgments = evaluateSummaryJudgments(
        baseInput({ currentBac: 1200, baseline: makeBaseline(1000) }),
      )
      const stale = judgments.find((j) => j.key === 'baseline-stale-p1')
      expect(stale?.severity).toBe('warning')
      expect(stale?.financial).toBe(true)
    })

    it('反証: 未凍結（baseline=null）の案件は対象外', () => {
      const judgments = evaluateSummaryJudgments(
        baseInput({ currentBac: 1200, baseline: null }),
      )
      expect(
        judgments.find((j) => j.key === 'baseline-stale-p1'),
      ).toBeUndefined()
    })
  })

  describe('R7 請求マイルストンの配分ギャップ', () => {
    it('配分合計と受注額の不一致でwarning', () => {
      const judgments = evaluateSummaryJudgments(
        baseInput({ contractAmount: 1000, billingAllocatedTotal: 800 }),
      )
      const gap = judgments.find((j) => j.key === 'billing-gap-p1')
      expect(gap?.severity).toBe('warning')
      expect(gap?.financial).toBe(true)
    })

    it('反証: マイルストン未登録（配分合計0）の案件では発火しない', () => {
      const judgments = evaluateSummaryJudgments(
        baseInput({ contractAmount: 1000, billingAllocatedTotal: 0 }),
      )
      expect(judgments.find((j) => j.key === 'billing-gap-p1')).toBeUndefined()
    })

    it('反証: 受注額未設定は判定不能としてスキップする', () => {
      const judgments = evaluateSummaryJudgments(
        baseInput({ contractAmount: null, billingAllocatedTotal: 800 }),
      )
      expect(judgments.find((j) => j.key === 'billing-gap-p1')).toBeUndefined()
    })

    it('一致していれば発火しない', () => {
      const judgments = evaluateSummaryJudgments(
        baseInput({ contractAmount: 1000, billingAllocatedTotal: 1000 }),
      )
      expect(judgments.find((j) => j.key === 'billing-gap-p1')).toBeUndefined()
    })
  })

  describe('R8 稼働超過（既存collectCapacityAlertsの再利用）', () => {
    it('体制メンバーの当月合計（他案件込み）が稼働率上限を超えるとwarning', () => {
      const judgments = evaluateSummaryJudgments(
        baseInput({
          teamMembers: [{ id: 'm1', name: '山田', capacityRatio: 0.8 }],
          assignments: [
            { memberId: 'm1', monthlyValues: { '2026-08': 0.5 } },
            { memberId: 'm1', monthlyValues: { '2026-08': 0.4 } },
          ],
        }),
      )
      const over = judgments.find((j) => j.key === 'capacity-m1')
      expect(over?.severity).toBe('warning')
      expect(over?.financial).toBe(false)
    })

    it('反証: 当月以外の超過は対象にしない（週次判断は当月フォーカス）', () => {
      const judgments = evaluateSummaryJudgments(
        baseInput({
          teamMembers: [{ id: 'm1', name: '山田', capacityRatio: 1 }],
          assignments: [{ memberId: 'm1', monthlyValues: { '2026-09': 1.5 } }],
        }),
      )
      expect(judgments.find((j) => j.key === 'capacity-m1')).toBeUndefined()
    })
  })

  it('複数ルール該当時は重大度順（critical→warning）に並ぶ', () => {
    const judgments = evaluateSummaryJudgments(
      baseInput({
        project: {
          id: 'p1',
          name: 'テスト案件',
          status: 'active',
          masterDueDate: '2026-01-01', // critical
        },
        spi: 0.5, // warning
      }),
    )
    expect(judgments.length).toBeGreaterThanOrEqual(2)
    expect(judgments[0]?.severity).toBe('critical')
  })
})

describe('deriveOverallStatus', () => {
  it('判定0件なら良好（good）', () => {
    expect(deriveOverallStatus([])).toBe('good')
  })

  it('warningのみならwarning、criticalが混ざればcritical', () => {
    const warning = {
      key: 'a',
      severity: 'warning' as const,
      category: 'x',
      message: 'y',
      financial: false,
    }
    expect(deriveOverallStatus([warning])).toBe('warning')
    expect(
      deriveOverallStatus([warning, { ...warning, severity: 'critical' }]),
    ).toBe('critical')
  })
})

describe('hasSummaryEvaluationBasis', () => {
  it('進捗・BAC・受注額のいずれかがあれば判定可能', () => {
    expect(
      hasSummaryEvaluationBasis({
        progressRate: 0,
        currentBac: 0,
        contractAmount: null,
      }),
    ).toBe(true) // 進捗率0は「記録あり」
    expect(
      hasSummaryEvaluationBasis({
        progressRate: null,
        currentBac: 100,
        contractAmount: null,
      }),
    ).toBe(true)
    expect(
      hasSummaryEvaluationBasis({
        progressRate: null,
        currentBac: 0,
        contractAmount: 500,
      }),
    ).toBe(true)
  })

  it('反証: 全て無い案件は判定不能（unknownバッジ表示の根拠）', () => {
    expect(
      hasSummaryEvaluationBasis({
        progressRate: null,
        currentBac: 0,
        contractAmount: null,
      }),
    ).toBe(false)
  })
})

describe('calcCurrentEvmIndices', () => {
  const series: EvmWeekPoint[] = [
    { week: '2026-W33', pv: 100, ev: 90, ac: 100 },
    { week: '2026-W34', pv: 200, ev: 160, ac: 200 },
    { week: '2026-W40', pv: 500, ev: 500, ac: 500 }, // 未来週（無視されるべき）
  ]

  it('今日以前の直近週のEV/PV・EV/ACを返す（小数2桁丸め）', () => {
    const { spi, cpi } = calcCurrentEvmIndices(series, '2026-W34')
    expect(spi).toBe(0.8) // 160/200
    expect(cpi).toBe(0.8) // 160/200
  })

  it('反証: 未来週のポイントは使わない', () => {
    const { spi } = calcCurrentEvmIndices(series, '2026-W35')
    expect(spi).toBe(0.8) // W40ではなくW34を採用
  })

  it('PV=0の週はSPI算出不能（null）、AC=0はCPI算出不能（ゼロ除算回避）', () => {
    const zeroSeries: EvmWeekPoint[] = [
      { week: '2026-W34', pv: 0, ev: 0, ac: 0 },
    ]
    const { spi, cpi } = calcCurrentEvmIndices(zeroSeries, '2026-W34')
    expect(spi).toBeNull()
    expect(cpi).toBeNull()
  })

  it('系列が空、または全て未来週ならどちらもnull', () => {
    expect(calcCurrentEvmIndices([], '2026-W34')).toEqual({
      spi: null,
      cpi: null,
    })
    expect(calcCurrentEvmIndices(series, '2026-W30')).toEqual({
      spi: null,
      cpi: null,
    })
  })
})

describe('buildProjectTeamRows', () => {
  const members = [
    {
      id: 'm1',
      name: '山田',
      role: 'PM',
      capacityRatio: undefined,
    },
    { id: 'm2', name: '佐藤', role: 'SE', capacityRatio: 0.8 },
  ]
  const monthKeys = ['2026-08', '2026-09']

  it('同一メンバーの複数タスク配分を合算し、名前順に返す', () => {
    const rows = buildProjectTeamRows(
      'p1',
      [
        {
          projectId: 'p1',
          memberId: 'm2',
          monthlyValues: { '2026-08': 0.3, '2026-09': 0.2 },
        },
        { projectId: 'p1', memberId: 'm1', monthlyValues: { '2026-08': 0.5 } },
        { projectId: 'p1', memberId: 'm2', monthlyValues: { '2026-08': 0.2 } },
      ],
      members,
      monthKeys,
      '2026-08',
    )
    expect(rows.map((r) => r.name)).toEqual(['佐藤', '山田'])
    expect(rows[0]?.currentMonthAllocation).toBeCloseTo(0.5)
    expect(rows[0]?.fiscalYearTotal).toBeCloseTo(0.7)
    expect(rows[0]?.capacityRatio).toBe(0.8)
    expect(rows[1]?.capacityRatio).toBe(1) // 未設定は1.0
  })

  it('反証: 他案件のアサインは含めない', () => {
    const rows = buildProjectTeamRows(
      'p1',
      [{ projectId: 'p2', memberId: 'm1', monthlyValues: { '2026-08': 1 } }],
      members,
      monthKeys,
      '2026-08',
    )
    expect(rows).toEqual([])
  })

  it('反証: 削除済みメンバー（members未存在）のアサインは行にしない', () => {
    const rows = buildProjectTeamRows(
      'p1',
      [
        {
          projectId: 'p1',
          memberId: 'deleted',
          monthlyValues: { '2026-08': 1 },
        },
      ],
      members,
      monthKeys,
      '2026-08',
    )
    expect(rows).toEqual([])
  })

  it('反証: 対象月範囲で配分が全て0のメンバーは体制に含めない', () => {
    const rows = buildProjectTeamRows(
      'p1',
      [{ projectId: 'p1', memberId: 'm1', monthlyValues: { '2025-04': 1 } }],
      members,
      monthKeys,
      '2026-08',
    )
    expect(rows).toEqual([])
  })
})

describe('filterJudgmentsByFinancialVisibility', () => {
  const judgments = [
    {
      key: 'a',
      severity: 'warning' as const,
      category: '予算',
      message: 'x',
      financial: true,
    },
    {
      key: 'b',
      severity: 'warning' as const,
      category: '納期',
      message: 'y',
      financial: false,
    },
  ]

  it('金額表示可なら全件、不可なら金額系判定を除外する（反証込み）', () => {
    expect(filterJudgmentsByFinancialVisibility(judgments, true)).toHaveLength(
      2,
    )
    const masked = filterJudgmentsByFinancialVisibility(judgments, false)
    expect(masked).toHaveLength(1)
    expect(masked[0]?.key).toBe('b')
  })
})

describe('既定閾値の定数', () => {
  it('設計どおりの既定値を公開する（R4=15pt・R5=0.9）', () => {
    expect(SUMMARY_BUDGET_PROGRESS_GAP_THRESHOLD).toBe(0.15)
    expect(SUMMARY_SPI_WARNING_THRESHOLD).toBe(0.9)
  })
})

describe('R9 重大リスク（リスク登録簿、非公開の設計文書）', () => {
  it('確率高×影響高のopenリスクがあるとwarningになる', () => {
    const judgments = evaluateSummaryJudgments(
      baseInput({
        contractAmount: 1000,
        risks: [
          { probability: 'high', impact: 'high', status: 'open' },
          { probability: 'high', impact: 'high', status: 'open' },
        ],
      }),
    )
    const r9 = judgments.find((j) => j.key.startsWith('risk-critical'))
    expect(r9?.severity).toBe('warning')
    expect(r9?.financial).toBe(false)
    expect(r9?.message).toContain('2件')
  })

  it('closed・realizedの重大リスクは数えない（反証: 事前警戒の対象はopenのみ）', () => {
    const judgments = evaluateSummaryJudgments(
      baseInput({
        contractAmount: 1000,
        risks: [
          { probability: 'high', impact: 'high', status: 'closed' },
          { probability: 'high', impact: 'high', status: 'realized' },
        ],
      }),
    )
    expect(
      judgments.find((j) => j.key.startsWith('risk-critical')),
    ).toBeUndefined()
  })

  it('高×中では発火しない（反証: 重大=高×高のみ）', () => {
    const judgments = evaluateSummaryJudgments(
      baseInput({
        contractAmount: 1000,
        risks: [{ probability: 'high', impact: 'medium', status: 'open' }],
      }),
    )
    expect(
      judgments.find((j) => j.key.startsWith('risk-critical')),
    ).toBeUndefined()
  })

  it('risks未指定（既存呼び出し）では判定しない（後方互換の反証）', () => {
    const judgments = evaluateSummaryJudgments(
      baseInput({ contractAmount: 1000 }),
    )
    expect(
      judgments.find((j) => j.key.startsWith('risk-critical')),
    ).toBeUndefined()
  })
})
