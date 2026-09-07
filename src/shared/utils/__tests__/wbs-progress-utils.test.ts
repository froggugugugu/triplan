import { describe, expect, it } from 'vitest'
import type { EffortEntry } from '@/shared/types/effort'
import type { ProjectTreeNode } from '@/shared/types/project'
import {
  calcWbsProgress,
  calcWbsProgressAtDate,
  calcWbsProgressWeighted,
} from '../wbs-progress-utils'

function makeNode(overrides: Partial<ProjectTreeNode> = {}): ProjectTreeNode {
  return {
    id: crypto.randomUUID(),
    code: 'P001',
    name: 'テスト',
    parentId: null,
    level: 0,
    status: 'active',
    confidence: null,
    completed: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    children: [],
    depth: 0,
    ...overrides,
  }
}

function makeEffort(
  projectId: string,
  value: number,
  columnId = 'effort-1',
): EffortEntry {
  return { id: crypto.randomUUID(), projectId, columnId, value }
}

describe('calcWbsProgress', () => {
  it('最下層（子なし）でcompleted=trueの場合、進捗率1を返す', () => {
    const node = makeNode({ completed: true, children: [] })
    expect(calcWbsProgress(node)).toBe(1)
  })

  it('最下層（子なし）でcompleted=falseの場合、進捗率0を返す', () => {
    const node = makeNode({ completed: false, children: [] })
    expect(calcWbsProgress(node)).toBe(0)
  })

  // 反証: 子タスクが0件（空配列）の親タスクで0除算にならない
  it('反証: 子が0件の場合でも0除算エラーにならず、completedフラグをそのまま返す', () => {
    const node = makeNode({ completed: false, children: [] })
    expect(() => calcWbsProgress(node)).not.toThrow()
    expect(calcWbsProgress(node)).toBe(0)
  })

  it('子2件がいずれもcompleted=trueの場合、親の進捗率は1', () => {
    const node = makeNode({
      children: [
        makeNode({ completed: true, children: [] }),
        makeNode({ completed: true, children: [] }),
      ],
    })
    expect(calcWbsProgress(node)).toBe(1)
  })

  it('子2件のうち1件のみcompleted=trueの場合、親の進捗率は0.5', () => {
    const node = makeNode({
      children: [
        makeNode({ completed: true, children: [] }),
        makeNode({ completed: false, children: [] }),
      ],
    })
    expect(calcWbsProgress(node)).toBe(0.5)
  })

  it('子がいずれもcompleted=falseの場合、親の進捗率は0', () => {
    const node = makeNode({
      children: [
        makeNode({ completed: false, children: [] }),
        makeNode({ completed: false, children: [] }),
      ],
    })
    expect(calcWbsProgress(node)).toBe(0)
  })

  it('3階層（level0→level1→level2）でlevel2の完了状況がlevel0までロールアップされる', () => {
    const tree = makeNode({
      level: 0,
      children: [
        makeNode({
          level: 1,
          children: [
            makeNode({ level: 2, completed: true, children: [] }),
            makeNode({ level: 2, completed: true, children: [] }),
            makeNode({ level: 2, completed: false, children: [] }),
            makeNode({ level: 2, completed: false, children: [] }),
          ],
        }),
      ],
    })
    // level2は4件中2件完了 → 50%
    expect(calcWbsProgress(tree)).toBe(0.5)
  })

  // 反証: 深さの異なる混在ツリー（あるlevel1ノードは自身がleaf、別のlevel1ノードはさらに
  // level2の子を持つ）でも、最下層タスク単位で正しく集計される
  it('反証: 深さの異なる混在ツリーでも最下層タスク単位で正しく集計する', () => {
    const tree = makeNode({
      level: 0,
      children: [
        // このlevel1ノードは子を持たない＝それ自体が最下層タスク（completed=true）
        makeNode({ level: 1, completed: true, children: [] }),
        // このlevel1ノードはさらにlevel2の子を2件持つ（うち1件完了）
        makeNode({
          level: 1,
          children: [
            makeNode({ level: 2, completed: true, children: [] }),
            makeNode({ level: 2, completed: false, children: [] }),
          ],
        }),
      ],
    })
    // 最下層タスクは合計3件（level1の1件 + level2の2件）。完了は2件 → 2/3
    expect(calcWbsProgress(tree)).toBeCloseTo(2 / 3)
  })

  it('最上位（level0）が直接completedを持つ最下層タスクの場合も進捗率を返す（子が1件も無い案件）', () => {
    const node = makeNode({ level: 0, completed: true, children: [] })
    expect(calcWbsProgress(node)).toBe(1)
  })
})

