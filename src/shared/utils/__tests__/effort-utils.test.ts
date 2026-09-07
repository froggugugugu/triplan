import { describe, expect, it } from 'vitest'
import type { EffortEntry } from '@/shared/types/effort'
import type { ProjectTreeNode } from '@/shared/types/project'
import {
  calcWhatIfTotalEffort,
  computeEffortDisplayValues,
  computeProjectTotalEffort,
  formatEffort,
  parseEffortInput,
  roundToHalf,
} from '@/shared/utils/effort-utils'

describe('roundToHalf', () => {
  it.each([
    [0.01, 0.0],
    [0.02, 0.0],
    [0.03, 0.05],
    [0.04, 0.05],
    [0.05, 0.05],
    [0.07, 0.05],
    [0.08, 0.1],
    [0.1, 0.1],
    [0.12, 0.1],
    [0.13, 0.15],
    [0.0, 0.0],
    [1.0, 1.0],
    [0.025, 0.05], // boundary: exactly halfway rounds up
  ])('roundToHalf(%f) === %f', (input, expected) => {
    expect(roundToHalf(input)).toBeCloseTo(expected, 10)
  })
})

describe('formatEffort', () => {
  it('formats to 2 decimal places', () => {
    expect(formatEffort(0)).toBe('0.00')
    expect(formatEffort(0.05)).toBe('0.05')
    expect(formatEffort(0.1)).toBe('0.10')
    expect(formatEffort(1)).toBe('1.00')
    expect(formatEffort(12.35)).toBe('12.35')
  })
})

describe('parseEffortInput', () => {
  it('returns 0 for empty string', () => {
    expect(parseEffortInput('')).toBe(0)
    expect(parseEffortInput('  ')).toBe(0)
  })

  it('returns null for negative values', () => {
    expect(parseEffortInput('-1')).toBeNull()
    expect(parseEffortInput('-0.5')).toBeNull()
  })

  it('returns null for non-numeric input', () => {
    expect(parseEffortInput('abc')).toBeNull()
    expect(parseEffortInput('1.2.3')).toBeNull()
  })

  it('rounds valid input to 0.05 steps', () => {
    expect(parseEffortInput('0.03')).toBeCloseTo(0.05)
    expect(parseEffortInput('0.07')).toBeCloseTo(0.05)
    expect(parseEffortInput('0.08')).toBeCloseTo(0.1)
    expect(parseEffortInput('0.1')).toBeCloseTo(0.1)
    expect(parseEffortInput('0')).toBe(0)
  })
})

// Helper to create a tree node
function makeNode(
  id: string,
  level: number,
  children: ProjectTreeNode[] = [],
): ProjectTreeNode {
  return {
    id,
    code: `P${id}`,
    name: `Project ${id}`,
    parentId: level === 0 ? null : 'parent',
    level,
    status: 'not_started' as const,
    confidence: null,
    completed: false,
    depth: level,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    children,
  }
}

