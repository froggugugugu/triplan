import { z } from 'zod'
import { DateOnlySchema } from './date-only'

/**
 * 部門予算スキーマ（部門×年度で1レコード）
 * 「現在の予算総額」は initialAmount + 紐づく BudgetAdjustment の合計として算出する（ストア側で計算）
 */
export const DivisionBudgetSchema = z.object({
  id: z.string().uuid(),
  divisionId: z.string().uuid(),
  fiscalYear: z.number().int().min(2000).max(2100),
  initialAmount: z.number().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type DivisionBudget = z.infer<typeof DivisionBudgetSchema>

export const CreateDivisionBudgetSchema = DivisionBudgetSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export type CreateDivisionBudget = z.infer<typeof CreateDivisionBudgetSchema>

export const UpdateDivisionBudgetSchema =
  DivisionBudgetSchema.partial().required({
    id: true,
  })
export type UpdateDivisionBudget = z.infer<typeof UpdateDivisionBudgetSchema>

/**
 * 予算調整の種別（増額/減額）。「その他予算変更」への改称に伴い、
 * 減額調整にも対応する。amountは常に0以上の絶対値として保持し、符号はこのフィールドで表す
 * （NumericInputが負値入力を受け付けないため、符号付きamountにはしない）。
 */
export const BudgetAdjustmentTypeSchema = z.enum(['increase', 'decrease'])
export type BudgetAdjustmentType = z.infer<typeof BudgetAdjustmentTypeSchema>

/**
 * 予算調整履歴スキーマ（追記専用。更新・削除APIは設けない）
 */
export const BudgetAdjustmentSchema = z.object({
  id: z.string().uuid(),
  budgetId: z.string().uuid(),
  amount: z.number().min(0),
  // 未指定は増額として扱う（defaultで自動付与）
  // （bufferActualAmountと同じパターン。マイグレーション関数の追加は不要）
  adjustmentType: BudgetAdjustmentTypeSchema.optional().default('increase'),
  reason: z.string().min(1).max(500),
  adjustedAt: DateOnlySchema,
  createdAt: z.string().datetime(),
})
export type BudgetAdjustment = z.infer<typeof BudgetAdjustmentSchema>

export const CreateBudgetAdjustmentSchema = BudgetAdjustmentSchema.omit({
  id: true,
  createdAt: true,
})
export type CreateBudgetAdjustment = z.infer<
  typeof CreateBudgetAdjustmentSchema
>

/**
 * 部門予算内訳の区分（案件予算の明細区分。SaaS費用・AI利用費は既存機能から自動集計するため対象外）
 */
export const BudgetBreakdownCategorySchema = z.enum([
  'project_personnel',
  'project_expense',
  'general_expense',
])
export type BudgetBreakdownCategory = z.infer<
  typeof BudgetBreakdownCategorySchema
>

/**
 * その他費用の実績明細（購入日・購入品目・金額）。1つの予算枠（BudgetBreakdown）に対して
 * 複数件の実績明細を紐付けられる（予算1:実績Nの構造）。追加・更新・削除は
 * addBudgetBreakdownActualRecord等の専用アクション経由で行う。
 */
export const BudgetBreakdownActualRecordSchema = z.object({
  id: z.string().uuid(),
  purchasedAt: DateOnlySchema,
  itemLabel: z.string().min(1).max(500),
  amount: z.number().min(0),
  // 詳細情報の自由記述欄（任意）
  note: z.string().max(1000).nullable().optional(),
})
export type BudgetBreakdownActualRecord = z.infer<
  typeof BudgetBreakdownActualRecordSchema
>

/**
 * 部門予算内訳スキーマ。追加・更新・削除が可能（追記専用原則は撤廃済み。
 * 整合性の担保はシステムでの制御ではなく運用ルールに委ねる）。
 * DivisionBudget.initialAmount は 内訳合計 + AI利用費予算合計 + SaaS年間コスト合計 から自動算出される
 */
export const BudgetBreakdownSchema = z.object({
  id: z.string().uuid(),
  budgetId: z.string().uuid(),
  category: BudgetBreakdownCategorySchema,
  label: z.string().min(1).max(200),
  amount: z.number().min(0),
  recordedAt: DateOnlySchema,
  createdAt: z.string().datetime(),
  // 概算額×係数の計算根拠（任意。両方入力時にamountへ自動反映される）
  estimateAmount: z.number().min(0).optional(),
  coefficient: z.number().positive().optional(),
  // 案件（Project）へのリンク（任意。project_personnel/project_expenseのみ使用）
  projectId: z.string().uuid().nullable().optional(),
  // 月次実績（"YYYY-MM"キー）。専用アクション経由でのみ更新する
  monthlyActuals: z.record(z.string(), z.number().min(0)).optional(),
  // 実績明細（購入日・品目・金額の配列）。専用アクション経由でのみ更新する
  actualRecords: z.array(BudgetBreakdownActualRecordSchema).optional(),
})
export type BudgetBreakdown = z.infer<typeof BudgetBreakdownSchema>

export const CreateBudgetBreakdownSchema = BudgetBreakdownSchema.omit({
  id: true,
  createdAt: true,
})
export type CreateBudgetBreakdown = z.infer<typeof CreateBudgetBreakdownSchema>

/**
 * 更新用スキーマ。monthlyActuals / actualRecords は専用アクション経由に限定し、
 * 汎用updateからは除外する。
 */
export const UpdateBudgetBreakdownSchema = BudgetBreakdownSchema.omit({
  monthlyActuals: true,
  actualRecords: true,
})
  .partial()
  .required({ id: true })
export type UpdateBudgetBreakdown = z.infer<typeof UpdateBudgetBreakdownSchema>

/**
 * AI利用費プロバイダ。部門ごとに、契約しているAIプロバイダ
 * （Anthropic・OpenAI・Microsoft等）とグレード・プランを登録するマスタ。
 * 金額そのものは持たず、AiUsageEntry.providerIdで紐づく月次予算・実績で管理する
 * （SaasContractとは異なり金額を自身のフィールドに持たない、名称のみの軽量マスタ）。
 */
export const AiUsageProviderSchema = z.object({
  id: z.string().uuid(),
  divisionId: z.string().uuid(),
  name: z.string().min(1).max(100),
  // グレード・プラン（例: "Team", "Enterprise"）。任意
  plan: z.string().max(100).nullable().optional(),
  sortOrder: z.number().int().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type AiUsageProvider = z.infer<typeof AiUsageProviderSchema>

export const CreateAiUsageProviderSchema = AiUsageProviderSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export type CreateAiUsageProvider = z.infer<typeof CreateAiUsageProviderSchema>

export const UpdateAiUsageProviderSchema =
  AiUsageProviderSchema.partial().required({ id: true })
export type UpdateAiUsageProvider = z.infer<typeof UpdateAiUsageProviderSchema>

/**
 * AI利用費スキーマ（部門×年度×月×課×プロバイダで1レコード。課は任意で、未指定（null）は部門全体を表す。
 * プロバイダも任意で、未指定（null）は「プロバイダ未分類（レガシー・部門一括）」の枠を表す）
 * actualAmount が null の月は「未記録」として扱い、0円と区別する
 */
export const AiUsageEntrySchema = z.object({
  id: z.string().uuid(),
  divisionId: z.string().uuid(),
  // 課単位の予算設定（任意）。null/未設定 = 部門全体としての予算
  sectionId: z.string().uuid().nullable().optional(),
  // プロバイダ単位の予算設定（任意）。null/未設定 = プロバイダ未分類（プロバイダ未登録の部門はこの状態が正常）
  providerId: z.string().uuid().nullable().optional(),
  fiscalYear: z.number().int().min(2000).max(2100),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  budgetAmount: z.number().min(0),
  actualAmount: z.number().min(0).nullable(),
})
export type AiUsageEntry = z.infer<typeof AiUsageEntrySchema>

export const CreateAiUsageEntrySchema = AiUsageEntrySchema.omit({ id: true })
export type CreateAiUsageEntry = z.infer<typeof CreateAiUsageEntrySchema>

export const UpdateAiUsageEntrySchema = AiUsageEntrySchema.partial().required({
  id: true,
})
export type UpdateAiUsageEntry = z.infer<typeof UpdateAiUsageEntrySchema>

/**
 * AI利用費のメンバー別予算配分・実績スキーマ（部門×年度×月×メンバー×プロバイダで1レコード）。
 * AiUsageEntry（部門×年度×月の月別予算）とは直交する別軸で、月次予算をメンバー単位に
 * 配分・微調整するために使用する。
 */
export const AiUsageMemberAllocationSchema = z.object({
  id: z.string().uuid(),
  divisionId: z.string().uuid(),
  fiscalYear: z.number().int().min(2000).max(2100),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  memberId: z.string().uuid(),
  // プロバイダ単位の配分（任意）。null/未設定 = プロバイダ未分類
  // （プロバイダ未登録の部門はこの状態が正常。AiUsageEntry.providerIdと同じパターン）
  providerId: z.string().uuid().nullable().optional(),
  monthlyBudget: z.number().min(0),
  bufferAmount: z.number().min(0),
  actualAmount: z.number().min(0),
  // バッファ枠に対する実績割当額。未入力を0として扱うため
  // optional + default(0)とし、zodのデフォルト機能でDatabaseSchema.parse()時に自動付与する
  // （status/confidenceと同じパターン。マイグレーション関数の追加は不要）
  bufferActualAmount: z.number().min(0).optional().default(0),
})
export type AiUsageMemberAllocation = z.infer<
  typeof AiUsageMemberAllocationSchema
>

export const CreateAiUsageMemberAllocationSchema =
  AiUsageMemberAllocationSchema.omit({ id: true })
export type CreateAiUsageMemberAllocation = z.infer<
  typeof CreateAiUsageMemberAllocationSchema
>

export const UpdateAiUsageMemberAllocationSchema =
  AiUsageMemberAllocationSchema.partial().required({ id: true })
export type UpdateAiUsageMemberAllocation = z.infer<
  typeof UpdateAiUsageMemberAllocationSchema
>

/**
 * 為替レート設定の履歴エントリ（requirements10: ドル建て金額の円換算）。
 * 1件が「effectiveFrom（YYYY-MM）以降に適用される1ドルあたりの円レート」を表す。
 * システム設定から更新するたびに対象月のエントリを追記/更新し、過去分は保持したまま残す
 * （SaasAmountHistoryEntry/UnitPriceEntryと同型だが、意味が異なるため別スキーマとして定義）。
 */
export const ExchangeRateEntrySchema = z.object({
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}$/), // "YYYY-MM" 形式
  rate: z.number().positive(), // 1ドルあたりの円（例: 150）
})
export type ExchangeRateEntry = z.infer<typeof ExchangeRateEntrySchema>

/**
 * SaaS契約の契約形態
 */
export const SaasContractTypeSchema = z.enum(['annual', 'monthly'])
export type SaasContractType = z.infer<typeof SaasContractTypeSchema>

/**
 * SaaS契約の支払いサイクル
 */
export const SaasPaymentCycleSchema = z.enum(['monthly', 'annual'])
export type SaasPaymentCycle = z.infer<typeof SaasPaymentCycleSchema>

/**
 * SaaS契約の金額変更履歴エントリ（年途中の契約変更を記録する）
 */
export const SaasAmountHistoryEntrySchema = z.object({
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}$/), // "YYYY-MM" 形式
  amount: z.number().min(0),
})
export type SaasAmountHistoryEntry = z.infer<
  typeof SaasAmountHistoryEntrySchema
