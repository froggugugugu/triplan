import { describe, expect, it } from 'vitest'
import {
  buildChangeRequestDecisionMessage,
  buildMonthlyCloseMessage,
} from '../events.js'

describe('buildMonthlyCloseMessage', () => {
  it('close: タイトル・実行者・理由がlinesに入る（severity info）', () => {
    const message = buildMonthlyCloseMessage({
      month: '2025-09',
      action: 'close',
      actorName: '田中',
      reason: '月次処理完了',
    })
    expect(message.title).toBe('2025-09を締めました')
    expect(message.severity).toBe('info')
    expect(message.lines).toEqual(['実行: 田中', '理由: 月次処理完了'])
  })

  it('reopen: 解除タイトル・severityはwarning（締めの巻き戻しは注意喚起）', () => {
    const message = buildMonthlyCloseMessage({
      month: '2025-09',
      action: 'reopen',
      actorName: null,
      reason: null,
    })
    expect(message.title).toBe('2025-09の締めを解除しました')
    expect(message.severity).toBe('warning')
    expect(message.lines).toEqual([])
  })
})

describe('buildChangeRequestDecisionMessage', () => {
  it('承認: プロジェクト名・新納期がlinesに入る', () => {
    const message = buildChangeRequestDecisionMessage(
      { title: '追加開発分', status: 'approved', newDueDate: '2025-12-26' },
      '基幹システム刷新',
    )
    expect(message.title).toBe('変更要求を承認: 追加開発分')
    expect(message.lines).toEqual([
      'プロジェクト: 基幹システム刷新',
      '新納期: 2025-12-26',
    ])
  })

  it('反証: 却下時は「却下」タイトルで、新納期は反映されないため文面に出さない', () => {
    const message = buildChangeRequestDecisionMessage(
      { title: '追加開発分', status: 'rejected', newDueDate: '2025-12-26' },
      '基幹システム刷新',
    )
    expect(message.title).toBe('変更要求を却下: 追加開発分')
    expect(message.lines).toEqual(['プロジェクト: 基幹システム刷新'])
  })

  it('反証: 金額フィールドがrowに存在しても文面に一切含めない（決定事項7）', () => {
    const message = buildChangeRequestDecisionMessage(
      {
        title: '増額CR',
        status: 'approved',
        newDueDate: null,
        // 実際のchangeRequests行が持つ金額フィールド（型上は無視される想定を実データで反証）
        contractAmountDelta: 300,
        contractAmountDeltaType: 'increase',
      } as Record<string, unknown>,
      null,
    )
    const flat = [message.title, ...message.lines].join('\n')
    expect(flat).not.toContain('300')
    expect(flat).not.toContain('万円')
    expect(message.lines).toEqual([])
  })
})
