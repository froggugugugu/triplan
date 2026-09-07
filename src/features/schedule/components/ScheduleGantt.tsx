import '@svar-ui/react-gantt/all.css'
import type { IApi, ILink, ITask } from '@svar-ui/react-gantt'
import { Gantt, Willow, WillowDark } from '@svar-ui/react-gantt'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import type {
  DependencyType,
  PhaseDefinition,
  PhaseDependency,
  ScheduleEntry,
} from '@/shared/types/schedule'
import { getThemeColor } from '@/shared/types/theme-color'
import { useAppStore } from '@/stores/app-store'
import {
  calculateDateRange,
  toDependencyType,
  toGanttLinks,
  toGanttTasks,
} from '../utils/svar-gantt-utils'

/**
 * SVAR Ganttのスケール設定（ライブラリからexportされていないため再定義）
 */
interface IScaleConfig {
  unit: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year'
  step: number
  format?: string | ((date: Date, next?: Date) => string)
}

/**
 * SVAR Ganttが要素へ付けるid属性（data-id / data-col-id / data-row-id）から工程キーを取り出す。
 * 2.7以降は値の先頭に「:」が付く（例: ":phase-1"）ため剥がす。2.5以前の値（"phase-1"）もそのまま通る
 */
function normalizeGanttId(value: string | null): string | null {
  if (value === null) return null
  return value.startsWith(':') ? value.slice(1) : value
}

interface ScheduleGanttProps {
  phases: PhaseDefinition[]
  entries: ScheduleEntry[]
  dependencies: PhaseDependency[]
  /**
   * 工程キー→進捗率（0.0〜1.0）の解決関数。
   * nullを返した工程はバーに進捗を描かない（タスク未紐づけと0%の区別）
   */
  progressOf?: (phaseKey: string) => number | null
  onDateChange: (phaseKey: string, startDate: string, endDate: string) => void
  onReorder: (fromKey: string, toKey: string) => void
  onAddDependency: (
    fromPhaseKey: string,
    toPhaseKey: string,
    type: DependencyType,
  ) => void
  onDeleteDependency: (id: string) => void
  onCreateEntry: (phaseKey: string, startDate: string, endDate: string) => void
}

/**
 * アプリのテーマ設定に基づいてダークモード判定するカスタムフック
 */
