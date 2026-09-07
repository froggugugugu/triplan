import type { AssignmentEntry } from '@/shared/types/assignment'
import type { EffortEntry } from '@/shared/types/effort'
import type { Member } from '@/shared/types/member'
import type { ProjectTreeNode } from '@/shared/types/project'
import {
  calcProjectEstimateBudget,
  WORKDAYS_PER_MONTH,
} from '@/shared/utils/budget-utils'
import type { ProjectCostBreakdown } from '@/shared/utils/cost-breakdown-utils'
import type {
  CsvExportRow,
  CsvSourceDefinition,
} from '@/shared/utils/csv-mapping-utils'
import { computeProjectTotalEffort } from '@/shared/utils/effort-utils'
import {
  calcProjectProfitability,
  type ProjectProfitability,
} from '@/shared/utils/profitability-utils'
import { calcWbsProgressWeighted } from '@/shared/utils/wbs-progress-utils'

/**
 * 案件別収支のレコードビルダー（で`features/reports/utils/report-csv.ts`から移設。
 * 公開API v1がサーバー側から再利用するためshared化。旧位置はリエクスポート）。
 * 算出ロジックは画面・固定CSV・カスタムCSV・公開APIのすべてで同一（単一実装）。
 */

export interface ProjectFinanceCsvInput {
  /** トップレベル案件のツリー（配下タスクを含む。getProjectTree()の戻り値） */
  projectTree: ProjectTreeNode[]
  divisions: { id: string; name: string }[]
  efforts: EffortEntry[]
  /** 案件ごとの有効なWBS工数列ID */
  getColumnIds: (projectId: string) => string[]
  estimatedUnitPrice: number
  /** 人月換算の1人月あたり人日（P0-a設定化）。省略時は従来の固定値20 */
  workdaysPerMonth?: number
  getCoefficient: (projectId: string) => number
  assignments: AssignmentEntry[]
  members: Member[]
  budgetBreakdowns: Parameters<typeof calcProjectProfitability>[3]
  /** 実コストの集計基準日（テストでは固定日を渡す） */
  referenceDate: Date
  /**
   * 原価4区分。`buildProjectCostBreakdownMap`で構築して渡す。
   * 省略時は4区分＋配賦後利益フィールドをnull出力する
   */
  costBreakdownByProjectId?: Map<string, ProjectCostBreakdown>
}

/**
 * 案件別収支のフィールドカタログ（汎用CSVマッピング基盤のデータソース定義、Phase B）。
 * ラベルは従来の固定ヘッダと同一（既定プロファイル=従来出力の完全互換）
 */
export const PROJECT_FINANCE_SOURCE: CsvSourceDefinition = {
  key: 'projectFinance',
  label: '案件別収支',
  fields: [
    { key: 'code', label: 'コード' },
    { key: 'name', label: 'プロジェクト名' },
    { key: 'divisionName', label: '担当部門' },
    { key: 'clientName', label: '発注元' },
    { key: 'contractType', label: '契約形態' },
    { key: 'masterDueDate', label: 'マスター納期' },
    { key: 'contractAmount', label: '受注金額(万円)' },
    { key: 'estimateBudget', label: '概算予算(万円)' },
    { key: 'actualPersonnelCost', label: '実人件費(万円)' },
    { key: 'actualExpenseCost', label: '実付帯費用(万円)' },
    { key: 'actualCostTotal', label: '実コスト計(万円)' },
    { key: 'grossProfit', label: '粗利(万円)' },
    { key: 'profitMarginRate', label: '利益率(%)' },
    { key: 'progressRate', label: '進捗率(%)' },
    // 原価4区分。労務費+外注費=実人件費、直接経費=実付帯費用と同値
    { key: 'laborCost', label: '労務費(万円)' },
    { key: 'subcontractCost', label: '外注費(万円)' },
    { key: 'directExpense', label: '直接経費(万円)' },
    { key: 'allocatedOverhead', label: '間接費配賦(万円)' },
    { key: 'netProfitAfterOverhead', label: '配賦後利益(万円)' },
  ],
}

/**
 * 案件別収支のレコード行を構築する（マッピング基盤用）。
 * 算出ロジックは従来の固定CSVと同一（`buildProjectFinanceCsvRows`はこの結果を
 * カタログ順に並べるラッパー＝両者の数値は常に一致する）
 */
export function buildProjectFinanceRecords(
  input: ProjectFinanceCsvInput,
): CsvExportRow[] {
  const divisionNameById = new Map(input.divisions.map((d) => [d.id, d.name]))
  return input.projectTree.map((root) => {
    const columnIds = input.getColumnIds(root.id)
    const totalEffortDays =
      computeProjectTotalEffort([root], columnIds, input.efforts).get(
        root.id,
      ) ?? 0
    const estimateBudget = calcProjectEstimateBudget(
      totalEffortDays / (input.workdaysPerMonth ?? WORKDAYS_PER_MONTH),
      input.estimatedUnitPrice,
      input.getCoefficient(root.id),
    )
    const profitability: ProjectProfitability = calcProjectProfitability(
      root,
      input.assignments,
      input.members,
      input.budgetBreakdowns,
      input.referenceDate,
    )
    const progressRate = calcWbsProgressWeighted(root, columnIds, input.efforts)
    const hasContract = (root.contractAmount ?? 0) > 0
    const costBreakdown = input.costBreakdownByProjectId?.get(root.id) ?? null

    return {
      code: root.code,
      name: root.name,
      divisionName: root.divisionId
        ? (divisionNameById.get(root.divisionId) ?? '')
        : '',
      clientName: root.clientName ?? '',
      contractType: root.contractType ?? '',
      masterDueDate: root.masterDueDate ?? '',
      contractAmount: hasContract ? profitability.contractAmount : null,
      estimateBudget,
      actualPersonnelCost: profitability.actualPersonnelCost,
      actualExpenseCost: profitability.actualExpenseCost,
      actualCostTotal: profitability.actualCostTotal,
      // 受注金額が未設定の案件は粗利・利益率を空欄にする（0受注に対する粗利は誤解を招くため）
      grossProfit: hasContract ? profitability.grossProfit : null,
      profitMarginRate:
        hasContract && profitability.profitMarginRate !== null
          ? Math.round(profitability.profitMarginRate * 10) / 10
          : null,
      progressRate: Math.round(progressRate * 100),
      laborCost: costBreakdown?.laborCost ?? null,
      subcontractCost: costBreakdown?.subcontractCost ?? null,
      directExpense: costBreakdown?.directExpense ?? null,
      allocatedOverhead: costBreakdown?.allocatedOverhead ?? null,
      // 配賦後利益 = 粗利 − 間接費配賦。粗利と同じく受注金額未設定はnull（判定不能）
      netProfitAfterOverhead:
        costBreakdown && hasContract
          ? profitability.grossProfit - costBreakdown.allocatedOverhead
          : null,
    }
  })
}
