import { describe, expect, it, vi } from 'vitest'
import type { CreateProject, Project } from '@/shared/types/project'
import {
  applyWbsTemplate,
  STANDARD_WBS_TEMPLATE,
  type WbsTemplateNode,
} from '../wbs-template-apply'

function makeRoot(overrides: Partial<Project> = {}): Project {
  return {
    id: crypto.randomUUID(),
    code: 'P001',
    name: 'テスト案件',
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

/**
 * addProject/getProjectsをインメモリで模擬するテスト用フェイクストア。
 * applyWbsTemplateはZustandに依存しないため、単純な配列操作のみで検証できる。
 */
function createFakeStore(root: Project) {
  let projects: Project[] = [root]
  const addProject = vi.fn((data: CreateProject): Project => {
    const created: Project = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: '2025-06-01T00:00:00.000Z',
      updatedAt: '2025-06-01T00:00:00.000Z',
    }
    projects = [...projects, created]
    return created
  })
  const getProjects = () => projects
  return { addProject, getProjects, all: () => projects }
}

function countNodes(nodes: WbsTemplateNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children ?? []), 0)
}

describe('applyWbsTemplate', () => {
  it('標準テンプレートの全ノード数分addProjectを呼び出す', () => {
    const root = makeRoot()
    const { addProject, getProjects } = createFakeStore(root)

    applyWbsTemplate(root, addProject, getProjects)

    expect(addProject).toHaveBeenCalledTimes(countNodes(STANDARD_WBS_TEMPLATE))
  })

  it('トップレベルの工程はparentProjectの直下（level+1）に作成される', () => {
    const root = makeRoot({ level: 0 })
    const { addProject, getProjects, all } = createFakeStore(root)

    applyWbsTemplate(root, addProject, getProjects)

    const topLevelNodes = all().filter((p) => p.parentId === root.id)
    expect(topLevelNodes.length).toBe(STANDARD_WBS_TEMPLATE.length)
    for (const node of topLevelNodes) {
      expect(node.level).toBe(1)
    }
  })

  it('子を持つ工程（UT/ITa/ITb/負荷試験）は方針/計画/実施/報告の4項目を孫ノード（level+2）として作成する', () => {
    const root = makeRoot()
    const { addProject, getProjects, all } = createFakeStore(root)

    applyWbsTemplate(root, addProject, getProjects)

    const utNode = all().find((p) => p.name === 'UT（単体テスト）')
    expect(utNode).toBeDefined()
    const utChildren = all().filter((p) => p.parentId === utNode?.id)
    expect(utChildren.map((c) => c.name).sort()).toEqual(
      ['UT方針', 'UT計画', 'UT実施', 'UT報告'].sort(),
    )
    for (const child of utChildren) {
      expect(child.level).toBe(2)
      // 完了条件を軸とするテンプレートのため、各リーフは必ず完了条件を持つ
      expect(child.completionCriteria).toBeTruthy()
    }
  })

  it('完了条件を持たない工程（親ノード）はcompletionCriteriaがundefinedのまま作成される', () => {
    const root = makeRoot()
    const { addProject, getProjects, all } = createFakeStore(root)

    applyWbsTemplate(root, addProject, getProjects)

    const itaNode = all().find((p) => p.name === 'ITa（結合テストA）')
    expect(itaNode?.completionCriteria).toBeUndefined()
  })

  it('リーフの工程（要求整理配下の要求一覧等）はcompletionCriteriaを持つ', () => {
    const root = makeRoot()
    const { addProject, getProjects, all } = createFakeStore(root)

    applyWbsTemplate(root, addProject, getProjects)

    const node = all().find((p) => p.name === '要求一覧')
    expect(node?.completionCriteria).toBe(
      'システム化の目的・背景・狙いを整理した要求一覧が文書化され、顧客の合意を得ている',
    )
  })

  // 反証: IPA共通フレーム準拠で拡充した工程（要件定義/基本設計等）も、
  // 親ノードは完了条件を持たず子ノード（成果物単位）に完了条件が付与されている
  it('反証: 要件定義・基本設計は親ノードとして作成され、成果物単位の子ノードに完了条件が付与される', () => {
    const root = makeRoot()
    const { addProject, getProjects, all } = createFakeStore(root)

    applyWbsTemplate(root, addProject, getProjects)

    const requirementNode = all().find((p) => p.name === '要件定義')
    expect(requirementNode?.completionCriteria).toBeUndefined()
    const requirementChildren = all().filter(
      (p) => p.parentId === requirementNode?.id,
    )
    expect(requirementChildren.map((c) => c.name).sort()).toEqual(
      ['業務要件定義書', '機能要件定義書', '非機能要件定義書'].sort(),
    )
    for (const child of requirementChildren) {
      expect(child.completionCriteria).toBeTruthy()
    }

    const basicDesignNode = all().find((p) => p.name === '基本設計')
    const basicDesignChildren = all().filter(
      (p) => p.parentId === basicDesignNode?.id,
    )
    expect(basicDesignChildren).toHaveLength(7)
  })

  // 反証: 同じプロジェクトに2回適用しても、コード採番が重複せず一意に採番され続けるか
  // （getProjectsが都度最新状態を返す前提が壊れていないかの確認）
  it('反証: 同一プロジェクトに2回適用してもコードが重複しない', () => {
    const root = makeRoot()
    const { addProject, getProjects, all } = createFakeStore(root)

    applyWbsTemplate(root, addProject, getProjects)
    applyWbsTemplate(root, addProject, getProjects)

    const codes = all()
      .filter((p) => p.id !== root.id)
      .map((p) => p.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('カスタムテンプレートを渡した場合はそちらのみが適用される', () => {
    const root = makeRoot()
    const { addProject, getProjects, all } = createFakeStore(root)
    const customTemplate: WbsTemplateNode[] = [
      { name: 'カスタム工程', completionCriteria: '完了' },
    ]

    applyWbsTemplate(root, addProject, getProjects, customTemplate)

    const created = all().filter((p) => p.id !== root.id)
    expect(created).toHaveLength(1)
    expect(created[0]?.name).toBe('カスタム工程')
  })
})
