import { AlertTriangle, BellRing, Info } from 'lucide-react'
import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import {
  type AlertSeverity,
  type AppAlert,
  sortAlerts,
} from '@/shared/utils/alert-utils'

interface AlertCenterProps {
  alerts: AppAlert[]
}

const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  critical: '重大',
  warning: '警告',
  info: '情報',
}

function SeverityChip({ severity }: { severity: AlertSeverity }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold',
        severity === 'critical' && 'bg-destructive/15 text-destructive',
        severity === 'warning' &&
          'bg-[#ffd43d]/25 text-amber-700 dark:text-amber-300',
        severity === 'info' && 'bg-muted text-muted-foreground',
      )}
    >
      {severity === 'critical' ? (
        <AlertTriangle className="h-3 w-3" />
      ) : severity === 'warning' ? (
        <BellRing className="h-3 w-3" />
      ) : (
        <Info className="h-3 w-3" />
      )}
      {SEVERITY_LABELS[severity]}
    </span>
  )
}

/**
 * アラートセンター（非公開の設計文書）。
 * 散在していた警告判定（SaaS更新・予算超過・ベースライン乖離）と新規判定
 * （納期超過・遅延予測・稼働超過）を1箇所へ集約し、重大度順に一覧表示する。
 * 「まず開く画面」としてダッシュボード最上部に置く。
 */
export function AlertCenter({ alerts }: AlertCenterProps) {
  const sorted = useMemo(() => sortAlerts(alerts), [alerts])

  return (
    <Card data-tour="dashboard-alert-center">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          アラートセンター
          {sorted.length > 0 && (
            <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-bold text-destructive tabular-nums">
              {sorted.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            対応が必要なアラートはありません
          </p>
        ) : (
          <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {sorted.map((alert) => (
              <li
                key={alert.key}
                className="flex items-start gap-2 rounded border border-border px-2 py-1.5 text-sm"
              >
                <SeverityChip severity={alert.severity} />
                <span className="shrink-0 text-xs text-muted-foreground leading-6">
                  [{alert.category}]
                </span>
                <span className="leading-6">{alert.message}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
