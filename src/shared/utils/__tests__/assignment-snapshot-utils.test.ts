import { describe, expect, it } from 'vitest'
import {
  buildAssignmentSnapshotEntries,
  diffAssignmentSnapshot,
  type SnapshotEntry,
  type SnapshotSourceAssignment,
  summarizeAssignmentDiff,
} from '../assignment-snapshot-utils'

const PRJ = 'p1'
const OTHER = 'p2'
const T1 = 't1'
const T2 = 't2'
const M1 = 'm1'
const M2 = 'm2'

function a(
  taskId: string,
  memberId: string,
  monthlyValues: Record<string, number>,
  projectId = PRJ,
): SnapshotSourceAssignment {
  return { projectId, taskId, memberId, monthlyValues }
}

function e(
  taskId: string,
  memberId: string,
  monthlyValues: Record<string, number>,
): SnapshotEntry {
  return { taskId, memberId, monthlyValues }
}

describe('buildAssignmentSnapshotEntries', () => {
  it('対象案件のアサインをタスク×メンバー粒度で記録する', () => {
    const entries = buildAssignmentSnapshotEntries(
      [a(T1, M1, { '2025-04': 0.5 }), a(T2, M2, { '2025-05': 0.3 })],
      PRJ,
    )
    expect(entries).toHaveLength(2)
    expect(entries[0]).toEqual({
      taskId: T1,
      memberId: M1,
      monthlyValues: { '2025-04': 0.5 },
    })
  })

  it('反証: 他案件のアサインを含めない', () => {
    const entries = buildAssignmentSnapshotEntries(
      [a(T1, M1, { '2025-04': 0.5 }), a(T2, M2, { '2025-04': 0.9 }, OTHER)],
      PRJ,
    )
    expect(entries).toHaveLength(1)
    expect(entries[0]?.taskId).toBe(T1)
  })

  it('反証: 配分が全て0のアサインは記録しない（体制に居ないため）', () => {
    expect(
      buildAssignmentSnapshotEntries([a(T1, M1, { '2025-04': 0 })], PRJ),
    ).toHaveLength(0)
  })

  it('反証: 元のオブジェクトを共有しない（後の編集がスナップショットへ波及しない）', () => {
    const source = a(T1, M1, { '2025-04': 0.5 })
    const entries = buildAssignmentSnapshotEntries([source], PRJ)
    source.monthlyValues['2025-04'] = 0.9
    expect(entries[0]?.monthlyValues['2025-04']).toBe(0.5)
  })

  it('並びは決定論的（taskId→memberId順）', () => {
    const forward = buildAssignmentSnapshotEntries(
      [a(T2, M2, { '2025-04': 0.1 }), a(T1, M1, { '2025-04': 0.1 })],
      PRJ,
    )
    const backward = buildAssignmentSnapshotEntries(
      [a(T1, M1, { '2025-04': 0.1 }), a(T2, M2, { '2025-04': 0.1 })],
      PRJ,
    )
    expect(forward).toEqual(backward)
  })
})

