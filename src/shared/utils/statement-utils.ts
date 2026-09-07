import type { AssignmentEntry } from '@/shared/types/assignment'
import type { Company } from '@/shared/types/company'
import type { Member } from '@/shared/types/member'
import type { Project } from '@/shared/types/project'
import { getApplicableUnitPrice } from '@/shared/utils/budget-utils'
import type {
  CsvExportRow,
  CsvSourceDefinition,
} from '@/shared/utils/csv-mapping-utils'
import { calcPaymentDueDate } from '@/shared/utils/payment-terms-utils'
import {
  calcQuasiDelegationSettlement,
  getApplicableContractEntry,
  hasSettlementRange,
  SETTLEMENT_KIND_LABELS,
  type SettlementKind,
} from '@/shared/utils/settlement-utils'

/**
 * 月次明細（/statements）のコアロジック。
 *
 * 単価の二重管理（docs/data-model.md「単価と契約単価の役割分担」）をそのまま2方向の帳票に写す:
 * - **協力会社向け（支払）**: 契約単価（`contractUnitPriceHistory`）ベース。
 *   協力会社への支払通知・検収のやり取りに使う
 * - **発注元向け（体制・請求根拠）**: 見積単価（`unitPriceHistory`）ベース。
 *   発注元への体制提示・請求根拠のやり取りに使う
 *
 * 配分率は計画（`monthlyValues`）と実績（`actualMonthlyValues`優先・未入力月は計画どおり、
 * 非公開の設計文書）を切り替えられる。すべて純粋関数。
 */