describe('computeEffortDisplayValues', () => {
  it('returns own value for leaf nodes', () => {
    const leaf = makeNode('1', 1)
    const tree = [makeNode('root', 0, [leaf])]
    const efforts: EffortEntry[] = [
      { id: 'e1', projectId: '1', columnId: 'effort-1', value: 0.5 },
    ]

    const result = computeEffortDisplayValues(tree, ['effort-1'], efforts)
    expect(result.get('1:effort-1')).toBe(0.5)
  })

  it('returns 0 for leaf with no effort entry', () => {
    const leaf = makeNode('1', 1)
    const tree = [makeNode('root', 0, [leaf])]

    const result = computeEffortDisplayValues(tree, ['effort-1'], [])
    expect(result.get('1:effort-1')).toBe(0)
  })

  it('rolls up children values to parent', () => {
    const child1 = makeNode('c1', 2)
    const child2 = makeNode('c2', 2)
    const parent = makeNode('p1', 1, [child1, child2])
    const root = makeNode('root', 0, [parent])
    const tree = [root]

    const efforts: EffortEntry[] = [
      { id: 'e1', projectId: 'c1', columnId: 'effort-1', value: 0.3 },
      { id: 'e2', projectId: 'c2', columnId: 'effort-1', value: 0.2 },
    ]

    const result = computeEffortDisplayValues(tree, ['effort-1'], efforts)
    expect(result.get('c1:effort-1')).toBe(0.3)
    expect(result.get('c2:effort-1')).toBe(0.2)
    expect(result.get('p1:effort-1')).toBe(0.5)
    expect(result.get('root:effort-1')).toBe(0.5)
  })

  it('handles multiple columns independently', () => {
    const child1 = makeNode('c1', 1)
    const child2 = makeNode('c2', 1)
    const root = makeNode('root', 0, [child1, child2])
    const tree = [root]

    const efforts: EffortEntry[] = [
      { id: 'e1', projectId: 'c1', columnId: 'effort-1', value: 0.1 },
      { id: 'e2', projectId: 'c2', columnId: 'effort-1', value: 0.2 },
      { id: 'e3', projectId: 'c1', columnId: 'effort-2', value: 0.5 },
      { id: 'e4', projectId: 'c2', columnId: 'effort-2', value: 0.3 },
    ]

    const result = computeEffortDisplayValues(
      tree,
      ['effort-1', 'effort-2'],
      efforts,
    )
    expect(result.get('root:effort-1')).toBe(0.3)
    expect(result.get('root:effort-2')).toBe(0.8)
  })

  it('ignores own value for non-leaf nodes (uses children sum only)', () => {
    const child = makeNode('c1', 2)
    const parent = makeNode('p1', 1, [child])
    const tree = [makeNode('root', 0, [parent])]

    // parent has own effort entry, but since it has children, should use children sum
    const efforts: EffortEntry[] = [
      { id: 'e1', projectId: 'p1', columnId: 'effort-1', value: 999 },
      { id: 'e2', projectId: 'c1', columnId: 'effort-1', value: 0.15 },
    ]

    const result = computeEffortDisplayValues(tree, ['effort-1'], efforts)
    expect(result.get('p1:effort-1')).toBe(0.15) // children sum, not own value
    expect(result.get('c1:effort-1')).toBe(0.15)
  })

  it('preserves own value in efforts array (not deleted) when node becomes non-leaf', () => {
    // This tests that the efforts array is not modified - own value records persist
    const child = makeNode('c1', 2)
    const parent = makeNode('p1', 1, [child])
    const tree = [makeNode('root', 0, [parent])]

    const efforts: EffortEntry[] = [
      { id: 'e1', projectId: 'p1', columnId: 'effort-1', value: 0.5 },
      { id: 'e2', projectId: 'c1', columnId: 'effort-1', value: 0.2 },
    ]

    computeEffortDisplayValues(tree, ['effort-1'], efforts)
    // Original efforts array should be unchanged
    expect(efforts).toHaveLength(2)
    expect(efforts[0]?.value).toBe(0.5) // own value preserved in data
  })

  it('restores own value when non-leaf becomes leaf again', () => {
    // First: node is leaf with own value
    const nodeAsLeaf = makeNode('p1', 1)
    const tree1 = [makeNode('root', 0, [nodeAsLeaf])]
    const efforts: EffortEntry[] = [
      { id: 'e1', projectId: 'p1', columnId: 'effort-1', value: 0.5 },
    ]

    const result1 = computeEffortDisplayValues(tree1, ['effort-1'], efforts)
    expect(result1.get('p1:effort-1')).toBe(0.5) // shows own value as leaf

    // Second: node becomes non-leaf (display shows children sum)
    const child = makeNode('c1', 2)
    const nodeAsParent = makeNode('p1', 1, [child])
    const tree2 = [makeNode('root', 0, [nodeAsParent])]

    const result2 = computeEffortDisplayValues(tree2, ['effort-1'], efforts)
    expect(result2.get('p1:effort-1')).toBe(0) // children sum (child has no effort)

    // Third: children removed, node is leaf again — own value restored
    const nodeAsLeafAgain = makeNode('p1', 1)
    const tree3 = [makeNode('root', 0, [nodeAsLeafAgain])]

    const result3 = computeEffortDisplayValues(tree3, ['effort-1'], efforts)
    expect(result3.get('p1:effort-1')).toBe(0.5) // restored from efforts
  })
})

