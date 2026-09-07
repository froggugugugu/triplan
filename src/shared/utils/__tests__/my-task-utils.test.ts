import { describe, expect, it } from 'vitest'
import { buildMyTaskRows } from '../my-task-utils'

/**
 * 「自分の担当タスク」。
 * 本ツールは全画面が組織・案件の視点で作られており、担当者個人が自分の担当を
 * 見る場所が無かった（partner・viewerには特に使い道が無い状態だった）。
 */

const ME = 'me'
const OTHER = 'other'

const PROJECTS = [
  { id: 'r1', code: 'P100', name: '会員基盤', parentId: null, level: 0 },
  {
    id: 'ph1',
    code: 'P100-01',
    name: '基本設計',
    parentId: 'r1',
    level: 1,
    phaseKey: 'phase-2',
  },
  {
    id: 't1',
    code: 'P100-01-01',
    name: '画面設計',
    parentId: 'ph1',
    level: 2,
  },
  {
    id: 't2',
    code: 'P100-01-02',
    name: 'DB設計',
    parentId: 'ph1',
    level: 2,
    completed: true,
  },
  { id: 'r2', code: 'P200', name: '在庫管理', parentId: null, level: 0 },
  { id: 't3', code: 'P200-01', name: '要件整理', parentId: 'r2', level: 1 },
]

const SCHEDULE = [
  { projectId: 'r1', phaseKey: 'phase-2', endDate: '2026-03-31' },
]

function assignment(
  over: Partial<{
    id: string
    projectId: string
    taskId: string
    memberId: string
    monthlyValues: Record<string, number>
    actualMonthlyValues?: Record<string, number>
  }> & { id: string; taskId: string; memberId: string },
) {
  return {
    projectId: 'r1',
    monthlyValues: { '2026-03': 0.5 },
    ...over,
  }
}

const MONTHS = ['2026-03', '2026-04']

