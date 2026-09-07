import { z } from 'zod'

/**
 * 契約形態選択肢（日本のシステム開発における一般的な区分）
 */
export const CONTRACT_TYPE_OPTIONS = [
  { value: '請負', label: '請負' },
  { value: '準委任', label: '準委任' },
  { value: '派遣', label: '派遣' },
  { value: '正社員', label: '正社員' },
] as const
export const ContractTypeSchema = z.enum(['請負', '準委任', '派遣', '正社員'])
export type ContractType = z.infer<typeof ContractTypeSchema>

/**
 * 単価履歴エントリスキーマ
 */
export const UnitPriceEntrySchema = z.object({
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}$/), // "YYYY-MM" 形式
  amount: z.number().min(0), // 月額単価（万円）
})
export type UnitPriceEntry = z.infer<typeof UnitPriceEntrySchema>

/**
 * 契約単価履歴エントリスキーマ（単価と同一構造。所属会社との契約に基づく支払単価）
 */
export const ContractUnitPriceEntrySchema = UnitPriceEntrySchema.extend({
  /**
   * 準委任の精算幅・下限（時間/月。例: 140）。上下限が両方設定されて初めて精算計算の
   * 対象になる（片側のみは防御的に固定扱い）。未設定=精算せず固定額。
   * 非公開の設計文書
   */
  settlementLowerHours: z.number().gt(0).optional(),
  /** 準委任の精算幅・上限（時間/月。例: 180）。フォーム側で下限以上を強制する */
  settlementUpperHours: z.number().gt(0).optional(),
})
export type ContractUnitPriceEntry = z.infer<
  typeof ContractUnitPriceEntrySchema
>

/**
 * 担当者スキーマ
 */
export const MemberSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  // メールアドレス（null/未設定 = 未設定）。通知・外部ツール連携（Backlog/Asana等）のキーとして使用
  email: z.string().email().nullable().optional(),
  sectionId: z.string().uuid().nullable(), // 課ID（null = 未所属）
  companyId: z.string().uuid().nullable().optional(), // 所属会社ID（null/未設定 = 未設定）
  contractType: ContractTypeSchema.nullable().optional(), // 契約形態（null/未設定 = 未設定）
  role: z.string().max(100),
  // 月間稼働率の上限（0より大きく1.0以下、未設定＝1.0）。時短勤務・兼務・部分参画の
  // メンバーは1.0未満を設定する。アサイン入力時の超過判定と、部門の供給キャパシティ算出に使う。
  // 未設定=1.0（フルタイム）として扱うためoptional（各利用箇所で`?? 1`。
  // `.default()`を付けると型が必須になり、既存のMemberリテラルが全て壊れるため付けない）
  capacityRatio: z.number().gt(0).max(1).optional(),
  isActive: z.boolean(),
  techTagIds: z.array(z.string().uuid()).optional(), // 紐付けた技術タグIDリスト
  startDate: z.string().nullable(), // 開始日 "YYYY-MM-DD"（null = 未設定）
  endDate: z.string().nullable(), // 終了日 "YYYY-MM-DD"（null = 現在も在籍）
  unitPriceHistory: z.array(UnitPriceEntrySchema), // 単価履歴（予算見積もり用、空配列可）
  contractUnitPriceHistory: z.array(ContractUnitPriceEntrySchema).optional(), // 契約単価履歴（所属会社への支払用、空配列可）
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Member = z.infer<typeof MemberSchema>

/**
 * 担当者作成用スキーマ（IDと日時は自動生成）
 */
export const CreateMemberSchema = MemberSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export type CreateMember = z.infer<typeof CreateMemberSchema>

/**
 * 担当者更新用スキーマ
 */
export const UpdateMemberSchema = MemberSchema.partial().required({ id: true })
export type UpdateMember = z.infer<typeof UpdateMemberSchema>

/**
 * 役割マスタ（ユニークな役割名のリスト）
 */
export function extractRoles(members: Member[]): string[] {
  const roles = new Set<string>()
  for (const member of members) {
    if (member.role) {
      roles.add(member.role)
    }
  }
  return Array.from(roles).sort()
}