export interface StatementLine {
  companyId: string | null
  companyName: string
  memberId: string
  memberName: string
  memberRole: string
  projectId: string
  projectCode: string
  projectName: string
  /** 発注元名（発注元向けビューで使用。Project.clientName） */
  clientName: string | null
  /** 対象月の配分（人月） */
  ratio: number
  /** 対象月の適用単価（万円。協力会社向け=契約単価、発注元向け=見積単価） */
  unitPrice: number
  /** 金額（万円） = ratio × unitPrice（小数2桁丸め）。精算適用時は按分後の精算額 */
  amount: number
  /**
   * 準委任精算（非公開の設計文書）。実績モードかつ
   * 契約単価エントリに精算幅がある場合のみ設定される（メンバー×月の合計実績で判定し、
   * 行へは実績比で按分。丸め差は最終行で調整）
   */
  settlementKind?: SettlementKind
  /** メンバー×月の実績時間（h）。同一メンバーの全行に同じ値が入る */
  settlementActualHours?: number
  /** 精算の基準額（万円。1.0人月あたりの契約単価） */
  settlementBaseAmount?: number
  /** 支払期日（会社の支払サイトから算出、YYYY-MM-DD。サイト未設定はnull） */
  paymentDueDate?: string | null
  /** 会社のインボイス登録番号（T+13桁。未登録はnull） */
  invoiceRegistrationNumber?: string | null
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** 対象月の配分率を解決する（実績モードは例外入力優先・未入力月は計画どおり） */
function resolveRatio(
  assignment: AssignmentEntry,
  month: string,
  useActual: boolean,
): number {
  const planned = assignment.monthlyValues[month] ?? 0
  if (!useActual) return planned
  return assignment.actualMonthlyValues?.[month] ?? planned
}

/** member×projectで対象月の配分を合算する（複数タスクへのアサインを1行にまとめる） */
function aggregateRatios(
  assignments: AssignmentEntry[],
  month: string,
  useActual: boolean,
): Map<string, Map<string, number>> {
  const byMember = new Map<string, Map<string, number>>()
  for (const assignment of assignments) {
    const ratio = resolveRatio(assignment, month, useActual)
    if (ratio <= 0) continue
    const byProject = byMember.get(assignment.memberId) ?? new Map()
    byProject.set(
      assignment.projectId,
      (byProject.get(assignment.projectId) ?? 0) + ratio,
    )
    byMember.set(assignment.memberId, byProject)
  }
  return byMember
}

export interface BuildStatementInput {
  /** 対象月（"YYYY-MM"） */
  month: string
  members: Member[]
  companies: Company[]
  projects: Project[]
  assignments: AssignmentEntry[]
  /** trueなら実績（例外入力優先・未入力月は計画どおり）、falseなら計画 */
  useActual: boolean
  /** 人月→時間換算（準委任精算用）。省略時は既定値20人日・8h */
  workdaysPerMonth?: number
  hoursPerDay?: number
}

function buildLines(
  input: BuildStatementInput,
  priceOf: (member: Member, month: string) => number,
  memberFilter: (member: Member, company: Company | undefined) => boolean,
): StatementLine[] {
  const companyById = new Map(input.companies.map((c) => [c.id, c]))
  const memberById = new Map(input.members.map((m) => [m.id, m]))
  const projectById = new Map(input.projects.map((p) => [p.id, p]))
  const ratios = aggregateRatios(
    input.assignments,
    input.month,
    input.useActual,
  )

  const lines: StatementLine[] = []
  for (const [memberId, byProject] of ratios) {
    const member = memberById.get(memberId)
    if (!member) continue
    const company = member.companyId
      ? companyById.get(member.companyId)
      : undefined
    if (!memberFilter(member, company)) continue
    const unitPrice = priceOf(member, input.month)

    for (const [projectId, ratio] of byProject) {
      const project = projectById.get(projectId)
      lines.push({
        companyId: member.companyId ?? null,
        companyName: company?.name ?? '（所属会社未設定）',
        memberId,
        memberName: member.name,
        memberRole: member.role,
        projectId,
        projectCode: project?.code ?? '(不明)',
        projectName: project?.name ?? '(不明なプロジェクト)',
        clientName: project?.clientName ?? null,
        ratio: round2(ratio),
        unitPrice,
        amount: round2(ratio * unitPrice),
      })
    }
  }
  return lines
}

/**
 * 準委任精算を支払明細行へ適用する（破壊的更新。非公開の設計文書）。
 * 判定はメンバー×月の**合計実績**（案件横断）で行い、各行へは実績比で按分する。
 * 按分の丸め（小数2桁）で合計が精算額とズレる分は最終行で調整し、
 * Σ行金額 = 精算額 を常に保証する
 */
function applyQuasiDelegationSettlement(
  lines: StatementLine[],
  input: BuildStatementInput,
): void {
  const memberById = new Map(input.members.map((m) => [m.id, m]))
  const byMember = new Map<string, StatementLine[]>()
  for (const line of lines) {
    const list = byMember.get(line.memberId) ?? []
    list.push(line)
    byMember.set(line.memberId, list)
  }
  for (const [memberId, memberLines] of byMember) {
    const member = memberById.get(memberId)
    if (!member) continue
    const entry = getApplicableContractEntry(
      member.contractUnitPriceHistory ?? [],
      input.month,
    )
    if (!entry || !hasSettlementRange(entry)) continue

    const totalRatio = memberLines.reduce((sum, l) => sum + l.ratio, 0)
    const settlement = calcQuasiDelegationSettlement(
      entry,
      totalRatio,
      input.workdaysPerMonth,
      input.hoursPerDay,
    )
    let distributed = 0
    memberLines.forEach((line, index) => {
      const isLast = index === memberLines.length - 1
      const share =
        totalRatio > 0
          ? round2((settlement.payableAmount * line.ratio) / totalRatio)
          : 0
      line.amount = isLast
        ? round2(settlement.payableAmount - distributed)
        : share
      distributed = round2(distributed + line.amount)
      line.settlementKind = settlement.kind
      line.settlementActualHours = settlement.actualHours
      line.settlementBaseAmount = settlement.baseAmount
    })
  }
}

/**
 * 協力会社向けの支払明細行を構築する。
 * 対象: 協力会社（`Company.isInternal === false`）に所属するメンバーのみ
 * （内部リソース・所属未設定への「支払」は存在しないため除外する）。
 * 単価: 契約単価（`contractUnitPriceHistory`）のみ。履歴が無い場合は0のまま出力する
 * （見積単価へフォールバックすると支払額が過大になるため。0行は契約単価の入力漏れの検知にもなる）。
 * 並び順: 会社名→メンバー名→PJコード。
 */
export function buildPartnerPaymentLines(
  input: BuildStatementInput,
): StatementLine[] {
  const lines = buildLines(
    input,
    (member, month) =>
      getApplicableUnitPrice(member.contractUnitPriceHistory ?? [], month),
    (member, company) =>
      member.companyId !== null &&
      member.companyId !== undefined &&
      company !== undefined &&
      !company.isInternal,
  )
  // 準委任精算（実績モードのみ。計画は従来どおり計画×単価）
  if (input.useActual) {
    applyQuasiDelegationSettlement(lines, input)
  }
  // 取引先属性（支払サイト→支払期日・インボイス登録番号）
  const partnerCompanyById = new Map(input.companies.map((c) => [c.id, c]))
  for (const line of lines) {
    const company = line.companyId
      ? partnerCompanyById.get(line.companyId)
      : undefined
    line.paymentDueDate = company?.paymentTerms
      ? calcPaymentDueDate(input.month, company.paymentTerms)
      : null
    line.invoiceRegistrationNumber = company?.invoiceRegistrationNumber ?? null
  }
  return lines.sort(
    (a, b) =>
      a.companyName.localeCompare(b.companyName, 'ja') ||
      a.memberName.localeCompare(b.memberName, 'ja') ||
      a.projectCode.localeCompare(b.projectCode, 'ja'),
  )
}

/**
 * 発注元向けの明細行を構築する（案件→会社→人の体制・請求根拠）。
 * 対象: 全メンバー（内部リソース含む。発注元向けの体制には自社要員も載る）。
 * 単価: 見積単価（`unitPriceHistory`）。予算の見積もり・請求根拠に使う側の単価。
 * 並び順: PJコード→会社名→メンバー名。
 */
export function buildClientStatementLines(
  input: BuildStatementInput,
): StatementLine[] {
  const lines = buildLines(
    input,
    (member, month) => getApplicableUnitPrice(member.unitPriceHistory, month),
    () => true,
  )
  return lines.sort(
    (a, b) =>
      a.projectCode.localeCompare(b.projectCode, 'ja') ||
      a.companyName.localeCompare(b.companyName, 'ja') ||
      a.memberName.localeCompare(b.memberName, 'ja'),
  )
}

/** 指定キーで小計を取るための汎用集計（表示・CSVの合計行に使用） */
export function sumStatementAmount(lines: StatementLine[]): number {
  return round2(lines.reduce((sum, line) => sum + line.amount, 0))
}

export function sumStatementRatio(lines: StatementLine[]): number {
  return round2(lines.reduce((sum, line) => sum + line.ratio, 0))
}

type CsvRow = (string | number | null)[]

/** 協力会社向け支払明細のCSV行（会社→人→案件PJコード） */
export function buildPartnerPaymentCsvRows(
  lines: StatementLine[],
  month: string,
): CsvRow[] {
  const rows: CsvRow[] = [
    [
      '対象月',
      '所属会社',
      '担当者',
      '役割',
      'PJコード',
      'プロジェクト名',
      '配分(人月)',
      '契約単価(万円)',
      '支払額(万円)',
    ],
  ]
  for (const line of lines) {
    rows.push([
      month,
      line.companyName,
      line.memberName,
      line.memberRole,
      line.projectCode,
      line.projectName,
      line.ratio,
      line.unitPrice,
      line.amount,
    ])
  }
  rows.push([
    month,
    '(合計)',
    null,
    null,
    null,
    null,
    sumStatementRatio(lines),
    null,
    sumStatementAmount(lines),
  ])
  return rows
}

/** 発注元向け明細のCSV行（案件→会社→人） */
export function buildClientStatementCsvRows(
  lines: StatementLine[],
  month: string,
): CsvRow[] {
  const rows: CsvRow[] = [
    [
      '対象月',
      'PJコード',
      'プロジェクト名',
      '発注元',
      '所属会社',
      '担当者',
      '役割',
      '配分(人月)',
      '単価(万円)',
      '金額(万円)',
    ],
  ]
  for (const line of lines) {
    rows.push([
      month,
      line.projectCode,
      line.projectName,
      line.clientName ?? '',
      line.companyName,
      line.memberName,
      line.memberRole,
      line.ratio,
      line.unitPrice,
      line.amount,
    ])
  }
  rows.push([
    month,
    '(合計)',
    null,
    null,
    null,
    null,
    null,
    sumStatementRatio(lines),
    null,
    sumStatementAmount(lines),
  ])
  return rows
}

// ============================================================================
// 汎用CSVマッピング基盤のデータソース（Phase C）。
// 既存の固定CSV（buildPartnerPaymentCsvRows等）と数値・並びの既定は同一だが、
// 合計行は含めない（外部システム取込では合計行が混入エラーの原因になるため。
// 合計が必要な帳票用途は従来の固定CSV出力を使う）
// ============================================================================

export const PARTNER_PAYMENT_SOURCE: CsvSourceDefinition = {
  key: 'partnerPayment',
  label: '協力会社への支払明細',
  fields: [
    { key: 'month', label: '対象月' },
    { key: 'companyName', label: '所属会社' },
    { key: 'memberName', label: '担当者' },
    { key: 'memberRole', label: '役割' },
    { key: 'projectCode', label: 'PJコード' },
    { key: 'projectName', label: 'プロジェクト名' },
    { key: 'ratio', label: '配分(人月)' },
    { key: 'unitPrice', label: '契約単価(万円)' },
    { key: 'amount', label: '支払額(万円)' },
    { key: 'settlementKind', label: '精算判定' },
    { key: 'settlementActualHours', label: '実績時間(h)' },
    { key: 'settlementBaseAmount', label: '精算基準額(万円)' },
    { key: 'paymentDueDate', label: '支払期日' },
    { key: 'invoiceRegistrationNumber', label: 'インボイス登録番号' },
  ],
}

export function buildPartnerPaymentRecords(
  lines: StatementLine[],
  month: string,
): CsvExportRow[] {
  return lines.map((line) => ({
    month,
    companyName: line.companyName,
    memberName: line.memberName,
    memberRole: line.memberRole,
    projectCode: line.projectCode,
    projectName: line.projectName,
    ratio: line.ratio,
    unitPrice: line.unitPrice,
    amount: line.amount,
    settlementKind: line.settlementKind
      ? SETTLEMENT_KIND_LABELS[line.settlementKind]
      : '',
    settlementActualHours: line.settlementActualHours ?? '',
    settlementBaseAmount: line.settlementBaseAmount ?? '',
    paymentDueDate: line.paymentDueDate ?? '',
    invoiceRegistrationNumber: line.invoiceRegistrationNumber ?? '',
  }))
}

export const CLIENT_STATEMENT_SOURCE: CsvSourceDefinition = {
  key: 'clientStatement',
  label: '発注元向け明細',
  fields: [
    { key: 'month', label: '対象月' },
    { key: 'projectCode', label: 'PJコード' },
    { key: 'projectName', label: 'プロジェクト名' },
    { key: 'clientName', label: '発注元' },
    { key: 'companyName', label: '所属会社' },
    { key: 'memberName', label: '担当者' },
    { key: 'memberRole', label: '役割' },
    { key: 'ratio', label: '配分(人月)' },
    { key: 'unitPrice', label: '単価(万円)' },
    { key: 'amount', label: '金額(万円)' },
  ],
}

export function buildClientStatementRecords(
  lines: StatementLine[],
  month: string,
): CsvExportRow[] {
  return lines.map((line) => ({
    month,
    projectCode: line.projectCode,
    projectName: line.projectName,
    clientName: line.clientName ?? '',
    companyName: line.companyName,
    memberName: line.memberName,
    memberRole: line.memberRole,
    ratio: line.ratio,
    unitPrice: line.unitPrice,
    amount: line.amount,
  }))
}
