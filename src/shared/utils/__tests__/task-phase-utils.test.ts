import { describe, expect, it } from 'vitest'
import type { EffortEntry, Project } from '@/shared/types'
import type { ScheduleEntry } from '@/shared/types/schedule'
import {
  calcPhaseProgress,
  findRootProjectId,
  resolveTaskDueDate,
  resolveTaskPhaseKey,
} from '../task-phase-utils'

const NOW = '2025-09-01T00:00:00.000Z'

function project(
  over: Partial<Project> & Pick<Project, 'id' | 'code'>,
): Project {
  return {
    name: over.code,
    description: '',
    parentId: null,
    level: 0,
    status: 'active',
    confidence: null,
    completed: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  } as Project
}

/**
 * ルート案件 R
 *  └ 工程ノード PHASE（phaseKey='phase-2'）
 *      └ リーフ LEAF（phaseKey未設定＝継承する）
 *  └ 直付けノード DIRECT（phaseKey='phase-5'を自身が持つ）
 *  └ 未設定ノード ORPHAN（自身も祖先もphaseKeyを持たない）
 */
const ROOT = project({ id: 'r1', code: 'P100', level: 0 })
const PHASE = project({
  id: 'p1',
  code: 'P100-01',
  level: 1,
  parentId: 'r1',
  phaseKey: 'phase-2',
})
const LEAF = project({ id: 'l1', code: 'P100-01-01', level: 2, parentId: 'p1' })
const DIRECT = project({
  id: 'd1',
  code: 'P100-02',
  level: 1,
  parentId: 'r1',
  phaseKey: 'phase-5',
})
const ORPHAN = project({ id: 'o1', code: 'P100-03', level: 1, parentId: 'r1' })
const PROJECTS = [ROOT, PHASE, LEAF, DIRECT, ORPHAN]

const ENTRIES: ScheduleEntry[] = [
  {
    id: 'se1',
    projectId: 'r1',
    phaseKey: 'phase-2',
    startDate: '2025-10-01',
    endDate: '2025-10-31',
  },
  {
    id: 'se2',
    projectId: 'r1',
    phaseKey: 'phase-5',
    startDate: '2025-11-01',
    endDate: '2025-11-30',
  },
  // 別案件の同じ工程キー（誤って拾わないことの検証用）
  {
    id: 'se3',
    projectId: 'other-root',
    phaseKey: 'phase-2',
    startDate: '2026-01-01',
    endDate: '2026-01-31',
  },
]

describe('findRootProjectId', () => {
  it('孫タスクからルート案件のidを辿れる', () => {
    expect(findRootProjectId('l1', PROJECTS)).toBe('r1')
  })

  it('ルート自身を渡すと自分のidを返す', () => {
    expect(findRootProjectId('r1', PROJECTS)).toBe('r1')
  })

  it('存在しないidはnull', () => {
    expect(findRootProjectId('missing', PROJECTS)).toBeNull()
  })

  it('反証: 親が見つからない（データ不整合の孤児）ならnull', () => {
    const orphan = project({ id: 'x1', code: 'X', level: 1, parentId: 'ghost' })
    expect(findRootProjectId('x1', [orphan])).toBeNull()
  })

  it('反証: parentIdが循環していても無限ループせずnullを返す', () => {
    const a = project({ id: 'a', code: 'A', level: 1, parentId: 'b' })
    const b = project({ id: 'b', code: 'B', level: 1, parentId: 'a' })
    expect(findRootProjectId('a', [a, b])).toBeNull()
  })

  it('反証: 自分自身を親に持つ壊れたデータでも無限ループしない', () => {
    const self = project({ id: 's', code: 'S', level: 1, parentId: 's' })
    expect(findRootProjectId('s', [self])).toBeNull()
  })
})

