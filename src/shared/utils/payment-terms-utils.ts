import type { PaymentTerms } from '@/shared/types/company'

/**
 * 支払サイト（支払条件）から支払期日を算出する純関数。
 * 対象月（月次明細の月）＋支払月オフセットの月の支払日。日は月の実日数へクランプする
 * （31=「月末」の意。2月なら28/29日、30日指定×2月なら28/29日）。
 */
export function calcPaymentDueDate(month: string, terms: PaymentTerms): string {
  const [yearStr, monthStr] = month.split('-')
  const year = Number(yearStr)
  const monthIndex = Number(monthStr) - 1 + terms.paymentMonthOffset
  // Dateのday=0は「前月の末日」= クランプ用の実日数
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const day = Math.min(terms.paymentDay, daysInMonth)
  const due = new Date(year, monthIndex, day)
  const mm = String(due.getMonth() + 1).padStart(2, '0')
  const dd = String(due.getDate()).padStart(2, '0')
  return `${due.getFullYear()}-${mm}-${dd}`
}

/** 支払サイトの表示ラベル（例: 「月末締め 翌月末払い」「20日締め 翌々月10日払い」） */
export function formatPaymentTermsLabel(terms: PaymentTerms): string {
  const closing = terms.closingDay >= 31 ? '月末' : `${terms.closingDay}日`
  const offsetLabels = ['当月', '翌月', '翌々月']
  const offset =
    offsetLabels[terms.paymentMonthOffset] ??
    `${terms.paymentMonthOffset}ヶ月後`
  const payment = terms.paymentDay >= 31 ? '末' : `${terms.paymentDay}日`
  return `${closing}締め ${offset}${payment}払い`
}
