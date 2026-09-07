import { Info } from 'lucide-react'
import { calcCompanyBreakdown } from '@/features/team/utils/company-breakdown-utils'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/shared/components/ui/hover-card'
import type { Company } from '@/shared/types/company'
import type { Member } from '@/shared/types/member'

export interface CompanyBreakdownHoverCardProps {
  members: Member[]
  companies: Company[]
  label?: string
  /** テスト用: Radix HoverCardの初期open状態を制御する（本番では未指定=通常のホバー挙動） */
  defaultOpen?: boolean
}

export function CompanyBreakdownHoverCard({
  members,
  companies,
  label = '所属会社別内訳',
  defaultOpen,
}: CompanyBreakdownHoverCardProps) {
  const breakdown = calcCompanyBreakdown(members, companies)

  return (
    <HoverCard defaultOpen={defaultOpen} openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="text-muted-foreground hover:text-foreground"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-56">
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          {label}
        </p>
        {breakdown.length === 0 ? (
          <p className="text-xs text-muted-foreground">メンバーがいません</p>
        ) : (
          <ul className="space-y-1">
            {breakdown.map((entry) => (
              <li
                key={entry.companyId ?? '__none__'}
                className="flex items-center justify-between text-xs"
              >
                <span>{entry.companyName}</span>
                <span className="font-medium">{entry.count}名</span>
              </li>
            ))}
          </ul>
        )}
      </HoverCardContent>
    </HoverCard>
  )
}
