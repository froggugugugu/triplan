import type { Company } from '@/shared/types/company'
import type { Division } from '@/shared/types/division'
import type { Section } from '@/shared/types/section'
import type { AssignmentImportPlan } from './master-import-assignments'
import type { MemberImportPlan } from './master-import-members'
import type { ProjectImportPlan } from './master-import-projects'

/**
 * 「実際に登録される内容」のプレビュー行。
 *
 * 件数とスキップ理由だけでは、**列を取り違えたまま通ってしまう**ケースに気づけない
 * （例: 部門と課を逆に書いた、単価と契約単価が入れ替わっている）。
 * 解釈後の値を人が読める形に直して並べる。
 *
 * 純関数。既存マスタのidは名前へ引き直し、これから作るものは「（新規）」と示す
 * ——「新しく作られる」ことが取込前に分かるのが要点。
 */

export interface PreviewTable {
  columns: string[]
  rows: string[][]
}

/** ダイアログに出す最大行数。超えた分は件数だけ伝える */
export const PREVIEW_ROW_LIMIT = 200

const NEW_SUFFIX = '（新規）'
const EMPTY = '—'

export function buildMemberPreview(
  plan: MemberImportPlan,
  masters: { divisions: Division[]; sections: Section[]; companies: Company[] },
): PreviewTable {
  const sectionById = new Map(masters.sections.map((s) => [s.id, s]))
  const divisionById = new Map(masters.divisions.map((d) => [d.id, d]))
  const companyById = new Map(masters.companies.map((c) => [c.id, c]))

  return {
    columns: [
      '行',
      '氏名',
      'メール',
      '所属',
      '所属会社',
      '役割',
      '契約形態',
      '稼働率上限',
      '在籍期間',
      '単価',
      '契約単価',
    ],
    rows: plan.candidates.map((c) => {
      const section = c.sectionId ? sectionById.get(c.sectionId) : undefined
      const division = section
        ? divisionById.get(section.divisionId)
        : undefined

      // 既存の課に入るならその名前、これから作るなら「（新規）」を添える
      const affiliation = section
        ? `${division?.name ?? '?'} / ${section.name}`
        : c.sectionName
          ? `${c.divisionName} / ${c.sectionName}${NEW_SUFFIX}`
          : c.divisionName
            ? `${c.divisionName}${c.existingDivisionId ? '' : NEW_SUFFIX}`
            : EMPTY

      const company = c.companyId ? companyById.get(c.companyId) : undefined
      const companyLabel = company
        ? company.name
        : c.companyName
          ? `${c.companyName}${NEW_SUFFIX}`
          : EMPTY

      return [
        String(c.row),
        c.name,
        c.email ?? EMPTY,
        affiliation,
        companyLabel,
        c.role || EMPTY,
        c.contractType ?? EMPTY,
        c.capacityRatio === undefined ? '1.0' : c.capacityRatio.toFixed(2),
        formatPeriod(c.startDate, c.endDate),
        formatPrice(c.unitPrice, c.effectiveFrom),
        formatPrice(c.contractUnitPrice, c.effectiveFrom),
      ]
    }),
  }
}

const STATUS_LABELS: Record<string, string> = {
  not_started: '未着手',
  active: '進行中',
  completed: '完了',
}

export function buildProjectPreview(
  plan: ProjectImportPlan,
  masters: { divisions: Division[] },
): PreviewTable {
  const divisionById = new Map(masters.divisions.map((d) => [d.id, d]))

  return {
    columns: [
      '行',
      '階層',
      'コード',
      '名前',
      '親',
      'ステータス',
      '担当部門',
      '発注元',
      '受注金額',
      '納期',
    ],
    rows: plan.candidates.map((c) => {
      const division = c.divisionId ? divisionById.get(c.divisionId) : undefined
      const divisionLabel = division
        ? division.name
        : c.divisionName
          ? `${c.divisionName}${NEW_SUFFIX}`
          : EMPTY

      return [
        String(c.row),
        // 階層をインデントで示す（level 0=プロジェクト、以降はタスク）
        c.level === 0
          ? 'プロジェクト'
          : `${'　'.repeat(c.level - 1)}└ L${c.level}`,
        c.code,
        c.name,
        c.parentCode ?? EMPTY,
        STATUS_LABELS[c.status] ?? c.status,
        divisionLabel,
        c.clientName ?? EMPTY,
        c.contractAmount === null ? EMPTY : `${c.contractAmount}万円`,
        c.masterDueDate ?? EMPTY,
      ]
    }),
  }
}

export function buildAssignmentPreview(
  plan: AssignmentImportPlan,
): PreviewTable {
  const months = plan.targetMonths
  return {
    columns: ['行', 'プロジェクト', 'タスク', '担当者', '合計', ...months],
    rows: plan.candidates.map((c) => {
      const total = Object.values(c.monthlyValues).reduce((a, b) => a + b, 0)
      return [
        String(c.row),
        c.projectCode,
        `${c.taskCode} ${c.taskName}`,
        c.memberName,
        total.toFixed(2),
        // 配分の無い月は空欄（0埋めすると「入力した0」と紛らわしい）
        ...months.map((m) =>
          c.monthlyValues[m] === undefined
            ? ''
            : (c.monthlyValues[m] as number).toFixed(2),
        ),
      ]
    }),
  }
}

function formatPeriod(start: string | null, end: string | null): string {
  if (!start && !end) return EMPTY
  return `${start ?? ''} 〜 ${end ?? '（在籍中）'}`
}

function formatPrice(amount: number | null, effectiveFrom: string): string {
  if (amount === null) return EMPTY
  return `${amount}万円（${effectiveFrom}〜）`
}
