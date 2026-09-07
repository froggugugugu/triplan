import { describe, expect, it, vi } from 'vitest'
import type { Company } from '@/shared/types/company'
import type { Division } from '@/shared/types/division'
import type { Member } from '@/shared/types/member'
import type { Project } from '@/shared/types/project'
import type { Section } from '@/shared/types/section'
import { parseCsv } from '../csv-utils'
import {
  applyAssignmentImport,
  applyMemberImport,
  applyProjectImport,
  type MasterImportDeps,
} from '../master-import-apply'
import { buildAssignmentImportPlan } from '../master-import-assignments'
import { buildMemberImportPlan } from '../master-import-members'
import { buildProjectImportPlan } from '../master-import-projects'

/**
 * マスタCSV一括登録の適用。
 * 実ストアの代わりに注入したスパイで、**何を何回作るか**を固定する。
 */

const NOW = '2026-04-01T00:00:00.000Z'

/** 呼ばれるたびに連番のidを返す偽ストア */
function makeDeps() {
  let seq = 0
  const nextId = () => {
    seq++
    return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`
  }
  const divisions: Division[] = []
  const sections: Section[] = []
  const companies: Company[] = []
  const members: Member[] = []
  const projects: Project[] = []
  const assignments: Array<{
    projectId: string
    taskId: string
    memberId: string
    monthlyValues: Record<string, number>
  }> = []

  const deps: MasterImportDeps = {
    addDivision: vi.fn((name: string) => {
      const d: Division = {
        id: nextId(),
        name,
        sortOrder: divisions.length,
        createdAt: NOW,
        updatedAt: NOW,
      }
      divisions.push(d)
      return d
    }),
    addSection: vi.fn((divisionId: string, name: string) => {
      const s: Section = {
        id: nextId(),
        divisionId,
        name,
        sortOrder: sections.length,
        createdAt: NOW,
        updatedAt: NOW,
      }
      sections.push(s)
      return s
    }),
    addCompany: vi.fn((name: string) => {
      const c: Company = {
        id: nextId(),
        name,
        sortOrder: companies.length,
        isInternal: false,
        createdAt: NOW,
        updatedAt: NOW,
      }
      companies.push(c)
      return c
    }),
    addMember: vi.fn((data) => {
      const m = { ...data, id: nextId(), createdAt: NOW, updatedAt: NOW }
      members.push(m)
      return m
    }),
    addProject: vi.fn((data) => {
      const p = { ...data, id: nextId(), createdAt: NOW, updatedAt: NOW }
      projects.push(p)
      return p
    }),
    upsertAssignment: vi.fn((data) => {
      assignments.push(data)
    }),
  }
  return {
    deps,
    divisions,
    sections,
    companies,
    members,
    projects,
    assignments,
  }
}

describe('applyMemberImport', () => {
  it('マスタを作ってからメンバーを登録し、作った課・会社を紐づける', () => {
    const { deps, members, sections, companies } = makeDeps()
    const plan = buildMemberImportPlan(
      parseCsv(
        [
          '氏名,部門,課,所属会社,単価,契約単価',
          '山田,新規部,新規課,新規会社,100,80',
        ].join('\n'),
      ),
      {
        members: [],
        divisions: [],
        sections: [],
        companies: [],
        autoCreateMasters: true,
        fallbackEffectiveFrom: '2026-04',
      },
    )

    const result = applyMemberImport(plan, deps)

    expect(result).toEqual({
      createdCount: 1,
      createdDivisions: 1,
      createdSections: 1,
      createdCompanies: 1,
    })
    expect(members[0]?.sectionId).toBe(sections[0]?.id)
    expect(members[0]?.companyId).toBe(companies[0]?.id)
    expect(members[0]?.unitPriceHistory).toEqual([
      { effectiveFrom: '2026-04', amount: 100 },
    ])
    expect(members[0]?.contractUnitPriceHistory).toEqual([
      { effectiveFrom: '2026-04', amount: 80 },
    ])
  })

  it('反証: 同じ部門・課を参照する行が複数あってもマスタは1つずつしか作らない', () => {
    const { deps } = makeDeps()
    const plan = buildMemberImportPlan(
      parseCsv(
        ['氏名,部門,課', '山田,新規部,新規課', '佐藤,新規部,新規課'].join('\n'),
      ),
      {
        members: [],
        divisions: [],
        sections: [],
        companies: [],
        autoCreateMasters: true,
        fallbackEffectiveFrom: '2026-04',
      },
    )

    const result = applyMemberImport(plan, deps)
    expect(result.createdCount).toBe(2)
    expect(result.createdDivisions).toBe(1)
    expect(result.createdSections).toBe(1)
    expect(deps.addDivision).toHaveBeenCalledTimes(1)
  })

  it('部門は既存・課だけ新規のとき、既存部門の下に課を作る', () => {
    const { deps, sections } = makeDeps()
    const division: Division = {
      id: '00000000-0000-4000-8000-0000000000d1',
      name: '開発部',
      sortOrder: 0,
      createdAt: NOW,
      updatedAt: NOW,
    }
    const plan = buildMemberImportPlan(
      parseCsv(['氏名,部門,課', '山田,開発部,新規課'].join('\n')),
      {
        members: [],
        divisions: [division],
        sections: [],
        companies: [],
        autoCreateMasters: true,
        fallbackEffectiveFrom: '2026-04',
      },
    )

    const result = applyMemberImport(plan, deps)
    expect(result.createdDivisions).toBe(0)
    expect(result.createdSections).toBe(1)
    expect(sections[0]?.divisionId).toBe(division.id)
  })

  it('反証: 単価が空欄なら0円の履歴を作らない', () => {
    const { deps, members } = makeDeps()
    const plan = buildMemberImportPlan(parseCsv(['氏名', '山田'].join('\n')), {
      members: [],
      divisions: [],
      sections: [],
      companies: [],
      autoCreateMasters: true,
      fallbackEffectiveFrom: '2026-04',
    })

    applyMemberImport(plan, deps)
    expect(members[0]?.unitPriceHistory).toEqual([])
    expect(members[0]?.contractUnitPriceHistory).toEqual([])
  })
})

describe('applyProjectImport', () => {
  it('親→子の順に作り、CSV内の親のidを子のparentIdへ渡す', () => {
    const { deps, projects } = makeDeps()
    const plan = buildProjectImportPlan(
      parseCsv(
        [
          'コード,名前,親コード',
          // 子が先に書かれていても正しく繋がることを見る
          'P100-01-01,タスク,P100-01',
          'P100-01,工程,P100',
          'P100,案件,',
        ].join('\n'),
      ),
      { projects: [], divisions: [], autoCreateMasters: true },
    )

    const result = applyProjectImport(plan, deps)
    expect(result.createdCount).toBe(3)

    const [root, phase, task] = projects
    expect(root?.code).toBe('P100')
    expect(root?.parentId).toBeNull()
    expect(phase?.parentId).toBe(root?.id)
    expect(task?.parentId).toBe(phase?.id)
  })

  it('既存プロジェクトを親にする場合はそのidを使う', () => {
    const { deps, projects } = makeDeps()
    const existing: Project = {
      id: '00000000-0000-4000-8000-0000000000a1',
      code: 'P001',
      name: '既存',
      parentId: null,
      level: 0,
      status: 'not_started',
      confidence: null,
      completed: false,
      createdAt: NOW,
      updatedAt: NOW,
    }
    const plan = buildProjectImportPlan(
      parseCsv(['コード,名前,親コード', 'P001-01,追加,P001'].join('\n')),
      { projects: [existing], divisions: [], autoCreateMasters: true },
    )

    applyProjectImport(plan, deps)
    expect(projects[0]?.parentId).toBe(existing.id)
  })

  it('未登録の担当部門を作って紐づける', () => {
    const { deps, projects, divisions } = makeDeps()
    const plan = buildProjectImportPlan(
      parseCsv(['コード,名前,担当部門', 'P100,案件,新規部'].join('\n')),
      { projects: [], divisions: [], autoCreateMasters: true },
    )

    const result = applyProjectImport(plan, deps)
    expect(result.createdDivisions).toBe(1)
    expect(projects[0]?.divisionId).toBe(divisions[0]?.id)
  })
})

describe('applyAssignmentImport', () => {
  it('候補ぶんだけupsertAssignmentを呼ぶ', () => {
    const { deps, assignments } = makeDeps()
    const root: Project = {
      id: '00000000-0000-4000-8000-0000000000a0',
      code: 'P001',
      name: '案件',
      parentId: null,
      level: 0,
      status: 'not_started',
      confidence: null,
      completed: false,
      createdAt: NOW,
      updatedAt: NOW,
    }
    const task: Project = {
      ...root,
      id: '00000000-0000-4000-8000-0000000000a1',
      code: 'P001-01',
      name: 'タスク',
      parentId: root.id,
      level: 1,
    }
    const member: Member = {
      id: '00000000-0000-4000-8000-0000000000b1',
      name: '山田',
      email: null,
      sectionId: null,
      role: '',
      isActive: true,
      startDate: null,
      endDate: null,
      unitPriceHistory: [],
      createdAt: NOW,
      updatedAt: NOW,
    }

    const plan = buildAssignmentImportPlan(
      parseCsv(
        ['タスクコード,担当者,2026-04,2026-05', 'P001-01,山田,0.5,0.3'].join(
          '\n',
        ),
      ),
      { projects: [root, task], members: [member], assignments: [] },
    )

    const result = applyAssignmentImport(plan, deps)
    expect(result.createdCount).toBe(1)
    expect(assignments[0]).toEqual({
      projectId: root.id,
      taskId: task.id,
      memberId: member.id,
      monthlyValues: { '2026-04': 0.5, '2026-05': 0.3 },
    })
  })

  it('反証: 候補が0件なら何も書き込まない', () => {
    const { deps } = makeDeps()
    const result = applyAssignmentImport(
      {
        candidates: [],
        skips: [],
        targetMonths: [],
        closedMonthsSkipped: [],
        totalValue: 0,
      },
      deps,
    )
    expect(result.createdCount).toBe(0)
    expect(deps.upsertAssignment).not.toHaveBeenCalled()
  })
})
