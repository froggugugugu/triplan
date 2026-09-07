import type { AssignmentEntry } from '@/shared/types/assignment'
import type { Member } from '@/shared/types/member'
import type { Project } from '@/shared/types/project'

/**
 * CSVレポートの行データ構築（非公開の設計文書）。
 * いずれも既存の算出ロジック（概算予算・損益・進捗率・アサイン集計）を再利用し、
 * 画面表示と同じ数値がCSVに出ることを保証する（レポート専用の計算式を持たない）。
 * 文字列化・エスケープは`shared/utils/csv-utils.ts`が担う。
 */

type CsvRow = (string | number | null)[]

import type { ProjectFinanceCsvInput } from '@/shared/utils/project-finance'

/**
 * 案件別収支のカタログ・レコードビルダーの実体は`shared/utils/project-finance.ts`へ移設
 * （公開API v1がサーバーから再利用するため）。features配下からの参照用にリエクスポートする。
 */
export {
  buildProjectFinanceRecords,
  PROJECT_FINANCE_SOURCE,
} from '@/shared/utils/project-finance'
export type { ProjectFinanceCsvInput }

import {
  buildProjectFinanceRecords,
  PROJECT_FINANCE_SOURCE,
} from '@/shared/utils/project-finance'

/**
 * 案件別収支表: 受注金額・概算予算・実コスト・粗利・進捗率を案件横断で一覧化する。
 * 社内の案件レビュー会議への提出を想定した帳票。
 */
export function buildProjectFinanceCsvRows(
  input: ProjectFinanceCsvInput,
): CsvRow[] {
  const fields = PROJECT_FINANCE_SOURCE.fields
  const rows: CsvRow[] = [fields.map((f) => f.label)]
  for (const record of buildProjectFinanceRecords(input)) {
    rows.push(fields.map((f) => record[f.key] ?? null))
  }
  return rows
}

export interface MemberUtilizationCsvInput {
  members: Member[]
  assignments: AssignmentEntry[]
  /** プロジェクト名の解決用（全Project。トップレベルに限らない） */
  projects: Pick<Project, 'id' | 'name' | 'parentId'>[]
  /** 出力対象の月キー（"YYYY-MM"、年度12ヶ月分を想定） */
  monthKeys: string[]
}

function resolveRootProjectName(
  projectId: string,
  projects: Pick<Project, 'id' | 'name' | 'parentId'>[],
): string {
  const byId = new Map(projects.map((p) => [p.id, p]))
  let current = byId.get(projectId)
  // 念のため循環防御（自己参照データがあっても無限ループしない）
  for (let hops = 0; current?.parentId && hops < 10; hops++) {
    const parent = byId.get(current.parentId)
    if (!parent) break
    current = parent
  }
  return current?.name ?? '(不明なプロジェクト)'
}

/**
 * 要員別稼働表: メンバー×プロジェクト×月の配分を計画・実績の2区分で一覧化する。
 * 客先提出の稼働報告書・BPへの支払根拠の原型となる帳票。
 * 実績は例外入力（`actualMonthlyValues`）がある月のみその値、無い月は計画値
 * （無操作＝計画どおり、非公開の設計文書）。
 */
export function buildMemberUtilizationCsvRows(
  input: MemberUtilizationCsvInput,
): CsvRow[] {
  const rows: CsvRow[] = [
    [
      '担当者',
      '役割',
      'プロジェクト',
      '区分',
      ...input.monthKeys,
      '合計(人月)',
    ],
  ]

  for (const member of input.members) {
    const memberAssignments = input.assignments.filter(
      (a) => a.memberId === member.id,
    )
    if (memberAssignments.length === 0) continue

    // プロジェクト（ルート）単位に集計する
    const byProject = new Map<string, AssignmentEntry[]>()
    for (const assignment of memberAssignments) {
      const list = byProject.get(assignment.projectId) ?? []
      list.push(assignment)
      byProject.set(assignment.projectId, list)
    }

    const memberTotals = {
      plan: new Map<string, number>(),
      actual: new Map<string, number>(),
    }

    for (const [projectId, projectAssignments] of byProject) {
      const projectName = resolveRootProjectName(projectId, input.projects)
      for (const kind of ['plan', 'actual'] as const) {
        const values: number[] = input.monthKeys.map((month) => {
          let sum = 0
          for (const a of projectAssignments) {
            const planned = a.monthlyValues[month] ?? 0
            sum +=
              kind === 'actual'
                ? (a.actualMonthlyValues?.[month] ?? planned)
                : planned
          }
          return sum
        })
        for (const [i, month] of input.monthKeys.entries()) {
          const totals = memberTotals[kind]
          totals.set(month, (totals.get(month) ?? 0) + (values[i] ?? 0))
        }
        const total = values.reduce((s, v) => s + v, 0)
        // 全月0の区分行はノイズになるため出力しない
        if (total <= 0) continue
        rows.push([
          member.name,
          member.role,
          projectName,
          kind === 'plan' ? '計画' : '実績',
          ...values.map((v) => Math.round(v * 100) / 100),
          Math.round(total * 100) / 100,
        ])
      }
    }

    for (const kind of ['plan', 'actual'] as const) {
      const values = input.monthKeys.map(
        (month) => memberTotals[kind].get(month) ?? 0,
      )
      const total = values.reduce((s, v) => s + v, 0)
      if (total <= 0) continue
      rows.push([
        member.name,
        member.role,
        '(合計)',
        kind === 'plan' ? '計画' : '実績',
        ...values.map((v) => Math.round(v * 100) / 100),
        Math.round(total * 100) / 100,
      ])
    }
  }

  return rows
}

export interface DivisionBudgetCsvRowInput {
  divisionName: string
  overview: {
    projectPersonnelTotal: number
    projectExpenseTotal: number
    generalExpenseTotal: number
    aiUsageBudgetTotal: number
    saasCostTotal: number
    personnelPlanBudgetTotal: number
    projectWbsEstimateTotal: number
    grandTotal: number
  }
}

/**
 * 部門予算予実表: 部門予算タブの俯瞰集計（`getBudgetOverview`）をそのまま帳票化する。
 * 集計ロジックはbudget-store側で単体テスト済みのため、本関数は整形のみを担う。
 */
export function buildDivisionBudgetCsvRows(
  inputs: DivisionBudgetCsvRowInput[],
  fiscalYear: number,
): CsvRow[] {
  const rows: CsvRow[] = [['部門', '年度', '項目', '金額(万円)']]
  for (const { divisionName, overview } of inputs) {
    const items: [string, number][] = [
      ['案件予算（人件費・内訳計上分）', overview.projectPersonnelTotal],
      ['案件予算（付帯費用・内訳計上分）', overview.projectExpenseTotal],
      ['案件予算（WBS概算・未計上分）', overview.projectWbsEstimateTotal],
      ['人件費予算（人員計画）', overview.personnelPlanBudgetTotal],
      ['一般経費', overview.generalExpenseTotal],
      ['AI利用費予算', overview.aiUsageBudgetTotal],
      ['SaaS費用', overview.saasCostTotal],
      ['総合計', overview.grandTotal],
    ]
    for (const [label, amount] of items) {
      rows.push([divisionName, fiscalYear, label, Math.round(amount)])
    }
  }
  return rows
}
