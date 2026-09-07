import { Pencil, Plus, Target, Trash2, Wifi } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  ExternalToolConnectionDialog,
  type ExternalToolConnectionFormValues,
} from '@/features/admin/components/ExternalToolConnectionDialog'
import { ExternalToolTargetDialog } from '@/features/admin/components/ExternalToolTargetDialog'
import {
  createExternalToolConnection,
  deleteExternalToolConnection,
  EXTERNAL_TOOL_LABELS,
  type ExternalToolConnection,
  type ExternalToolTargetConfig,
  listExternalToolConnections,
  testExternalToolConnection,
  updateExternalToolConnection,
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
import { useToast } from '@/shared/hooks/use-toast'

/** 起票先設定を人間可読な1行にする（一覧のサマリ表示用） */
function describeTarget(connection: ExternalToolConnection): string {
  const t = connection.targetConfig
  if (!t) return '未設定'
  if ('owner' in t) return `${t.owner}/${t.repo}`
  if ('projectKey' in t) return `${t.projectKey}（課題タイプ ${t.issueTypeId}）`
  if ('projectGid' in t) return `プロジェクト ${t.projectGid}`
  return `プロジェクト ${t.projectId}（種別 ${t.issueTypeId}／優先度 ${t.priorityId}）`
}

/**
 * admin限定の外部ツール接続設定画面（postgresモードのみ。API起票基盤 Phase 2）。
 * NotificationSettingsPageと同型の構成で、接続の一覧・追加・編集・削除・接続テストと
 * 起票先（プロジェクト・リポジトリ）の設定を行う。
 * APIトークンは「設定済みか」しか表示しない（サーバーが返さない）。
 */
export function ExternalToolsPage() {
  const { toast } = useToast()
  const [connections, setConnections] = useState<ExternalToolConnection[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ExternalToolConnection | null>(null)
  const [targetTarget, setTargetTarget] =
    useState<ExternalToolConnection | null>(null)
  const [deleting, setDeleting] = useState<ExternalToolConnection | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      setConnections(await listExternalToolConnections())
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : '接続の取得に失敗しました',
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const handleSubmit = async (values: ExternalToolConnectionFormValues) => {
    try {
      if (editing) {
        await updateExternalToolConnection(editing.id, {
          name: values.name,
          baseUrl: values.baseUrl || null,
          authEmail: values.authEmail || null,
          // 空欄=変更なし（undefinedを送らずキー自体を含めない）
          ...(values.apiToken ? { apiToken: values.apiToken } : {}),
        })
      } else {
        await createExternalToolConnection({
          tool: values.tool,
          name: values.name,
          baseUrl: values.baseUrl || null,
          authEmail: values.authEmail || null,
          apiToken: values.apiToken,
        })
      }
      setDialogOpen(false)
      setEditing(null)
      await reload()
      toast({ title: editing ? '接続を更新しました' : '接続を追加しました' })
    } catch (error) {
      toast({
        title: '保存に失敗しました',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    }
  }

  const handleSaveTarget = async (targetConfig: ExternalToolTargetConfig) => {
    if (!targetTarget) return
    try {
      // 起票先が決まって初めて起票に使える状態にする
      await updateExternalToolConnection(targetTarget.id, {
        targetConfig,
        enabled: true,
      })
      setTargetTarget(null)
      await reload()
      toast({ title: '起票先を設定しました' })
    } catch (error) {
      toast({
        title: '起票先の保存に失敗しました',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    }
  }

  const handleTest = async (connection: ExternalToolConnection) => {
    setPendingId(connection.id)
    try {
      const result = await testExternalToolConnection(connection.id)
      toast({
        title: result.ok ? '接続できました' : '接続できませんでした',
        description: result.detail ?? undefined,
        variant: result.ok ? undefined : 'destructive',
      })
    } catch (error) {
      toast({
        title: '接続テストに失敗しました',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setPendingId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await deleteExternalToolConnection(deleting.id)
      setDeleting(null)
      await reload()
      toast({ title: '接続を削除しました' })
    } catch (error) {
      toast({
        title: '削除に失敗しました',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-xl">外部ツール接続</h1>
          <p className="text-muted-foreground text-sm">
            WBSのタスクをBacklog・Asana・Jira・GitHubへAPIで起票するための接続を設定します
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          接続を追加
        </Button>
      </div>

      {loadError && (
        <div className="rounded-lg border border-destructive bg-destructive/5 p-4 text-destructive text-sm">
          {loadError}
        </div>
      )}

      {isLoading ? (
        <p className="text-muted-foreground text-sm">読み込み中…</p>
      ) : connections.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground text-sm">
            接続がまだありません。「接続を追加」から外部ツールのAPIトークンを登録してください
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {connections.map((connection) => (
            <div
              key={connection.id}
              className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{connection.name}</span>
                  <Badge variant="secondary">
                    {EXTERNAL_TOOL_LABELS[connection.tool]}
                  </Badge>
                  {connection.enabled ? (
                    <Badge>起票に使用可</Badge>
                  ) : (
                    <Badge variant="outline">設定未完了</Badge>
                  )}
                  {!connection.apiTokenConfigured && (
                    <Badge variant="destructive">トークン未設定</Badge>
                  )}
                </div>
                <p className="truncate text-muted-foreground text-xs">
                  起票先: {describeTarget(connection)}
                  {connection.baseUrl ? ` ／ ${connection.baseUrl}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTest(connection)}
                  disabled={pendingId === connection.id}
                >
                  <Wifi className="h-3.5 w-3.5" />
                  接続テスト
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTargetTarget(connection)}
                >
                  <Target className="h-3.5 w-3.5" />
                  起票先
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="編集"
                  onClick={() => {
                    setEditing(connection)
                    setDialogOpen(true)
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="削除"
                  onClick={() => setDeleting(connection)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ExternalToolConnectionDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        connection={editing}
        onSubmit={handleSubmit}
      />

      <ExternalToolTargetDialog
        open={targetTarget !== null}
        onOpenChange={(open) => {
          if (!open) setTargetTarget(null)
        }}
        connection={targetTarget}
        onSave={handleSaveTarget}
      />

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>接続を削除しますか？</DialogTitle>
            <DialogDescription>
              「{deleting?.name}
              」を削除します。既に起票済みのタスクとの紐づけ（外部ID）は残るため、完了同期は引き続き動作します
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              キャンセル
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              削除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
