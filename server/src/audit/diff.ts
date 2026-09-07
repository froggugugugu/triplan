/**
 * 監査証跡の差分抽出。純関数。
 *
 * 「実際に値が変わったフィールドだけ」を残す。patchに含まれていても値が同じなら
 * 落とし、変更が1件も無ければnullを返す（何も変わっていない更新でログを増やさない）。
 */

/** 差分から常に除外するフィールド（更新のたびに必ず変わるため意味を持たない） */
const IGNORED_FIELDS: ReadonlySet<string> = new Set(['updatedAt', 'updated_at'])

export interface FieldChange {
  before: unknown
  after: unknown
}

/**
 * 値を比較用に正規化する。
 * - null / undefined は同一視する（Drizzleは未設定列をnullで返し、Zodのoptionalは
 *   undefinedで届くため、素の比較では「未設定→未設定」が差分になってしまう）
 * - Date はISO文字列へ寄せる（timestamp列はDateで返り、クライアントは文字列を送る）
 */
function normalize(value: unknown): unknown {
  if (value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  return value
}

function isEqual(a: unknown, b: unknown): boolean {
  const left = normalize(a)
  const right = normalize(b)
  if (left === right) return true
  if (left === null || right === null) return false
  if (typeof left !== 'object' || typeof right !== 'object') return false
  // オブジェクト・配列は構造で比較する（参照違いを差分にしない）。
  // 監査対象の値はDBのjsonb由来でキー順が安定しているため、JSON文字列化で足りる
  return JSON.stringify(left) === JSON.stringify(right)
}

/**
 * 更新前の行と適用するパッチから、実際に変わったフィールドの差分を作る。
 * 変更が無ければnull。
 */
export function diffChangedFields(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, FieldChange> | null {
  const changes: Record<string, FieldChange> = {}
  for (const [field, after] of Object.entries(patch)) {
    if (IGNORED_FIELDS.has(field)) continue
    const previous = before[field]
    if (isEqual(previous, after)) continue
    changes[field] = {
      before: normalize(previous),
      after: normalize(after),
    }
  }
  return Object.keys(changes).length > 0 ? changes : null
}
