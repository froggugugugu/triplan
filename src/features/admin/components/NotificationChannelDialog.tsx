import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import type { NotificationChannel } from '@/features/admin/api/notifications-api'
import {
  type NotificationChannelFormValues,
  notificationChannelFormSchema,
} from '@/infrastructure/validation/schemas'
import { Button } from '@/shared/components/ui/button'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'

export const PROVIDER_LABELS: Record<
  NotificationChannelFormValues['provider'],
  string
> = {
  slack: 'Slack',
  teams: 'Microsoft Teams',
  google_chat: 'Google Chat',
  discord: 'Discord',
  chatwork: 'Chatwork',
  generic: '汎用Webhook',
}

const SEVERITY_LABELS: Record<
  NotificationChannelFormValues['minSeverity'],
  string
> = {
  critical: 'criticalのみ',
  warning: 'warning以上',
  info: 'すべて（info以上）',
}

const DEFAULT_VALUES: NotificationChannelFormValues = {
  name: '',
  provider: 'slack',
  webhookUrl: '',
  apiToken: '',
  roomId: '',
  enabled: true,
  minSeverity: 'warning',
  notifyEvents: true,
  notifyDigest: true,
}

interface NotificationChannelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 編集対象。nullなら新規追加 */
  channel: NotificationChannel | null
  onSubmit: (values: NotificationChannelFormValues) => Promise<void>
}

/**
 * 通知チャンネルの追加・編集ダイアログ（Phase 3 Phase B）。
 * Webhook URL・APIトークンは書き込み専用のため、編集時は空欄のまま保存すると
 * 「変更なし」になる（サーバー側の3値PATCHセマンティクスに対応）。
 */
export function NotificationChannelDialog({
  open,
  onOpenChange,
  channel,
  onSubmit,
}: NotificationChannelDialogProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NotificationChannelFormValues>({
    resolver: zodResolver(notificationChannelFormSchema),
    defaultValues: DEFAULT_VALUES,
  })
  const provider = watch('provider')
  const isEdit = channel !== null

  useEffect(() => {
    if (!open) return
    reset(
      channel
        ? {
            name: channel.name,
            provider: channel.provider,
            webhookUrl: '',
            apiToken: '',
            roomId: channel.roomId ?? '',
            enabled: channel.enabled,
            minSeverity: channel.minSeverity,
            notifyEvents: channel.notifyEvents,
            notifyDigest: channel.notifyDigest,
          }
        : DEFAULT_VALUES,
    )
  }, [open, channel, reset])

  const submit = useCallback(
    async (values: NotificationChannelFormValues) => {
      await onSubmit(values)
      onOpenChange(false)
    },
    [onSubmit, onOpenChange],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? '通知チャンネルを編集' : '通知チャンネルを追加'}
          </DialogTitle>
          <DialogDescription>
            チャットツールへの通知先を設定します。接続確認は保存後の「テスト送信」で行えます
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="channel-name">チャンネル名</Label>
            <Input
              id="channel-name"
              placeholder="例: 開発部通知（#dev-alerts）"
              {...register('name')}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>送信先の種類</Label>
            <Select
              value={provider}
              onValueChange={(v) =>
                setValue(
                  'provider',
                  v as NotificationChannelFormValues['provider'],
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.keys(
                    PROVIDER_LABELS,
                  ) as NotificationChannelFormValues['provider'][]
                ).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PROVIDER_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {provider === 'chatwork' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="channel-api-token">APIトークン</Label>
                <Input
                  id="channel-api-token"
                  type="password"
                  placeholder={
                    isEdit && channel?.apiTokenConfigured
                      ? '設定済み（変更する場合のみ入力）'
                      : 'ChatworkのAPIトークン'
                  }
                  {...register('apiToken')}
                />
                {errors.apiToken && (
                  <p className="text-sm text-destructive">
                    {errors.apiToken.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="channel-room-id">ルームID</Label>
                <Input
                  id="channel-room-id"
                  placeholder="例: 12345678"
                  {...register('roomId')}
                />
                {errors.roomId && (
                  <p className="text-sm text-destructive">
                    {errors.roomId.message}
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="channel-webhook-url">Webhook URL</Label>
              <Input
                id="channel-webhook-url"
                placeholder={
                  isEdit && channel?.webhookUrlConfigured
                    ? '設定済み（変更する場合のみ入力）'
                    : 'https://...'
                }
                {...register('webhookUrl')}
              />
              {errors.webhookUrl && (
                <p className="text-sm text-destructive">
                  {errors.webhookUrl.message}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>ダイジェストに含める最小重大度</Label>
            <Select
              value={watch('minSeverity')}
              onValueChange={(v) =>
                setValue(
                  'minSeverity',
                  v as NotificationChannelFormValues['minSeverity'],
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.keys(
                    SEVERITY_LABELS,
                  ) as NotificationChannelFormValues['minSeverity'][]
                ).map((s) => (
                  <SelectItem key={s} value={s}>
                    {SEVERITY_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register('notifyEvents')} />
              即時イベント（月次締め・変更要求の承認/却下）を通知する
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register('notifyDigest')} />
              日次ダイジェスト（アラートまとめ）を通知する
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register('enabled')} />
              このチャンネルを有効にする
            </label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isEdit ? '保存' : '追加'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
