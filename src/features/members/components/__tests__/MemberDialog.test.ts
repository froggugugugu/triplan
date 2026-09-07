import { describe, expect, it, vi } from 'vitest'
import { getTodayDate } from '../MemberDialog'

describe('MemberDialog', () => {
  describe('getTodayDate', () => {
    it('今日の日付をYYYY-MM-DD形式で返す', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2025-04-15T12:34:56.789Z'))

      const result = getTodayDate()
      expect(result).toBe('2025-04-15')

      vi.useRealTimers()
    })

    it('1桁の月と日をゼロパディングする', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2025-01-05T00:00:00.000Z'))

      const result = getTodayDate()
      expect(result).toBe('2025-01-05')

      vi.useRealTimers()
    })

    it('年末の日付を正しく処理する', () => {
      vi.useFakeTimers()
      // タイムゾーンに依存しない形式で指定
      vi.setSystemTime(new Date(2025, 11, 31, 23, 59, 59, 999))

      const result = getTodayDate()
      expect(result).toBe('2025-12-31')

      vi.useRealTimers()
    })
  })
})
