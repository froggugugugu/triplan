import { isValidDateOnly } from './iso-week-utils'

/**
 * 外部完了同期の突合コア小関数（非公開の設計文書）。
 * クライアント（完了CSV取込ウィザード）とサーバー（Webhook受信エンドポイント、Phase 2）の
 * 両方が使うためshared化（features側はリエクスポート＝effort-utilsで確立済みのパターン）。
 */

/** 件名から`[コード]`を抽出する（最初の角括弧のみ）。無ければnull */
export function extractCodeFromSubject(subject: string): string | null {
  const match = subject.match(/\[([^\]]+)\]/)
  return match?.[1]?.trim() || null
}

/**
 * 日付文字列を`YYYY-MM-DD`へ正規化する。`YYYY-MM-DD`／`YYYY/M/D`／ISO datetimeの
 * 前方一致を受け付け、解釈できなければnull
 */
export function resolveDateOnly(raw: string): string | null {
  const m = raw.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const normalized = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  // 暦として実在する日付かまで見る（2026-02-31・平年の2/29等を弾く）。
  // 外部ツールからの取込・Webhookは人手の編集が入りうる経路のため
  return isValidDateOnly(normalized) ? normalized : null
}
