import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table'
import { manYenFormatter } from '@/shared/utils/budget-utils'
import type {
  ComparedValue,
  ComparisonRow,
} from '@/shared/utils/org-design-utils'
import {
  type DeltaKind,
  formatDelta,
  formatUtilization,
} from '../utils/org-design-view'

const KIND_LABEL: Record<ComparisonRow['kind'], string | null> = {
  kept: null,
  added: '新設',
  removed: '廃止',
}

function formatValue(value: number | null, kind: DeltaKind): string {
  if (value === null) return '—'
  if (kind === 'percent') return formatUtilization(value)
  if (kind === 'cost') return `${manYenFormatter.format(value)}万円`
  return `${value}名`
}

function ComparedCell({
  value,
  kind,
}: {
  value: ComparedValue<number>
  kind: DeltaKind
}) {
  const delta = formatDelta(value.delta, kind)
  return (
    <TableCell className="text-right tabular-nums">
      <div className="whitespace-nowrap">
        {formatValue(value.current, kind)} → {formatValue(value.draft, kind)}
      </div>
      <div
        className={cn(
          'text-xs',
          delta.direction === 'flat' || delta.direction === null
            ? 'text-muted-foreground'
            : 'font-medium text-foreground',
        )}
      >
        {delta.text}
      </div>
    </TableCell>
  )
}

interface ComparisonTableProps {
  rows: ComparisonRow[]
  canViewFinancials: boolean
  teamLabel: string
}

/** 現組織と案をチーム単位で比較する。差分は記号（▲▼±）で示し、色だけに頼らない */
export function ComparisonTable({
  rows,
  canViewFinancials,
  teamLabel,
}: ComparisonTableProps) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        比較できる{teamLabel}がありません
      </p>
    )
  }
  return (
    <Table aria-label="現組織と案の比較">
      <TableHeader>
        <TableRow>
          <TableHead>{teamLabel}</TableHead>
          <TableHead className="text-right">人数</TableHead>
          <TableHead className="text-right">稼働率</TableHead>
          <TableHead className="text-right">兼務者</TableHead>
          <TableHead className="text-right">過負荷</TableHead>
          {canViewFinancials && (
            <TableHead className="text-right">コスト（年度）</TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const badge = KIND_LABEL[row.kind]
          return (
            <TableRow key={row.key} data-testid={`org-compare-${row.key}`}>
              <TableCell className="font-medium">
                {row.name}
                {badge && (
                  <span className="ml-2 rounded border border-border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {badge}
                  </span>
                )}
              </TableCell>
              <ComparedCell value={row.memberCount} kind="count" />
              <ComparedCell value={row.utilization} kind="percent" />
              <ComparedCell value={row.crossProductMemberCount} kind="count" />
              <ComparedCell value={row.overloadedMemberCount} kind="count" />
              {canViewFinancials && (
                <ComparedCell value={row.annualCost} kind="cost" />
              )}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
