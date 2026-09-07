import { z } from 'zod'

/**
 * 所属会社スキーマ（全社共通マスタ、部門には紐づかない）
 */
/**
 * 支払サイト（支払条件）。例: 月末締め翌月末払い = { closingDay: 31, paymentMonthOffset: 1,
 * paymentDay: 31 }。日は31を「月末」として扱い、月の実日数へクランプする（2月等）。
 * 【仮定】月次明細は暦月集計のため、締め日は属性として保持し支払期日の算出には
 * 「対象月＋オフセット月のpaymentDay」を使う（20日締め等の期間ずらし集計はスコープ外）
 */
export const PaymentTermsSchema = z.object({
  /** 締め日（1〜31。31=月末） */
  closingDay: z.number().int().min(1).max(31),
  /** 支払月（対象月からのオフセット。0=当月、1=翌月、2=翌々月） */
  paymentMonthOffset: z.number().int().min(0).max(6),
  /** 支払日（1〜31。31=月末） */
  paymentDay: z.number().int().min(1).max(31),
})
export type PaymentTerms = z.infer<typeof PaymentTermsSchema>

export const CompanySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  sortOrder: z.number().int().min(0),
  isInternal: z.boolean().optional().default(false), // 内部リソース（自社）として人件費計上する会社か
  /**
   * 適格請求書発行事業者の登録番号（T＋13桁）。協力会社からの請求書
   * （支払通知）の確認・保存に使う。null/未設定=未登録
   */
  invoiceRegistrationNumber: z
    .string()
    .regex(/^T\d{13}$/, '登録番号はT＋13桁の数字で入力してください')
    .nullable()
    .optional(),
  /** 支払サイト。null/未設定=未定義（支払期日は表示しない） */
  paymentTerms: PaymentTermsSchema.nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Company = z.infer<typeof CompanySchema>

/**
 * 所属会社作成用スキーマ（IDと日時は自動生成）
 */
export const CreateCompanySchema = CompanySchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export type CreateCompany = z.infer<typeof CreateCompanySchema>

/**
 * 所属会社更新用スキーマ
 */
export const UpdateCompanySchema = CompanySchema.partial().required({
  id: true,
})
export type UpdateCompany = z.infer<typeof UpdateCompanySchema>
