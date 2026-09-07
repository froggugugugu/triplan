/**
 * SVAR Ganttとの連携ユーティリティ
 * 既存のデータ構造 ⇔ SVAR Gantt形式の変換
 */

import type { ILink, ITask } from '@svar-ui/react-gantt'
import type {
  DependencyType,
  PhaseDefinition,
  PhaseDependency,
  ScheduleEntry,
} from '@/shared/types/schedule'

/**
 * YYYY-MM-DD → YYYY/MM/DD 表示用
 */
function formatDisplayDate(dateString: string): string {
  return dateString.replace(/-/g, '/')
}

/**
 * SVAR GanttのリンクタイプTLinkType（ライブラリからexportされていないため再定義）
 */
type TLinkType = 's2s' | 's2e' | 'e2s' | 'e2e'

/**
 * DependencyType → TLinkType への変換マップ
 * FS: Finish-to-Start → e2s (End-to-Start)
 * SS: Start-to-Start → s2s
 * FF: Finish-to-Finish → e2e (End-to-End)
 * SF: Start-to-Finish → s2e (Start-to-End)
 */
const DEPENDENCY_TO_LINK_TYPE: Record<DependencyType, TLinkType> = {
  FS: 'e2s',
  SS: 's2s',
  FF: 'e2e',
  SF: 's2e',
}

/**
 * TLinkType → DependencyType への逆変換マップ
 */
const LINK_TYPE_TO_DEPENDENCY: Record<TLinkType, DependencyType> = {
  e2s: 'FS',
  s2s: 'SS',
  e2e: 'FF',
  s2e: 'SF',
}

/**
 * YYYY-MM-DD形式の文字列をローカル時間の午前0時のDateオブジェクトに変換
 */
function parseLocalDate(dateString: string): Date {
  const [year = 0, month = 1, day = 1] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day, 0, 0, 0, 0)
}

/**
 * ScheduleEntry + PhaseDefinition を ITask に変換
 */
export function toGanttTask(
  entry: ScheduleEntry,
  phase: PhaseDefinition,
  /**
   * 工程の進捗率（0.0〜1.0）。WBSの完了チェックからロールアップした値。
   * nullは「この工程にタスクが紐づいていない」＝進捗を描かない
   * （0%として描くと未着手と誤読されるため、`progress`キー自体を付けない）
   */
  progressRate: number | null = null,
): ITask {
  return {
    id: entry.phaseKey,
    text: phase.name,
    start: parseLocalDate(entry.startDate),
    end: parseLocalDate(entry.endDate),
    startText: formatDisplayDate(entry.startDate),
    endText: formatDisplayDate(entry.endDate),
    type: 'task',
    color: phase.color,
    // SVAR Ganttのprogressは0〜100（%）
    ...(progressRate === null
      ? {}
      : { progress: Math.round(progressRate * 100) }),
    $custom: {
      phaseColor: phase.color,
    },
  } as ITask
}

/**
 * PhaseDefinition（日付なし）を空のITaskに変換
 * ガントチャート上にはバーは表示されないが、リスト行として表示される
 */
export function toEmptyGanttTask(phase: PhaseDefinition): ITask {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return {
    id: phase.phaseKey,
    text: phase.name,
    start: now,
    end: now,
    startText: '',
    endText: '',
    type: 'task',
    color: phase.color,
  } as ITask
}

/**
 * 複数のScheduleEntryとPhaseDefinitionをITask配列に変換
 */
export function toGanttTasks(
  phases: PhaseDefinition[],
  entries: ScheduleEntry[],
  /**
   * 工程キー→進捗率（0.0〜1.0、紐づくタスクが無ければnull）の解決関数。
   * 未指定なら進捗を描かない（既存の呼び出し元との後方互換）
   */
  progressOf: (phaseKey: string) => number | null = () => null,
): ITask[] {
  const entryMap = new Map(entries.map((e) => [e.phaseKey, e]))

  const tasks = phases.map((phase) => {
    const entry = entryMap.get(phase.phaseKey)
    if (entry) {
      return toGanttTask(entry, phase, progressOf(phase.phaseKey))
    }
    return toEmptyGanttTask(phase)
  })

  // 最後の行が横スクロールバーに隠れないよう、ダミーの空行を追加
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  tasks.push({
    id: '__spacer__',
    text: '',
    start: now,
    end: now,
    startText: '',
    endText: '',
    type: 'task',
  } as ITask)

  return tasks
}

