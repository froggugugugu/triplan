import { describe, expect, it } from 'vitest'
import {
  buildProviderRequest,
  isSuccessStatus,
  type NotificationMessage,
} from '../message.js'

const MESSAGE: NotificationMessage = {
  title: '2025-09を締めました',
  severity: 'info',
  lines: ['実行: 田中', '対象: 全社'],
  link: 'https://triplan.example.com/monthly-actuals',
}

describe('buildProviderRequest', () => {
  it('slack: {text}のJSON・mrkdwn太字・成功は200のみ', () => {
    const req = buildProviderRequest(
      'slack',
      { webhookUrl: 'https://hooks.slack.com/services/T/B/x' },
      MESSAGE,
    )
    expect(req.url).toBe('https://hooks.slack.com/services/T/B/x')
    expect(req.headers['content-type']).toBe('application/json')
    const body = JSON.parse(req.body)
    expect(body.text).toContain('*2025-09を締めました*')
    expect(body.text).toContain('実行: 田中')
    expect(body.text).toContain('https://triplan.example.com/monthly-actuals')
    expect(req.okStatuses).toEqual([200])
  })

  it('google_chat: {text}のJSON', () => {
    const req = buildProviderRequest(
      'google_chat',
      { webhookUrl: 'https://chat.googleapis.com/v1/spaces/S/messages?key=k' },
      MESSAGE,
    )
    expect(JSON.parse(req.body).text).toContain('*2025-09を締めました*')
    expect(req.okStatuses).toEqual([200])
  })

  it('discord: {content}のJSON・成功は204も含む', () => {
    const req = buildProviderRequest(
      'discord',
      { webhookUrl: 'https://discord.com/api/webhooks/1/t' },
      MESSAGE,
    )
    const body = JSON.parse(req.body)
    expect(body.content).toContain('**2025-09を締めました**')
    expect(req.okStatuses).toEqual([200, 204])
  })

  it('反証: discordのcontentは2000文字上限で切り詰められる（超過400の予防）', () => {
    const longMessage: NotificationMessage = {
      title: 'ダイジェスト',
      severity: 'warning',
      lines: ['あ'.repeat(3000)],
    }
    const req = buildProviderRequest(
      'discord',
      { webhookUrl: 'https://discord.com/api/webhooks/1/t' },
      longMessage,
    )
    const content = JSON.parse(req.body).content as string
    expect(content.length).toBeLessThanOrEqual(2000)
    expect(content.endsWith('…')).toBe(true)
  })

  it('teams: Adaptive Card形式（type:message + attachments）・成功は202を含む', () => {
    const req = buildProviderRequest(
      'teams',
      { webhookUrl: 'https://prod-1.westus.logic.azure.com/workflows/x' },
      MESSAGE,
    )
    const body = JSON.parse(req.body)
    expect(body.type).toBe('message')
    expect(body.attachments[0].contentType).toBe(
      'application/vnd.microsoft.card.adaptive',
    )
    const card = body.attachments[0].content
    expect(card.type).toBe('AdaptiveCard')
    expect(card.version).toBe('1.4')
    expect(card.body[0].text).toContain('2025-09を締めました')
    expect(card.actions[0]).toMatchObject({
      type: 'Action.OpenUrl',
      url: 'https://triplan.example.com/monthly-actuals',
    })
    expect(req.okStatuses).toEqual([200, 202])
  })

  it('chatwork: form-encodedボディ・X-ChatWorkTokenヘッダ・[info][title]記法', () => {
    const req = buildProviderRequest(
      'chatwork',
      { apiToken: 'cw-token', roomId: '12345' },
      MESSAGE,
    )
    expect(req.url).toBe('https://api.chatwork.com/v2/rooms/12345/messages')
    expect(req.headers['x-chatworktoken']).toBe('cw-token')
    expect(req.headers['content-type']).toBe(
      'application/x-www-form-urlencoded',
    )
    // 2025-07仕様変更: bodyはform-encoded（クエリパラメータではない）
    expect(req.body.startsWith('body=')).toBe(true)
    const decoded = decodeURIComponent(req.body.slice('body='.length))
    expect(decoded).toContain('[info][title]')
    expect(decoded).toContain('2025-09を締めました')
    expect(decoded).toContain('[/info]')
  })

  it('generic: 共通モデルをそのままJSONで送り、成功は2xx全般', () => {
    const req = buildProviderRequest(
      'generic',
      { webhookUrl: 'https://example.com/hook' },
      MESSAGE,
    )
    expect(JSON.parse(req.body)).toEqual(MESSAGE)
    expect(req.okStatuses).toBeUndefined()
    expect(isSuccessStatus(req, 201)).toBe(true)
    expect(isSuccessStatus(req, 400)).toBe(false)
  })

  it('反証: 通知文面に金額の詳細を含めない設計の担保（linesの内容がそのまま出るだけ）', () => {
    // アダプタは受け取ったlines以外の情報を注入しない（金額はメッセージ組み立て側で
    // 除外するという契約。アダプタが勝手にデータを足さないことを確認）
    const minimal: NotificationMessage = {
      title: 'T',
      severity: 'critical',
      lines: [],
    }
    const req = buildProviderRequest(
      'slack',
      { webhookUrl: 'https://hooks.slack.com/x' },
      minimal,
    )
    expect(JSON.parse(req.body).text).toBe('🚨 *T*')
  })

  it('反証: 設定不足はErrorを投げる（URL無し・chatworkのトークン/ルーム欠落）', () => {
    expect(() =>
      buildProviderRequest('slack', { webhookUrl: null }, MESSAGE),
    ).toThrow('Webhook URL')
    expect(() =>
      buildProviderRequest(
        'chatwork',
        { apiToken: 'x', roomId: null },
        MESSAGE,
      ),
    ).toThrow('ルームID')
  })

  it('severityごとのアイコンが付く', () => {
    for (const [severity, icon] of [
      ['critical', '🚨'],
      ['warning', '⚠️'],
      ['info', 'ℹ️'],
    ] as const) {
      const req = buildProviderRequest(
        'slack',
        { webhookUrl: 'https://hooks.slack.com/x' },
        { title: 'T', severity, lines: [] },
      )
      expect(JSON.parse(req.body).text).toContain(icon)
    }
  })
})

describe('isSuccessStatus', () => {
  it('okStatuses指定時はその値のみ成功（反証: 2xxでも一覧外は失敗扱い）', () => {
    const req = { okStatuses: [200, 202] }
    expect(isSuccessStatus(req, 202)).toBe(true)
    expect(isSuccessStatus(req, 204)).toBe(false)
  })
})
