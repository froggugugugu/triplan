import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EffortEntry } from '@/shared/types/effort'
import type { ProjectTreeNode } from '@/shared/types/project'
import { WhatIfSimulationDialog } from '../WhatIfSimulationDialog'

afterEach(() => cleanup())

const PROJECT_ID = crypto.randomUUID()

function createNode(overrides: Partial<ProjectTreeNode> = {}): ProjectTreeNode {
  return {
    id: PROJECT_ID,
    code: 'P001',
    name: 'テスト案件',
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

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    open: true,
    onOpenChange: vi.fn(),
    project: createNode(),
    efforts: [] as EffortEntry[],
    settingsMap: {},
    estimatedUnitPrice: 100,
    coefficient: 1,
    ...overrides,
  }
}

describe('WhatIfSimulationDialog', () => {
  it('プロジェクト名をタイトルに表示する', () => {
    render(
      <WhatIfSimulationDialog
        {...baseProps({ project: createNode({ name: '基幹刷新PJ' }) })}
      />,
    )
    expect(screen.getByText(/基幹刷新PJ/)).toBeInTheDocument()
  })

  it('タスクが1件も無い場合は案内メッセージを表示する', () => {
    render(<WhatIfSimulationDialog {...baseProps()} />)
    expect(screen.getByText(/タスクが登録されていません/)).toBeInTheDocument()
  })

  // 反証: project=nullの場合でもクラッシュしない（ダイアログを開く前の初期状態を想定）
  it('反証: project=nullでもクラッシュしない', () => {
    expect(() =>
      render(<WhatIfSimulationDialog {...baseProps({ project: null })} />),
    ).not.toThrow()
  })

  it('タスクにチェックを入れると、シミュレーション後の概算予算が減る', async () => {
    const user = userEvent.setup()
    const child = createNode({
      id: 'task-1',
      name: 'タスクA',
      level: 1,
      children: [],
      depth: 1,
    })
    const project = createNode({ children: [child] })
    const efforts: EffortEntry[] = [
      { id: 'e1', projectId: 'task-1', columnId: 'effort-1', value: 20 },
    ]
    const settingsMap = {
      [PROJECT_ID]: {
        effortColumns: [
          {
            id: 'effort-1',
            displayName: '工数1',
            enabled: true,
            order: 0,
          },
        ],
        lastModified: '2025-01-01T00:00:00.000Z',
      },
    }

    render(
      <WhatIfSimulationDialog
        {...baseProps({
          project,
          efforts,
          settingsMap,
          estimatedUnitPrice: 100,
          coefficient: 1,
        })}
      />,
    )

    // 20人日 = 1人月（WORKDAYS_PER_MONTH=20）× 単価100万円 × 係数1 = 100.00万円
    // 除外前は「現在の概算予算」「シミュレーション後」の両方が100.00万円になる
    expect(screen.getAllByText(/100\.00\s*万円/)).toHaveLength(2)

    const checkbox = screen.getByRole('checkbox', { name: 'タスクAを除外' })
    await user.click(checkbox)

    // 除外後は「シミュレーション後」がちょうど0.00万円になる（完全一致で「現在の
    // 概算予算」100.00万円・「削減額」100.00万円（100.0%）とは区別する）
    expect(screen.getByText(/^0\.00\s*万円$/)).toBeInTheDocument()
    // 「現在の概算予算」100.00万円は実データ変更なしのため引き続き表示される
    expect(screen.getAllByText(/100\.00\s*万円/).length).toBeGreaterThan(0)
  })

  it('中間ノードを除外すると配下の子タスクのチェックボックスが無効化される', async () => {
    const user = userEvent.setup()
    const grandchild = createNode({
      id: 'gc-1',
      name: '孫タスク',
      level: 2,
      children: [],
      depth: 2,
    })
    const branch = createNode({
      id: 'branch-1',
      name: '枝タスク',
      level: 1,
      children: [grandchild],
      depth: 1,
    })
    const project = createNode({ children: [branch] })

    render(<WhatIfSimulationDialog {...baseProps({ project })} />)

    const branchCheckbox = screen.getByRole('checkbox', {
      name: '枝タスクを除外',
    })
    const grandchildCheckbox = screen.getByRole('checkbox', {
      name: '孫タスクを除外',
    })
    expect(grandchildCheckbox).not.toBeDisabled()

    await user.click(branchCheckbox)

    expect(grandchildCheckbox).toBeDisabled()
  })
})
