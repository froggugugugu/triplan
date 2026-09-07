import { describe, expect, it } from 'vitest'
import { getAvailableTours } from '../tour-route-map'

describe('getAvailableTours', () => {
  it('常に全体概要ツアーを返す', () => {
    const tours = getAvailableTours('/unknown')
    expect(tours).toHaveLength(1)
    expect(tours[0]).toEqual({ id: 'global', label: '全体概要' })
  })

  it.each([
    ['/dashboard', 'dashboard', 'ダッシュボードガイド'],
    ['/team', 'team', 'チームガイド'],
    ['/projects', 'projects', 'プロジェクトガイド'],
    ['/wbs', 'wbs', 'WBSガイド'],
    ['/schedule', 'schedule', 'スケジュールガイド'],
    ['/assignment', 'assignment', 'アサインガイド'],
  ])(
    '%s では全体概要とページ固有ツアーの2件を返す',
    (path, expectedId, expectedLabel) => {
      const tours = getAvailableTours(path)
      expect(tours).toHaveLength(2)
      expect(tours[0]).toEqual({ id: 'global', label: '全体概要' })
      expect(tours[1]).toEqual({ id: expectedId, label: expectedLabel })
    },
  )

  it('マッピング外のパスでは全体概要のみ', () => {
    const tours = getAvailableTours('/reports')
    expect(tours).toHaveLength(1)
  })
})