describe('resolveTaskPhaseKey', () => {
  it('自身がphaseKeyを持つ場合はそれを返す', () => {
    expect(resolveTaskPhaseKey('d1', PROJECTS)).toBe('phase-5')
  })

  it('自身が持たない場合は最も近い祖先のphaseKeyを継承する', () => {
    expect(resolveTaskPhaseKey('l1', PROJECTS)).toBe('phase-2')
  })

  it('反証: 自身も祖先も持たなければnull（推測しない）', () => {
    expect(resolveTaskPhaseKey('o1', PROJECTS)).toBeNull()
  })

  it('反証: 子のphaseKeyが祖先のものより優先される（上書きできる）', () => {
    const override = project({
      id: 'l2',
      code: 'P100-01-02',
      level: 2,
      parentId: 'p1',
      phaseKey: 'phase-7',
    })
    expect(resolveTaskPhaseKey('l2', [...PROJECTS, override])).toBe('phase-7')
  })

  it('反証: 空文字のphaseKeyは未設定として扱い祖先へ遡る', () => {
    const blank = project({
      id: 'l3',
      code: 'P100-01-03',
      level: 2,
      parentId: 'p1',
      phaseKey: '',
    })
    expect(resolveTaskPhaseKey('l3', [...PROJECTS, blank])).toBe('phase-2')
  })

  it('存在しないidはnull', () => {
    expect(resolveTaskPhaseKey('missing', PROJECTS)).toBeNull()
  })

  it('反証: 循環参照でも無限ループしない', () => {
    const a = project({ id: 'a', code: 'A', level: 1, parentId: 'b' })
    const b = project({ id: 'b', code: 'B', level: 1, parentId: 'a' })
    expect(resolveTaskPhaseKey('a', [a, b])).toBeNull()
  })
})

describe('resolveTaskDueDate', () => {
  it('継承した工程のScheduleEntry.endDateを期日として返す', () => {
    expect(resolveTaskDueDate('l1', PROJECTS, ENTRIES)).toBe('2025-10-31')
  })

  it('自身が工程を持つタスクはその工程の終了日を返す', () => {
    expect(resolveTaskDueDate('d1', PROJECTS, ENTRIES)).toBe('2025-11-30')
  })

  it('反証: 工程が未設定のタスクはnull（案件全体の納期で代用しない）', () => {
    expect(resolveTaskDueDate('o1', PROJECTS, ENTRIES)).toBeNull()
  })

  it('反証: 工程は設定されているがスケジュール未登録ならnull', () => {
    const noSchedule = project({
      id: 'n1',
      code: 'P100-04',
      level: 1,
      parentId: 'r1',
      phaseKey: 'phase-9',
    })
    expect(
      resolveTaskDueDate('n1', [...PROJECTS, noSchedule], ENTRIES),
    ).toBeNull()
  })

  it('反証: 別案件の同じ工程キーのスケジュールを拾わない', () => {
    // 'other-root'にもphase-2のエントリがあるが、l1のルートはr1なのでr1側を使う
    expect(resolveTaskDueDate('l1', PROJECTS, ENTRIES)).toBe('2025-10-31')
    expect(resolveTaskDueDate('l1', PROJECTS, ENTRIES)).not.toBe('2026-01-31')
  })

  it('反証: スケジュールが空配列でも例外を投げずnull', () => {
    expect(resolveTaskDueDate('l1', PROJECTS, [])).toBeNull()
  })
})

/**
 * 索引キャッシュ（のスケーラビリティ対応）。
 * 呼び出しごとにMapを作り直すとO(n²)になるため配列参照をキーにキャッシュするが、
 * それによって「別の配列に古い結果を返す」ことがあってはならない。
 */
describe('索引キャッシュの正しさ', () => {
  it('反証: 内容の異なる別配列を渡せば、キャッシュではなくその配列の結果を返す', () => {
    const a = [
      project({ id: 'x', code: 'X', level: 0 }),
      project({ id: 'y', code: 'Y', level: 1, parentId: 'x' }),
    ]
    expect(findRootProjectId('y', a)).toBe('x')

    // 同じidだが親が別（イミュータブル更新後の新しい配列を模す）
    const b = [
      project({ id: 'z', code: 'Z', level: 0 }),
      project({ id: 'y', code: 'Y', level: 1, parentId: 'z' }),
    ]
    expect(findRootProjectId('y', b)).toBe('z')
  })

  it('同じ配列を繰り返し渡しても結果が変わらない（キャッシュが状態を汚さない）', () => {
    const results = Array.from({ length: 5 }, () =>
      resolveTaskPhaseKey('l1', PROJECTS),
    )
    expect(new Set(results).size).toBe(1)
    expect(results[0]).toBe('phase-2')
  })
})