describe('computeProjectTotalEffort', () => {
  it('sums a single column across a single project', () => {
    const child = makeNode('c1', 1)
    const root = makeNode('root', 0, [child])
    const efforts: EffortEntry[] = [
      { id: 'e1', projectId: 'c1', columnId: 'effort-1', value: 0.5 },
    ]

    const result = computeProjectTotalEffort([root], ['effort-1'], efforts)
    expect(result.get('root')).toBe(0.5)
  })

  it('sums multiple columns across a single project (列横断合計)', () => {
    const child = makeNode('c1', 1)
    const root = makeNode('root', 0, [child])
    const efforts: EffortEntry[] = [
      { id: 'e1', projectId: 'c1', columnId: 'effort-1', value: 0.3 },
      { id: 'e2', projectId: 'c1', columnId: 'effort-2', value: 0.2 },
    ]

    const result = computeProjectTotalEffort(
      [root],
      ['effort-1', 'effort-2'],
      efforts,
    )
    expect(result.get('root')).toBe(0.5)
  })

  it('computes independent totals for multiple top-level projects', () => {
    const child1 = makeNode('c1', 1)
    const child2 = makeNode('c2', 1)
    const root1 = makeNode('root1', 0, [child1])
    const root2 = makeNode('root2', 0, [child2])
    const efforts: EffortEntry[] = [
      { id: 'e1', projectId: 'c1', columnId: 'effort-1', value: 0.4 },
      { id: 'e2', projectId: 'c2', columnId: 'effort-1', value: 0.6 },
    ]

    const result = computeProjectTotalEffort(
      [root1, root2],
      ['effort-1'],
      efforts,
    )
    expect(result.get('root1')).toBe(0.4)
    expect(result.get('root2')).toBe(0.6)
  })

  it('returns 0 for a project with no effort entries', () => {
    const root = makeNode('root', 0, [makeNode('c1', 1)])

    const result = computeProjectTotalEffort([root], ['effort-1'], [])
    expect(result.get('root')).toBe(0)
  })

  it('rounds the total to 0.05 steps', () => {
    const child1 = makeNode('c1', 1)
    const child2 = makeNode('c2', 1)
    const root = makeNode('root', 0, [child1, child2])
    const efforts: EffortEntry[] = [
      { id: 'e1', projectId: 'c1', columnId: 'effort-1', value: 0.01 },
      { id: 'e2', projectId: 'c2', columnId: 'effort-1', value: 0.02 },
    ]

    const result = computeProjectTotalEffort([root], ['effort-1'], efforts)
    expect(result.get('root')).toBeCloseTo(0.05, 10)
  })

  // 反証: 一部の列にしか工数が入っていない案件で、無データの列が0扱いとして
  // 正しく合算対象に含まれるか（欠落列によって合計が歪まないか）
  it('一部の列にのみデータがある場合、無データの列は0として合算する', () => {
    const child = makeNode('c1', 1)
    const root = makeNode('root', 0, [child])
    const efforts: EffortEntry[] = [
      { id: 'e1', projectId: 'c1', columnId: 'effort-1', value: 0.3 },
      // effort-2 列にはデータなし
    ]

    const result = computeProjectTotalEffort(
      [root],
      ['effort-1', 'effort-2'],
      efforts,
    )
    expect(result.get('root')).toBe(0.3)
  })

  // 反証: 他案件のeffortsが混在していても、案件間で誤って合算しないか
  it('他案件のeffortsが混在していても案件をまたいで合算しない', () => {
    const child1 = makeNode('c1', 1)
    const child2 = makeNode('c2', 1)
    const root1 = makeNode('root1', 0, [child1])
    const root2 = makeNode('root2', 0, [child2])
    const efforts: EffortEntry[] = [
      { id: 'e1', projectId: 'c1', columnId: 'effort-1', value: 1.0 },
      { id: 'e2', projectId: 'c2', columnId: 'effort-1', value: 2.0 },
    ]

    const result = computeProjectTotalEffort(
      [root1, root2],
      ['effort-1'],
      efforts,
    )
    expect(result.get('root1')).toBe(1.0)
    expect(result.get('root2')).toBe(2.0)
    expect(result.size).toBe(2)
  })
})

