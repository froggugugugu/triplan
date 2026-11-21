import { Pencil, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useDrop } from 'react-dnd'
import { cn } from '@/lib/utils'
import { Button } from '@/shared/components/ui/button'
import {
  MultiSelectCombobox,
  type MultiSelectComboboxOption,
} from '@/shared/components/ui/multi-select-combobox'
import type { OrgDesignTeam } from '@/shared/types/org-design'
import { manYenFormatter } from '@/shared/utils/budget-utils'
import type { TeamMetrics } from '@/shared/utils/org-design-utils'
import { formatUtilization } from '../utils/org-design-view'
import { MEMBER_CARD_TYPE, type MemberDragItem } from './MemberCard'

interface DropLaneProps {
  title: ReactNode
  testId: string
  canEdit: boolean
  onDropMember: (memberId: string) => void
  header?: ReactNode
  children: ReactNode
  isEmpty: boolean
}

/** 担当者カードを落とせる列（チーム・未配置で共通） */
export function DropLane({
  title,
  testId,
  canEdit,
  onDropMember,
  header,
  children,
  isEmpty,
}: DropLaneProps) {
  const [{ isOver }, drop] = useDrop({
    accept: MEMBER_CARD_TYPE,
    canDrop: () => canEdit,
    drop: (item: MemberDragItem) => onDropMember(item.memberId),
    collect: (monitor) => ({ isOver: monitor.isOver() && monitor.canDrop() }),
  })

  return (
    <section
      ref={(el) => {
        drop(el)
      }}
      data-testid={testId}
      className={cn(
        'flex w-64 shrink-0 flex-col rounded-lg border border-border bg-muted/40 transition-colors',
        isOver && 'border-primary bg-accent/40',
      )}
    >
      <div className="space-y-2 border-b border-border p-3">
        <div className="flex items-center justify-between gap-2">{title}</div>
        {header}
      </div>
      <ul className="flex min-h-24 flex-1 flex-col gap-2 p-2">
        {children}
        {isEmpty && (
          <li className="py-4 text-center text-xs text-muted-foreground">
            担当者がいません
          </li>
        )}
      </ul>
    </section>
  )
}

interface TeamColumnProps {
  team: OrgDesignTeam
  metrics: TeamMetrics | undefined
  canEdit: boolean
  canViewFinancials: boolean
  productOptions: MultiSelectComboboxOption[]
  techTagOptions: MultiSelectComboboxOption[]
  onDropMember: (memberId: string) => void
  onRename: () => void
  onRemove: () => void
  onScopeChange: (scope: {
    productIds?: string[]
    techTagIds?: string[]
  }) => void
  children: ReactNode
}

export function TeamColumn({
  team,
  metrics,
  canEdit,
  canViewFinancials,
  productOptions,
  techTagOptions,
  onDropMember,
  onRename,
  onRemove,
  onScopeChange,
  children,
}: TeamColumnProps) {
  const memberCount = metrics?.memberCount ?? 0
  return (
    <DropLane
      testId={`org-team-${team.id}`}
      canEdit={canEdit}
      onDropMember={onDropMember}
      isEmpty={memberCount === 0}
      title={
        <>
          <h3 className="min-w-0 truncate font-semibold">{team.name}</h3>
          {canEdit && (
            <div className="flex shrink-0 gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={`${team.name}の名前を変更`}
                onClick={onRename}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={`${team.name}を案から削除`}
                onClick={onRemove}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          )}
        </>
      }
      header={
        <>
          <dl
            className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs"
            data-testid={`org-team-metrics-${team.id}`}
          >
            <dt className="text-muted-foreground">人数</dt>
            <dd className="text-right tabular-nums">{memberCount}名</dd>
            <dt className="text-muted-foreground">稼働率</dt>
            <dd className="text-right tabular-nums">
              {formatUtilization(metrics?.utilization ?? null)}
            </dd>
            <dt className="text-muted-foreground">兼務者</dt>
            <dd className="text-right tabular-nums">
              {metrics?.productsUnset
                ? '—'
                : `${metrics?.crossProductMemberCount ?? 0}名`}
            </dd>
            <dt className="text-muted-foreground">過負荷</dt>
            <dd className="text-right tabular-nums">
              {metrics?.overloadedMemberCount ?? 0}名
            </dd>
            {canViewFinancials && (
              <>
                <dt className="text-muted-foreground">コスト</dt>
                <dd className="text-right tabular-nums">
                  {manYenFormatter.format(metrics?.annualCost ?? 0)}万円
                </dd>
              </>
            )}
          </dl>
          <MultiSelectCombobox
            values={team.productIds}
            onValuesChange={(productIds) => onScopeChange({ productIds })}
            options={productOptions}
            placeholder="受け持ちプロダクト"
            disabled={!canEdit}
            ariaLabel={`${team.name}の受け持ちプロダクト`}
            className="text-xs"
          />
          <MultiSelectCombobox
            values={team.techTagIds}
            onValuesChange={(techTagIds) => onScopeChange({ techTagIds })}
            options={techTagOptions}
            placeholder="扱う技術"
            disabled={!canEdit}
            ariaLabel={`${team.name}の扱う技術`}
            className="text-xs"
          />
          {metrics?.productsUnset && (
            <p className="text-xs text-muted-foreground">
              受け持ちが未設定のため兼務を判定できません
            </p>
          )}
        </>
      }
    >
      {children}
    </DropLane>
  )
}
