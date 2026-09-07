import { z } from 'zod'
import { ContractTypeSchema } from '@/shared/types/member'
import { SKILL_LEVELS } from '@/shared/types/skill'

/**
 * 案件フォームのバリデーションスキーマ
 */
export const projectFormSchema = z.object({
  code: z
    .string()
    .min(1, 'コードは必須です')
    .max(50, 'コードは50文字以内で入力してください'),
  name: z
    .string()
    .min(1, '名称は必須です')
    .max(200, '名称は200文字以内で入力してください'),
  description: z
    .string()
    .max(2000, '説明は2000文字以内で入力してください')
    .optional(),
  background: z
    .string()
    .max(2000, '背景は2000文字以内で入力してください')
    .optional(),
  purpose: z
    .string()
    .max(2000, '目的は2000文字以内で入力してください')
    .optional(),
  completionCriteria: z
    .string()
    .max(2000, '完了条件は2000文字以内で入力してください')
    .optional(),
  parentId: z.string().uuid().nullable(),
  level: z.number().int().min(0).max(5),
  status: z.enum(['not_started', 'active', 'completed']).default('not_started'),
  confidence: z.enum(['S', 'A', 'B', 'C']).nullable().default(null),
  // 担当部門ID。トップレベル案件（level===0）のみ設定対象
  divisionId: z.string().uuid().nullable().optional(),
  // 発注元（対外クライアント）名。トップレベル案件（level===0）のみ設定対象
  clientName: z
    .string()
    .max(200, '発注元名は200文字以内で入力してください')
    .nullable()
    .optional(),
  // 受注金額（万円）。トップレベル案件（level===0）のみ設定対象
  contractAmount: z
    .number()
    .min(0, '受注金額は0以上で入力してください')
    .nullable()
    .optional(),
  // 優先度。トップレベル案件（level===0）のみ設定対象
  priority: z.enum(['high', 'medium', 'low']).nullable().optional(),
  // EVMのPV算出における単価の扱い。トップレベル案件（level===0）のみ設定対象
  evmUnitPriceMode: z.enum(['frozen', 'latest']).optional(),
  // 起票先の既定接続。level===0のみ対象、未設定はnull
  externalConnectionId: z.string().uuid().nullable().optional(),
  // 案件レベルの契約形態。トップレベル案件（level===0）のみ設定対象
  contractType: z
    .enum(['請負', '準委任', '派遣', '混在'])
    .nullable()
    .optional(),
  // 契約上のマスター納期。トップレベル案件（level===0）のみ設定対象
  masterDueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '有効な日付（YYYY-MM-DD）を入力してください')
    .nullable()
    .optional(),
  // 所属する工程（phaseKey）。タスク（level>0）のみ設定対象。
  // 未設定は「祖先から継承」を意味する
  phaseKey: z.string().max(50).nullable().optional(),
})
export type ProjectFormValues = z.infer<typeof projectFormSchema>

/**
 * 単価履歴エントリフォームスキーマ
 */
export const unitPriceEntryFormSchema = z.object({
  effectiveFrom: z
    .string()
    .regex(/^\d{4}-\d{2}$/, '有効な年月（YYYY-MM）を入力してください'),
  amount: z.number().min(0, '単価は0以上で入力してください'),
})

/**
 * 契約単価履歴エントリフォームスキーマ（所属会社との契約に基づく支払単価）
 */
export const contractUnitPriceEntryFormSchema = z
  .object({
    effectiveFrom: z
      .string()
      .regex(/^\d{4}-\d{2}$/, '有効な年月（YYYY-MM）を入力してください'),
    amount: z.number().min(0, '契約単価は0以上で入力してください'),
    // 準委任の精算幅（時間/月）。0は未設定として扱う（NumericInputは空欄=0のため）
    settlementLowerHours: z.number().min(0).optional(),
    settlementUpperHours: z.number().min(0).optional(),
  })
  .refine(
    (entry) => {
      const lower = entry.settlementLowerHours ?? 0
      const upper = entry.settlementUpperHours ?? 0
      // 片側のみの入力・上下逆転は保存させない（0=未設定は両方0でのみ許容）
      if (lower === 0 && upper === 0) return true
      return lower > 0 && upper > 0 && upper >= lower
    },
    {
      message:
        '精算幅は下限・上限の両方を入力し、上限は下限以上にしてください（使わない場合は両方空欄）',
    },
  )