describe('calcWhatIfTotalEffort（What-ifシミュレーション: 人・モノ・金の三位一体強化）', () => {
  it('除外タスクが無い場合はcomputeProjectTotalEffortと同じ値を返す', () => {
    const child1 = makeNode('c1', 1)
    const child2 = makeNode('c2', 1)
    const root = makeNode('root', 0, [child1, child2])
    const efforts: EffortEntry[] = [
      { id: 'e1', projectId: 'c1', columnId: 'effort-1', value: 1.0 },
      { id: 'e2', projectId: 'c2', columnId: 'effort-1', value: 2.0 },
    ]

    const result = calcWhatIfTotalEffort(root, ['effort-1'], efforts, new Set())
    expect(result).toBe(3.0)
  })

  it('葉タスクを1件除外すると、そのタスク分だけ工数が減る', () => {
    const child1 = makeNode('c1', 1)
    const child2 = makeNode('c2', 1)
    const root = makeNode('root', 0, [child1, child2])
    const efforts: EffortEntry[] = [
      { id: 'e1', projectId: 'c1', columnId: 'effort-1', value: 1.0 },
      { id: 'e2', projectId: 'c2', columnId: 'effort-1', value: 2.0 },
    ]

    const result = calcWhatIfTotalEffort(
      root,
      ['effort-1'],
      efforts,
      new Set(['c1']),
    )
    expect(result).toBe(2.0)
  })

  it('中間ノード（枝）を除外すると、配下の全葉タスクの工数がまとめて除外される', () => {
    const grandchild1 = makeNode('gc1', 2)
    const grandchild2 = makeNode('gc2', 2)
    const branch = makeNode('branch', 1, [grandchild1, grandchild2])
    const other = makeNode('other', 1)
    const root = makeNode('root', 0, [branch, other])
    const efforts: EffortEntry[] = [
      { id: 'e1', projectId: 'gc1', columnId: 'effort-1', value: 1.0 },
      { id: 'e2', projectId: 'gc2', columnId: 'effort-1', value: 1.5 },
      { id: 'e3', projectId: 'other', columnId: 'effort-1', value: 0.5 },
    ]

    const result = calcWhatIfTotalEffort(
      root,
      ['effort-1'],
      efforts,
      new Set(['branch']),
    )
    // gc1 + gc2 の分がまとめて除外され、otherの0.5のみ残る
    expect(result).toBe(0.5)
  })

  it('全タスクを除外すると0になる', () => {
    const child1 = makeNode('c1', 1)
    const child2 = makeNode('c2', 1)
    const root = makeNode('root', 0, [child1, child2])
    const efforts: EffortEntry[] = [
      { id: 'e1', projectId: 'c1', columnId: 'effort-1', value: 1.0 },
      { id: 'e2', projectId: 'c2', columnId: 'effort-1', value: 2.0 },
    ]

    const result = calcWhatIfTotalEffort(
      root,
      ['effort-1'],
      efforts,
      new Set(['c1', 'c2']),
    )
    expect(result).toBe(0)
  })

  // 反証: 実データ（efforts配列）自体は変更されず、呼び出し前後で同一内容のままか
  it('反証: 呼び出し後もefforts配列自体は変更されない（読み取り専用）', () => {
    const child1 = makeNode('c1', 1)
    const root = makeNode('root', 0, [child1])
    const efforts: EffortEntry[] = [
      { id: 'e1', projectId: 'c1', columnId: 'effort-1', value: 1.0 },
    ]
    const snapshot = JSON.parse(JSON.stringify(efforts))

    calcWhatIfTotalEffort(root, ['effort-1'], efforts, new Set(['c1']))

    expect(efforts).toEqual(snapshot)
  })

  // 反証: 存在しないIDを除外指定してもエラーにならず、無視されるか
  it('反証: 存在しないタスクIDを除外指定しても無視され、通常通り集計される', () => {
    const child1 = makeNode('c1', 1)
    const root = makeNode('root', 0, [child1])
    const efforts: EffortEntry[] = [
      { id: 'e1', projectId: 'c1', columnId: 'effort-1', value: 1.0 },
    ]

    const result = calcWhatIfTotalEffort(
      root,
      ['effort-1'],
      efforts,
      new Set(['not-exist']),
    )
    expect(result).toBe(1.0)
  })
})