describe('diffAssignmentSnapshot', () => {
  it('増えたアサインをaddedとして返す', () => {
    const rows = diffAssignmentSnapshot(
      [],
      [a(T1, M1, { '2025-04': 0.5 })],
      PRJ,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      status: 'added',
      memberId: M1,
      totalDelta: 0.5,
    })
  })

  it('消えたアサインをremovedとして返す', () => {
    const rows = diffAssignmentSnapshot(
      [e(T1, M1, { '2025-04': 0.5 })],
      [],
      PRJ,
    )
    expect(rows[0]).toMatchObject({ status: 'removed', totalDelta: -0.5 })
  })

  it('配分が変わった月をchangedMonthsで示す', () => {
    const rows = diffAssignmentSnapshot(
      [e(T1, M1, { '2025-04': 0.5, '2025-05': 0.5 })],
      [a(T1, M1, { '2025-04': 0.5, '2025-05': 0.2 })],
      PRJ,
    )
    expect(rows[0]).toMatchObject({
      status: 'changed',
      changedMonths: ['2025-05'],
    })
    expect(rows[0]?.totalDelta).toBeCloseTo(-0.3, 5)
  })

  // ── 反証 ────────────────────────────────────────────────────────────────

  it('反証: 変化が無い行は返さない（差分だけを見せる）', () => {
    const rows = diffAssignmentSnapshot(
      [e(T1, M1, { '2025-04': 0.5 })],
      [a(T1, M1, { '2025-04': 0.5 })],
      PRJ,
    )
    expect(rows).toEqual([])
  })

  it('反証: 浮動小数点の丸め誤差を変化と誤検知しない', () => {
    const rows = diffAssignmentSnapshot(
      [e(T1, M1, { '2025-04': 0.1 + 0.2 })],
      [a(T1, M1, { '2025-04': 0.3 })],
      PRJ,
    )
    expect(rows).toEqual([])
  })

  it('反証: 同じメンバーでもタスクが違えば別の行として扱う', () => {
    const rows = diffAssignmentSnapshot(
      [e(T1, M1, { '2025-04': 0.5 })],
      [a(T2, M1, { '2025-04': 0.5 })],
      PRJ,
    )
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.status).sort()).toEqual(['added', 'removed'])
  })

  it('反証: 他案件の変更を差分に混ぜない', () => {
    const rows = diffAssignmentSnapshot(
      [e(T1, M1, { '2025-04': 0.5 })],
      [a(T1, M1, { '2025-04': 0.5 }), a(T2, M2, { '2025-04': 0.9 }, OTHER)],
      PRJ,
    )
    expect(rows).toEqual([])
  })

  it('反証: 0へ落としたアサインはremoved扱い（体制から外れたことを示す）', () => {
    const rows = diffAssignmentSnapshot(
      [e(T1, M1, { '2025-04': 0.5 })],
      [a(T1, M1, { '2025-04': 0 })],
      PRJ,
    )
    expect(rows[0]).toMatchObject({ status: 'removed', totalDelta: -0.5 })
  })

  it('反証: 月を追加した場合も変化として検出する', () => {
    const rows = diffAssignmentSnapshot(
      [e(T1, M1, { '2025-04': 0.5 })],
      [a(T1, M1, { '2025-04': 0.5, '2025-05': 0.4 })],
      PRJ,
    )
    expect(rows[0]).toMatchObject({
      status: 'changed',
      changedMonths: ['2025-05'],
    })
  })

  it('並びは決定論的（入力順に依存しない）', () => {
    const snap = [e(T2, M2, { '2025-04': 0.2 }), e(T1, M1, { '2025-04': 0.5 })]
    const cur = [a(T1, M1, { '2025-04': 0.1 }), a(T2, M2, { '2025-04': 0.9 })]
    const rows = diffAssignmentSnapshot(snap, cur, PRJ)
    expect(rows.map((r) => r.taskId)).toEqual([T1, T2])
  })
})

describe('summarizeAssignmentDiff', () => {
  it('種別ごとの件数と体制の増減量を集計する', () => {
    const rows = diffAssignmentSnapshot(
      [e(T1, M1, { '2025-04': 0.5 }), e(T2, M2, { '2025-04': 0.3 })],
      [a(T1, M1, { '2025-04': 0.2 }), a(T2, M1, { '2025-04': 0.6 })],
      PRJ,
    )
    const summary = summarizeAssignmentDiff(rows)
    expect(summary.added).toBe(1)
    expect(summary.removed).toBe(1)
    expect(summary.changed).toBe(1)
    // -0.3(M1減) -0.3(M2離脱) +0.6(M1追加) = 0
    expect(summary.totalDelta).toBeCloseTo(0, 5)
  })

  it('差分が無ければ全て0', () => {
    expect(summarizeAssignmentDiff([])).toEqual({
      added: 0,
      removed: 0,
      changed: 0,
      totalDelta: 0,
    })
  })
})
