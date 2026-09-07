import type { Company } from '@/shared/types/company'
import type { Member } from '@/shared/types/member'

export interface CompanyBreakdownEntry {
  companyId: string | null
  companyName: string
  count: number
}

/**
 * メンバー群を所属会社別に集計する（部門・課の人数内訳ポップアップ用）
 * companyId=null は「未設定」として独立集計する
 */
export function calcCompanyBreakdown(
  members: Member[],
  companies: Company[],
): CompanyBreakdownEntry[] {
  const countByCompanyId = new Map<string | null, number>()
  for (const member of members) {
    const key = member.companyId ?? null
    countByCompanyId.set(key, (countByCompanyId.get(key) ?? 0) + 1)
  }

  const result: CompanyBreakdownEntry[] = []
  for (const [companyId, count] of countByCompanyId) {
    if (companyId === null) {
      result.push({ companyId: null, companyName: '未設定', count })
      continue
    }
    const company = companies.find((c) => c.id === companyId)
    result.push({
      companyId,
      companyName: company?.name ?? '不明な会社',
      count,
    })
  }

  return result.sort((a, b) => {
    if (a.companyId === null) return 1
    if (b.companyId === null) return -1
    return b.count - a.count
  })
}
