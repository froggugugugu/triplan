import { describe, expect, it } from 'vitest'
import type { EstimateSnapshot } from '@/shared/types/estimate-snapshot'
import {
  diffEstimateSnapshots,
  getLatestFpSnapshot,
  getLatestSnapshot,
  getSnapshotsForProject,
} from '@/shared/utils/estimate-snapshot-utils'

const P1 = '00000000-0000-4000-8000-0000000000a1'
const P2 = '00000000-0000-4000-8000-0000000000a2'

function snap(
  over: Partial<EstimateSnapshot> & { version: number },
): EstimateSnapshot {
  return {
    id: `00000000-0000-4000-8000-0000000000${over.version.toString(16).padStart(2, '0')}`,
    projectId: P1,
    stage: 'product_definition',
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

function fpSnap(
  version: number,
  items: { name: string; type: 'EI' | 'ILF' | 'EIF'; count: number }[],
  over: Partial<EstimateSnapshot> = {},
): EstimateSnapshot {
  return snap({
    version,
    method: 'function_point',
    basis: {
      estimatedUnitPrice: 100,
      coefficient: 1,
      workdaysPerMonth: 20,
      hoursPerDay: 8,
      hoursPerFunctionPoint: 10,
    },
    fp: { method: 'nesma_estimated', items, totalFp: 0 },
    ...over,
  })
}

describe('getSnapshotsForProject / getLatestSnapshot', () => {
  it('対象案件の版を昇順で返し、入力順に依存しない', () => {
    const list = [
      snap({ version: 3 }),
      snap({ version: 1 }),
      snap({ version: 2, projectId: P2 }),
      snap({ version: 2 }),
    ]
    expect(getSnapshotsForProject(list, P1).map((s) => s.version)).toEqual([
      1, 2, 3,
    ])
    expect(getLatestSnapshot(list, P1)?.version).toBe(3)
  })

  it('反証: 他案件の版を混ぜない・無ければnull', () => {
    expect(getLatestSnapshot([snap({ version: 5, projectId: P2 })], P1)).toBe(
      null,
    )
  })

  it('getLatestFpSnapshotはFP版のうち最新を返す（後にWBS版があっても）', () => {
    const wbsOnly = snap({
      version: 3,
      method: 'wbs',
      wbs: { leafCount: 1, totalEffortDays: 1 },
    })
    const list = [
      fpSnap(1, [{ name: 'A', type: 'ILF', count: 1 }]),
      fpSnap(2, [{ name: 'A', type: 'ILF', count: 2 }]),
      wbsOnly,
    ]
    expect(getLatestFpSnapshot(list, P1)?.version).toBe(2)
    expect(getLatestFpSnapshot([wbsOnly], P1)).toBeNull()
  })
})

describe('diffEstimateSnapshots', () => {
  it('前版が無ければ差分はすべてnull', () => {
    expect(diffEstimateSnapshots(null, snap({ version: 1 }))).toEqual({
      effortDaysDelta: null,
      amountDelta: null,
      fpItems: null,
    })
  })

  it('工数・金額の差を返す（人日は2桁丸め）', () => {
    const prev = snap({ version: 1, effortDays: 100.1, amount: 500 })
    const next = snap({ version: 2, effortDays: 120.35, amount: 620 })
    const diff = diffEstimateSnapshots(prev, next)
    expect(diff.effortDaysDelta).toBe(20.25)
    expect(diff.amountDelta).toBe(120)
  })

  it('反証: どちらかがFP版でなければFP項目の差分は出さない（工数・金額の差のみ）', () => {
    const prev = fpSnap(1, [{ name: 'A', type: 'ILF', count: 1 }])
    const next = snap({
      version: 2,
      method: 'wbs',
      wbs: { leafCount: 1, totalEffortDays: 1 },
    })
    expect(diffEstimateSnapshots(prev, next).fpItems).toBeNull()
    expect(diffEstimateSnapshots(next, prev).fpItems).toBeNull()
  })

  it('FP項目の追加・削除・件数変化を名前一致で返す', () => {
    const prev = fpSnap(1, [
      { name: '顧客', type: 'ILF', count: 1 },
      { name: '請求', type: 'ILF', count: 1 },
      { name: '登録画面', type: 'EI', count: 2 },
    ])
    const next = fpSnap(2, [
      { name: '顧客', type: 'ILF', count: 1 },
      { name: '登録画面', type: 'EI', count: 3 },
      { name: '承認画面', type: 'EI', count: 1 },
    ])
    const diff = diffEstimateSnapshots(prev, next).fpItems
    expect(diff?.added.map((i) => i.name)).toEqual(['承認画面'])
    expect(diff?.removed.map((i) => i.name)).toEqual(['請求'])
    expect(diff?.changed).toEqual([
      {
        name: '登録画面',
        before: { type: 'EI', count: 2 },
        after: { type: 'EI', count: 3 },
      },
    ])
  })

  it('反証: 変化の無い項目は返さない・種別だけ変わった項目はchangedに出す', () => {
    const prev = fpSnap(1, [{ name: '顧客', type: 'ILF', count: 1 }])
    const same = fpSnap(2, [{ name: '顧客', type: 'ILF', count: 1 }])
    expect(diffEstimateSnapshots(prev, same).fpItems).toEqual({
      added: [],
      removed: [],
      changed: [],
    })
    const retyped = fpSnap(2, [{ name: '顧客', type: 'EIF', count: 1 }])
    expect(diffEstimateSnapshots(prev, retyped).fpItems?.changed).toHaveLength(
      1,
    )
  })

  it('反証: 同名が複数行あっても先勝ちで1件として扱い、重複して追加扱いにしない', () => {
    const prev = fpSnap(1, [{ name: 'A', type: 'EI', count: 1 }])
    const next = fpSnap(2, [
      { name: 'A', type: 'EI', count: 1 },
      { name: 'A', type: 'EI', count: 5 },
    ])
    const diff = diffEstimateSnapshots(prev, next).fpItems
    expect(diff?.added).toEqual([])
    expect(diff?.changed).toEqual([])
  })
})
