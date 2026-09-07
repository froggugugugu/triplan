import { describe, expect, it } from 'vitest'
import {
  buildTaskCreationPlan,
  type TaskCreationCandidate,
} from '../task-creation-core'

/**
 * API起票の対象抽出。クライアントのドライランとサーバーの再検証が
 * 同じ関数を使うため、ここでの判定がそのまま実際の起票対象になる。
 */

const ROOT = '00000000-0000-4000-8000-0000000000c0'
const PHASE = '00000000-0000-4000-8000-0000000000c1'
const TASK_A = '00000000-0000-4000-8000-0000000000c2'
const TASK_B = '00000000-0000-4000-8000-0000000000c3'
const OTHER_ROOT = '00000000-0000-4000-8000-0000000000d0'

const PROJECTS: TaskCreationCandidate[] = [
  { id: ROOT, code: 'P030', name: '会員基盤', parentId: null },
  { id: PHASE, code: 'P030-01', name: '設計', parentId: ROOT },
  {
    id: TASK_A,
    code: 'P030-01-01',
    name: '画面設計',
    parentId: PHASE,
    completionCriteria: 'レビュー完了',
  },
  { id: TASK_B, code: 'P030-01-02', name: 'DB設計', parentId: PHASE },
  { id: OTHER_ROOT, code: 'P098', name: '別案件', parentId: null },
]

describe('buildTaskCreationPlan', () => {
  it('リーフをコード昇順で対象にし、直近親をグループとして付ける', () => {
    const plan = buildTaskCreationPlan(PROJECTS, ROOT, [TASK_B, TASK_A])
    expect(plan.targets.map((t) => t.code)).toEqual([
      'P030-01-01',
      'P030-01-02',
    ])
    expect(plan.targets[0]?.group).toBe('[P030-01] 設計')
    expect(plan.targets[0]?.completionCriteria).toBe('レビュー完了')
    expect(plan.skips).toEqual([])
  })

  it('反証: 起票済み（外部ID学習済み）はskipする＝再実行で二重起票しない', () => {
    const projects = PROJECTS.map((p) =>
      p.id === TASK_A
        ? { ...p, externalSource: 'github', externalTaskId: 'acme/webapp#1' }
        : p,
    )
    const plan = buildTaskCreationPlan(projects, ROOT, [TASK_A, TASK_B])
    expect(plan.targets.map((t) => t.code)).toEqual(['P030-01-02'])
    expect(plan.skips[0]?.reason).toMatch(/起票済み/)
  })

  it('反証: 別ツールで学習済みのタスクもskipする（1タスク1外部ツール）', () => {
    const projects = PROJECTS.map((p) =>
      p.id === TASK_A
        ? { ...p, externalSource: 'backlog', externalTaskId: 'PJ-1' }
        : p,
    )
    expect(buildTaskCreationPlan(projects, ROOT, [TASK_A]).targets).toEqual([])
  })

  it('反証: 非リーフ・ルート外・存在しないIDは対象にしない', () => {
    expect(buildTaskCreationPlan(PROJECTS, ROOT, [PHASE]).targets).toEqual([])
    expect(buildTaskCreationPlan(PROJECTS, ROOT, [OTHER_ROOT]).targets).toEqual(
      [],
    )
    expect(
      buildTaskCreationPlan(PROJECTS, ROOT, [
        '00000000-0000-4000-8000-00000000dead',
      ]).targets,
    ).toEqual([])
  })

  describe('期日の導出', () => {
    const SCHEDULE = [
      { projectId: ROOT, phaseKey: 'phase-2', endDate: '2026-03-31' },
    ]
    /** 工程ノードにphaseKeyを設定した状態（配下のタスクが継承する） */
    const WITH_PHASE: TaskCreationCandidate[] = PROJECTS.map((p) =>
      p.id === PHASE ? { ...p, phaseKey: 'phase-2' } : p,
    )

    it('所属工程のスケジュール終了日が期日になる（工程ノードから継承）', () => {
      const plan = buildTaskCreationPlan(
        WITH_PHASE,
        ROOT,
        [TASK_A, TASK_B],
        SCHEDULE,
      )
      expect(plan.targets.map((t) => t.dueDate)).toEqual([
        '2026-03-31',
        '2026-03-31',
      ])
    })

    it('反証: 工程が未設定のタスクは期日なし（案件の納期で代用しない）', () => {
      const plan = buildTaskCreationPlan(
        PROJECTS,
        ROOT,
        [TASK_A, TASK_B],
        SCHEDULE,
      )
      expect(plan.targets.every((t) => t.dueDate === null)).toBe(true)
    })

    it('反証: 工程は設定済みでもスケジュール未登録なら期日なし', () => {
      const plan = buildTaskCreationPlan(WITH_PHASE, ROOT, [TASK_A], [])
      expect(plan.targets[0]?.dueDate).toBeNull()
    })

    it('反証: スケジュールを渡さない既存の呼び出しでも壊れない（後方互換）', () => {
      const plan = buildTaskCreationPlan(WITH_PHASE, ROOT, [TASK_A])
      expect(plan.targets).toHaveLength(1)
      expect(plan.targets[0]?.dueDate).toBeNull()
    })

    it('反証: 別案件のスケジュールを期日に使わない', () => {
      const otherSchedule = [
        { projectId: OTHER_ROOT, phaseKey: 'phase-2', endDate: '2099-12-31' },
      ]
      const plan = buildTaskCreationPlan(
        WITH_PHASE,
        ROOT,
        [TASK_A],
        otherSchedule,
      )
      expect(plan.targets[0]?.dueDate).toBeNull()
    })
  })

  it('反証: ルート直下のリーフはグループを持たない（空グループを作らない）', () => {
    const soloLeaf = '00000000-0000-4000-8000-0000000000c9'
    const projects: TaskCreationCandidate[] = [
      ...PROJECTS,
      { id: soloLeaf, code: 'P030-02', name: '直下タスク', parentId: ROOT },
    ]
    const plan = buildTaskCreationPlan(projects, ROOT, [soloLeaf])
    expect(plan.targets[0]?.group).toBeNull()
  })
})
