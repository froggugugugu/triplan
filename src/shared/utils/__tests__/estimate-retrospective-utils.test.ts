import { describe, expect, it } from 'vitest'
import type { AssignmentEntry, EstimateSnapshot, Member } from '@/shared/types'
import {
  buildRetrospectiveRows,
  calcActualCostAmount,
  calcActualEffortDays,
  calcActualHoursPerFp,
  calcCalibrationHint,
  median,
  resolveActualReference,
} from '@/shared/utils/estimate-retrospective-utils'

const P1 = '00000000-0000-4000-8000-0000000000a1'
const P2 = '00000000-0000-4000-8000-0000000000a2'
const M1 = '00000000-0000-4000-8000-0000000000b1'
const M2 = '00000000-0000-4000-8000-0000000000b2'
const NOW = new Date(2026, 8, 15) // 2026-09-15（ローカル）

function member(id: string, price = 100): Member {
  return {
    id,
    name: id,
    sectionId: null,
    role: 'SE',
    isActive: true,
    startDate: null,
    endDate: null,
    unitPriceHistory: [{ effectiveFrom: '2026-01', amount: price }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function assignment(
  projectId: string,
  memberId: string,
  monthlyValues: Record<string, number>,
  actualMonthlyValues?: Record<string, number>,
): AssignmentEntry {
  return {
    id: crypto.randomUUID(),
    projectId,
    taskId: crypto.randomUUID(),
    memberId,
    monthlyValues,
    actualMonthlyValues,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function snap(
  over: Partial<EstimateSnapshot> & { version: number },
): EstimateSnapshot {
  return {
    id: crypto.randomUUID(),
    projectId: P1,
    stage: 'requirements_complete',
    method: 'manual',
    label: `v${over.version}`,
    takenAt: '2026-09-01T00:00:00.000Z',
    effortDays: 100,
    amount: 500,
    basis: {
      estimatedUnitPrice: 100,
      coefficient: 1,
      workdaysPerMonth: 20,
      hoursPerDay: 8,
    },
    changeRequestId: null,
    authorName: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...over,
  }
}

describe('calcActualEffortDays', () => {
  it('当月以前の配分（実績の例外入力優先）を合算し人日にする', () => {
    const assignments = [
      assignment(P1, M1, { '2026-08': 1, '2026-09': 0.5 }, { '2026-08': 1.2 }),
      assignment(P1, M2, { '2026-09': 0.5 }),
    ]
    // 8月: 実績1.2 ／ 9月: 0.5 + 0.5 → 2.2人月 × 20 = 44人日
    expect(
      calcActualEffortDays(P1, assignments, [member(M1), member(M2)], 20, NOW),
    ).toBe(44)
  })

  it('反証: 未来月の配分は実績に含めない', () => {
    const assignments = [
      assignment(P1, M1, { '2026-09': 0.5, '2026-10': 1, '2027-01': 1 }),
    ]
    expect(calcActualEffortDays(P1, assignments, [member(M1)], 20, NOW)).toBe(
      10,
    )
  })

  it('反証: 他案件のアサイン・削除済みメンバーの配分は除外する', () => {
    const assignments = [
      assignment(P2, M1, { '2026-09': 1 }),
      assignment(P1, M2, { '2026-09': 1 }),
    ]
    expect(calcActualEffortDays(P1, assignments, [member(M1)], 20, NOW)).toBe(0)
  })

  it('計画に無い月の実績だけの入力（計画外稼働）も拾う', () => {
    const assignments = [assignment(P1, M1, {}, { '2026-07': 0.25 })]
    expect(calcActualEffortDays(P1, assignments, [member(M1)], 20, NOW)).toBe(5)
  })
})

describe('calcActualCostAmount', () => {
  it('EVMのACと同じ算出で当週までの実コストを返す', () => {
    const assignments = [assignment(P1, M1, { '2026-08': 1 })]
    expect(calcActualCostAmount(P1, assignments, [member(M1, 100)], NOW)).toBe(
      100,
    )
  })
})

describe('resolveActualReference', () => {
  it('完了時の記録（actual）があればそれを採る', () => {
    const list = [
      snap({ version: 1 }),
      snap({
        version: 2,
        method: 'actual',
        stage: 'completed',
        effortDays: 130,
        amount: 650,
      }),
    ]
    expect(
      resolveActualReference(list, { effortDays: 999, amount: 9999 }),
    ).toEqual({ effortDays: 130, amount: 650, fromCompletedRecord: true })
  })

  it('無ければ現在の実績を使う', () => {
    expect(
      resolveActualReference([snap({ version: 1 })], {
        effortDays: 50,
        amount: 250,
      }),
    ).toEqual({ effortDays: 50, amount: 250, fromCompletedRecord: false })
  })
})

describe('buildRetrospectiveRows', () => {
  it('版ごとの誤差比とコーン内判定を返す（実績の記録自体は行にしない）', () => {
    const list = [
      snap({ version: 2, effortDays: 120, amount: 600 }),
      snap({
        version: 1,
        stage: 'initial_concept',
        effortDays: 50,
        amount: 250,
      }),
      snap({
        version: 3,
        method: 'actual',
        stage: 'completed',
        effortDays: 130,
        amount: 650,
      }),
    ]
    const rows = buildRetrospectiveRows(list, { effortDays: 130, amount: 650 })
    expect(rows.map((r) => r.snapshot.version)).toEqual([1, 2])
    expect(rows[0]?.amountRatio).toBeCloseTo(2.6)
    expect(rows[0]?.withinCone).toBe(true) // 初期コンセプトは0.25x〜4x
    expect(rows[1]?.amountRatio).toBeCloseTo(650 / 600)
    expect(rows[1]?.withinCone).toBe(true) // 要件定義完了は0.67x〜1.5x
  })

  it('反証: 見積0の版は誤差比・判定ともnull（ゼロ除算しない）', () => {
    const rows = buildRetrospectiveRows(
      [snap({ version: 1, effortDays: 0, amount: 0 })],
      { effortDays: 10, amount: 50 },
    )
    expect(rows[0]?.effortRatio).toBeNull()
    expect(rows[0]?.amountRatio).toBeNull()
    expect(rows[0]?.withinCone).toBeNull()
  })

  it('幅の外はfalse', () => {
    const rows = buildRetrospectiveRows(
      [snap({ version: 1, stage: 'detailed_design_complete', amount: 500 })],
      { effortDays: 100, amount: 600 },
    )
    expect(rows[0]?.withinCone).toBe(false)
  })
})

describe('calcActualHoursPerFp / median / calcCalibrationHint', () => {
  const fpV1 = snap({
    version: 1,
    method: 'function_point',
    basis: {
      estimatedUnitPrice: 100,
      coefficient: 1,
      workdaysPerMonth: 20,
      hoursPerDay: 8,
      hoursPerFunctionPoint: 10,
    },
    fp: { method: 'nesma_indicative', items: [], totalFp: 100 },
  })

  it('実績人日×時間/日÷最新FP版のtotalFp（2桁丸め）', () => {
    // 150人日 × 8h ÷ 100FP = 12人時/FP
    expect(calcActualHoursPerFp(P1, [fpV1], 150, 8)).toBe(12)
    expect(calcActualHoursPerFp(P1, [fpV1], 100, 7)).toBe(7)
    expect(calcActualHoursPerFp(P1, [fpV1], 33.33, 8)).toBe(2.67)
  })

  it('反証: FP版が無い・totalFp=0はnull', () => {
    expect(calcActualHoursPerFp(P1, [snap({ version: 1 })], 100, 8)).toBeNull()
    expect(
      calcActualHoursPerFp(
        P1,
        [
          {
            ...fpV1,
            fp: { method: 'nesma_indicative', items: [], totalFp: 0 },
          },
        ],
        100,
        8,
      ),
    ).toBeNull()
  })

  it('最新のFP版を使う（CRで増えた機能を含めて比較する）', () => {
    const fpV2 = {
      ...fpV1,
      id: crypto.randomUUID(),
      version: 2,
      fp: { method: 'nesma_indicative' as const, items: [], totalFp: 200 },
    }
    expect(calcActualHoursPerFp(P1, [fpV2, fpV1], 200, 8)).toBe(8)
  })

  it('medianは奇数件は中央、偶数件は中央2つの平均、0件はnull', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBeNull()
    expect(median([7])).toBe(7)
  })

  it('校正ヒント: 実績とFP版を両方持つ案件の実績人時/FPの中央値', () => {
    const actualP1 = snap({
      version: 2,
      method: 'actual',
      stage: 'completed',
      effortDays: 150, // 150×8÷100 = 12
    })
    const fpP2 = { ...fpV1, id: crypto.randomUUID(), projectId: P2 }
    const actualP2 = snap({
      version: 2,
      projectId: P2,
      method: 'actual',
      stage: 'completed',
      effortDays: 100, // 100×8÷100 = 8
    })
    const hint = calcCalibrationHint([fpV1, actualP1, fpP2, actualP2])
    expect(hint.sampleCount).toBe(2)
    expect(hint.medianHoursPerFp).toBe(10)
  })

  it('反証: 実績の記録が無い案件・FP版が無い案件は標本に入れない', () => {
    const noActual = fpV1
    const noFp = [
      snap({ version: 1, projectId: P2 }),
      snap({ version: 2, projectId: P2, method: 'actual', stage: 'completed' }),
    ]
    expect(calcCalibrationHint([noActual, ...noFp])).toEqual({
      sampleCount: 0,
      medianHoursPerFp: null,
    })
  })

  it('実績の時間/日は記録時の値（basis）を使い、現在の設定に左右されない', () => {
    const actual = snap({
      version: 2,
      method: 'actual',
      stage: 'completed',
      effortDays: 100,
      basis: {
        estimatedUnitPrice: 100,
        coefficient: 1,
        workdaysPerMonth: 20,
        hoursPerDay: 7,
      },
    })
    expect(calcCalibrationHint([fpV1, actual]).medianHoursPerFp).toBe(7)
  })
})
