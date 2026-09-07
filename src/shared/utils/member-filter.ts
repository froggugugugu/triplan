import type { Company } from '@/shared/types/company'
import type { Member } from '@/shared/types/member'
import type { Section } from '@/shared/types/section'
import { isProperMember } from '@/shared/utils/budget-utils'

/**
 * メンバーを部門・課でフィルタリング
 * selectedDivisionId: '' = フィルタなし, '__unaffiliated__' = 未所属, UUID = 部門ID
 * selectedSectionId: '' = 部門内全課, UUID = 特定の課
 */
export function filterMembersByOrganization(
  members: Member[],
  sections: Section[],
  selectedDivisionId: string,
  selectedSectionId: string,
): Member[] {
  if (!selectedDivisionId) return members

  if (selectedDivisionId === '__unaffiliated__') {
    return members.filter((m) => !m.sectionId)
  }

  if (selectedSectionId) {
    return members.filter((m) => m.sectionId === selectedSectionId)
  }

  const sectionIds = new Set(
    sections
      .filter((s) => s.divisionId === selectedDivisionId)
      .map((s) => s.id),
  )
  return members.filter(
    (m) => m.sectionId !== null && sectionIds.has(m.sectionId),
  )
}

/**
 * メンバーを所属会社（複数選択）でフィルタリング
 * companyIds が空配列の場合はフィルタなし（全件返す）
 */
export function filterMembersByCompanyIds(
  members: Member[],
  companyIds: string[],
): Member[] {
  if (companyIds.length === 0) return members
  const idSet = new Set(companyIds)
  return members.filter((m) => m.companyId && idSet.has(m.companyId))
}

export type InternalFilterMode = 'all' | 'internal' | 'external'

/**
 * メンバーを内部/外部リソースでフィルタリング
 * isProperMember（companyId=null、またはisInternal=trueの会社所属を内部リソース扱い）と同一セマンティクス
 */
export function filterMembersByInternal(
  members: Member[],
  companies: Company[],
  mode: InternalFilterMode,
): Member[] {
  if (mode === 'all') return members
  return members.filter(
    (m) => isProperMember(m, companies) === (mode === 'internal'),
  )
}