describe('calcPhaseProgress', () => {
  const COLUMN_IDS = ['effort-1', 'effort-2']

  function effort(
    projectId: string,
    columnId: string,
    value: number,
  ): EffortEntry {
    return { id: `${projectId}-${columnId}`, projectId, columnId, value }
  }

  /**
   * R
   *  └ PH（phase-2）
   *      ├ A（工数3・完了）
   *      └ B（工数1・未完了）
   */
  const R = project({ id: 'r', code: 'P200', level: 0 })
  const PH = project({
    id: 'ph',
    code: 'P200-01',
    level: 1,
    parentId: 'r',
    phaseKey: 'phase-2',
  })
  const A = project({
    id: 'a',
    code: 'P200-01-01',
    level: 2,
    parentId: 'ph',
    completed: true,
  })
  const B = project({ id: 'b', code: 'P200-01-02', level: 2, parentId: 'ph' })
  const BASE = [R, PH, A, B]
  const EFFORTS = [effort('a', 'effort-1', 3), effort('b', 'effort-1', 1)]

  it('工程に属するリーフタスクの工数加重で進捗を算出する', () => {
    // 完了3 / 全体4 = 0.75
    expect(calcPhaseProgress('r', 'phase-2', BASE, COLUMN_IDS, EFFORTS)).toBe(
      0.75,
    )
  })

  it('反証: 工程に紐づくタスクが1件も無ければnull（進捗0%と区別する）', () => {
    // 「まだ紐づけていない工程」を0%として描くと、未着手と誤読させる
    expect(
      calcPhaseProgress('r', 'phase-9', BASE, COLUMN_IDS, EFFORTS),
    ).toBeNull()
  })

  it('反証: 工数が全て0のときはタスク数ベースへフォールバックする', () => {
    // 完了1件 / 2件 = 0.5
    expect(calcPhaseProgress('r', 'phase-2', BASE, COLUMN_IDS, [])).toBe(0.5)
  })

  it('反証: 非リーフ（工程ノード自身）を母数に含めない（二重計上の防止）', () => {
    // PH自身もphase-2に属するが、A・Bの親なので数えない。
    // 数えてしまうと母数3件になり0.75→別の値へずれる
    expect(calcPhaseProgress('r', 'phase-2', BASE, COLUMN_IDS, EFFORTS)).toBe(
      0.75,
    )
  })

  it('反証: 別の工程のタスクを混ぜない', () => {
    const other = project({
      id: 'o',
      code: 'P200-02',
      level: 1,
      parentId: 'r',
      phaseKey: 'phase-3',
      completed: true,
    })
    const projects = [...BASE, other]
    const efforts = [...EFFORTS, effort('o', 'effort-1', 100)]
    // phase-3の巨大な完了工数がphase-2の進捗を押し上げないこと
    expect(
      calcPhaseProgress('r', 'phase-2', projects, COLUMN_IDS, efforts),
    ).toBe(0.75)
  })

  it('反証: 別案件の同じ工程キーのタスクを混ぜない', () => {
    const otherRoot = project({ id: 'r2', code: 'P300', level: 0 })
    const otherTask = project({
      id: 't2',
      code: 'P300-01',
      level: 1,
      parentId: 'r2',
      phaseKey: 'phase-2',
      completed: true,
    })
    const projects = [...BASE, otherRoot, otherTask]
    const efforts = [...EFFORTS, effort('t2', 'effort-1', 100)]
    expect(
      calcPhaseProgress('r', 'phase-2', projects, COLUMN_IDS, efforts),
    ).toBe(0.75)
  })

  it('反証: 無効化された工数列の値は集計に含めない', () => {
    // effort-9は有効列（COLUMN_IDS）に含まれないため無視される
    const efforts = [...EFFORTS, effort('b', 'effort-9', 1000)]
    expect(calcPhaseProgress('r', 'phase-2', BASE, COLUMN_IDS, efforts)).toBe(
      0.75,
    )
  })

  it('継承した孫タスクも工程の対象に含める', () => {
    const grandChild = project({
      id: 'g',
      code: 'P200-01-01-01',
      level: 3,
      parentId: 'a',
      completed: true,
    })
    // Aは親になったのでリーフでなくなり、G（完了・工数3）とBが対象
    const projects = [...BASE, grandChild]
    const efforts = [effort('g', 'effort-1', 3), effort('b', 'effort-1', 1)]
    expect(
      calcPhaseProgress('r', 'phase-2', projects, COLUMN_IDS, efforts),
    ).toBe(0.75)
  })

  it('全て完了なら1、全て未完了なら0', () => {
    const allDone = [
      R,
      PH,
      { ...A, completed: true },
      { ...B, completed: true },
    ]
    expect(
      calcPhaseProgress('r', 'phase-2', allDone, COLUMN_IDS, EFFORTS),
    ).toBe(1)
    const noneDone = [R, PH, { ...A, completed: false }, B]
    expect(
      calcPhaseProgress('r', 'phase-2', noneDone, COLUMN_IDS, EFFORTS),
    ).toBe(0)
  })
})
