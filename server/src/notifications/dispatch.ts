import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { notificationChannels, notificationLogs } from '../db/schema.js'
import type { NotificationMessage } from './message.js'
import { type SendOptions, sendToChannel } from './sender.js'

/**
 * 複数チャンネルへの配信（非公開の設計文書・§5）。
 * - チャンネルごとに独立送信（1つの失敗が他を止めない）
 * - 結果は`notificationLogs`へ追記（追跡性＋ダイジェストの同日再送防止）
 * - **例外を外へ投げない**: 業務フック（締めのafterCreate等）から呼ばれるため、
 *   通知の失敗が業務処理のレスポンスを失敗させてはならない
 */

export type NotificationKind = 'event' | 'digest' | 'test'

export async function dispatchNotification(
  kind: Exclude<NotificationKind, 'test'>,
  message: NotificationMessage,
  options: SendOptions = {},
): Promise<void> {
  try {
    const channels = await db
      .select()
      .from(notificationChannels)
      .where(eq(notificationChannels.enabled, true))
    const targets = channels.filter((c) =>
      kind === 'event' ? c.notifyEvents : c.notifyDigest,
    )
    for (const channel of targets) {
      const result = await sendToChannel(channel, message, options)
      await db.insert(notificationLogs).values({
        sentAt: new Date().toISOString(),
        channelId: channel.id,
        kind,
        subject: message.title,
        ok: result.ok,
        detail: result.detail,
      })
    }
  } catch (error) {
    // DB障害等でもここで握りつぶす（呼び出し元の業務処理を守る）。
    // サーバーログにだけ痕跡を残す
    console.error('[notifications] dispatch failed:', error)
  }
}