/**
 * 担当者フォームのバリデーションスキーマ
 */
export const memberFormSchema = z
  .object({
    name: z
      .string()
      .min(1, '氏名は必須です')
      .max(100, '氏名は100文字以内で入力してください'),
    // 空文字・null・undefinedはいずれも「未設定」としてnullへ正規化する
    // （フォーム入力欄の空文字とMemberSchema側の型 string|null を橋渡しするため）
    email: z
      .union([
        z.literal(''),
        z.string().email('有効なメールアドレスを入力してください'),
      ])
      .nullable()
      .optional()
      .transform((v) => v || null),
    sectionId: z.string().uuid().nullable().default(null),
    companyId: z.string().uuid().nullable().optional().default(null),
    contractType: ContractTypeSchema.nullable().optional().default(null),
    role: z.string().max(100, '役割は100文字以内で入力してください'),
    // 月間稼働率の上限（未設定＝1.0）。時短勤務・兼務・部分参画のメンバーは1.0未満を設定する
    capacityRatio: z
      .number()
      .gt(0, '稼働率上限は0より大きい値を入力してください')
      .max(1, '稼働率上限は1.0以下で入力してください')
      .optional(),
    isActive: z.boolean(),
    techTagIds: z.array(z.string().uuid()).optional(),
    startDate: z.string().nullable().default(null),
    endDate: z.string().nullable().default(null),
    unitPriceHistory: z.array(unitPriceEntryFormSchema).default([]),
    contractUnitPriceHistory: z
      .array(contractUnitPriceEntryFormSchema)
      .optional()
      .default([]),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.endDate >= data.startDate
      }
      return true
    },
    {
      message: '終了日は開始日以降の日付を指定してください',
      path: ['endDate'],
    },
  )
export type MemberFormValues = z.infer<typeof memberFormSchema>

/**
 * 技術タグフォームのバリデーションスキーマ
 */
export const techTagFormSchema = z.object({
  name: z
    .string()
    .min(1, 'タグ名は必須です')
    .max(50, 'タグ名は50文字以内で入力してください'),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, '有効なカラーコードを入力してください'),
  categoryId: z.string().uuid('カテゴリは必須です'),
  subCategoryId: z.string().uuid().nullable().default(null),
  note: z
    .string()
    .max(200, '備考は200文字以内で入力してください')
    .nullable()
    .default(null),
})
export type TechTagFormValues = z.infer<typeof techTagFormSchema>

export const techTagCategoryFormSchema = z.object({
  name: z
    .string()
    .min(1, 'カテゴリ名は必須です')
    .max(100, 'カテゴリ名は100文字以内で入力してください'),
})
export type TechTagCategoryFormValues = z.infer<
  typeof techTagCategoryFormSchema
>

export const techTagSubCategoryFormSchema = z.object({
  categoryId: z.string().uuid('カテゴリは必須です'),
  name: z
    .string()
    .min(1, 'サブカテゴリ名は必須です')
    .max(100, 'サブカテゴリ名は100文字以内で入力してください'),
})
export type TechTagSubCategoryFormValues = z.infer<
  typeof techTagSubCategoryFormSchema
>

/**
 * SaaS契約フォームのバリデーションスキーマ
 */
export const saasAmountHistoryEntryFormSchema = z.object({
  effectiveFrom: z
    .string()
    .regex(/^\d{4}-\d{2}$/, '有効な年月（YYYY-MM）を入力してください'),
  amount: z.number().min(0, '金額は0以上で入力してください'),
})

export const saasContractFormSchema = z
  .object({
    name: z
      .string()
      .min(1, 'サービス名は必須です')
      .max(100, 'サービス名は100文字以内で入力してください'),
    plan: z
      .string()
      .max(100, 'グレード・プランは100文字以内で入力してください')
      .nullable()
      .optional(),
    divisionId: z.string().uuid('対象部門は必須です'),
    contractType: z.enum(['annual', 'monthly']),
    amount: z.number().min(0, '金額は0以上で入力してください'),
    headcount: z
      .number()
      .int()
      .min(1, '利用人数は1以上で入力してください')
      .nullable()
      .optional(),
    unitPrice: z
      .number()
      .min(0, '単価は0以上で入力してください')
      .nullable()
      .optional(),
    amountHistory: z.array(saasAmountHistoryEntryFormSchema).optional(),
    paymentCycle: z.enum(['monthly', 'annual']),
    contractStartDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, '契約開始日を入力してください'),
    nextRenewalDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, '次回更新日を入力してください'),
    note: z
      .string()
      .max(500, '備考は500文字以内で入力してください')
      .nullable()
      .default(null),
  })
  .refine((data) => data.nextRenewalDate >= data.contractStartDate, {
    message: '次回更新日は契約開始日以降の日付を指定してください',
    path: ['nextRenewalDate'],
  })
