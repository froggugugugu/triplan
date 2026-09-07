import { z } from 'zod'

/**
 * 見積スナップショット（非公開の設計文書）。
 *
 * WBSを切る前の段階（引合・確度低）から完了後の振り返りまで、**見積そのものの履歴**を
 * 案件×版で残す追記専用エンティティ。`ProjectBaseline`（EVMのPV基準線。アサイン計画が
 * 無いと凍結できない）とは別物で、段階・方法・根拠（FP項目／WBSの要約）・当時の設定値を
 * 自己完結で凍結する。設定値を後から変えても保存済みの版の数字は動かない。
 */

/**
 * 見積の段階（不確実性コーン。Boehm 1981 / McConnell 2006 の6段階）。
 * 幅（実績÷見積の範囲）は`shared/utils/uncertainty-cone.ts`の定数表から都度導出し、保存しない。
 */
export const ESTIMATE_STAGES = [
  'initial_concept',
  'product_definition',
  'requirements_complete',
  'ui_design_complete',
  'detailed_design_complete',
  'completed',
] as const
export const EstimateStageSchema = z.enum(ESTIMATE_STAGES)
export type EstimateStage = z.infer<typeof EstimateStageSchema>

/** 見積の方法。`actual`は完了時の実績記録（`stage='completed'`のみ許可） */
export const ESTIMATE_METHODS = [
  'function_point',
  'wbs',
  'manual',
  'actual',
] as const
export const EstimateMethodSchema = z.enum(ESTIMATE_METHODS)
export type EstimateMethod = z.infer<typeof EstimateMethodSchema>

/** 簡易FPの方法（NESMA）。複雑度は評価せず固定重みの未調整FP */
export const FP_METHODS = ['nesma_indicative', 'nesma_estimated'] as const
export const FpMethodSchema = z.enum(FP_METHODS)
export type FpMethod = z.infer<typeof FpMethodSchema>

/** FPの機能種別。概算法はILF/EIFのみ、推定法は5種すべてを数える */
export const FP_ITEM_TYPES = ['EI', 'EO', 'EQ', 'ILF', 'EIF'] as const
export const FpItemTypeSchema = z.enum(FP_ITEM_TYPES)
export type FpItemType = z.infer<typeof FpItemTypeSchema>

export const FpItemSchema = z.object({
  name: z.string().min(1).max(200),
  type: FpItemTypeSchema,
  count: z.number().int().min(1),
  note: z.string().max(500).optional(),
})
export type FpItem = z.infer<typeof FpItemSchema>

/**
 * 記録時点の設定値の凍結。`hoursPerFunctionPoint`（人時/FP）はFP法のときのみ必須。
 */
export const EstimateBasisSchema = z.object({
  estimatedUnitPrice: z.number().min(0),
  coefficient: z.number().gt(0),
  workdaysPerMonth: z.number().gt(0),
  hoursPerDay: z.number().gt(0),
  hoursPerFunctionPoint: z.number().gt(0).optional(),
})
export type EstimateBasis = z.infer<typeof EstimateBasisSchema>

/** FP法の根拠。`totalFp`は導出値だが、重み表が将来変わっても当時の値を保つため保存する */
export const EstimateFpDetailSchema = z.object({
  method: FpMethodSchema,
  items: z.array(FpItemSchema),
  totalFp: z.number().int().min(0),
})
export type EstimateFpDetail = z.infer<typeof EstimateFpDetailSchema>

/** WBS法の根拠（何タスクで積んだかの要約） */
export const EstimateWbsDetailSchema = z.object({
  leafCount: z.number().int().min(0),
  totalEffortDays: z.number().min(0),
})
export type EstimateWbsDetail = z.infer<typeof EstimateWbsDetailSchema>

/** 整合検証（superRefine）前の素のフィールド定義。サーバーの部分更新スキーマ等、`.partial()`が要る場面で使う */
export const EstimateSnapshotFieldsSchema = z.object({
  id: z.string().uuid(),
  /** トップレベル案件（`level===0`）。案件削除でカスケード削除 */
  projectId: z.string().uuid(),
  /** 案件内の連番（1=最初の記録）。凍結のたびに最大値+1で採番 */
  version: z.number().int().min(1),
  stage: EstimateStageSchema,
  method: EstimateMethodSchema,
  label: z.string().min(1).max(100),
  takenAt: z.string().datetime(),
  /** 工数（人日、小数2桁） */
  effortDays: z.number().min(0),
  /** 金額（万円、整数） */
  amount: z.number().min(0),
  basis: EstimateBasisSchema,
  /** `method='function_point'`のときのみ */
  fp: EstimateFpDetailSchema.nullable().optional(),
  /** `method='wbs'`のときのみ */
  wbs: EstimateWbsDetailSchema.nullable().optional(),
  /** 変更起因の改定なら紐づける（弱参照。CR削除後も版は残る） */
  changeRequestId: z.string().uuid().nullable(),
  note: z.string().max(1000).nullable().optional(),
  /** postgresモードはサーバーが`req.user`からスタンプ。localモードはnull */
  authorName: z.string().max(100).nullable(),
  createdAt: z.string().datetime(),
})

type EstimateSnapshotShape = z.infer<typeof EstimateSnapshotFieldsSchema>

/** 方法と根拠・段階の整合を検証する（Create／完全形の両方で共用） */
function refineEstimateSnapshot(
  value: Omit<EstimateSnapshotShape, 'id'>,
  ctx: z.RefinementCtx,
): void {
  const fp = value.fp ?? undefined
  const wbs = value.wbs ?? undefined
  if (value.method === 'function_point' && !fp) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fp'],
      message: 'FP法ではFP項目が必要です',
    })
  }
  if (value.method !== 'function_point' && fp) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fp'],
      message: 'FP項目はFP法のときだけ記録できます',
    })
  }
  if (value.method === 'wbs' && !wbs) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['wbs'],
      message: 'WBS法ではWBSの要約が必要です',
    })
  }
  if (value.method !== 'wbs' && wbs) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['wbs'],
      message: 'WBSの要約はWBS法のときだけ記録できます',
    })
  }
  if (value.method === 'actual' && value.stage !== 'completed') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['stage'],
      message: '実績の記録は「完了」段階でのみ行えます',
    })
  }
  if (fp) {
    if (
      fp.method === 'nesma_indicative' &&
      fp.items.some((item) => item.type !== 'ILF' && item.type !== 'EIF')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fp', 'items'],
        message:
          '概算法ではILF・EIFのみ数えます（EI・EO・EQは推定法で数えます）',
      })
    }
    if (value.basis.hoursPerFunctionPoint === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['basis', 'hoursPerFunctionPoint'],
        message: 'FP法では人時/FPを記録してください',
      })
    }
  }
}

export const EstimateSnapshotSchema = EstimateSnapshotFieldsSchema.superRefine(
  refineEstimateSnapshot,
)
export type EstimateSnapshot = z.infer<typeof EstimateSnapshotSchema>

/** 追記専用のため`id`のみ除外（`createdAt`は履歴の追跡性のため呼び出し側が持つ） */
export const CreateEstimateSnapshotSchema = EstimateSnapshotFieldsSchema.omit({
  id: true,
}).superRefine(refineEstimateSnapshot)
export type CreateEstimateSnapshot = z.infer<
  typeof CreateEstimateSnapshotSchema
>