describe('calcWbsProgressWeighted', () => {
  const COLS = ['effort-1']

  it('完了タスクの工数比で進捗率を算出する（タスク数ではなく工数で重み付けされる）', () => {
    const a = makeNode({ completed: true, children: [] })
    const b = makeNode({ completed: true, children: [] })
    const c = makeNode({ completed: false, children: [] })
    const d = makeNode({ completed: false, children: [] })
    const root = makeNode({ children: [a, b, c, d] })
    const efforts = [
      makeEffort(a.id, 40),
      makeEffort(b.id, 30),
      makeEffort(c.id, 100),
      makeEffort(d.id, 30),
    ]
    // 完了70人日 / 全体200人日 = 0.35（タスク数ベースなら2/4=0.5になる）
    expect(calcWbsProgressWeighted(root, COLS, efforts)).toBeCloseTo(0.35)
    expect(calcWbsProgress(root)).toBe(0.5)
  })

  it('複数の工数列を横断して合算する', () => {
    const a = makeNode({ completed: true, children: [] })
    const b = makeNode({ completed: false, children: [] })
    const root = makeNode({ children: [a, b] })
    const efforts = [
      makeEffort(a.id, 10, 'effort-1'),
      makeEffort(a.id, 20, 'effort-2'),
      makeEffort(b.id, 30, 'effort-1'),
      makeEffort(b.id, 40, 'effort-2'),
    ]
    // 完了30 / 全体100 = 0.3
    expect(
      calcWbsProgressWeighted(root, ['effort-1', 'effort-2'], efforts),
    ).toBeCloseTo(0.3)
  })

  it('無効化された工数列は集計対象に含めない', () => {
    const a = makeNode({ completed: true, children: [] })
    const b = makeNode({ completed: false, children: [] })
    const root = makeNode({ children: [a, b] })
    const efforts = [
      makeEffort(a.id, 10, 'effort-1'),
      makeEffort(a.id, 90, 'effort-2'),
      makeEffort(b.id, 90, 'effort-1'),
      makeEffort(b.id, 10, 'effort-2'),
    ]
    // effort-1のみ有効: 完了10 / 全体100 = 0.1
    expect(calcWbsProgressWeighted(root, ['effort-1'], efforts)).toBeCloseTo(
      0.1,
    )
  })

  it('3階層のツリーでも最下層の工数がロールアップされる', () => {
    const leaf1 = makeNode({ level: 2, completed: true, children: [] })
    const leaf2 = makeNode({ level: 2, completed: false, children: [] })
    const mid = makeNode({ level: 1, children: [leaf1, leaf2] })
    const root = makeNode({ level: 0, children: [mid] })
    const efforts = [makeEffort(leaf1.id, 25), makeEffort(leaf2.id, 75)]
    expect(calcWbsProgressWeighted(root, COLS, efforts)).toBeCloseTo(0.25)
  })

  // 反証: 工数が1件も入っていない案件は工数加重が成立しないため、タスク数ベースへフォールバックする
  it('反証: 全タスクの工数が0の場合はタスク数ベースへフォールバックする', () => {
    const a = makeNode({ completed: true, children: [] })
    const b = makeNode({ completed: false, children: [] })
    const root = makeNode({ children: [a, b] })
    expect(calcWbsProgressWeighted(root, COLS, [])).toBe(0.5)
  })

  // 反証: 工数0のタスクは分母にも分子にも算入しない（完了させても進捗率が動かない）
  it('反証: 工数0のタスクを完了させても進捗率は変わらない', () => {
    const zero = makeNode({ completed: true, children: [] })
    const heavy = makeNode({ completed: false, children: [] })
    const root = makeNode({ children: [zero, heavy] })
    const efforts = [makeEffort(zero.id, 0), makeEffort(heavy.id, 100)]
    expect(calcWbsProgressWeighted(root, COLS, efforts)).toBe(0)
  })

  // 反証: 子を持たない単独ノードでも0除算にならない
  it('反証: 子が0件の単独ノードでも0除算にならない', () => {
    const node = makeNode({ completed: true, children: [] })
    expect(() => calcWbsProgressWeighted(node, COLS, [])).not.toThrow()
    expect(calcWbsProgressWeighted(node, COLS, [])).toBe(1)
  })

  it('全タスクが完了している場合は1を返す', () => {
    const a = makeNode({ completed: true, children: [] })
    const b = makeNode({ completed: true, children: [] })
    const root = makeNode({ children: [a, b] })
    const efforts = [makeEffort(a.id, 40), makeEffort(b.id, 60)]
    expect(calcWbsProgressWeighted(root, COLS, efforts)).toBe(1)
  })
})