export type SaasContractFormValues = z.infer<typeof saasContractFormSchema>

/**
 * 部門予算内訳フォームのバリデーションスキーマ
 */
export const budgetBreakdownFormSchema = z
  .object({
    category: z.enum(
      ['project_personnel', 'project_expense', 'general_expense'],
      { message: '種別を選択してください' },
    ),
    label: z
      .string()
      .min(1, 'ラベルは必須です')
      .max(200, 'ラベルは200文字以内で入力してください'),
    amount: z.number().min(0, '金額は0以上で入力してください'),
    recordedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, '計上日を入力してください'),
    estimateAmount: z
      .number()
      .min(0, '概算額は0以上で入力してください')
      .optional(),
    coefficient: z
      .number()
      .positive('係数は0より大きい値を入力してください')
      .optional(),
    projectId: z.string().uuid().nullable().optional(),
  })
  .refine((data) => data.category !== 'general_expense' || !data.projectId, {
    message: '一般経費区分ではプロジェクトを選択できません',
    path: ['projectId'],
  })
export type BudgetBreakdownFormValues = z.infer<
  typeof budgetBreakdownFormSchema
>

/**
 * その他費用の実績明細（購入日・購入品目・金額）フォームのバリデーションスキーマ
 */
export const otherExpenseActualFormSchema = z.object({
  purchasedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '購入日を入力してください'),
  itemLabel: z
    .string()
    .min(1, '購入品目は必須です')
    .max(500, '購入品目は500文字以内で入力してください'),
  amount: z.number().min(0, '金額は0以上で入力してください'),
  note: z
    .string()
    .max(1000, '備考は1000文字以内で入力してください')
    .nullable()
    .optional(),
})
export type OtherExpenseActualFormValues = z.infer<
  typeof otherExpenseActualFormSchema
>

/**
 * AI利用費メンバー配分の一律設定フォームのバリデーションスキーマ
 * （月間設定額・バッファ額を対象メンバー全員へ一括適用する）
 */
export const aiUsageMemberAllocationFormSchema = z.object({
  monthlyBudget: z.number().min(0, '月あたりの予算は0以上で入力してください'),
  bufferAmount: z.number().min(0, 'バッファ額は0以上で入力してください'),
})
export type AiUsageMemberAllocationFormValues = z.infer<
  typeof aiUsageMemberAllocationFormSchema
>

/**
 * AI利用費プロバイダ（Anthropic/OpenAI/Microsoft等）の追加・編集フォームのバリデーションスキーマ
 *
 */
export const aiUsageProviderFormSchema = z.object({
  name: z
    .string()
    .min(1, 'プロバイダ名は必須です')
    .max(100, 'プロバイダ名は100文字以内で入力してください'),
  plan: z
    .string()
    .max(100, 'グレード・プランは100文字以内で入力してください')
    .nullable()
    .optional(),
})
export type AiUsageProviderFormValues = z.infer<
  typeof aiUsageProviderFormSchema
>

/**
 * スキル評価記録フォームのバリデーションスキーマ。beforeLevelはフォーム入力対象ではなく、
 * 送信直前に現在レベル（getCurrentLevel、未評価の場合は'none'）から導出して渡す
 */
export const skillEvaluationFormSchema = z.object({
  techTagId: z.string().uuid('技術タグを選択してください'),
  evaluatorType: z.enum(['self', 'manager']),
  afterLevel: z.enum(SKILL_LEVELS),
  evaluatedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '評価日を入力してください'),
  note: z
    .string()
    .max(500, '備考は500文字以内で入力してください')
    .nullable()
    .optional(),
})
export type SkillEvaluationFormValues = z.infer<
  typeof skillEvaluationFormSchema
