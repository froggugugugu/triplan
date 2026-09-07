import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AssignmentEntry } from '@/shared/types/assignment'
import type { Project } from '@/shared/types/project'
import { MemberProjectAssignmentGrid } from '../MemberProjectAssignmentGrid'

afterEach(() => cleanup())

function createProject(overrides: Partial<Project> = {}): Project {
  return {
    id: crypto.randomUUID(),
    code: 'P001',
    name: '案件A',
    parentId: null,
    level: 0,
    status: 'active',
    confidence: null,
    completed: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function createAssignment(
  overrides: Partial<AssignmentEntry> = {},
): AssignmentEntry {
  return {
    id: crypto.randomUUID(),
    projectId: 'p1',
    taskId: 't1',
    memberId: 'm1',
    monthlyValues: { '2025-04': 0.5 },
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('MemberProjectAssignmentGrid', () => {
  //  FR-008: プロジェクト行クリックで選択コールバックが呼ばれる
  it('プロジェクト行をクリックするとonProjectSelectが該当プロジェクトIDで呼ばれる', async () => {
    const user = userEvent.setup()
    const project = createProject({ id: 'p1', code: 'P001', name: '案件A' })
    const onProjectSelect = vi.fn()

    render(
      <MemberProjectAssignmentGrid
        memberId="m1"
        memberName="担当者A"
        monthColumns={['2025-04']}
        assignments={[createAssignment({ projectId: 'p1' })]}
        projects={[project]}
        onProjectSelect={onProjectSelect}
      />,
    )

    const row = screen.getByText('案件A').closest('tr')
    if (!row) throw new Error('row not found')
    await user.click(row)

    expect(onProjectSelect).toHaveBeenCalledWith('p1')
  })

  // 反証: onProjectSelect未指定でもクラッシュしない（後方互換）
  it('反証: onProjectSelect未指定でも行クリックでクラッシュしない', async () => {
    const user = userEvent.setup()
    const project = createProject({ id: 'p1', code: 'P001', name: '案件A' })

    render(
      <MemberProjectAssignmentGrid
        memberId="m1"
        memberName="担当者A"
        monthColumns={['2025-04']}
        assignments={[createAssignment({ projectId: 'p1' })]}
        projects={[project]}
      />,
    )

    const row = screen.getByText('案件A').closest('tr')
    if (!row) throw new Error('row not found')
    await expect(user.click(row)).resolves.not.toThrow()
  })

  // 反証: 合計行クリックではonProjectSelectが呼ばれない（合計行はプロジェクトではないため）
  it('反証: 合計行をクリックしてもonProjectSelectは呼ばれない', async () => {
    const user = userEvent.setup()
    const project = createProject({ id: 'p1', code: 'P001', name: '案件A' })
    const onProjectSelect = vi.fn()

    render(
      <MemberProjectAssignmentGrid
        memberId="m1"
        memberName="担当者A"
        monthColumns={['2025-04']}
        assignments={[createAssignment({ projectId: 'p1' })]}
        projects={[project]}
        onProjectSelect={onProjectSelect}
      />,
    )

    const totalRow = screen.getByText('合計').closest('tr')
    if (!totalRow) throw new Error('total row not found')
    await user.click(totalRow)

    expect(onProjectSelect).not.toHaveBeenCalled()
  })
})