>

/**
 * SaaS契約スキーマ
 */
export const SaasContractSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  // グレード・プラン（例: "Business", "Enterprise"）。任意。
  // 同一サービス（name）で複数プランを契約している場合の区別に使う
  plan: z.string().max(100).nullable().optional(),
  divisionId: z.string().uuid(),
  contractType: SaasContractTypeSchema,
  amount: z.number().min(0),
  headcount: z.number().int().min(1).nullable().optional(), // 利用人数（人数×単価の内訳計算用、任意）
  unitPrice: z.number().min(0).nullable().optional(), // 1人あたり単価（万円、任意）
  amountHistory: z.array(SaasAmountHistoryEntrySchema).optional(), // 金額変更履歴（空配列可）
  // 月次実績（"YYYY-MM"キー、任意）。amountHistory（契約金額改定履歴）とは別。専用アクション経由でのみ更新する
  monthlyActuals: z.record(z.string(), z.number().min(0)).optional(),
  paymentCycle: SaasPaymentCycleSchema,
  contractStartDate: DateOnlySchema,
  nextRenewalDate: DateOnlySchema,
  note: z.string().max(500).nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type SaasContract = z.infer<typeof SaasContractSchema>

export const CreateSaasContractSchema = SaasContractSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
export type CreateSaasContract = z.infer<typeof CreateSaasContractSchema>

// monthlyActuals は setSaasContractActual 専用アクション経由に限定し、汎用updateからは除外する
export const UpdateSaasContractSchema = SaasContractSchema.omit({
  monthlyActuals: true,
})
  .partial()
  .required({ id: true })
export type UpdateSaasContract = z.infer<typeof UpdateSaasContractSchema>
