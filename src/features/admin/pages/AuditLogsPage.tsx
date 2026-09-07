import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AuditAction,
  AuditLogEntry,
  AuditLogStats,
} from '@/features/admin/api/audit-logs-api'
import {
  getAuditLogStats,
  listAuditLogEntities,
  listAuditLogs,
  purgeAuditLogs,
} from '@/features/admin/api/audit-logs-api'
import { Button } from '@/shared/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import { Combobox } from '@/shared/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { useToast } from '@/shared/hooks/use-toast'

/**
 * 監査証跡の閲覧（admin限定）。
 *
 * 「誰がいつ何を変えたか」を追う画面。差分に金額が入りうるためサーバー側も
 * `users:manage`で保護している。記録の書き換え経路は持たず、削除は保持期間を
 * 過ぎたログの一括パージだけに限る（個別削除＝恣意的な抹消の経路を作らない）。
 */

const ACTION_LABELS: Record<AuditAction, string> = {
  create: '作成',
  update: '更新',
  delete: '削除',
}

const ACTION_STYLES: Record<AuditAction, string> = {
  create: 'bg-budget-planned/15 text-foreground',
  update: 'bg-accent text-accent-foreground',
  delete: 'bg-destructive/15 text-destructive',
}

/** 内部センチネル（Comboboxは空文字を選択なしとして扱えないため） */
const ALL = '__all__'

/** パージの保持期間。恣意的な日付指定を避け、運用しやすい選択肢に限定する */
const RETENTION_OPTIONS = [
  { value: '365', label: '1年より古いログ' },
  { value: '180', label: '180日より古いログ' },
  { value: '90', label: '90日より古いログ' },
]

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '（未設定）'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function formatOccurredAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  // 監査は「いつ」が本体なので秒まで出す
  return date.toLocaleString('ja-JP', { hour12: false })
}

