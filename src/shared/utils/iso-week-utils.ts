const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * ISO週の曜日番号を返す（1=月曜〜7=日曜）。
 * ローカル日付のgetDay()（0=日曜〜6=土曜）をISO準拠に変換する。
 */
function isoDayOfWeek(year: number, month: number, day: number): number {
  const dow = new Date(year, month, day).getDay()
  return dow === 0 ? 7 : dow
}

/**
 * 指定日（ローカル日付の年月日）にdeltaDays日を加算し、ローカル日付として返す。
 * 加減算自体はUTCミリ秒で行うため、DST（サマータイム）のある地域でも日数計算がずれない
 * （development-patterns.md 10章のタイムゾーン落とし穴と同じ回避方針）。
 */
function addDaysAsLocalDate(
  year: number,
  month: number,
  day: number,
  deltaDays: number,
): Date {
  const utcMs = Date.UTC(year, month, day) + deltaDays * MS_PER_DAY
  const d = new Date(utcMs)
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

function toUtcDayMs(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * Dateを`YYYY-MM-DD`形式の文字列へ変換する（ローカル日付基準）。
 * `toISOString().slice(0, 10)`はUTC変換を伴うため、日本時間の午前9時より前が前日に
 * ずれる（`docs/development-patterns.md` §10「タイムゾーンでテスト失敗」と同根）。
 * 日付のみを扱う値（`Project.completedAt`・`ProjectBaseline.approvedAt`等）の生成には必ず本関数を使う。
 */
export function formatDateOnly(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * `YYYY-MM-DD`が**暦として実在する日付**かを判定する。
 *
 * 形式の正規表現だけでは`2026-02-31`や`2026-99-99`のような存在しない日付が通る。
 * 画面の`<input type="date">`はブラウザが弾くが、**CSV取込・Webhook受信・公開API**は
 * 外部から任意の文字列が届く経路なので、ここで暦の妥当性まで見る。
 * うるう年は`Date`の正規化（2月30日→3月2日等）を利用して検出する。
 */
export function isValidDateOnly(value: string): boolean {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return false
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  // 存在しない日はDateが翌月へ繰り上がるため、戻して一致するかで判定する
  const d = new Date(year, month - 1, day)
  return (
    d.getFullYear() === year &&
    d.getMonth() === month - 1 &&
    d.getDate() === day
  )
}

/**
 * ISO 8601週番号キー（"YYYY-Www"、月曜始まり）を返す。
 * ISO週の年は、その週の木曜日が属する年に一致する（ISO 8601の定義）。
 *
 * @param date 対象日（ローカル日付として解釈する）
 */
export function getIsoWeekKey(date: Date): string {
  const year = date.getFullYear()
  const month = date.getMonth()
  const day = date.getDate()
  const dow = isoDayOfWeek(year, month, day)
  const thursday = addDaysAsLocalDate(year, month, day, 4 - dow)
  const isoYear = thursday.getFullYear()
  const diffDays = Math.round(
    (toUtcDayMs(thursday) - Date.UTC(isoYear, 0, 1)) / MS_PER_DAY,
  )
  const weekNumber = Math.floor(diffDays / 7) + 1
  return `${isoYear}-W${String(weekNumber).padStart(2, '0')}`
}

function parseIsoWeekKey(weekKey: string): { year: number; week: number } {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekKey)
  if (!match) {
    throw new Error(`不正なISO週番号キー: ${weekKey}`)
  }
  return { year: Number(match[1]), week: Number(match[2]) }
}

/**
 * ISO週の月曜日をローカル日付として返す。
 */
export function getIsoWeekMonday(weekKey: string): Date {
  const { year, week } = parseIsoWeekKey(weekKey)
  const dow4 = isoDayOfWeek(year, 0, 4)
  const week1Monday = addDaysAsLocalDate(year, 0, 4, 1 - dow4)
  return addDaysAsLocalDate(
    week1Monday.getFullYear(),
    week1Monday.getMonth(),
    week1Monday.getDate(),
    (week - 1) * 7,
  )
}

/**
 * ISO週の日曜日をローカル日付として返す。
 */
export function getIsoWeekSunday(weekKey: string): Date {
  const monday = getIsoWeekMonday(weekKey)
  return addDaysAsLocalDate(
    monday.getFullYear(),
    monday.getMonth(),
    monday.getDate(),
    6,
  )
}

function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number) as [
    number,
    number,
    number,
  ]
  return new Date(year, month - 1, day)
}

/**
 * 指定期間（"YYYY-MM-DD"、両端含む）に重なるISO週キー一覧を昇順で返す。
 * startDateがendDateより後（逆転範囲）の場合は空配列を返す。
 */
export function getIsoWeeksInRange(
  startDate: string,
  endDate: string,
): string[] {
  const start = parseDateOnly(startDate)
  const end = parseDateOnly(endDate)
  if (start.getTime() > end.getTime()) return []

  const endUtcMs = toUtcDayMs(end)
  let cursor = getIsoWeekMonday(getIsoWeekKey(start))

  const result: string[] = []
  while (toUtcDayMs(cursor) <= endUtcMs) {
    result.push(getIsoWeekKey(cursor))
    cursor = addDaysAsLocalDate(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate(),
      7,
    )
  }
  return result
}
