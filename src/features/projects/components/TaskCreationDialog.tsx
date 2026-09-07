import { Rocket } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  EXTERNAL_TOOL_LABELS,
  type ExternalToolConnection,
  listExternalToolConnections,
} from '@/shared/api/external-tools-api'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Label } from '@/shared/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import type { Project } from '@/shared/types/project'
import type { ScheduleEntry } from '@/shared/types/schedule'
import {
  buildTaskCreationPlan,
  type TaskCreationResult,
} from '@/shared/utils/task-creation-core'

interface TaskCreationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 選択中のトップレベルプロジェクト */
  rootProject: Project | null
  projects: Project[]
  /**
   * 対象案件の工程スケジュール。
   * 起票時の期日（＝所属工程の終了日）の導出に使う
   */
  scheduleEntries: ScheduleEntry[]
  /** 起票実行（サーバーAPIの呼び出しは呼び出し元が担う） */
  onExecute: (
    connectionId: string,
    taskIds: string[],
  ) => Promise<TaskCreationResult>
}

/**
 * API起票ダイアログ（API起票基盤 Phase 3、非公開の設計文書・
 *）。postgresモード専用で、接続選択 → ドライラン → 実行の3ステップ。
 *
 * ドライランはサーバーの再検証と同一の純関数（`buildTaskCreationPlan`）で行うため、
 * 「画面に出た件数」と「実際に起票される件数」が食い違わない。
 */
export function TaskCreationDialog({
  open,
  onOpenChange,
  rootProject,
  projects,
  scheduleEntries,
  onExecute,
}: TaskCreationDialogProps) {
  const [connections, setConnections] = useState<ExternalToolConnection[]>([])
  const [connectionId, setConnectionId] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)
  const [result, setResult] = useState<TaskCreationResult | null>(null)

  const loadConnections = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const list = await listExternalToolConnections()
      const usable = list.filter((c) => c.enabled && c.apiTokenConfigured)
      setConnections(usable)
      // 案件に既定接続が設定されていればそれを選ぶ。
      // 案件ごとに使うツールが違う運用で、取り違えて別ツールへ起票する事故を防ぐ
      // （起票は外部IDを学習するため、間違えると取り消しが面倒）。
      // 既定が未設定・無効・削除済みのときだけ先頭にフォールバックする
      const preferred = usable.find(
        (c) => c.id === rootProject?.externalConnectionId,
      )
      setConnectionId((prev) => prev || preferred?.id || (usable[0]?.id ?? ''))
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : '接続の取得に失敗しました',
      )
    } finally {
      setIsLoading(false)
    }
  }, [rootProject?.externalConnectionId])

  useEffect(() => {
    if (!open) return
    setResult(null)
    void loadConnections()
  }, [open, loadConnections])

  // 対象は「選択中プロジェクト配下の全リーフ」。起票済みはプランがskipへ回す
  const plan = useMemo(() => {
    if (!open || !rootProject) return { targets: [], skips: [] }
    const inTree = new Set<string>()
    const collect = (id: string) => {
      inTree.add(id)
      for (const p of projects) {
        if (p.parentId === id) collect(p.id)
      }
    }
    collect(rootProject.id)
    const parentIds = new Set(
      projects.map((p) => p.parentId).filter((id): id is string => id !== null),
    )
    const leafIds = projects
      .filter((p) => inTree.has(p.id) && !parentIds.has(p.id))
      .map((p) => p.id)
    return buildTaskCreationPlan(
      projects,
      rootProject.id,
      leafIds,
      scheduleEntries,
    )
  }, [open, rootProject, projects, scheduleEntries])

  const handleExecute = async () => {
    if (!connectionId || plan.targets.length === 0) return
    setIsExecuting(true)
    try {
      setResult(
        await onExecute(
          connectionId,
          plan.targets.map((t) => t.id),
        ),
      )
    } finally {
      setIsExecuting(false)
    }
  }

  const selected = connections.find((c) => c.id === connectionId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>外部ツールへAPI起票</DialogTitle>
          <DialogDescription>
            {rootProject
              ? `「${rootProject.code} ${rootProject.name}」の未起票リーフタスクを外部ツールへ作成します`
              : 'プロジェクトを選択してください'}
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <p className="text-destructive text-sm">{loadError}</p>
        ) : isLoading ? (
          <p className="text-muted-foreground text-sm">読み込み中…</p>
        ) : connections.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            使用できる接続がありません。システム設定の「外部ツール接続」で接続と起票先を設定してください
          </p>
        ) : result ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>起票 {result.created.length}件</Badge>
              {result.skipped.length > 0 && (
                <Badge variant="secondary">
                  スキップ {result.skipped.length}件
                </Badge>
              )}
              {result.failed.length > 0 && (
                <Badge variant="destructive">
                  失敗 {result.failed.length}件
                </Badge>
              )}
            </div>
            {result.created.length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                {result.created.map((c) => (
                  <li key={c.id} className="text-muted-foreground">
                    {c.code} → {c.externalId}
                  </li>
                ))}
              </ul>
            )}
            {result.failed.length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-y-auto text-destructive text-xs">
                {result.failed.map((f) => (
                  <li key={f.id}>
                    {f.code}: {f.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="connection">起票先の接続</Label>
              <Select value={connectionId} onValueChange={setConnectionId}>
                <SelectTrigger id="connection" aria-label="起票先の接続">
                  <SelectValue placeholder="選択してください" />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}（{EXTERNAL_TOOL_LABELS[c.tool]}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border p-3 text-sm">
              <p>
                起票対象: <strong>{plan.targets.length}件</strong>
                {plan.skips.length > 0 && (
                  <span className="text-muted-foreground">
                    ／ 起票済みなどでスキップ: {plan.skips.length}件
                  </span>
                )}
              </p>
              {plan.targets.length > 0 && (
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-muted-foreground text-xs">
                  {plan.targets.slice(0, 20).map((t) => (
                    <li key={t.id}>
                      [{t.code}] {t.name}
                      {t.group ? `（${t.group}）` : ''}
                      {t.dueDate ? (
                        <span className="ml-1">期日 {t.dueDate}</span>
                      ) : (
                        <span className="ml-1 text-muted-foreground/70">
                          期日なし
                        </span>
                      )}
                    </li>
                  ))}
                  {plan.targets.length > 20 && (
                    <li>ほか{plan.targets.length - 20}件</li>
                  )}
                </ul>
              )}
            </div>

            <p className="text-muted-foreground text-xs">
              件名は「[コード]
              タスク名」で作成され、このコードが完了同期の突合キーになります。
              外部ツール側のレート制限に配慮して1件ずつ順に作成するため、
              {plan.targets.length}件で約{Math.max(plan.targets.length - 1, 0)}
              秒かかります
              {selected?.tool === 'backlog' || selected?.tool === 'asana'
                ? '。工程名のカテゴリー/セクションが外部ツール側に無い場合は作成されます'
                : ''}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {result ? '閉じる' : 'キャンセル'}
          </Button>
          {!result && (
            <Button
              onClick={handleExecute}
              disabled={
                isExecuting || !connectionId || plan.targets.length === 0
              }
            >
              <Rocket className="h-3.5 w-3.5" />
              {isExecuting ? '起票中…' : `${plan.targets.length}件を起票`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
