import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as notificationsApi from '../../api/notifications-api'
import { NotificationSettingsPage } from '../NotificationSettingsPage'

vi.mock('../../api/notifications-api')

const toastMock = vi.fn()
vi.mock('@/shared/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}))

const SLACK_CHANNEL: notificationsApi.NotificationChannel = {
  id: '44444444-4444-4444-8444-444444444444',
  name: '開発部Slack',
  provider: 'slack',
  roomId: null,
  enabled: true,
  minSeverity: 'warning',
  notifyEvents: true,
  notifyDigest: true,
  webhookUrlConfigured: true,
  apiTokenConfigured: false,
  createdAt: '2026-08-17T00:00:00.000Z',
  updatedAt: '2026-08-17T00:00:00.000Z',
}

const UNCONFIGURED_CHANNEL: notificationsApi.NotificationChannel = {
  ...SLACK_CHANNEL,
  id: '55555555-5555-4555-8555-555555555555',
  name: '未設定Teams',
  provider: 'teams',
  enabled: false,
  webhookUrlConfigured: false,
}

const LOG: notificationsApi.NotificationLogEntry = {
  id: '66666666-6666-4666-8666-666666666666',
  sentAt: '2026-08-17T01:00:00.000Z',
  channelId: SLACK_CHANNEL.id,
  channelName: '開発部Slack',
  kind: 'event',
  subject: '2026-01を締めました',
  ok: true,
  detail: null,
}

describe('NotificationSettingsPage', () => {
  beforeEach(() => {
    toastMock.mockClear()
    vi.mocked(notificationsApi.listNotificationChannels).mockResolvedValue([
      SLACK_CHANNEL,
      UNCONFIGURED_CHANNEL,
    ])
    vi.mocked(notificationsApi.listNotificationLogs).mockResolvedValue([LOG])
  })

  it('チャンネル一覧と送信ログを表示する', async () => {
    render(<NotificationSettingsPage />)

    expect(await screen.findByText('開発部Slack')).toBeInTheDocument()
    expect(screen.getByText('Slack')).toBeInTheDocument()
    // 送信ログセクションに件名・分類ラベルが表示される
    expect(screen.getByText('2026-01を締めました')).toBeInTheDocument()
    expect(screen.getByText('イベント')).toBeInTheDocument()
  })

  it('反証: 接続先未設定・無効のチャンネルには警告バッジが出る（設定済みには出ない）', async () => {
    render(<NotificationSettingsPage />)

    await screen.findByText('未設定Teams')
    expect(screen.getByText('接続先未設定')).toBeInTheDocument()
    expect(screen.getByText('無効')).toBeInTheDocument()
    // 設定済みSlack行にはどちらのバッジも無い（1件ずつしか存在しない）
    expect(screen.getAllByText('接続先未設定')).toHaveLength(1)
    expect(screen.getAllByText('無効')).toHaveLength(1)
  })

  it('「チャンネルを追加」でダイアログが開き、フォーム送信でcreateが呼ばれる', async () => {
    vi.mocked(notificationsApi.createNotificationChannel).mockResolvedValue(
      SLACK_CHANNEL,
    )
    const user = userEvent.setup()
    render(<NotificationSettingsPage />)
    await screen.findByText('開発部Slack')

    await user.click(screen.getByRole('button', { name: /チャンネルを追加/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('通知チャンネルを追加')).toBeInTheDocument()

    await user.type(
      within(dialog).getByLabelText('チャンネル名'),
      '新しいSlack',
    )
    await user.type(
      within(dialog).getByLabelText('Webhook URL'),
      'https://hooks.slack.com/services/A/B/C',
    )
    await user.click(within(dialog).getByRole('button', { name: '追加' }))

    await waitFor(() => {
      expect(notificationsApi.createNotificationChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '新しいSlack',
          provider: 'slack',
          webhookUrl: 'https://hooks.slack.com/services/A/B/C',
        }),
      )
    })
  })

  it('反証: 編集でWebhook URLを空のまま保存するとwebhookUrl: undefined（変更なし）で送られる', async () => {
    vi.mocked(notificationsApi.updateNotificationChannel).mockResolvedValue(
      SLACK_CHANNEL,
    )
    const user = userEvent.setup()
    render(<NotificationSettingsPage />)
    await screen.findByText('開発部Slack')

    await user.click(
      screen.getAllByRole('button', { name: '編集' })[0] as HTMLElement,
    )
    const dialog = screen.getByRole('dialog')
    // 設定済みの場合はプレースホルダーで「変更する場合のみ入力」と案内される
    expect(
      within(dialog).getByPlaceholderText('設定済み（変更する場合のみ入力）'),
    ).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(notificationsApi.updateNotificationChannel).toHaveBeenCalledWith(
        SLACK_CHANNEL.id,
        expect.objectContaining({ webhookUrl: undefined }),
      )
    })
  })

  it('テスト送信ボタンでtestNotificationChannelが呼ばれ、失敗時はdestructiveトースト', async () => {
    vi.mocked(notificationsApi.testNotificationChannel).mockResolvedValue({
      ok: false,
      detail: 'HTTP 404',
    })
    const user = userEvent.setup()
    render(<NotificationSettingsPage />)
    await screen.findByText('開発部Slack')

    await user.click(
      screen.getAllByRole('button', { name: /テスト送信/ })[0] as HTMLElement,
    )

    await waitFor(() => {
      expect(notificationsApi.testNotificationChannel).toHaveBeenCalledWith(
        SLACK_CHANNEL.id,
      )
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
          description: 'HTTP 404',
        }),
      )
    })
  })

  it('削除は確認ダイアログを経由してdeleteNotificationChannelが呼ばれる', async () => {
    vi.mocked(notificationsApi.deleteNotificationChannel).mockResolvedValue()
    const user = userEvent.setup()
    render(<NotificationSettingsPage />)
    await screen.findByText('開発部Slack')

    await user.click(
      screen.getAllByRole('button', { name: '削除' })[0] as HTMLElement,
    )
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('通知チャンネルを削除')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: '削除する' }))

    await waitFor(() => {
      expect(notificationsApi.deleteNotificationChannel).toHaveBeenCalledWith(
        SLACK_CHANNEL.id,
      )
    })
  })

  it('一覧取得に失敗した場合はエラーメッセージを表示する', async () => {
    vi.mocked(notificationsApi.listNotificationChannels).mockRejectedValue(
      new Error('通知設定の取得に失敗しました'),
    )

    render(<NotificationSettingsPage />)

    expect(
      await screen.findByText('通知設定の取得に失敗しました'),
    ).toBeInTheDocument()
  })
})