>

/**
 * 成長ロードマップ目標設定フォームのバリデーションスキーマ
 */
export const skillRoadmapGoalFormSchema = z.object({
  techTagId: z.string().uuid('技術タグを選択してください'),
  targetLevel: z.enum(SKILL_LEVELS),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}$/, '達成予定時期（YYYY-MM）を入力してください'),
  note: z
    .string()
    .max(500, '備考は500文字以内で入力してください')
    .nullable()
    .optional(),
})
export type SkillRoadmapGoalFormValues = z.infer<
  typeof skillRoadmapGoalFormSchema
>

/**
 * 案件×週次進捗率入力フォームのバリデーションスキーマ（EVM機能のEV算出に使用）。
 * progressRateは0〜100の割合（%）で入力を受け、送信時に0.0〜1.0へ変換する
 */
export const projectProgressFormSchema = z.object({
  projectId: z.string().uuid('プロジェクトを選択してください'),
  weekKey: z
    .string()
    .regex(/^\d{4}-W\d{2}$/, '有効なISO週番号（YYYY-Www）を指定してください'),
  progressRate: z
    .number()
    .min(0, '進捗率は0以上で入力してください')
    .max(100, '進捗率は100以下で入力してください'),
})
export type ProjectProgressFormValues = z.infer<
  typeof projectProgressFormSchema
>

/**
 * ログインフォームのバリデーションスキーマ（postgresモードのみ使用）
 */
export const loginFormSchema = z.object({
  email: z
    .string()
    .min(1, 'メールアドレスを入力してください')
    .email('有効なメールアドレスを入力してください'),
  password: z.string().min(1, 'パスワードを入力してください'),
})
export type LoginFormValues = z.infer<typeof loginFormSchema>

/**
 * ユーザー追加フォームのバリデーションスキーマ（postgresモード、admin限定の
 * ユーザー管理画面で使用。サーバー側server/src/routes/users.tsのバリデーションと一致させる）
 */
export const createUserFormSchema = z.object({
  email: z
    .string()
    .min(1, 'メールアドレスを入力してください')
    .email('有効なメールアドレスを入力してください'),
  name: z
    .string()
    .min(1, '氏名を入力してください')
    .max(100, '氏名は100文字以内で入力してください'),
  password: z.string().min(8, 'パスワードは8文字以上にしてください'),
  role: z.enum(['admin', 'manager', 'editor', 'viewer', 'partner'], {
    message: 'ロールを選択してください',
  }),
})
export type CreateUserFormValues = z.infer<typeof createUserFormSchema>

/**
 * 通知チャンネル追加・編集フォームのバリデーションスキーマ（postgresモード、admin限定の
 * 通知設定画面で使用。Phase 3 Phase B）。
 * webhookUrl/apiTokenは書き込み専用シークレットのため、編集時の空文字は「変更なし」を
 * 意味する（必須にしない。接続設定の妥当性はテスト送信で確認する運用）
 */
export const notificationChannelFormSchema = z.object({
  name: z
    .string()
    .min(1, 'チャンネル名を入力してください')
    .max(100, 'チャンネル名は100文字以内で入力してください'),
  provider: z.enum(
    ['slack', 'teams', 'google_chat', 'discord', 'chatwork', 'generic'],
    { message: '送信先の種類を選択してください' },
  ),
  webhookUrl: z
    .string()
    .max(2000, 'URLは2000文字以内で入力してください')
    .url('有効なURLを入力してください')
    .or(z.literal('')),
  apiToken: z.string().max(500, 'APIトークンは500文字以内で入力してください'),
  roomId: z.string().max(100, 'ルームIDは100文字以内で入力してください'),
  enabled: z.boolean(),
  minSeverity: z.enum(['critical', 'warning', 'info']),
  notifyEvents: z.boolean(),
  notifyDigest: z.boolean(),
})
export type NotificationChannelFormValues = z.infer<
  typeof notificationChannelFormSchema
>

/**
 * JSONインポートのバリデーション
 */
export function validateJsonImport(jsonString: string): {
  isValid: boolean
  error?: string
} {
  try {
    JSON.parse(jsonString)
    return { isValid: true }
  } catch {
    return { isValid: false, error: '無効なJSONフォーマットです' }
  }
}
