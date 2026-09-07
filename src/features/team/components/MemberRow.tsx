import { Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import type { Member } from '@/shared/types/member'
import type { TechTag } from '@/shared/types/tech-tag'
import { pickReadableTextColor } from '@/shared/utils/color-contrast'

export interface MemberRowProps {
  member: Member
  indent: 1 | 2
  onEdit: () => void
  onDelete: () => void
  currentPrice: string
  tags: TechTag[]
  companyName: string
}

export function MemberRow({
  member,
  indent,
  onEdit,
  onDelete,
  currentPrice,
  tags,
  companyName,
}: MemberRowProps) {
  const paddingClass = indent === 2 ? 'pl-14' : 'pl-8'

  return (
    <div
      className={`group flex flex-col gap-1 ${paddingClass} pr-4 py-2 hover:bg-muted/30`}
    >
      <div className="flex items-center gap-3">
        <span className="text-sm">{member.name}</span>
        {member.role && (
          <span className="text-xs text-muted-foreground">{member.role}</span>
        )}
        <span className="text-xs text-muted-foreground">{companyName}</span>
        {member.contractType && (
          <span className="text-xs text-muted-foreground">
            {member.contractType}
          </span>
        )}
        <div className="ml-auto flex items-center gap-4">
          <span className="text-xs text-muted-foreground">{currentPrice}</span>
          {member.startDate && (
            <span className="text-xs text-muted-foreground">
              {member.startDate}〜{member.endDate ?? ''}
            </span>
          )}
          <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onEdit}
              title="編集"
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive hover:text-destructive"
              onClick={onDelete}
              title="削除"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
      {tags.length > 0 && (
        <div data-testid="member-tag-badges" className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <Badge
              key={tag.id}
              style={{
                backgroundColor: tag.color,
                color: pickReadableTextColor(tag.color),
              }}
              className="border-transparent text-[10px]"
            >
              {tag.name}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
