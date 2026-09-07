import { Pencil, Plus, Send, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  createNotificationChannel,
  deleteNotificationChannel,
  listNotificationChannels,
  listNotificationLogs,
  type NotificationChannel,
  type NotificationLogEntry,
  testNotificationChannel,
  updateNotificationChannel,
} from '@/features/admin/api/notifications-api'
import {
  NotificationChannelDialog,
  PROVIDER_LABELS,
} from '@/features/admin/components/NotificationChannelDialog'
import type { NotificationChannelFormValues } from '@/infrastructure/validation/schemas'
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

const KIND_LABELS: Record<NotificationLogEntry['kind'], string> = {
  event: 'イベント',
  digest: 'ダイジェスト',
  test: 'テスト',
}

/**
 * admin限定の通知設定画面（postgresモードのみ。Phase 3 Phase B）。
 * 通知チャンネルの一覧・追加・編集・削除・テスト送信と、送信ログの確認を行う。
 * シークレット（Webhook URL・APIトークン）は「設定済みか」しか表示しない（サーバーが返さない）。
 */
export function NotificationSettingsPage() {
  const { toast } = useToast()
  const [channels, setChannels] = useState<NotificationChannel[]>([])
  const [logs, setLogs] = useState<NotificationLogEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingChannel, setEditingChannel] =
    useState<NotificationChannel | null>(null)
  const [deletingChannel, setDeletingChannel] =
    useState<NotificationChannel | null>(null)
  const [pendingChannelId, setPendingChannelId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const [channelList, logList] = await Promise.all([
        listNotificationChannels(),
        listNotificationLogs(20),
      ])
      setChannels(channelList)
      setLogs(logList)
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : '通知設定の取得に失敗しました',
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const handleSubmit = useCallback(
    async (values: NotificationChannelFormValues) => {
      try {
        if (editingChannel) {
          // シークレットは空欄=変更なし（undefined）。入力があるときだけ送る
          await updateNotificationChannel(editingChannel.id, {
            name: values.name,
            provider: values.provider,
            webhookUrl: values.webhookUrl ? values.webhookUrl : undefined,
            apiToken: values.apiToken ? values.apiToken : undefined,
            roomId: values.roomId ? values.roomId : null,
            enabled: values.enabled,
            minSeverity: values.minSeverity,
            notifyEvents: values.notifyEvents,
            notifyDigest: values.notifyDigest,
          })
          toast({ title: '通知チャンネルを更新しました' })
        } else {
          await createNotificationChannel({
            name: values.name,
            provider: values.provider,
            webhookUrl: values.webhookUrl ? values.webhookUrl : null,
            apiToken: values.apiToken ? values.apiToken : null,
            roomId: values.roomId ? values.roomId : null,
            enabled: values.enabled,
            minSeverity: values.minSeverity,
            notifyEvents: values.notifyEvents,
            notifyDigest: values.notifyDigest,
          })
          toast({ title: '通知チャンネルを追加しました' })
        }
        await reload()
      } catch (error) {
        toast({
          title: editingChannel
            ? '通知チャンネルの更新に失敗しました'
            : '通知チャンネルの追加に失敗しました',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
        throw error
      }
    },
    [editingChannel, toast, reload],
  )

  const handleTest = useCallback(
    async (channel: NotificationChannel) => {
      setPendingChannelId(channel.id)
      try {
        const result = await testNotificationChannel(channel.id)
        if (result.ok) {
          toast({
            title: `「${channel.name}」へテスト送信しました`,
            description: '送信先のチャットで受信を確認してください',
          })
        } else {
          toast({
            title: `「${channel.name}」へのテスト送信に失敗しました`,
            description: result.detail ?? undefined,
            variant: 'destructive',
          })
        }
        setLogs(await listNotificationLogs(20))
      } catch (error) {
        toast({
          title: 'テスト送信に失敗しました',
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        })
      } finally {
        setPendingChannelId(null)
      }
    },
    [toast],
  )

  const handleDelete = useCallback(async () => {
    if (!deletingChannel) return
    setPendingChannelId(deletingChannel.id)
    try {
      await deleteNotificationChannel(deletingChannel.id)
      toast({ title: `「${deletingChannel.name}」を削除しました` })
      setDeletingChannel(null)
      await reload()
    } catch (error) {
      toast({
        title: '削除に失敗しました',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setPendingChannelId(null)
    }
  }, [deletingChannel, toast, reload])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">通知設定</h1>
          <p className="text-sm text-muted-foreground">
            チャットツールへの通知チャンネルを管理します（admin限定）
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingChannel(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="h-4 w-4" />
          チャンネルを追加
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card">
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">
            読み込み中...
          </div>
        ) : loadError ? (
          <div className="py-12 text-center text-destructive">{loadError}</div>
        ) : channels.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            通知チャンネルが登録されていません。「チャンネルを追加」から登録してください。
          </div>
        ) : (
          <div className="divide-y divide-border">
            {channels.map((channel) => {
              const isPending = pendingChannelId === channel.id
              const secretConfigured =
                channel.provider === 'chatwork'
                  ? channel.apiTokenConfigured
                  : channel.webhookUrlConfigured
              return (
                <div
                  key={channel.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{channel.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {PROVIDER_LABELS[channel.provider]}
                      </Badge>
                      {!channel.enabled && (
                        <Badge variant="destructive" className="text-xs">
                          無効
                        </Badge>
                      )}
                      {!secretConfigured && (
                        <Badge variant="destructive" className="text-xs">
                          接続先未設定
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {[
                        channel.notifyEvents ? '即時イベント' : null,
                        channel.notifyDigest
                          ? `ダイジェスト（${channel.minSeverity}以上）`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' ・ ') || '通知対象なし'}
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleTest(channel)}
                  >
                    <Send className="h-4 w-4" />
                    テスト送信
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    title="編集"
                    onClick={() => {
                      setEditingChannel(channel)
                      setDialogOpen(true)
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    title="削除"
                    onClick={() => setDeletingChannel(channel)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-base font-semibold">送信ログ（直近20件）</h2>
        <div className="rounded-lg border border-border bg-card">
          {logs.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              送信ログはまだありません
            </div>
          ) : (
            <div className="divide-y divide-border">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center gap-3 px-4 py-2 text-sm"
                >
                  <Badge
                    variant={log.ok ? 'outline' : 'destructive'}
                    className="text-xs"
                  >
                    {log.ok ? '成功' : '失敗'}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {KIND_LABELS[log.kind]}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate">
                    {log.subject}
                    {log.detail && (
                      <span className="text-muted-foreground">
                        {' '}
                        — {log.detail}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {log.channelName ?? '（削除済み）'} ・{' '}
                    {new Date(log.sentAt).toLocaleString('ja-JP')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <NotificationChannelDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        channel={editingChannel}
        onSubmit={handleSubmit}
      />

      <Dialog
        open={deletingChannel !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingChannel(null)
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>通知チャンネルを削除</DialogTitle>
            <DialogDescription>
              「{deletingChannel?.name}
              」を削除します。このチャンネルの送信ログも削除されます。よろしいですか？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingChannel(null)}>
              キャンセル
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
