import { STANDARD_WBS_TEMPLATE } from '@/shared/data/wbs-template-master'
import type { CreateProject, Project } from '@/shared/types/project'
import type { WbsTemplateNode } from '@/shared/types/wbs-template'
import { generateProjectCode } from '@/shared/utils/project-code-generator'

export type { WbsTemplateNode }
export { STANDARD_WBS_TEMPLATE }

/**
 * 指定したWBSテンプレート（`template`。省略時は標準テンプレート）を
 * プロジェクト（`parentProject`）配下に一括適用する。
 * `addProject`呼び出しのたびにコード採番（`generateProjectCode`）用の最新プロジェクト一覧が
 * 必要なため、都度最新状態を返す`getProjects`を受け取る（`addProject`はid/コードを内部で
 * 決定しないため、事前のID採番は行わずstore経由の生成結果をそのまま子の`parentId`に使う）。
 * 本関数自体はstoreに依存しない（呼び出し側でZustandストアのアクション・セレクタを注入する）。
 * 実体は元`features/projects/utils/wbs-template.ts`から移設（* 初期設定ウィザード＝features/onboardingからも使うため、features間直接依存を避けてshared化）。
 */
export function applyWbsTemplate(
  parentProject: Pick<Project, 'id' | 'code' | 'level'>,
  addProject: (data: CreateProject) => Project,
  getProjects: () => Pick<Project, 'code' | 'level' | 'parentId'>[],
  template: WbsTemplateNode[] = STANDARD_WBS_TEMPLATE,
): void {
  function createNode(
    node: WbsTemplateNode,
    parent: Pick<Project, 'id' | 'code' | 'level'>,
  ) {
    const level = parent.level + 1
    const code = generateProjectCode(
      level,
      getProjects(),
      parent.id,
      parent.code,
    )
    const created = addProject({
      code,
      name: node.name,
      completionCriteria: node.completionCriteria,
      parentId: parent.id,
      level,
      status: 'not_started',
      confidence: null,
      completed: false,
      divisionId: null,
    })
    for (const child of node.children ?? []) {
      createNode(child, created)
    }
  }

  for (const node of template) {
    createNode(node, parentProject)
  }
}
