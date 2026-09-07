/**
 * 通知メッセージの共通モデルとプロバイダ別アダプタ（非公開の設計文書・§8、
 *）。すべて純関数で、HTTP送信・暗号化・DBアクセスはsender/dispatch側が担う。
 * 各プロバイダのペイロード仕様は公式ドキュメント調査（出典付き）に基づく。
 */

export type NotificationSeverity = 'critical' | 'warning' | 'info'

export type NotificationProvider =
  | 'slack'
  | 'teams'
  | 'google_chat'
  | 'discord'
  | 'chatwork'
  | 'generic'

/** 通知の共通モデル。金額の詳細は含めない（決定事項7: 件数・案件名・重大度まで） */
export interface NotificationMessage {
  title: string
  severity: NotificationSeverity
  lines: string[]
  /** 本ツールへのリンク（任意） */
  link?: string
}

/** プロバイダごとの送信設定（復号済みの平文。復号はdispatch側） */
export interface ProviderConfig {
  webhookUrl?: string | null
  apiToken?: string | null
  roomId?: string | null
}

/** アダプタが組み立てるHTTPリクエスト仕様 */
export interface ProviderRequest {
  url: string
  headers: Record<string, string>
  body: string
  /**
   * 成功とみなすHTTPステータス（プロバイダごとに200/202/204が混在するため明示する。
   * 省略時は2xx全般を成功とみなす=generic用）
   */
  okStatuses?: number[]
}

const SEVERITY_ICONS: Record<NotificationSeverity, string> = {
  critical: '🚨',
  warning: '⚠️',
  info: 'ℹ️',
}

/** Discordのcontent上限（超過は400になるためアダプタ側で切り詰める） */
const DISCORD_CONTENT_LIMIT = 2000

function plainText(message: NotificationMessage, bold: (s: string) => string) {
  const icon = SEVERITY_ICONS[message.severity]
  const parts = [`${icon} ${bold(message.title)}`, ...message.lines]
  if (message.link) parts.push(message.link)
  return parts.join('\n')
}

/**
 * プロバイダ別のHTTPリクエストを組み立てる。
 * 必要な設定（webhookUrl / apiToken+roomId）が欠けている場合はErrorを投げる
 * （sender側が捕捉してok:false・ログ記録にする）
 */
export function buildProviderRequest(
  provider: NotificationProvider,
  config: ProviderConfig,
  message: NotificationMessage,
): ProviderRequest {
  switch (provider) {
    case 'slack': {
      const url = requireUrl(config, 'slack')
      // mrkdwn記法（*bold*）。成功は200・本文"ok"
      return {
        url,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: plainText(message, (s) => `*${s}*`) }),
        okStatuses: [200],
      }
    }
    case 'google_chat': {
      const url = requireUrl(config, 'google_chat')
      return {
        url,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: plainText(message, (s) => `*${s}*`) }),
        okStatuses: [200],
      }
    }
    case 'discord': {
      const url = requireUrl(config, 'discord')
      let content = plainText(message, (s) => `**${s}**`)
      if (content.length > DISCORD_CONTENT_LIMIT) {
        content = `${content.slice(0, DISCORD_CONTENT_LIMIT - 1)}…`
      }
      // 既定は204 No Content（?wait=trueなら200）
      return {
        url,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content }),
        okStatuses: [200, 204],
      }
    }
    case 'teams': {
      const url = requireUrl(config, 'teams')
      // 旧O365コネクタは廃止済み。Workflows（Power Automate）はAdaptive Card形式が
      // 前提で、{"text"}単独は動作未保証（公式調査）。成功は202 Accepted
      const bodyBlocks: Array<Record<string, unknown>> = [
        {
          type: 'TextBlock',
          text: `${SEVERITY_ICONS[message.severity]} ${message.title}`,
          weight: 'Bolder',
          size: 'Medium',
          wrap: true,
        },
      ]
      if (message.lines.length > 0) {
        bodyBlocks.push({
          type: 'TextBlock',
          text: message.lines.join('\n\n'),
          wrap: true,
        })
      }
      const card: Record<string, unknown> = {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        body: bodyBlocks,
      }
      if (message.link) {
        card.actions = [
          { type: 'Action.OpenUrl', title: '開く', url: message.link },
        ]
      }
      return {
        url,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'message',
          attachments: [
            {
              contentType: 'application/vnd.microsoft.card.adaptive',
              contentUrl: null,
              content: card,
            },
          ],
        }),
        okStatuses: [200, 202],
      }
    }
    case 'chatwork': {
      // Webhook URL方式ではなくAPIトークン＋ルームID。2025-07の仕様変更により
      // form-encodedボディが必須（クエリパラメータ指定は廃止済み）
      if (!config.apiToken || !config.roomId) {
        throw new Error('chatworkにはAPIトークンとルームIDが必要です')
      }
      const icon = SEVERITY_ICONS[message.severity]
      const bodyText = `[info][title]${icon} ${message.title}[/title]${[
        ...message.lines,
        ...(message.link ? [message.link] : []),
      ].join('\n')}[/info]`
      return {
        url: `https://api.chatwork.com/v2/rooms/${encodeURIComponent(config.roomId)}/messages`,
        headers: {
          'x-chatworktoken': config.apiToken,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: `body=${encodeURIComponent(bodyText)}`,
        okStatuses: [200],
      }
    }
    case 'generic': {
      const url = requireUrl(config, 'generic')
      // 共通モデルをそのままJSONで送る（自作中継用）。成功は2xx全般
      return {
        url,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(message),
      }
    }
  }
}

function requireUrl(config: ProviderConfig, provider: string): string {
  if (!config.webhookUrl) {
    throw new Error(`${provider}にはWebhook URLが必要です`)
  }
  return config.webhookUrl
}

/** レスポンスステータスが成功か（okStatuses省略時は2xx全般） */
export function isSuccessStatus(
  request: Pick<ProviderRequest, 'okStatuses'>,
  status: number,
): boolean {
  if (request.okStatuses) return request.okStatuses.includes(status)
  return status >= 200 && status < 300
}