function useIsDarkMode(): boolean {
  const theme = useAppStore((s) => s.theme)

  const [systemIsDark, setSystemIsDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e: MediaQueryListEvent) => setSystemIsDark(e.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  if (theme === 'dark') return true
  if (theme === 'light') return false
  return systemIsDark
}

/** バー編集ダイアログの状態 */
interface BarEditState {
  phaseKey: string
  phaseName: string
  startDate: string
  endDate: string
  isNew: boolean
}

/** ホバーツールチップの状態 */
interface BarTooltipState {
  phaseKey: string
  phaseName: string
  startDate: string
  endDate: string
  x: number
  y: number
}

/**
 * SVAR Ganttを使用したスケジュールガントチャートコンポーネント
 */
/** @svar-ui/react-ganttのリンクイベントで実際に参照するフィールドだけを宣言する */
interface GanttLinkPayload {
  source?: string | number
  target?: string | number
  type?: ILink['type']
}

export function ScheduleGantt({
  phases,
  entries,
  dependencies,
  progressOf,
  onDateChange,
  onReorder,
  onAddDependency,
  onDeleteDependency,
  onCreateEntry,
}: ScheduleGanttProps) {
  // 年度開始月
  const fiscalYearStartMonth = useAppStore((s) => s.fiscalYearStartMonth)

  // アプリテーマの監視
  const isDarkMode = useIsDarkMode()
  const ThemeWrapper = isDarkMode ? WillowDark : Willow

  // コールバックをrefで保持（stale closure防止）
  const onDateChangeRef = useRef(onDateChange)
  const onReorderRef = useRef(onReorder)
  const onAddDependencyRef = useRef(onAddDependency)
  const onDeleteDependencyRef = useRef(onDeleteDependency)
  const onCreateEntryRef = useRef(onCreateEntry)
  useEffect(() => {
    onDateChangeRef.current = onDateChange
  }, [onDateChange])
  useEffect(() => {
    onReorderRef.current = onReorder
  }, [onReorder])
  useEffect(() => {
    onAddDependencyRef.current = onAddDependency
  }, [onAddDependency])
  useEffect(() => {
    onDeleteDependencyRef.current = onDeleteDependency
  }, [onDeleteDependency])
  useEffect(() => {
    onCreateEntryRef.current = onCreateEntry
  }, [onCreateEntry])

  // バー編集ダイアログの状態
  const [barEdit, setBarEdit] = useState<BarEditState | null>(null)

  // ホバーツールチップの状態
  const [tooltip, setTooltip] = useState<BarTooltipState | null>(null)

  // 既存データをSVAR Gantt形式に変換
  const tasks: ITask[] = useMemo(
    () => toGanttTasks(phases, entries, progressOf),
    [phases, entries, progressOf],
  )

  const links: ILink[] = useMemo(
    () => toGanttLinks(dependencies),
    [dependencies],
  )

  // 表示期間を自動計算
  const { start, end } = useMemo(
    () => calculateDateRange(entries, 1, fiscalYearStartMonth),
    [entries, fiscalYearStartMonth],
  )

  // スケール設定（月単位）
  const scales: IScaleConfig[] = useMemo(
    () => [
      {
        unit: 'month',
        step: 1,
        format: (date: Date) => {
          const yy = String(date.getFullYear()).slice(-2)
          const mm = String(date.getMonth() + 1).padStart(2, '0')
          return `${yy}/${mm}`
        },
      },
    ],
    [],
  )

  // カラム定義
  const columns = useMemo(
    () => [
      { id: 'text', header: '工程名', width: 200 },
      { id: 'startText', header: '開始日', width: 95 },
      { id: 'endText', header: '終了日', width: 95 },
    ],
    [],
  )

  // APIの状態管理
  const [api, setApi] = useState<IApi | null>(null)

  // API初期化ハンドラー
  const handleInit = useCallback((ganttApi: IApi) => {
    setApi(ganttApi)

    // update-task: タスク日付更新（ref経由で常に最新のコールバックを使用）
    ganttApi.on(
      'update-task',
      (ev: { id: string | number; task: Partial<ITask> }) => {
        if (ev.task.start && ev.task.end) {
          const startDate =
            ev.task.start instanceof Date
              ? formatDateString(ev.task.start)
              : String(ev.task.start)
          const endDate =
            ev.task.end instanceof Date
              ? formatDateString(ev.task.end)
              : String(ev.task.end)
          onDateChangeRef.current(String(ev.id), startDate, endDate)
        }
      },
    )

    // move-task: タスク並び替え（interceptで事前チェック）
    // biome-ignore lint/suspicious/noExplicitAny: SVAR Gantt internal event config types
    ganttApi.intercept('move-task', (ev: any) => {
      if (ev.id === '__spacer__' || ev.target === '__spacer__') {
        return false
      }
      return true
    })

    // biome-ignore lint/suspicious/noExplicitAny: SVAR Gantt internal event config types
    ganttApi.on('move-task', (ev: any) => {
      if (ev.target !== undefined) {
        onReorderRef.current(String(ev.id), String(ev.target))
      }
    })

    // add-link: 依存関係追加。@svar-ui/react-ganttはイベントペイロードの型を
    // 公開していないため、実際に参照するフィールドだけを最小の形で宣言する
    ganttApi.on('add-link', (ev: { link?: GanttLinkPayload }) => {
      const link = ev.link
      if (link?.source !== undefined && link?.target !== undefined) {
        onAddDependencyRef.current(
          String(link.source),
          String(link.target),
          toDependencyType(link.type),
        )
      }
    })

    // delete-link: 依存関係削除
    ganttApi.on('delete-link', (ev: { id: string | number }) => {
      onDeleteDependencyRef.current(String(ev.id))
    })

    // 月列幅の自動拡張を無効化（cellWidth=70pxを維持）
    ganttApi.intercept('expand-scale', () => false)

    // 週の始まりを日曜日に設定
    // set-configはライブラリの公開型に含まれないアクション名のため、
    // exec のキー型だけを緩める（値は型どおり）
    ganttApi.exec('set-config' as Parameters<typeof ganttApi.exec>[0], {
      _weekStart: 0,
    })
  }, [])

  // entriesとphasesをrefで保持（DOMイベントハンドラーから参照）
  const entriesRef = useRef(entries)
  const phasesRef = useRef(phases)
  useEffect(() => {
    entriesRef.current = entries
  }, [entries])
  useEffect(() => {
    phasesRef.current = phases
  }, [phases])

  // ダブルクリック: 空き領域→バー作成 / バー上→日付編集ダイアログ
  useEffect(() => {
    if (!api) return

    const ganttElement = document.querySelector('.schedule-gantt-container')
    if (!ganttElement) return

    /** phaseKeyからエントリを探して編集ダイアログを開くヘルパー */
    const openEditDialog = (phaseKey: string) => {
      const entry = entriesRef.current.find((en) => en.phaseKey === phaseKey)
      const phase = phasesRef.current.find((p) => p.phaseKey === phaseKey)

      if (entry) {
        // 既存エントリの編集
        setBarEdit({
          phaseKey,
          phaseName: phase?.name ?? phaseKey,
          startDate: entry.startDate,
          endDate: entry.endDate,
          isNew: false,
        })
      } else {
        // 新規作成（日付は空で開く）
        setBarEdit({
          phaseKey,
          phaseName: phase?.name ?? phaseKey,
          startDate: '',
          endDate: '',
          isNew: true,
        })
      }
      return true
    }

    const handleDomDoubleClick = (e: Event) => {
      const mouseEvent = e as MouseEvent
      const target = mouseEvent.target as HTMLElement

      // バー上のダブルクリック → 日付編集ダイアログを開く
      // SVAR Gantt 2.7以降は data-id / data-col-id / data-row-id の値に「:」を前置する
      // （例: ":phase-1"）ため、そのまま工程キーとして使わず normalizeGanttId で剥がす
      const barElement =
        target.closest('.wx-bar') ||
        (target.closest('[data-id]')?.getAttribute('data-type') === 'bar'
          ? target.closest('[data-id]')
          : null)

      if (barElement) {
        const phaseKey = normalizeGanttId(barElement.getAttribute('data-id'))
        if (phaseKey) openEditDialog(phaseKey)
        return
      }

      // グリッド左パネルの開始日・終了日セルのダブルクリック → 日付編集ダイアログ
      // SVAR Ganttのセルは data-col-id / data-row-id 属性を使用
      const gridCell = target.closest('[data-col-id]') as HTMLElement | null
      if (gridCell) {
        const colId = normalizeGanttId(gridCell.getAttribute('data-col-id'))
        if (colId === 'startText' || colId === 'endText') {
          const phaseKey = normalizeGanttId(
            gridCell.getAttribute('data-row-id'),
          )
          if (phaseKey && phaseKey !== '__spacer__') {
            openEditDialog(phaseKey)
          }
          return
        }
      }

      // 空き領域のダブルクリック → バー作成
      const barsContainer =
        target.closest('.wx-bars') ||
        (target.classList.contains('wx-bars') ? target : null)
      if (!barsContainer) return

      const timelineContainer = barsContainer as HTMLElement
      const rect = timelineContainer.getBoundingClientRect()
      const clickX = mouseEvent.clientX - rect.left

      const scrollLeft =
        timelineContainer.scrollLeft ||
        timelineContainer.parentElement?.scrollLeft ||
        0

      const pixelsFromStart = clickX + scrollLeft
      // cellWidth=70px per month ≈ 70/30 px/day
      const daysFromStart = Math.floor(pixelsFromStart / (70 / 30))

      const ganttStart =
        start instanceof Date ? start : parseLocalDate(String(start))
      const clickedDate = new Date(ganttStart)
      clickedDate.setDate(clickedDate.getDate() + daysFromStart)

      const clickY = mouseEvent.clientY - rect.top
      const scrollTop =
        (ganttElement.querySelector('[class*="scroll"]') as HTMLElement)
          ?.scrollTop || 0
      const rowIndex = Math.floor((clickY + scrollTop) / 36)

      const enabledPhases = phasesRef.current.filter((p) => p.enabled)
      const targetPhase = enabledPhases[rowIndex]
      if (!targetPhase) return

      const existingEntry = entriesRef.current.find(
        (entry) => entry.phaseKey === targetPhase.phaseKey,
      )
      if (existingEntry) return

      const startDate = new Date(clickedDate)
      startDate.setDate(startDate.getDate() - 3)

      const endDate = new Date(clickedDate)
      endDate.setDate(endDate.getDate() + 4)

      onCreateEntryRef.current(
        targetPhase.phaseKey,
        formatDateString(startDate),
        formatDateString(endDate),
      )
    }

    ganttElement.addEventListener('dblclick', handleDomDoubleClick)

    return () => {
      ganttElement.removeEventListener('dblclick', handleDomDoubleClick)
    }
  }, [api, start])

  // ホバーツールチップ: バー上にマウスを乗せたとき表示
  useEffect(() => {
    if (!api) return

    const ganttElement = document.querySelector('.schedule-gantt-container')
    if (!ganttElement) return

    const handleMouseOver = (e: Event) => {
      const target = (e as MouseEvent).target as HTMLElement
      const barElement = target.closest('.wx-bar') as HTMLElement | null
      if (!barElement) return

      const phaseKey = normalizeGanttId(barElement.getAttribute('data-id'))
      if (!phaseKey || phaseKey === '__spacer__') return

      const entry = entriesRef.current.find((en) => en.phaseKey === phaseKey)
      if (!entry) return

      const phase = phasesRef.current.find((p) => p.phaseKey === phaseKey)

      const barRect = barElement.getBoundingClientRect()
      const containerRect = ganttElement.getBoundingClientRect()

      setTooltip({
        phaseKey,
        phaseName: phase?.name ?? phaseKey,
        startDate: entry.startDate,
        endDate: entry.endDate,
        x: barRect.left - containerRect.left + barRect.width / 2,
        y: barRect.top - containerRect.top - 4,
      })
    }

    const handleMouseOut = (e: Event) => {
      const target = (e as MouseEvent).relatedTarget as HTMLElement | null
      if (target?.closest('.wx-bar')) return
      setTooltip(null)
    }

    ganttElement.addEventListener('mouseover', handleMouseOver)
    ganttElement.addEventListener('mouseout', handleMouseOut)

    return () => {
      ganttElement.removeEventListener('mouseover', handleMouseOver)
      ganttElement.removeEventListener('mouseout', handleMouseOut)
    }
  }, [api])

  // バーの色を工程設定に基づいて適用
  useEffect(() => {
    if (!api) return

    const timer = setTimeout(() => {
      const ganttElement = document.querySelector('.schedule-gantt-container')
      if (!ganttElement) return

      phases.forEach((phase) => {
        const barElements = ganttElement.querySelectorAll(
          `[data-id="${phase.phaseKey}"].wx-bar`,
        )

        barElements.forEach((element) => {
          const barElement = element as HTMLElement
          if (phase.color) {
            const theme = useAppStore.getState().theme
            barElement.style.backgroundColor = getThemeColor(phase.color, theme)
          }
        })
      })
    }, 500)

    return () => clearTimeout(timer)
  }, [api, phases])

  // 年度区切り線を太線で表示
  // 年度最終月（デフォルト: 3月）のセルのborder-rightを太線にする
  useEffect(() => {
    if (!api) return

    const FISCAL_BORDER = '2px solid var(--color-foreground)'
    const FISCAL_ATTR = 'data-fiscal-year-border'
    // 年度最終月 = 年度開始月の前月（4月始まり → 3月）
    const fiscalYearEndMonth =
      fiscalYearStartMonth === 1 ? 12 : fiscalYearStartMonth - 1

    let observer: MutationObserver | null = null
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const applyFiscalYearBorders = () => {
      const ganttElement = document.querySelector('.schedule-gantt-container')
      if (!ganttElement) return

      // 適用中はObserverを一時停止（自身の変更による無限ループ防止）
      observer?.disconnect()

      // 前回適用分をリセット
      ganttElement.querySelectorAll(`[${FISCAL_ATTR}]`).forEach((el) => {
        const htmlEl = el as HTMLElement
        htmlEl.style.borderRight = ''
        htmlEl.removeAttribute(FISCAL_ATTR)
      })

      // タイムスケールヘッダーセルから年度最終月のインデックスを収集
      const scaleCells = ganttElement.querySelectorAll('.wx-scale-row .wx-cell')
      const fiscalEndIndices: number[] = []

      scaleCells.forEach((cell, index) => {
        const el = cell as HTMLElement
        const text = el.textContent?.trim()
        if (!text) return

        const match = text.match(/^(\d{2})\/(\d{2})$/)
        if (!match) return

        // biome-ignore lint/style/noNonNullAssertion: match succeeded so group 2 exists
        const month = Number.parseInt(match[2]!, 10)
        if (month === fiscalYearEndMonth) {
          el.style.borderRight = FISCAL_BORDER
          el.setAttribute(FISCAL_ATTR, '')
          fiscalEndIndices.push(index)
        }
      })

      // タイムライン本体の各行セルにも同じインデックスで太線を適用
      const gridRows = ganttElement.querySelectorAll('.wx-row')
      gridRows.forEach((row) => {
        const cells = row.querySelectorAll('.wx-cell')
        for (const idx of fiscalEndIndices) {
          const cell = cells[idx] as HTMLElement | undefined
          if (cell) {
            cell.style.borderRight = FISCAL_BORDER
            cell.setAttribute(FISCAL_ATTR, '')
          }
        }
      })

      // Observer再開
      if (ganttElement && observer) {
        observer.observe(ganttElement, { childList: true, subtree: true })
      }
    }

    // 初回適用
    const initTimer = setTimeout(applyFiscalYearBorders, 300)

    // DOM変更時に再適用（デバウンス付き）
    const ganttElement = document.querySelector('.schedule-gantt-container')
    if (ganttElement) {
      observer = new MutationObserver(() => {
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(applyFiscalYearBorders, 150)
      })
      observer.observe(ganttElement, { childList: true, subtree: true })
    }

    return () => {
      clearTimeout(initTimer)
      if (debounceTimer) clearTimeout(debounceTimer)
      observer?.disconnect()
    }
  }, [api, fiscalYearStartMonth])

  // ダイアログの保存ハンドラー
  const handleBarEditSave = useCallback(() => {
    if (!barEdit) return
    if (
      barEdit.startDate &&
      barEdit.endDate &&
      barEdit.startDate <= barEdit.endDate
    ) {
      if (barEdit.isNew) {
        onCreateEntryRef.current(
          barEdit.phaseKey,
          barEdit.startDate,
          barEdit.endDate,
        )
      } else {
        onDateChangeRef.current(
          barEdit.phaseKey,
          barEdit.startDate,
          barEdit.endDate,
        )
      }
    }
    setBarEdit(null)
  }, [barEdit])

  return (
    <>
      <div className="schedule-gantt-container relative rounded-md border border-border overflow-hidden h-[500px]">
        <ThemeWrapper>
          <Gantt
            tasks={tasks}
            links={links}
            scales={scales}
            columns={columns}
            start={start}
            end={end}
            cellWidth={70}
            cellHeight={36}
            autoScale={false}
            init={handleInit}
          />
        </ThemeWrapper>

        {/* ホバーツールチップ */}
        {tooltip && (
          <div
            className="pointer-events-none absolute z-50 rounded-md border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md"
            style={{
              left: tooltip.x,
              top: tooltip.y,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <span className="font-medium">{tooltip.phaseName}</span>
            <span className="mx-1.5 text-muted-foreground">|</span>
            <span className="tabular-nums">
              {formatDisplayDate(tooltip.startDate)} 〜{' '}
              {formatDisplayDate(tooltip.endDate)}
            </span>
          </div>
        )}
      </div>

      {/* バー日付編集ダイアログ */}
      <Dialog
        open={barEdit !== null}
        onOpenChange={(open) => !open && setBarEdit(null)}
      >
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>
              {barEdit?.phaseName} - {barEdit?.isNew ? '期間設定' : '期間編集'}
            </DialogTitle>
            <DialogDescription>
              開始日と終了日を入力してください
            </DialogDescription>
          </DialogHeader>
          {barEdit && (
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="bar-start-date">開始日</Label>
                <Input
                  id="bar-start-date"
                  type="date"
                  value={barEdit.startDate}
                  onChange={(e) =>
                    setBarEdit((prev) =>
                      prev ? { ...prev, startDate: e.target.value } : null,
                    )
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bar-end-date">終了日</Label>
                <Input
                  id="bar-end-date"
                  type="date"
                  value={barEdit.endDate}
                  onChange={(e) =>
                    setBarEdit((prev) =>
                      prev ? { ...prev, endDate: e.target.value } : null,
                    )
                  }
                />
              </div>
              {barEdit.startDate &&
                barEdit.endDate &&
                barEdit.startDate > barEdit.endDate && (
                  <p className="text-sm text-destructive">
                    終了日は開始日以降を指定してください
                  </p>
                )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBarEdit(null)}>
              キャンセル
            </Button>
            <Button
              onClick={handleBarEditSave}
              disabled={
                !barEdit?.startDate ||
                !barEdit?.endDate ||
                barEdit.startDate > barEdit.endDate
              }
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * YYYY-MM-DD形式の文字列をローカル時間の午前0時のDateオブジェクトに変換
 */
function parseLocalDate(dateString: string): Date {
  const [year = 0, month = 1, day = 1] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day, 0, 0, 0, 0)
}

/**
 * DateオブジェクトをYYYY-MM-DD形式に変換
 */
function formatDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * YYYY-MM-DD → YYYY/MM/DD 表示用
 */
function formatDisplayDate(dateString: string): string {
  return dateString.replace(/-/g, '/')
}