describe('calcWbsProgressAtDate', () => {
  const COLS = ['effort-1']

  function buildTree() {
    const a = makeNode({
      completed: true,
      completedAt: '2026-08-01',
      children: [],
    })
    const b = makeNode({
      completed: true,
      completedAt: '2026-08-20',
      children: [],
    })
    const c = makeNode({ completed: false, children: [] })
    const root = makeNode({ children: [a, b, c] })
    const efforts = [
      makeEffort(a.id, 40),
      makeEffort(b.id, 30),
      makeEffort(c.id, 130),
    ]
    return { root, efforts }
  }

  it('基準日以前に完了したタスクのみを完了として集計する', () => {
    const { root, efforts } = buildTree()
    // 2026-08-10時点ではAのみ完了扱い → 40/200 = 0.2
    expect(
      calcWbsProgressAtDate(root, COLS, efforts, '2026-08-10'),
    ).toBeCloseTo(0.2)
  })

  it('基準日を後ろにずらすと後から完了したタスクも集計に入る', () => {
    const { root, efforts } = buildTree()
    expect(
      calcWbsProgressAtDate(root, COLS, efforts, '2026-08-31'),
    ).toBeCloseTo(0.35)
  })

  // 境界値: 完了日と基準日が同一の場合は完了扱い（<=判定）
  it('境界値: 完了日と基準日が同一日の場合は完了として扱う', () => {
    const { root, efforts } = buildTree()
    expect(
      calcWbsProgressAtDate(root, COLS, efforts, '2026-08-01'),
    ).toBeCloseTo(0.2)
  })

  // 境界値: 完了日の前日は未完了扱い
  it('境界値: 基準日が完了日の前日なら未完了として扱う', () => {
    const { root, efforts } = buildTree()
    expect(calcWbsProgressAtDate(root, COLS, efforts, '2026-07-31')).toBe(0)
  })

  // 反証: completedAtを持たない完了済みタスク（旧データ等）は日付不明として常に完了扱いにする。
  // 未完了扱いにすると、マイグレーション漏れの案件で現在の進捗率が過小評価されるため
  it('反証: completedAtがnullの完了タスクは基準日に関わらず完了として扱う', () => {
    const a = makeNode({ completed: true, completedAt: null, children: [] })
    const b = makeNode({ completed: false, children: [] })
    const root = makeNode({ children: [a, b] })
    const efforts = [makeEffort(a.id, 50), makeEffort(b.id, 50)]
    expect(calcWbsProgressAtDate(root, COLS, efforts, '2000-01-01')).toBe(0.5)
  })

  // 反証: 未完了タスクはcompletedAtを持っていても完了として集計しない
  it('反証: completed=falseならcompletedAtが残っていても未完了として扱う', () => {
    const a = makeNode({
      completed: false,
      completedAt: '2026-08-01',
      children: [],
    })
    const root = makeNode({ children: [a] })
    const efforts = [makeEffort(a.id, 100)]
    expect(calcWbsProgressAtDate(root, COLS, efforts, '2026-08-31')).toBe(0)
  })

  it('基準日にnullを渡すと日付を無視して現在の完了状況で算出する', () => {
    const { root, efforts } = buildTree()
    expect(calcWbsProgressAtDate(root, COLS, efforts, null)).toBeCloseTo(0.35)
  })

  // 反証: 工数が無い案件では基準日判定を保ったままタスク数ベースへフォールバックする
  it('反証: 工数0の案件でも基準日による絞り込みは有効なままタスク数ベースになる', () => {
    const a = makeNode({
      completed: true,
      completedAt: '2026-08-20',
      children: [],
    })
    const b = makeNode({ completed: false, children: [] })
    const root = makeNode({ children: [a, b] })
    expect(calcWbsProgressAtDate(root, COLS, [], '2026-08-10')).toBe(0)
    expect(calcWbsProgressAtDate(root, COLS, [], '2026-08-31')).toBe(0.5)
  })
})