function ChangesCell({ log }: { log: AuditLogEntry }) {
  if (log.action === 'create' || !log.changes) {
    return <span className="text-muted-foreground text-xs">—</span>
  }
  if (log.action === 'delete') {
    // 削除は行全体のスナップショット。主要フィールドだけ拾って要約する
    const snapshot = log.changes as Record<string, unknown>
    const summary = ['code', 'name', 'label', 'month']
      .filter((key) => snapshot[key] !== undefined && snapshot[key] !== null)
      .map((key) => `${key}: ${formatValue(snapshot[key])}`)
      .join(' / ')
    return (
      <span className="text-xs">{summary || '（削除時の値を記録済み）'}</span>
    )
  }
  const changes = log.changes as Record<
    string,
    { before: unknown; after: unknown }
  >
  return (
    <ul className="space-y-0.5 text-xs">
      {Object.entries(changes).map(([field, change]) => (
        <li key={field}>
          <span className="font-medium">{field}</span>:{' '}
          <span className="text-muted-foreground">
            {formatValue(change.before)}
          </span>
          {' → '}
          <span>{formatValue(change.after)}</span>
        </li>
      ))}
    </ul>
  )
}

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [entities, setEntities] = useState<string[]>([])
  const [entity, setEntity] = useState(ALL)
  const [action, setAction] = useState(ALL)
  const [entityId, setEntityId] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<AuditLogStats | null>(null)
  const [retentionDays, setRetentionDays] = useState('365')
  const [purgeConfirmOpen, setPurgeConfirmOpen] = useState(false)
  const [isPurging, setIsPurging] = useState(false)
  const { toast } = useToast()

  const loadStats = useCallback(async () => {
    try {
      setStats(await getAuditLogStats())
    } catch {
      /* 保持状況が出ないだけで一覧・絞り込みは成立する */
    }
  }, [])

  // レコードIDは自由入力のため、依存に含めると1打鍵ごとにGETが飛ぶ
  // （UUIDなら36回）。値はrefで読み、発火は明示操作（Enter・再読み込み）に限る
  const entityIdRef = useRef(entityId)
  entityIdRef.current = entityId

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setLogs(
        await listAuditLogs({
          entity: entity === ALL ? undefined : entity,
          action: action === ALL ? undefined : (action as AuditAction),
          entityId: entityIdRef.current.trim() || undefined,
        }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : '監査ログの取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [entity, action])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    listAuditLogEntities()
      .then(setEntities)
      .catch(() => {
        /* 絞り込みの選択肢が出ないだけで一覧は成立する */
      })
    void loadStats()
  }, [loadStats])

  const handlePurge = useCallback(async () => {
    setIsPurging(true)
    setPurgeConfirmOpen(false)
    try {
      // 基準日時はサーバー時計で算出させる（端末の時計ずれで消しすぎない）
      const { deletedCount } = await purgeAuditLogs(retentionDays)
      toast({
        title: `監査ログを${deletedCount.toLocaleString()}件削除しました`,
      })
      await Promise.all([load(), loadStats()])
    } catch (e) {
      toast({
        title: '監査ログの削除に失敗しました',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setIsPurging(false)
    }
  }, [retentionDays, toast, load, loadStats])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-bold text-2xl">監査証跡</h1>
        <p className="text-muted-foreground text-sm">
          業務データの変更履歴（誰がいつ何を変えたか）。記録の書き換えはできません。
          削除は保持期間を過ぎたログの一括パージのみ可能です
        </p>
      </div>

      {/* 保持管理。監査ログは単調増加するため、
          保持期間を過ぎたものを古い側から切り落とす運用を用意する */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">保持管理</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm">
            {stats
              ? `現在 ${stats.total.toLocaleString()}件${
                  stats.oldestAt
                    ? `（最古: ${formatOccurredAt(stats.oldestAt)}）`
                    : ''
                }`
              : '保持状況を取得中…'}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>削除の対象</Label>
              <Combobox
                value={retentionDays}
                onValueChange={setRetentionDays}
                options={RETENTION_OPTIONS}
                searchPlaceholder="期間を検索..."
                className="w-64"
              />
            </div>
            <Button
              variant="outline"
              disabled={isPurging}
              onClick={() => setPurgeConfirmOpen(true)}
            >
              {isPurging ? '削除中…' : '古いログを削除'}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            指定した期間より古いログをまとめて削除します。個別のログだけを消すことは
            できません（記録の恣意的な抹消を防ぐため）。削除の実行自体も証跡に残ります
          </p>
        </CardContent>
      </Card>

      <Dialog open={purgeConfirmOpen} onOpenChange={setPurgeConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>古い監査ログを削除しますか？</DialogTitle>
            <DialogDescription>
              {RETENTION_OPTIONS.find((o) => o.value === retentionDays)?.label}
              を削除します。この操作は取り消せません
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPurgeConfirmOpen(false)}
            >
              キャンセル
            </Button>
            <Button variant="destructive" onClick={() => void handlePurge()}>
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">絞り込み</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>対象データ</Label>
            <Combobox
              value={entity}
              onValueChange={setEntity}
              options={[
                { value: ALL, label: 'すべて' },
                ...entities.map((e) => ({ value: e, label: e })),
              ]}
              searchPlaceholder="対象を検索..."
              className="w-56"
            />
          </div>
          <div className="space-y-1">
            <Label>操作</Label>
            <Combobox
              value={action}
              onValueChange={setAction}
              options={[
                { value: ALL, label: 'すべて' },
                { value: 'create', label: '作成' },
                { value: 'update', label: '更新' },
                { value: 'delete', label: '削除' },
              ]}
              searchPlaceholder="操作を検索..."
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="entityId">レコードID</Label>
            <Input
              id="entityId"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void load()
              }}
              placeholder="特定のレコードに絞る（Enterで検索）"
              className="w-72"
            />
          </div>
          <Button variant="outline" onClick={() => void load()}>
            再読み込み
          </Button>
        </CardContent>
      </Card>

      {error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              履歴（新しい順・最大100件）
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground text-sm">読み込み中…</p>
            ) : logs.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                該当する履歴がありません
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground text-xs">
                      <th className="py-2 pr-3 font-medium">日時</th>
                      <th className="py-2 pr-3 font-medium">操作者</th>
                      <th className="py-2 pr-3 font-medium">対象</th>
                      <th className="py-2 pr-3 font-medium">操作</th>
                      <th className="py-2 font-medium">変更内容</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="border-b align-top">
                        <td className="whitespace-nowrap py-2 pr-3 text-xs tabular-nums">
                          {formatOccurredAt(log.occurredAt)}
                        </td>
                        <td className="py-2 pr-3 text-xs">
                          {/* 退職・削除済みユーザーは表示名を引けないためメールで示す */}
                          {log.actorName ?? log.actorEmail ?? '（不明）'}
                        </td>
                        <td className="py-2 pr-3 text-xs">
                          <div>{log.entity}</div>
                          <div className="text-muted-foreground">
                            {log.entityId}
                          </div>
                        </td>
                        <td className="py-2 pr-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs ${ACTION_STYLES[log.action]}`}
                          >
                            {ACTION_LABELS[log.action]}
                          </span>
                        </td>
                        <td className="py-2">
                          <ChangesCell log={log} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
