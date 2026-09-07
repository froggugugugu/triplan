import { describe, expect, it } from 'vitest'
import type { AssignmentEntry } from '@/shared/types/assignment'
import type { Member } from '@/shared/types/member'
import type { Project } from '@/shared/types/project'
import { parseCsv } from '../csv-utils'
import {
  type AssignmentImportContext,
  buildAssignmentImportPlan,
} from '../master-import-assignments'

/**
 * アサインCSV一括登録（横持ち＝月が列）。
 * 誤った人・誤ったタスクへ配分を作らないこと（判別不能はskip）と、
 * 締め済み月へ書き込まないことを重点的に固定する。
 */

const NOW = '2026-04-01T00:00:00.000Z'
const ROOT_ID = '00000000-0000-4000-8000-0000000000a0'
const TASK_ID = '00000000-0000-4000-8000-0000000000a1'
const MEMBER_ID = '00000000-0000-4000-8000-0000000000b1'

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: ROOT_ID,
    code: 'P001',
    name: '案件',
    parentId: null,
    level: 0,
    status: 'not_started',
    confidence: null,
    completed: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function member(overrides: Partial<Member> = {}): Member {
  return {
    id: MEMBER_ID,
    name: '山田太郎',
    email: 'yamada@example.com',
    sectionId: null,
    role: '',
    isActive: true,
    startDate: null,
    endDate: null,
    unitPriceHistory: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

const ROOT = project()
const TASK = project({
  id: TASK_ID,
  code: 'P001-01',
  name: '要件定義',
  parentId: ROOT_ID,
  level: 1,
})
const MEMBER = member()

function ctx(
  overrides: Partial<AssignmentImportContext> = {},
): AssignmentImportContext {
  return {
    projects: [ROOT, TASK],
    members: [MEMBER],
    assignments: [],
    ...overrides,
  }
}

function plan(csv: string, overrides: Partial<AssignmentImportContext> = {}) {
  return buildAssignmentImportPlan(parseCsv(csv), ctx(overrides))
}

describe('buildAssignmentImportPlan', () => {
  it('横持ちの月列から配分を取り込み、ルート案件へ紐づける', () => {
    const result = plan(
      [
        'タスクコード,担当者,2026-04,2026-05,2026-06',
        'P001-01,山田太郎,0.5,0.5,0.3',
      ].join('\n'),
    )

    expect(result.skips).toEqual([])
    expect(result.candidates[0]).toMatchObject({
      projectId: ROOT_ID,
      projectCode: 'P001',
      taskId: TASK_ID,
      taskCode: 'P001-01',
      memberId: MEMBER_ID,
      monthlyValues: { '2026-04': 0.5, '2026-05': 0.5, '2026-06': 0.3 },
    })
    expect(result.targetMonths).toEqual(['2026-04', '2026-05', '2026-06'])
    expect(result.totalValue).toBe(1.3)
  })

  it('空欄の月はキーを作らない（0を書かなくてよい）', () => {
    const result = plan(
      ['タスクコード,担当者,2026-04,2026-05', 'P001-01,山田太郎,,0.5'].join(
        '\n',
      ),
    )
    expect(result.candidates[0]?.monthlyValues).toEqual({ '2026-05': 0.5 })
  })

  it('反証: 0の月もキーを作らない（配分なしと同じ扱いに寄せる）', () => {
    const result = plan(
      ['タスクコード,担当者,2026-04,2026-05', 'P001-01,山田太郎,0,0.5'].join(
        '\n',
      ),
    )
    expect(result.candidates[0]?.monthlyValues).toEqual({ '2026-05': 0.5 })
  })

  it('メールでも担当者を指定できる', () => {
    const result = plan(
      ['タスクコード,担当者,2026-04', 'P001-01,YAMADA@example.com,0.5'].join(
        '\n',
      ),
    )
    expect(result.candidates[0]?.memberId).toBe(MEMBER_ID)
  })

  it('プロジェクト（level 0）のコードを直接指定してもよい', () => {
    const result = plan(
      ['タスクコード,担当者,2026-04', 'P001,山田太郎,0.5'].join('\n'),
    )
    expect(result.candidates[0]).toMatchObject({
      projectId: ROOT_ID,
      taskId: ROOT_ID,
    })
  })

  describe('誤った帰属を作らない', () => {
    it('反証: 同名の担当者が複数いる行はskip（どちらか決められない）', () => {
      const result = plan(
        ['タスクコード,担当者,2026-04', 'P001-01,山田太郎,0.5'].join('\n'),
        {
          members: [
            member({ email: null }),
            member({
              id: '00000000-0000-4000-8000-0000000000b2',
              email: null,
            }),
          ],
        },
      )
      expect(result.candidates).toEqual([])
      expect(result.skips[0]?.reason).toContain('メールで指定してください')
    })

    it('反証: 存在しないタスクコードの行はskip', () => {
      const result = plan(
        ['タスクコード,担当者,2026-04', 'P999,山田太郎,0.5'].join('\n'),
      )
      expect(result.skips[0]?.reason).toContain('見つかりません')
    })

    it('反証: プロジェクトコード列が実際のルートと食い違う行はskip（書き間違いを通さない）', () => {
      const result = plan(
        [
          'プロジェクトコード,タスクコード,担当者,2026-04',
          'P999,P001-01,山田太郎,0.5',
        ].join('\n'),
      )
      expect(result.candidates).toEqual([])
      expect(result.skips[0]?.reason).toContain(
        'プロジェクトコードが一致しません',
      )
    })

    it('プロジェクトコードが合っていれば取り込む', () => {
      const result = plan(
        [
          'プロジェクトコード,タスクコード,担当者,2026-04',
          'P001,P001-01,山田太郎,0.5',
        ].join('\n'),
      )
      expect(result.candidates).toHaveLength(1)
    })
  })

  describe('既存との突合', () => {
    it('反証: 既にアサイン済みの組み合わせはskip（現行の配分を上書きしない）', () => {
      const existing: AssignmentEntry = {
        id: '00000000-0000-4000-8000-0000000000e1',
        projectId: ROOT_ID,
        taskId: TASK_ID,
        memberId: MEMBER_ID,
        monthlyValues: { '2026-04': 1 },
        createdAt: NOW,
        updatedAt: NOW,
      }
      const result = plan(
        ['タスクコード,担当者,2026-05', 'P001-01,山田太郎,0.5'].join('\n'),
        { assignments: [existing] },
      )
      expect(result.candidates).toEqual([])
      expect(result.skips[0]?.reason).toContain('既にアサイン済み')
    })

    it('反証: CSV内で同じ人×タスクが2行あれば2件目をskip', () => {
      const result = plan(
        [
          'タスクコード,担当者,2026-04',
          'P001-01,山田太郎,0.5',
          'P001-01,yamada@example.com,0.3',
        ].join('\n'),
      )
      expect(result.candidates).toHaveLength(1)
      expect(result.skips[0]?.reason).toContain('CSV内で重複')
    })
  })

  describe('締め済み月', () => {
    it('締め済みの月だけを落とし、他の月は取り込む', () => {
      const result = plan(
        [
          'タスクコード,担当者,2026-04,2026-05',
          'P001-01,山田太郎,0.5,0.5',
        ].join('\n'),
        { closedMonths: new Set(['2026-04']) },
      )
      expect(result.candidates[0]?.monthlyValues).toEqual({ '2026-05': 0.5 })
      expect(result.closedMonthsSkipped).toEqual(['2026-04'])
    })

    it('反証: 全部の月が締め済みなら行ごとskip（空のアサインを作らない）', () => {
      const result = plan(
        ['タスクコード,担当者,2026-04', 'P001-01,山田太郎,0.5'].join('\n'),
        { closedMonths: new Set(['2026-04']) },
      )
      expect(result.candidates).toEqual([])
      expect(result.skips[0]?.reason).toContain('取り込む配分がありません')
    })
  })

  describe('値の検証', () => {
    it('反証: 計画の配分は1.0を超えられない（実績と違い上限がある）', () => {
      const result = plan(
        ['タスクコード,担当者,2026-04', 'P001-01,山田太郎,1.5'].join('\n'),
      )
      expect(result.candidates).toEqual([])
      expect(result.skips[0]?.reason).toContain('0〜1で指定してください')
    })

    it('1.0ちょうどは受け付ける', () => {
      const result = plan(
        ['タスクコード,担当者,2026-04', 'P001-01,山田太郎,1'].join('\n'),
      )
      expect(result.candidates[0]?.monthlyValues).toEqual({ '2026-04': 1 })
    })

    it('負の配分はskip', () => {
      const result = plan(
        ['タスクコード,担当者,2026-04', 'P001-01,山田太郎,-0.5'].join('\n'),
      )
      expect(result.candidates).toEqual([])
    })

    it('0.01刻みへ丸める（アサイン入力と同じ規則）', () => {
      const result = plan(
        ['タスクコード,担当者,2026-04', 'P001-01,山田太郎,0.333'].join('\n'),
      )
      expect(result.candidates[0]?.monthlyValues).toEqual({ '2026-04': 0.33 })
    })
  })

  it('反証: 月の列が1つも無ければヘッダの問題として報告する（黙って0件成功にしない）', () => {
    const result = plan(['タスクコード,担当者', 'P001-01,山田太郎'].join('\n'))
    expect(result.candidates).toEqual([])
    expect(result.skips[0]?.reason).toContain('月の列')
  })

  it('必須列が無いCSVはヘッダの問題として報告する', () => {
    const result = plan(['担当者,2026-04', '山田太郎,0.5'].join('\n'))
    expect(result.skips).toEqual([
      { row: 1, reason: '「タスクコード」列が見つかりません' },
    ])
  })

  it('反証: 空行は行として数えない', () => {
    const result = plan(
      ['タスクコード,担当者,2026-04', 'P001-01,山田太郎,0.5', '', ''].join(
        '\n',
      ),
    )
    expect(result.candidates).toHaveLength(1)
    expect(result.skips).toEqual([])
  })
})