/**
 * PhaseDependency を ILink に変換
 */
export function toGanttLink(dependency: PhaseDependency): ILink {
  return {
    id: dependency.id,
    source: dependency.fromPhaseKey,
    target: dependency.toPhaseKey,
    type: DEPENDENCY_TO_LINK_TYPE[dependency.dependencyType],
  }
}

/**
 * 複数のPhaseDependencyをILink配列に変換
 */
export function toGanttLinks(dependencies: PhaseDependency[]): ILink[] {
  return dependencies.map(toGanttLink)
}

/**
 * リンクタイプ から DependencyType に変換
 */
export function toDependencyType(
  linkType: ILink['type'] | undefined,
): DependencyType {
  if (!linkType) return 'FS'
  return LINK_TYPE_TO_DEPENDENCY[linkType as TLinkType] ?? 'FS'
}

/**
 * 日付範囲を計算（前後マージン付き）
 * @param entries スケジュールエントリ配列
 * @param marginMonths マージン月数（デフォルト: 1）
 * @param startMonth 年度開始月（デフォルト: 4 = 4月始まり）
 * @returns { start: Date, end: Date }
 */
export function calculateDateRange(
  entries: ScheduleEntry[],
  marginMonths = 1,
  startMonth = 4,
): { start: Date; end: Date } {
  // デフォルト: 現在年度の後半6ヶ月 + 翌年度の12ヶ月 = 18ヶ月
  // 例）startMonth=4, 作業日=2026/02/10 → 年度=2025年度
  //     後半開始=2025/10, 翌年度末=2027/03 → 2025/10〜2027/03
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const fiscalYear = currentMonth >= startMonth ? currentYear : currentYear - 1

  // 年度後半の開始月 = 年度開始月 + 6
  const halfYearStart = new Date(fiscalYear, startMonth - 1 + 6, 1)
  // 翌年度の末日 = 翌々年の年度開始月の前月末日
  const nextFiscalYearEnd = new Date(fiscalYear + 2, startMonth - 1, 0)

  const defaultStart = halfYearStart
  const defaultEnd = nextFiscalYearEnd

  if (entries.length === 0) {
    return { start: defaultStart, end: defaultEnd }
  }

  // 有効な日付のみを抽出
  const validEntries = entries.filter(
    (e) => e.startDate && e.endDate && e.startDate <= e.endDate,
  )

  if (validEntries.length === 0) {
    return { start: defaultStart, end: defaultEnd }
  }

  const startDates = validEntries.map((e) => parseLocalDate(e.startDate))
  const endDates = validEntries.map((e) => parseLocalDate(e.endDate))

  const minDate = new Date(Math.min(...startDates.map((d) => d.getTime())))
  const maxDate = new Date(Math.max(...endDates.map((d) => d.getTime())))

  // マージンを適用
  const entryStart = new Date(minDate)
  entryStart.setMonth(entryStart.getMonth() - marginMonths)
  entryStart.setDate(1) // 月初に調整

  const entryEnd = new Date(maxDate)
  entryEnd.setMonth(entryEnd.getMonth() + marginMonths + 1)
  entryEnd.setDate(0) // 月末に調整

  // デフォルト範囲を最低枠として確保
  const start = entryStart < defaultStart ? entryStart : defaultStart
  const end = entryEnd > defaultEnd ? entryEnd : defaultEnd

  return { start, end }
}

/**
 * 指定された月が年度開始月かどうかを判定
 * @param month 判定対象の月（1-12）
 * @param startMonth 年度開始月（デフォルト: 4）
 */
export function isFiscalYearStart(month: number, startMonth = 4): boolean {
  return month === startMonth
}

/**
 * 旬（上旬/中旬/下旬）のフォーマット関数
 * 日付から旬を判定して「上」「中」「下」を返す
 */
export function formatDecade(date: Date): string {
  const day = date.getDate()
  if (day <= 10) return '上'
  if (day <= 20) return '中'
  return '下'
}

/**
 * 月名フォーマット関数（日本語）
 */
export function formatMonth(date: Date): string {
  const month = date.getMonth() + 1
  return `${month}月`
}
