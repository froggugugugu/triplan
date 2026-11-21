import { AlertTriangle, GripVertical, Shuffle } from 'lucide-react'
import { useDrag } from 'react-dnd'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import type { MemberDesignInfo } from '@/shared/utils/org-design-utils'

export const MEMBER_CARD_TYPE = 'ORG_DESIGN_MEMBER'

export interface MemberDragItem {
  memberId: string
}

/** 「移動先」選択肢。value は teamId、未配置は UNPLACED_VALUE */
export interface MoveTarget {
  value: string
  label: string
}

export const UNPLACED_VALUE = '__unplaced__'

interface MemberCardProps {
  memberId: string
  name: string
  role: string
  info: MemberDesignInfo | undefined
  /** 兼務先（受け持ち外のプロダクト）の名前 */
  crossProductNames: string[]
  currentValue: string
  moveTargets: MoveTarget[]
  canEdit: boolean
  onMove: (memberId: string, targetValue: string) => void
}

/**
 * 担当者カード。表示は名前・役割・兼務・過負荷のみ（スキル評価や単価は出さない。設計 §3）。
 * D&D に加え、キーボードでも動かせるよう「移動先」セレクトを置く（D&D のみにしない）。
 */
export function MemberCard({
  memberId,
  name,
  role,
  info,
  crossProductNames,
  currentValue,
  moveTargets,
  canEdit,
  onMove,
}: MemberCardProps) {
  const [{ isDragging }, drag] = useDrag({
    type: MEMBER_CARD_TYPE,
    item: { memberId } satisfies MemberDragItem,
    canDrag: canEdit,
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  })

  const crossCount = info?.crossProductIds.length ?? 0

  return (
    <li
      ref={(el) => {
        drag(el)
      }}
      data-testid={`org-member-${memberId}`}
      className={cn(
        'rounded-md border border-border bg-card p-2 text-sm shadow-sm',
        canEdit && 'cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-40',
      )}
    >
      <div className="flex items-start gap-1">
        {canEdit && (
          <GripVertical
            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{name}</div>
          {role && (
            <div className="truncate text-xs text-muted-foreground">{role}</div>
          )}
          {(crossCount > 0 || info?.overloaded) && (
            <div className="mt-1 flex flex-wrap gap-1">
              {crossCount > 0 && (
                <span
                  className="inline-flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 text-xs text-foreground"
                  title={`受け持ち外: ${crossProductNames.join('、')}`}
                >
                  <Shuffle className="h-3 w-3" aria-hidden="true" />
                  兼務 {crossCount}
                </span>
              )}
              {info?.overloaded && (
                <span className="inline-flex items-center gap-0.5 rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  過負荷
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      {canEdit && (
        <Select
          value={currentValue}
          onValueChange={(v) => {
            if (v !== currentValue) onMove(memberId, v)
          }}
        >
          <SelectTrigger
            className="mt-2 h-7 text-xs"
            aria-label={`${name}の移動先`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {moveTargets.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </li>
  )
}