describe('buildMyTaskRows', () => {
  it('自分に配分があるタスクを行として返す', () => {
    const rows = buildMyTaskRows({
      memberId: ME,
      projects: PROJECTS,
      assignments: [assignment({ id: 'a1', taskId: 't1', memberId: ME })],
      scheduleEntries: SCHEDULE,
      monthKeys: MONTHS,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      taskId: 't1',
      taskCode: 'P100-01-01',
      taskName: '画面設計',
      projectName: '会員基盤',
      dueDate: '2026-03-31',
      completed: false,
    })
  })

  it('対象月の配分合計を持つ', () => {
    const rows = buildMyTaskRows({
      memberId: ME,
      projects: PROJECTS,
      assignments: [
        assignment({
          id: 'a1',
          taskId: 't1',
          memberId: ME,
          monthlyValues: { '2026-03': 0.5, '2026-04': 0.25 },
        }),
      ],
      scheduleEntries: SCHEDULE,
      monthKeys: MONTHS,
    })
    expect(rows[0]?.allocation).toBeCloseTo(0.75)
  })

  describe('反証: 自分のものだけを、意味のある行だけ出す', () => {
    it('他人のアサインは含めない', () => {
      const rows = buildMyTaskRows({
        memberId: ME,
        projects: PROJECTS,
        assignments: [assignment({ id: 'a1', taskId: 't1', memberId: OTHER })],
        scheduleEntries: SCHEDULE,
        monthKeys: MONTHS,
      })
      expect(rows).toEqual([])
    })

    it('対象月の配分が全て0のアサインは含めない（過去に外した担当を残さない）', () => {
      const rows = buildMyTaskRows({
        memberId: ME,
        projects: PROJECTS,
        assignments: [
          assignment({
            id: 'a1',
            taskId: 't1',
            memberId: ME,
            monthlyValues: { '2026-03': 0 },
          }),
        ],
        scheduleEntries: SCHEDULE,
        monthKeys: MONTHS,
      })
      expect(rows).toEqual([])
    })

    it('対象月の外にしか配分が無いアサインは含めない', () => {
      const rows = buildMyTaskRows({
        memberId: ME,
        projects: PROJECTS,
        assignments: [
          assignment({
            id: 'a1',
            taskId: 't1',
            memberId: ME,
            monthlyValues: { '2025-12': 0.8 },
          }),
        ],
        scheduleEntries: SCHEDULE,
        monthKeys: MONTHS,
      })
      expect(rows).toEqual([])
    })

    it('削除済みタスクを参照するアサインは含めない（存在しない行を出さない）', () => {
      const rows = buildMyTaskRows({
        memberId: ME,
        projects: PROJECTS,
        assignments: [assignment({ id: 'a1', taskId: 'ghost', memberId: ME })],
        scheduleEntries: SCHEDULE,
        monthKeys: MONTHS,
      })
      expect(rows).toEqual([])
    })

    it('memberIdが未紐づけ（null）なら何も返さない', () => {
      const rows = buildMyTaskRows({
        memberId: null,
        projects: PROJECTS,
        assignments: [assignment({ id: 'a1', taskId: 't1', memberId: ME })],
        scheduleEntries: SCHEDULE,
        monthKeys: MONTHS,
      })
      expect(rows).toEqual([])
    })
  })

  describe('期日と並び順', () => {
    it('工程が未設定のタスクは期日なし（案件の納期で代用しない）', () => {
      const rows = buildMyTaskRows({
        memberId: ME,
        projects: PROJECTS,
        assignments: [
          assignment({
            id: 'a1',
            taskId: 't3',
            memberId: ME,
            projectId: 'r2',
          }),
        ],
        scheduleEntries: SCHEDULE,
        monthKeys: MONTHS,
      })
      expect(rows[0]?.dueDate).toBeNull()
    })

    it('反証: 期日が近い順に並び、期日なしは末尾へ回す（締切から目を離さない並び）', () => {
      const projects = [
        ...PROJECTS,
        {
          id: 'ph2',
          code: 'P100-02',
          name: '詳細設計',
          parentId: 'r1',
          level: 1,
          phaseKey: 'phase-3',
        },
        {
          id: 't4',
          code: 'P100-02-01',
          name: 'API設計',
          parentId: 'ph2',
          level: 2,
        },
      ]
      const rows = buildMyTaskRows({
        memberId: ME,
        projects,
        assignments: [
          // 期日なし
          assignment({ id: 'a3', taskId: 't3', memberId: ME, projectId: 'r2' }),
          // 2026-05-31
          assignment({ id: 'a2', taskId: 't4', memberId: ME }),
          // 2026-03-31
          assignment({ id: 'a1', taskId: 't1', memberId: ME }),
        ],
        scheduleEntries: [
          ...SCHEDULE,
          { projectId: 'r1', phaseKey: 'phase-3', endDate: '2026-05-31' },
        ],
        monthKeys: MONTHS,
      })
      expect(rows.map((r) => r.taskId)).toEqual(['t1', 't4', 't3'])
    })

    it('完了済みタスクも表示するが完了として区別する（やり残しの確認に使う）', () => {
      const rows = buildMyTaskRows({
        memberId: ME,
        projects: PROJECTS,
        assignments: [assignment({ id: 'a2', taskId: 't2', memberId: ME })],
        scheduleEntries: SCHEDULE,
        monthKeys: MONTHS,
      })
      expect(rows[0]).toMatchObject({ taskId: 't2', completed: true })
    })
  })

  it('同じタスクに複数のアサインがあっても1行にまとめる', () => {
    const rows = buildMyTaskRows({
      memberId: ME,
      projects: PROJECTS,
      assignments: [
        assignment({
          id: 'a1',
          taskId: 't1',
          memberId: ME,
          monthlyValues: { '2026-03': 0.3 },
        }),
        assignment({
          id: 'a2',
          taskId: 't1',
          memberId: ME,
          monthlyValues: { '2026-04': 0.2 },
        }),
      ],
      scheduleEntries: SCHEDULE,
      monthKeys: MONTHS,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.allocation).toBeCloseTo(0.5)
  })
})
