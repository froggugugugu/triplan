import { describe, expect, it } from 'vitest'
import type { AppAlert } from '@/shared/utils/alert-utils'
import { buildDigestMessage } from '../digest.js'

function alert(
  severity: AppAlert['severity'],
  message: string,
  key = message,
): AppAlert {
  return { key, severity, category: 'テスト', message }
}

describe('buildDigestMessage', () => {
  it('minSeverity=warningではcritical/warningを含みinfoを除外する', () => {
    const message = buildDigestMessage(
      [
        alert('critical', '納期超過'),
        alert('warning', '稼働超過'),
        alert('info', 'スキルレビュー未実施'),
      ],
      'warning',
    )
    expect(message?.title).toBe('本日のアラート 2件')
    expect(message?.severity).toBe('critical')
    expect(message?.lines).toEqual([
      '[critical] テスト: 納期超過',
      '[warning] テスト: 稼働超過',
    ])
  })

  it('反証: 絞り込み後0件ならnull＝空のダイジェストを送らない（ノイズ回避）', () => {
    expect(buildDigestMessage([alert('info', '軽微')], 'critical')).toBeNull()
    expect(buildDigestMessage([], 'info')).toBeNull()
  })

  it('minSeverity=infoは全件を含む', () => {
    const message = buildDigestMessage(
      [alert('warning', 'A'), alert('info', 'B')],
      'info',
    )
    expect(message?.title).toBe('本日のアラート 2件')
  })

  it('反証: 21件以上は20行に丸めて「ほかN件」を付ける（タイトルの件数は総数のまま）', () => {
    const alerts = Array.from({ length: 25 }, (_, i) =>
      alert('warning', `アラート${i + 1}`, `k${i}`),
    )
    const message = buildDigestMessage(alerts, 'warning')
    expect(message?.title).toBe('本日のアラート 25件')
    expect(message?.lines).toHaveLength(21)
    expect(message?.lines[20]).toBe('…ほか5件')
  })
})
