import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PhaseDefinition, ScheduleEntry } from '@/shared/types/schedule'
import {
  calculateDateRange,
  formatDecade,
  formatMonth,
  isFiscalYearStart,
  toDependencyType,
  toGanttLink,
  toGanttTask,
  toGanttTasks,
} from '../svar-gantt-utils'

describe('svar-gantt-utils', () => {
  describe('toGanttTask', () => {
    it('ScheduleEntryとPhaseDefinitionをITask形式に変換する', () => {
      const entry: ScheduleEntry = {
        id: 'entry-1',
        projectId: 'proj-1',
        phaseKey: 'phase-1',
        startDate: '2026-04-01',
        endDate: '2026-05-31',
      }
      const phase: PhaseDefinition = {
        phaseKey: 'phase-1',
        name: '要件定義',
        color: '#4A90D9',
        enabled: true,
        sortOrder: 0,
      }

      const result = toGanttTask(entry, phase)

      expect(result.id).toBe('phase-1')
      expect(result.text).toBe('要件定義')
      expect(result.start).toEqual(new Date(2026, 3, 1))
      expect(result.end).toEqual(new Date(2026, 4, 31))
      expect(result.color).toBe('#4A90D9')
      expect(result.type).toBe('task')
    })

    describe('進捗の描画', () => {
      const entry: ScheduleEntry = {
        id: 'entry-1',
        projectId: 'proj-1',
        phaseKey: 'phase-1',
        startDate: '2026-04-01',
        endDate: '2026-05-31',
      }
      const phase: PhaseDefinition = {
        phaseKey: 'phase-1',
        name: '要件定義',
        color: '#4A90D9',
        enabled: true,
        sortOrder: 0,
      }

      it('進捗率（0.0〜1.0）をSVAR Ganttのパーセント（0〜100）へ変換する', () => {
        expect(toGanttTask(entry, phase, 0.75).progress).toBe(75)
        expect(toGanttTask(entry, phase, 1).progress).toBe(100)
      })

      it('反証: 紐づくタスクが無い工程（null）はprogressキー自体を持たない', () => {
        // 0%として描くと「着手していない」と誤読されるため、
        // 「紐づけていない」ことをキーの不在で表す
        expect(toGanttTask(entry, phase, null)).not.toHaveProperty('progress')
        expect(toGanttTask(entry, phase)).not.toHaveProperty('progress')
      })

      it('反証: 進捗0%はキーを持つ（未紐づけと区別される）', () => {
        const result = toGanttTask(entry, phase, 0)
        expect(result).toHaveProperty('progress')
        expect(result.progress).toBe(0)
      })

      it('端数は四捨五入する（決定論的な丸め）', () => {
        expect(toGanttTask(entry, phase, 0.756).progress).toBe(76)
        expect(toGanttTask(entry, phase, 0.754).progress).toBe(75)
        expect(toGanttTask(entry, phase, 1 / 3).progress).toBe(33)
      })
    })
  })

  describe('toGanttTasks', () => {
    it('複数のPhaseとEntryをITask配列に変換する', () => {
      const phases: PhaseDefinition[] = [
        {
          phaseKey: 'phase-1',
          name: '要件定義',
          color: '#4A90D9',
          enabled: true,
          sortOrder: 0,
        },
        {
          phaseKey: 'phase-2',
          name: '設計',
          color: '#E67E22',
          enabled: true,
          sortOrder: 1,
        },
      ]
      const entries: ScheduleEntry[] = [
        {
          id: 'entry-1',
          projectId: 'proj-1',
          phaseKey: 'phase-1',
          startDate: '2026-04-01',
          endDate: '2026-05-31',
        },
      ]

      const result = toGanttTasks(phases, entries)

      // phases 2件 + スペーサー行 1件
      expect(result).toHaveLength(3)
      expect(result[0]?.text).toBe('要件定義')
      expect(result[0]?.start).toEqual(new Date(2026, 3, 1))
      expect(result[1]?.text).toBe('設計')
      // phase-2にはentryがないので現在日時が設定される
      expect(result[2]?.id).toBe('__spacer__')
    })
  })

  describe('toGanttLink', () => {
    it('PhaseDependencyをILink形式に変換する（FS → e2s）', () => {
      const dependency = {
        id: 'dep-1',
        projectId: 'proj-1',
        fromPhaseKey: 'phase-1',
        toPhaseKey: 'phase-2',
        dependencyType: 'FS' as const,
      }

      const result = toGanttLink(dependency)

      expect(result.id).toBe('dep-1')
      expect(result.source).toBe('phase-1')
      expect(result.target).toBe('phase-2')
      expect(result.type).toBe('e2s')
    })

    it('SS → s2s', () => {
      const dependency = {
        id: 'dep-2',
        projectId: 'proj-1',
        fromPhaseKey: 'phase-1',
        toPhaseKey: 'phase-2',
        dependencyType: 'SS' as const,
      }

      const result = toGanttLink(dependency)
      expect(result.type).toBe('s2s')
    })

    it('FF → e2e', () => {
      const dependency = {
        id: 'dep-3',
        projectId: 'proj-1',
        fromPhaseKey: 'phase-1',
        toPhaseKey: 'phase-2',
        dependencyType: 'FF' as const,
      }

      const result = toGanttLink(dependency)
      expect(result.type).toBe('e2e')
    })

    it('SF → s2e', () => {
      const dependency = {
        id: 'dep-4',
        projectId: 'proj-1',
        fromPhaseKey: 'phase-1',
        toPhaseKey: 'phase-2',
        dependencyType: 'SF' as const,
      }

      const result = toGanttLink(dependency)
      expect(result.type).toBe('s2e')
    })
  })

  describe('toDependencyType', () => {
    it('e2s → FS', () => {
      expect(toDependencyType('e2s')).toBe('FS')
    })

    it('s2s → SS', () => {
      expect(toDependencyType('s2s')).toBe('SS')
    })

    it('e2e → FF', () => {
      expect(toDependencyType('e2e')).toBe('FF')
    })

    it('s2e → SF', () => {
      expect(toDependencyType('s2e')).toBe('SF')
    })
  })

  describe('calculateDateRange', () => {
    // 「現在日時」への暗黙依存を断つため、テスト実行日に関わらず結果が安定するよう
    // システム時刻を固定する（docs/development-patterns.md 過去の問題事例参照）。
    // 固定日=2025-04-01（fiscalYear=2025）は、下記テストが前提とする
    // デフォルト範囲（2025/10〜2027/03）と整合する
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2025, 3, 1))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('エントリがない場合は現在年度後半6ヶ月+翌年度12ヶ月を返す', () => {
      // テスト実行時の日付に依存するが、年度後半6ヶ月+翌年度12ヶ月の18ヶ月間であること
      const result = calculateDateRange([])
      const now = new Date()
      const currentMonth = now.getMonth() + 1
      const fiscalYear =
        currentMonth >= 4 ? now.getFullYear() : now.getFullYear() - 1

      // 表示開始 = 現在年度の後半開始（年度開始月+6 = 10月）
      expect(result.start.getFullYear()).toBe(fiscalYear)
      expect(result.start.getMonth()).toBe(9) // October (0-indexed)
      expect(result.start.getDate()).toBe(1)

      // 表示終了 = 翌年度末（翌々年3月31日）
      expect(result.end.getFullYear()).toBe(fiscalYear + 2)
      expect(result.end.getMonth()).toBe(2) // March
      expect(result.end.getDate()).toBe(31)
    })

    it('エントリがデフォルト範囲内の場合はデフォルト範囲を維持する', () => {
      // デフォルト範囲（2025/10〜2027/03）内に収まるエントリ
      const entries: ScheduleEntry[] = [
        {
          id: 'e1',
          projectId: 'p1',
          phaseKey: 'phase-1',
          startDate: '2026-04-15',
          endDate: '2026-06-30',
        },
        {
          id: 'e2',
          projectId: 'p1',
          phaseKey: 'phase-2',
          startDate: '2026-05-01',
          endDate: '2026-08-15',
        },
      ]

      const result = calculateDateRange(entries, 1)
      const now = new Date()
      const currentMonth = now.getMonth() + 1
      const fiscalYear =
        currentMonth >= 4 ? now.getFullYear() : now.getFullYear() - 1

      // エントリ範囲（2026/03〜2026/09）はデフォルト範囲内なのでデフォルトが返る
      expect(result.start.getFullYear()).toBe(fiscalYear)
      expect(result.start.getMonth()).toBe(9) // October
      expect(result.start.getDate()).toBe(1)
      expect(result.end.getFullYear()).toBe(fiscalYear + 2)
      expect(result.end.getMonth()).toBe(2) // March
      expect(result.end.getDate()).toBe(31)
    })

    it('エントリがデフォルト範囲を超える場合は拡張する', () => {
      // デフォルト範囲を超えるエントリ
      const entries: ScheduleEntry[] = [
        {
          id: 'e1',
          projectId: 'p1',
          phaseKey: 'phase-1',
          startDate: '2024-01-15',
          endDate: '2028-06-30',
        },
      ]

      const result = calculateDateRange(entries, 1)

      // エントリ開始: 2024-01-15 → マージン1ヶ月 → 2023-12-01（デフォルトより前）
      expect(result.start.getFullYear()).toBe(2023)
      expect(result.start.getMonth()).toBe(11) // December
      expect(result.start.getDate()).toBe(1)

      // エントリ終了: 2028-06-30 → マージン1ヶ月 → 2028-07-31（デフォルトより後）
      expect(result.end.getFullYear()).toBe(2028)
      expect(result.end.getMonth()).toBe(6) // July
      expect(result.end.getDate()).toBe(31)
    })

    it('無効な日付（開始 > 終了）のエントリは無視する', () => {
      const entries: ScheduleEntry[] = [
        {
          id: 'e1',
          projectId: 'p1',
          phaseKey: 'phase-1',
          startDate: '2026-06-01', // 開始が終了より後
          endDate: '2026-04-30',
        },
      ]

      const result = calculateDateRange(entries)

      // 無効なエントリのみの場合はデフォルト年度後半+翌年度
      const now = new Date()
      const currentMonth = now.getMonth() + 1
      const fiscalYear =
        currentMonth >= 4 ? now.getFullYear() : now.getFullYear() - 1
      expect(result.start.getFullYear()).toBe(fiscalYear)
      expect(result.start.getMonth()).toBe(9) // October
    })

    it('startMonth=1: エントリがない場合は年度後半6ヶ月+翌年度12ヶ月を返す', () => {
      const result = calculateDateRange([], 1, 1)

      // 年度後半開始 = startMonth+6 = 7月
      expect(result.start.getMonth()).toBe(6) // July
      expect(result.start.getDate()).toBe(1)
      // 翌年度末 = 翌々年12月31日
      expect(result.end.getMonth()).toBe(11) // December
      expect(result.end.getDate()).toBe(31)
    })

    it('startMonth=10: エントリがない場合は年度後半6ヶ月+翌年度12ヶ月を返す', () => {
      const result = calculateDateRange([], 1, 10)

      // 年度後半開始 = startMonth+6 = 翌年4月
      expect(result.start.getMonth()).toBe(3) // April
      expect(result.start.getDate()).toBe(1)
      // 翌年度末 = 翌々年9月30日
      expect(result.end.getMonth()).toBe(8) // September
      expect(result.end.getDate()).toBe(30)
    })
  })

  describe('formatDecade', () => {
    it('1日〜10日は「上」を返す', () => {
      expect(formatDecade(new Date(2026, 3, 1))).toBe('上')
      expect(formatDecade(new Date(2026, 3, 5))).toBe('上')
      expect(formatDecade(new Date(2026, 3, 10))).toBe('上')
    })

    it('11日〜20日は「中」を返す', () => {
      expect(formatDecade(new Date(2026, 3, 11))).toBe('中')
      expect(formatDecade(new Date(2026, 3, 15))).toBe('中')
      expect(formatDecade(new Date(2026, 3, 20))).toBe('中')
    })

    it('21日以降は「下」を返す', () => {
      expect(formatDecade(new Date(2026, 3, 21))).toBe('下')
      expect(formatDecade(new Date(2026, 3, 25))).toBe('下')
      expect(formatDecade(new Date(2026, 3, 30))).toBe('下')
    })
  })

  describe('formatMonth', () => {
    it('日付から月名を返す', () => {
      expect(formatMonth(new Date(2026, 0, 1))).toBe('1月')
      expect(formatMonth(new Date(2026, 3, 15))).toBe('4月')
      expect(formatMonth(new Date(2026, 11, 31))).toBe('12月')
    })
  })

  describe('isFiscalYearStart', () => {
    it('年度開始月（デフォルト=4月）に一致する場合trueを返す', () => {
      expect(isFiscalYearStart(4)).toBe(true)
      expect(isFiscalYearStart(3)).toBe(false)
      expect(isFiscalYearStart(5)).toBe(false)
    })

    it('年度開始月をカスタム指定できる', () => {
      expect(isFiscalYearStart(1, 1)).toBe(true)
      expect(isFiscalYearStart(10, 10)).toBe(true)
      expect(isFiscalYearStart(4, 10)).toBe(false)
    })
  })
})
