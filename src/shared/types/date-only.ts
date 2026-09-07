import { z } from 'zod'
import { isValidDateOnly } from '@/shared/utils/iso-week-utils'

/**
 * 日付のみ（`YYYY-MM-DD`）の共通スキーマ。
 *
 * 従来は各フィールドが`z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`で形式だけを見ていたため、
 * **`2026-02-31`や`2026-99-99`のような存在しない日付が通っていた**。
 * 画面の`<input type="date">`はブラウザが弾くが、CSV取込・Webhook受信・公開APIは
 * 外部から任意の文字列が届くため、暦の妥当性まで検証する。
 */
export const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD形式で指定してください')
  .refine(isValidDateOnly, '存在しない日付です')
