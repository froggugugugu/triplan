import { create } from 'zustand'
import {
  ApiError,
  type AppSettingsData,
  getDataAdapter,
} from '@/infrastructure/adapters'
import { toast } from '@/shared/hooks/use-toast'
import type {
  AiUsageEntry,
  AiUsageMemberAllocation,
  AiUsageProvider,
  BudgetAdjustment,
  BudgetBreakdown,
  BudgetBreakdownActualRecord,
  CreateBudgetAdjustment,
  CreateBudgetBreakdown,
  CreateSaasContract,
  DivisionBudget,
  ExchangeRateEntry,
  SaasContract,
  UpdateBudgetBreakdown,
  UpdateSaasContract,
} from '@/shared/types/budget'
import {
  calcDivisionExpectedRevenue,
  calcDivisionProperExpectedRevenue,
  calcProjectEstimateBudget,
  calcSaasContractsTotalCost,
  convertUsdToManYen,
  getApplicableExchangeRate,
  HOURS_PER_DAY,
  HOURS_PER_FUNCTION_POINT,
  sumAcrossDivisions,
  WORKDAYS_PER_MONTH,
} from '@/shared/utils/budget-utils'
import { computeProjectTotalEffort } from '@/shared/utils/effort-utils'
import {
  BASELINE_STALE_THRESHOLD,
  SUMMARY_BUDGET_PROGRESS_GAP_THRESHOLD,
  SUMMARY_SPI_WARNING_THRESHOLD,
} from '@/shared/utils/evm-utils'
import { SKILL_REVIEW_CYCLE_MONTHS } from '@/shared/utils/skill-utils'
import { useAssignmentStore } from './assignment-store'
import { useCompaniesStore } from './companies-store'
import { useEffortsStore } from './efforts-store'
import { useMembersStore } from './members-store'
import {
  describeSaveFailure,
  isConflictError,
  isForbiddenError,
  isStorageQuotaError,
} from './persistence-error'
import { usePersonnelPlanStore } from './personnel-plan-store'
import { useProjectsStore } from './projects-store'
import { useTeamStore } from './team-store'
import { useWbsSettingsStore } from './wbs-settings-store'

interface BudgetOverview {
  projectPersonnelTotal: number
  projectExpenseTotal: number
  generalExpenseTotal: number
  aiUsageBudgetTotal: number
  saasCostTotal: number
  personnelPlanBudgetTotal: number
  // 担当部門（Project.divisionId）一致・トップレベル案件のWBS概算予算額合計。
  // BudgetBreakdown.projectIdで既に手動計上済みの案件は二重計上を避けるため除外する
  // 。DivisionBudget.initialAmountの自動計算には含めない、
  // 俯瞰表示専用の集計値（personnelPlanBudgetTotalと同じ既存パターン）
  projectWbsEstimateTotal: number
  grandTotal: number
}

interface BudgetState {
  divisionBudgets: DivisionBudget[]
  budgetAdjustments: BudgetAdjustment[]
  budgetBreakdowns: BudgetBreakdown[]
  aiUsageEntries: AiUsageEntry[]
  aiUsageMemberAllocations: AiUsageMemberAllocation[]
  // AI利用費プロバイダマスタ（部門ごとのAnthropic/OpenAI/Microsoft等の契約）
  aiUsageProviders: AiUsageProvider[]
  saasContracts: SaasContract[]
  // 概算単価（万円、全社共通・単一値）。人員計画・案件タブの概算予算算出に使用する
  estimatedUnitPrice: number
  // 案件タブの係数デフォルト値（全社共通・単一値）
  defaultCoefficient: number
  // 案件別の係数（key: projectId、value: 係数）。未設定の案件はdefaultCoefficientを使用する
  projectCoefficients: Record<string, number>
  // 為替レート設定の履歴（1ドルあたりの円、全社共通）。requirements10
  exchangeRateHistory: ExchangeRateEntry[]
  // ── 業務定数の設定化（P0-a。既定値=従来のハードコード定数） ──
  // 人月換算の1人月あたり稼働日数（人日/人月、既定20=WORKDAYS_PER_MONTH）
  workdaysPerMonth: number
  // スキル定期評価レビューの周期（月、既定3=SKILL_REVIEW_CYCLE_MONTHS）
  skillReviewCycleMonths: number
  // ベースライン乖離の再凍結警告閾値（比率、既定0.1=BASELINE_STALE_THRESHOLD）
  baselineStaleThreshold: number
  // CSV取込の時間→人日換算（時間/人日、既定8=HOURS_PER_DAY。P1-a）
  hoursPerDay: number
  // 簡易FPの人時/FP（既定10=HOURS_PER_FUNCTION_POINT）
  hoursPerFunctionPoint: number
  // プロジェクトサマリーの判定閾値。R4 予算先行（比率、既定0.15=15pt）
  summaryBudgetProgressGapThreshold: number
  // R5 SPI低下（既定0.9）
  summarySpiWarningThreshold: number

  // Actions
  loadBudgetData: () => void

  // DivisionBudget（部門×年度で1レコード。登録・編集は同一アクションでupsertする）
  setInitialBudget: (
    divisionId: string,
    fiscalYear: number,
    initialAmount: number,
  ) => DivisionBudget
  // 内訳・AI利用費・SaaS契約を登録する前提として、部門×年度のレコードがなければ作成する
  getOrCreateDivisionBudget: (
    divisionId: string,
    fiscalYear: number,
  ) => DivisionBudget

  // BudgetAdjustment（追記専用。更新・削除アクションは設けない）
  addBudgetAdjustment: (data: CreateBudgetAdjustment) => BudgetAdjustment

  // BudgetBreakdown（案件予算の内訳）
  // 追加・更新・削除いずれも、紐づく DivisionBudget.initialAmount が自動再計算される
  addBudgetBreakdown: (data: CreateBudgetBreakdown) => BudgetBreakdown
  updateBudgetBreakdown: (data: UpdateBudgetBreakdown) => void
  deleteBudgetBreakdown: (id: string) => void

  // BudgetBreakdown の実績明細（購入日・品目・金額）。予算1:実績Nの構造。
  // DivisionBudget.initialAmount の自動再計算は行わない（実績は予算枠の変動要因ではない）
  addBudgetBreakdownActualRecord: (
    breakdownId: string,
    data: Omit<BudgetBreakdownActualRecord, 'id'>,
  ) => BudgetBreakdownActualRecord
  updateBudgetBreakdownActualRecord: (
    breakdownId: string,
    recordId: string,
    patch: Partial<Omit<BudgetBreakdownActualRecord, 'id'>>,
  ) => void
  deleteBudgetBreakdownActualRecord: (
    breakdownId: string,
    recordId: string,
  ) => void

  // 概算単価（全社共通・単一値）
  setEstimatedUnitPrice: (amount: number) => void

  // 案件タブの係数（全社共通デフォルト値・案件別上書き）
  setDefaultCoefficient: (amount: number) => void
  setProjectCoefficient: (projectId: string, coefficient: number) => void
  // 案件別の係数を取得する（未設定の場合はdefaultCoefficient、それも未設定なら1にフォールバック）
  getProjectCoefficient: (projectId: string) => number

  // 為替レート（1ドルあたりの円、全社共通）。設定時は「今月」を起点に履歴へ追記/更新する
  // （同月内の再設定は上書き、月をまたぐと新しい履歴エントリになり過去分は保持される）
  setExchangeRate: (rate: number) => void
  // 対象月に適用される為替レートを履歴から取得する（未設定の場合は0）
  getApplicableExchangeRate: (targetMonth: string) => number

  // 業務定数の設定（P0-a）。0以下等の不正値は呼び出し側（NumericInput/フォーム）で防ぐ前提
  setWorkdaysPerMonth: (days: number) => void
  setSkillReviewCycleMonths: (months: number) => void
  setBaselineStaleThreshold: (ratio: number) => void
  setHoursPerDay: (hours: number) => void
  setHoursPerFunctionPoint: (hours: number) => void
  setSummaryBudgetProgressGapThreshold: (ratio: number) => void
  setSummarySpiWarningThreshold: (value: number) => void

  // AiUsageEntry（部門×年度×月×課×プロバイダで1レコード。予算額と実績額を個別に更新する）
  // sectionIdを省略/nullにすると部門全体レベルのレコードを対象とする
  // providerIdを省略/nullにすると「プロバイダ未分類」のレコードを対象とする（単一枠運用の既定）
  // budgetAmount の変更は DivisionBudget.initialAmount の自動再計算対象
  setAiUsageBudget: (
    divisionId: string,
    fiscalYear: number,
    month: string,
    budgetAmount: number,
    sectionId?: string | null,
    providerId?: string | null,
  ) => void
  setAiUsageActual: (
    divisionId: string,
    fiscalYear: number,
    month: string,
    actualAmount: number | null,
    sectionId?: string | null,
    providerId?: string | null,
  ) => void

  // AiUsageProvider（部門ごとのAIプロバイダ・グレード/プランのマスタ）
  addAiUsageProvider: (
    divisionId: string,
    name: string,
    plan?: string | null,
  ) => AiUsageProvider
  updateAiUsageProvider: (
    id: string,
    name: string,
    plan?: string | null,
  ) => void
  // 紐づくAiUsageEntry（providerId一致）も併せて削除し、削除部門のDivisionBudget.initialAmountを再計算する
  deleteAiUsageProvider: (id: string) => void

  // AiUsageMemberAllocation（部門×年度×月×メンバー×プロバイダで1レコード。AiUsageEntryとは
  // 直交する別軸）。providerId省略/nullはプロバイダ未分類
  // 対象メンバー分のレコード存在を保証する（既存値は上書きしない）
  getOrCreateAiUsageMemberAllocations: (
    divisionId: string,
    fiscalYear: number,
    month: string,
    memberIds: string[],
    providerId?: string | null,
  ) => AiUsageMemberAllocation[]
  setAiUsageMemberAllocation: (
    id: string,
    patch: Partial<
      Pick<
        AiUsageMemberAllocation,
        'monthlyBudget' | 'bufferAmount' | 'actualAmount' | 'bufferActualAmount'
      >
    >,
  ) => void
  // 一律設定: 対象月のメンバーの月間設定額/バッファ額を一括上書きする。
  // memberIds省略時は部門内全メンバーが対象。指定時はそのメンバーのみに絞り込む
  // （選択中の課に絞り込んだ一律設定に対応するため）。
  // providerId省略時はプロバイダ未分類の配分のみが対象
  bulkSetAiUsageMemberMonthlyBudget: (
    divisionId: string,
    fiscalYear: number,
    month: string,
    amount: number,
    memberIds?: string[],
    providerId?: string | null,
  ) => void
  bulkSetAiUsageMemberBufferAmount: (
    divisionId: string,
    fiscalYear: number,
    month: string,
    amount: number,
    memberIds?: string[],
    providerId?: string | null,
  ) => void

  // BudgetBreakdown の月次実績（追記専用原則の限定的例外。AiUsageEntry.actualAmountと同じ考え方）
  // DivisionBudget.initialAmount の自動再計算は行わない。amount=nullで当該月のキーを削除し「未記録」に戻す
  setBudgetBreakdownActual: (
    id: string,
    month: string,
    amount: number | null,
  ) => void

  // SaasContract CRUD（変更は DivisionBudget.initialAmount の自動再計算対象）
  addSaasContract: (data: CreateSaasContract) => SaasContract
  updateSaasContract: (data: UpdateSaasContract) => void
  deleteSaasContract: (id: string) => void
  // SaasContract の月次実績（追記専用原則の限定的例外。amountHistoryとは独立）
  // DivisionBudget.initialAmount の自動再計算は行わない。amount=nullで当該月のキーを削除し「未記録」に戻す
  setSaasContractActual: (
    id: string,
    month: string,
    amount: number | null,
  ) => void

  // Selectors
  getDivisionBudget: (
    divisionId: string,
    fiscalYear: number,
  ) => DivisionBudget | undefined
  getAdjustmentsByBudget: (budgetId: string) => BudgetAdjustment[]
  getBreakdownsByBudget: (budgetId: string) => BudgetBreakdown[]
  getDivisionBudgetTotal: (divisionId: string, fiscalYear: number) => number
  getAiUsageEntries: (divisionId: string, fiscalYear: number) => AiUsageEntry[]
  getAiUsageTotal: (divisionId: string, fiscalYear: number) => number
  getAiUsageBudgetTotal: (divisionId: string, fiscalYear: number) => number
  // 部門×課（sectionId省略/nullは部門全体レベル）×年度のAI利用費エントリを取得する
  getAiUsageEntriesBySection: (
    divisionId: string,
    sectionId: string | null | undefined,
    fiscalYear: number,
  ) => AiUsageEntry[]
  // 部門×課×年度×月の予算額を取得する（未登録の場合は0）。providerId省略時は
  // 全プロバイダ横断で合算、指定時（nullも含む）はそのプロバイダのみに絞り込む
  // （他のproviderId対応関数と異なり「省略＝フィルタなし」である点に注意）
  getAiUsageBudgetAmountForMonth: (
    divisionId: string,
    sectionId: string | null | undefined,
    fiscalYear: number,
    month: string,
    providerId?: string | null,
  ) => number
  // 部門のAI利用費プロバイダ一覧をsortOrder昇順で取得する
  getAiUsageProvidersByDivision: (divisionId: string) => AiUsageProvider[]
  getSaasContractsByDivision: (divisionId: string) => SaasContract[]
  getSaasAnnualCostTotal: (divisionId: string) => number
  // providerId省略時はプロバイダ未分類の配分のみを返す
  getAiUsageMemberAllocationsByMonth: (
    divisionId: string,
    fiscalYear: number,
    month: string,
    providerId?: string | null,
  ) => AiUsageMemberAllocation[]
  getPersonnelCost: (
    divisionId: string,
    fiscalYear: number,
    startMonth: number,
  ) => number
  getProperPersonnelCost: (
    divisionId: string,
    fiscalYear: number,
    startMonth: number,
  ) => number
  getEstimatedUnitPrice: () => number
  // 部門予算タブの俯瞰集計（案件予算・その他費用・AI利用費・SaaS費用・人件費予算・総合計）
  getBudgetOverview: (divisionId: string, fiscalYear: number) => BudgetOverview

  // 全部門集計（FR-020）。既存の単一部門セレクタを部門ID配列で
  // ループ集計する薄いラッパー。既存セレクタのシグネチャ・ロジックは変更しない
  getAiUsageTotalForDivisions: (
    divisionIds: string[],
    fiscalYear: number,
  ) => number
  getAiUsageBudgetTotalForDivisions: (
    divisionIds: string[],
    fiscalYear: number,
  ) => number
  getSaasAnnualCostTotalForDivisions: (divisionIds: string[]) => number
  getBudgetOverviewForDivisions: (
    divisionIds: string[],
    fiscalYear: number,
  ) => BudgetOverview
}

function notifyPersistenceFailure(action: string, error: unknown) {
  toast({
    // 楽観ロックの競合（412）は障害ではなく並行編集の結果なので、
    // 「失敗」ではなく再読込を促す文言にする
    title: isConflictError(error)
      ? '他のユーザーが先に更新しました'
      : isStorageQuotaError(error)
        ? 'ブラウザの保存容量が上限です'
        : `予算情報の${action}に失敗しました`,
    description: describeSaveFailure(
      error,
      error instanceof Error ? error.message : undefined,
    ),
    variant: 'destructive',
  })
}

// postgresモードのON DELETE CASCADEにより、親エンティティの削除が先に処理されると
// 子エンティティの個別remove()が404になりうる（Promise.allは処理順序を保証しない、
// projects-store.ts/team-store.tsと同じ実Postgresで反証済みのパターン）。「対象が
// 既に存在しない」は削除の目的を既に満たしているため404はエラー扱いしない
function tolerate404(error: unknown): void {
  if (error instanceof ApiError && error.status === 404) return
  throw error
}

// divisionBudgets配列のうち、再計算によって実際に値が変わったレコードのみを
// DataAdapter.bulkUpdate()で永続化する（参照同一性で差分判定、recalcDivisionBudgetsForDivision/
// recalcAllDivisionBudgetsは変更の無いレコードを同一参照のまま返す設計のため成立する）
function persistChangedDivisionBudgets(
  previous: DivisionBudget[],
  next: DivisionBudget[],
): Promise<unknown> {
  const prevMap = new Map(previous.map((b) => [b.id, b]))
  const changed = next.filter((b) => prevMap.get(b.id) !== b)
  if (changed.length === 0) return Promise.resolve()
  return getDataAdapter().bulkUpdate(
    'divisionBudgets',
    changed.map((b) => ({
      id: b.id,
      patch: { initialAmount: b.initialAmount, updatedAt: b.updatedAt },
    })),
  )
}

// 全社共通の単一設定値（appSettings）はEntityMap非対象（entity-registry.tsの設計判断:
// 「list/create/update/removeというレコード単位CRUDの形に馴染まない」）のため、
// DataAdapterの専用メソッド（loadAppSettings/updateAppSettings）で読み書きする
// （P0-b。postgresモード未対応だった既知ギャップの解消）。
// updateAppSettingsは指定キーのみのフィールド単位パッチのため、未ロードのまま保存しても
// 他フィールドを消さない（旧persistSettingsFieldsの全体上書き方式が抱えていた
// 「Layoutマウント時にloadBudgetData()必須」という事故前提そのものを解消）。
// 失敗時は呼び出し側が渡すrollbackで楽観的更新を巻き戻す
function persistAppSettings(patch: AppSettingsData, rollback: () => void) {
  getDataAdapter()
    .updateAppSettings(patch)
    .catch((error: unknown) => {
      rollback()
      notifyPersistenceFailure('システム設定の保存', error)
    })
}

/**
 * AiUsageMemberAllocation（メンバー別配分）のactualAmount/bufferActualAmount変更を、
 * 部門全体・プロバイダ未分類（sectionId=null, providerId=null）のAiUsageEntry.actualAmountへ
 * 同期する。AiUsageGrid（features/budget）の「割当合計」「バッファ割当合計」行はメンバー配分の
 * 当該月合計を表示専用で参照するため（AiUsageEntry.actualAmountの直接編集UIは廃止済み）、
 * 年度末着地予測（calcYearEndForecast）等、既存にAiUsageEntry.actualAmountを参照する
 * 機能との整合性を保つために自動同期する。同期値は「割当＋バッファ割当」の合計（実際の
 * 消化額）とする（actualAmountを個人予算分/バッファ分に分割したため）。
 *
 * でAiUsageMemberAllocationにproviderId軸を追加したが、同期先はあえて
 * プロバイダ非依存のまま維持する（メンバー配分のproviderIdに関わらず、常にproviderId=nullの
 * 集計バケツへ書き込む）。プロバイダ別の「実績額」（AiUsageGridの手動入力欄）は
 * `setAiUsageActual`経由の独立した手動入力に限定するという既存の設計判断
 * （data-model.md参照。メンバー配分とプロバイダ別実績額は別々の実績追跡経路）を崩さないため。
 * 同期先をプロバイダ単位に分けてしまうと、同一プロバイダに対して「手動入力した実績額」と
 * 「メンバー配分由来の自動集計」が別レコードとして両方存在しうるようになり、部門合計セレクタ
 * （sectionId/providerIdを問わずdivisionId単位でロールアップする）で二重計上される。
 * メンバー別配分はsectionIdを持たない（課はメンバー本人の所属を通じてのみ判定できる粒度）
 * ため、同期先は常にsectionId=nullのエントリとする（課別エントリの直接手入力actualAmountは
 * 対象外・従来通り）。
 */
function syncAiUsageActualForDivisionMonth(
  state: Pick<BudgetState, 'aiUsageMemberAllocations' | 'aiUsageEntries'>,
  divisionId: string,
  fiscalYear: number,
  month: string,
): AiUsageEntry[] {
  const actualTotal = state.aiUsageMemberAllocations
    .filter(
      (a) =>
        a.divisionId === divisionId &&
        a.fiscalYear === fiscalYear &&
        a.month === month,
    )
    .reduce((sum, a) => sum + a.actualAmount + (a.bufferActualAmount ?? 0), 0)

  const existing = state.aiUsageEntries.find(
    (e) =>
      e.divisionId === divisionId &&
      e.fiscalYear === fiscalYear &&
      e.month === month &&
      (e.sectionId ?? null) === null &&
      (e.providerId ?? null) === null,
  )
  if (existing) {
    return state.aiUsageEntries.map((e) =>
      e.id === existing.id ? { ...e, actualAmount: actualTotal } : e,
    )
  }
  return [
    ...state.aiUsageEntries,
    {
      id: crypto.randomUUID(),
      divisionId,
      sectionId: null,
      providerId: null,
      fiscalYear,
      month,
      budgetAmount: 0,
      actualAmount: actualTotal,
    },
  ]
}

/**
 * ＄建てのAiUsageEntry一覧を、各エントリの対象月に有効な為替レートで万円に換算して合算する
 * （requirements10）。エントリごとにmonthが異なるため、レートも月ごとに引き直す。
 */
function sumAiUsageAmountInManYen(
  entries: AiUsageEntry[],
  exchangeRateHistory: ExchangeRateEntry[],
  pickAmount: (entry: AiUsageEntry) => number | null,
): number {
  return entries.reduce((sum, e) => {
    const amount = pickAmount(e)
    if (amount === null) return sum
    const rate = getApplicableExchangeRate(exchangeRateHistory, e.month)
    return sum + convertUsdToManYen(amount, rate)
  }, 0)
}

/**
 * 部門×年度の「自動計算される初期予算額」を算出する
 * = 案件予算内訳の合計 + AI利用費（月次予算額、＄→万円換算後）の年間合計 + SaaS契約の年間コスト合計
 */
function calcAutoInitialAmount(
  divisionId: string,
  fiscalYear: number,
  budgetId: string,
  budgetBreakdowns: BudgetBreakdown[],
  aiUsageEntries: AiUsageEntry[],
  saasContracts: SaasContract[],
  exchangeRateHistory: ExchangeRateEntry[],
): number {
  const breakdownTotal = budgetBreakdowns
    .filter((b) => b.budgetId === budgetId)
    .reduce((sum, b) => sum + b.amount, 0)
  const aiUsageBudgetTotal = sumAiUsageAmountInManYen(
    aiUsageEntries.filter(
      (e) => e.divisionId === divisionId && e.fiscalYear === fiscalYear,
    ),
    exchangeRateHistory,
    (e) => e.budgetAmount,
  )
  const saasTotal = calcSaasContractsTotalCost(
    saasContracts.filter((c) => c.divisionId === divisionId),
  )
  return breakdownTotal + aiUsageBudgetTotal + saasTotal
}

/**
 * 指定部門に属する全年度の DivisionBudget.initialAmount を再計算する
 */
function recalcDivisionBudgetsForDivision(
  state: Pick<
    BudgetState,
    | 'divisionBudgets'
    | 'budgetBreakdowns'
    | 'aiUsageEntries'
    | 'saasContracts'
    | 'exchangeRateHistory'
  >,
  divisionId: string,
): DivisionBudget[] {
  const now = new Date().toISOString()
  return state.divisionBudgets.map((b) => {
    if (b.divisionId !== divisionId) return b
    const newInitialAmount = calcAutoInitialAmount(
      b.divisionId,
      b.fiscalYear,
      b.id,
      state.budgetBreakdowns,
      state.aiUsageEntries,
      state.saasContracts,
      state.exchangeRateHistory,
    )
    if (newInitialAmount === b.initialAmount) return b
    return { ...b, initialAmount: newInitialAmount, updatedAt: now }
  })
}

/**
 * 全部門のDivisionBudget.initialAmountを再計算する。為替レート変更はAI利用費（＄）を通じて
 * 全部門のinitialAmountに影響しうるため、setExchangeRate専用に用意する
 * （他の更新アクションは対象部門が1件に定まるためrecalcDivisionBudgetsForDivisionで十分）。
 */
function recalcAllDivisionBudgets(
  state: Pick<
    BudgetState,
    | 'divisionBudgets'
    | 'budgetBreakdowns'
    | 'aiUsageEntries'
    | 'saasContracts'
    | 'exchangeRateHistory'
  >,
): DivisionBudget[] {
  const divisionIds = new Set(state.divisionBudgets.map((b) => b.divisionId))
  let divisionBudgets = state.divisionBudgets
  for (const divisionId of divisionIds) {
    divisionBudgets = recalcDivisionBudgetsForDivision(
      { ...state, divisionBudgets },
      divisionId,
    )
  }
  return divisionBudgets
}

/** 現在の暦月キー（"YYYY-MM"）を返す */
function getCurrentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export const useBudgetStore = create<BudgetState>()((set, get) => ({
  divisionBudgets: [],
  budgetAdjustments: [],
  budgetBreakdowns: [],
  aiUsageEntries: [],
  aiUsageMemberAllocations: [],
  aiUsageProviders: [],
  saasContracts: [],
  estimatedUnitPrice: 0,
  defaultCoefficient: 1,
  projectCoefficients: {},
  exchangeRateHistory: [],
  workdaysPerMonth: WORKDAYS_PER_MONTH,
  skillReviewCycleMonths: SKILL_REVIEW_CYCLE_MONTHS,
  baselineStaleThreshold: BASELINE_STALE_THRESHOLD,
  hoursPerDay: HOURS_PER_DAY,
  hoursPerFunctionPoint: HOURS_PER_FUNCTION_POINT,
  summaryBudgetProgressGapThreshold: SUMMARY_BUDGET_PROGRESS_GAP_THRESHOLD,
  summarySpiWarningThreshold: SUMMARY_SPI_WARNING_THRESHOLD,

  loadBudgetData: () => {
    getDataAdapter()
      .loadAppSettings()
      .then((settings) =>
        set({
          estimatedUnitPrice: settings.estimatedUnitPrice ?? 0,
          defaultCoefficient: settings.defaultCoefficient ?? 1,
          projectCoefficients: settings.projectCoefficients ?? {},
          exchangeRateHistory: settings.exchangeRateHistory ?? [],
          workdaysPerMonth: settings.workdaysPerMonth ?? WORKDAYS_PER_MONTH,
          skillReviewCycleMonths:
            settings.skillReviewCycleMonths ?? SKILL_REVIEW_CYCLE_MONTHS,
          baselineStaleThreshold:
            settings.baselineStaleThreshold ?? BASELINE_STALE_THRESHOLD,
          hoursPerDay: settings.hoursPerDay ?? HOURS_PER_DAY,
          hoursPerFunctionPoint:
            settings.hoursPerFunctionPoint ?? HOURS_PER_FUNCTION_POINT,
          summaryBudgetProgressGapThreshold:
            settings.summaryBudgetProgressGapThreshold ??
            SUMMARY_BUDGET_PROGRESS_GAP_THRESHOLD,
          summarySpiWarningThreshold:
            settings.summarySpiWarningThreshold ??
            SUMMARY_SPI_WARNING_THRESHOLD,
        }),
      )
      .catch((error: unknown) => {
        // 権限が無いだけの読み込み失敗は通知しない
        if (isForbiddenError(error)) return
        notifyPersistenceFailure('読み込み', error)
      })

    getDataAdapter()
      .list('divisionBudgets')
      .then((divisionBudgets) => set({ divisionBudgets }))
      .catch((error: unknown) => {
        // 権限が無いだけの読み込み失敗は通知しない
        if (isForbiddenError(error)) return
        notifyPersistenceFailure('読み込み', error)
      })
    getDataAdapter()
      .list('budgetAdjustments')
      .then((budgetAdjustments) => set({ budgetAdjustments }))
      .catch((error: unknown) => {
        // 権限が無いだけの読み込み失敗は通知しない
        if (isForbiddenError(error)) return
        notifyPersistenceFailure('読み込み', error)
      })
    getDataAdapter()
      .list('budgetBreakdowns')
      .then((budgetBreakdowns) => set({ budgetBreakdowns }))
      .catch((error: unknown) => {
        // 権限が無いだけの読み込み失敗は通知しない
        if (isForbiddenError(error)) return
        notifyPersistenceFailure('読み込み', error)
      })
    getDataAdapter()
      .list('aiUsageEntries')
      .then((aiUsageEntries) => set({ aiUsageEntries }))
      .catch((error: unknown) => {
        // 権限が無いだけの読み込み失敗は通知しない
        if (isForbiddenError(error)) return
        notifyPersistenceFailure('読み込み', error)
      })
    getDataAdapter()
      .list('aiUsageMemberAllocations')
      .then((aiUsageMemberAllocations) => set({ aiUsageMemberAllocations }))
      .catch((error: unknown) => {
        // 権限が無いだけの読み込み失敗は通知しない
        if (isForbiddenError(error)) return
        notifyPersistenceFailure('読み込み', error)
      })
    getDataAdapter()
      .list('aiUsageProviders')
      .then((aiUsageProviders) => set({ aiUsageProviders }))
      .catch((error: unknown) => {
        // 権限が無いだけの読み込み失敗は通知しない
        if (isForbiddenError(error)) return
        notifyPersistenceFailure('読み込み', error)
      })
    getDataAdapter()
      .list('saasContracts')
      .then((saasContracts) => set({ saasContracts }))
      .catch((error: unknown) => {
        // 権限が無いだけの読み込み失敗は通知しない
        if (isForbiddenError(error)) return
        notifyPersistenceFailure('読み込み', error)
      })
  },

  // 直接上書き。UIからは使用せず、テストのセットアップ用に残している
  // （実運用の登録はgetOrCreateDivisionBudget＋内訳からの自動計算に委ねる）
  setInitialBudget: (divisionId, fiscalYear, initialAmount) => {
    const previous = get().divisionBudgets
    const now = new Date().toISOString()
    const existing = previous.find(
      (b) => b.divisionId === divisionId && b.fiscalYear === fiscalYear,
    )

    if (existing) {
      const result: DivisionBudget = {
        ...existing,
        initialAmount,
        updatedAt: now,
      }
      set({
        divisionBudgets: previous.map((b) =>
          b.id === existing.id ? result : b,
        ),
      })
      getDataAdapter()
        .update('divisionBudgets', existing.id, {
          initialAmount,
          updatedAt: now,
        })
        .catch((error: unknown) => {
          set({ divisionBudgets: previous })
          notifyPersistenceFailure('更新', error)
        })
      return result
    }

    const id = crypto.randomUUID()
    const result: DivisionBudget = {
      id,
      divisionId,
      fiscalYear,
      initialAmount,
      createdAt: now,
      updatedAt: now,
    }
    set({ divisionBudgets: [...previous, result] })
    getDataAdapter()
      .create(
        'divisionBudgets',
        {
          divisionId,
          fiscalYear,
          initialAmount,
          createdAt: now,
          updatedAt: now,
        },
        { id },
      )
      .then((created) => {
        set((state) => ({
          divisionBudgets: state.divisionBudgets.map((b) =>
            b.id === id ? created : b,
          ),
        }))
      })
      .catch((error: unknown) => {
        set((state) => ({
          divisionBudgets: state.divisionBudgets.filter((b) => b.id !== id),
        }))
        notifyPersistenceFailure('追加', error)
      })
    return result
  },

  getOrCreateDivisionBudget: (divisionId, fiscalYear) => {
    const existing = get().getDivisionBudget(divisionId, fiscalYear)
    if (existing) return existing

    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const newBudget: DivisionBudget = {
      id,
      divisionId,
      fiscalYear,
      initialAmount: 0,
      createdAt: now,
      updatedAt: now,
    }
    set((state) => ({
      divisionBudgets: [...state.divisionBudgets, newBudget],
    }))
    getDataAdapter()
      .create(
        'divisionBudgets',
        {
          divisionId,
          fiscalYear,
          initialAmount: 0,
          createdAt: now,
          updatedAt: now,
        },
        { id },
      )
      .then((created) => {
        set((state) => ({
          divisionBudgets: state.divisionBudgets.map((b) =>
            b.id === id ? created : b,
          ),
        }))
      })
      .catch((error: unknown) => {
        set((state) => ({
          divisionBudgets: state.divisionBudgets.filter((b) => b.id !== id),
        }))
        notifyPersistenceFailure('追加', error)
      })

    return newBudget
  },

  addBudgetAdjustment: (data) => {
    const previous = get().budgetAdjustments
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const newAdjustment: BudgetAdjustment = { ...data, id, createdAt: now }

    set({ budgetAdjustments: [...previous, newAdjustment] })
    getDataAdapter()
      .create('budgetAdjustments', { ...data, createdAt: now }, { id })
      .then((created) => {
        set((state) => ({
          budgetAdjustments: state.budgetAdjustments.map((a) =>
            a.id === id ? created : a,
          ),
        }))
      })
      .catch((error: unknown) => {
        set({ budgetAdjustments: previous })
        notifyPersistenceFailure('予算調整の追加', error)
      })

    return newAdjustment
  },

  addBudgetBreakdown: (data) => {
    const state = get()
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const newBreakdown: BudgetBreakdown = { ...data, id, createdAt: now }
    const newBreakdowns = [...state.budgetBreakdowns, newBreakdown]
    const budget = state.divisionBudgets.find((b) => b.id === data.budgetId)
    const newDivisionBudgets = budget
      ? recalcDivisionBudgetsForDivision(
          { ...state, budgetBreakdowns: newBreakdowns },
          budget.divisionId,
        )
      : state.divisionBudgets

    set({
      budgetBreakdowns: newBreakdowns,
      divisionBudgets: newDivisionBudgets,
    })
    Promise.all([
      getDataAdapter()
        .create('budgetBreakdowns', { ...data, createdAt: now }, { id })
        .then((created) => {
          set((s) => ({
            budgetBreakdowns: s.budgetBreakdowns.map((b) =>
              b.id === id ? created : b,
            ),
          }))
        }),
      persistChangedDivisionBudgets(state.divisionBudgets, newDivisionBudgets),
    ]).catch((error: unknown) => {
      set({
        budgetBreakdowns: state.budgetBreakdowns,
        divisionBudgets: state.divisionBudgets,
      })
      notifyPersistenceFailure('内訳の追加', error)
    })

    return newBreakdown
  },

  updateBudgetBreakdown: (data) => {
    const state = get()
    const before = state.budgetBreakdowns.find((b) => b.id === data.id)
    const newBudgetBreakdowns = state.budgetBreakdowns.map((b) =>
      b.id === data.id ? { ...b, ...data } : b,
    )
    const beforeDivisionId = state.divisionBudgets.find(
      (b) => b.id === before?.budgetId,
    )?.divisionId
    const afterDivisionId = state.divisionBudgets.find(
      (b) => b.id === (data.budgetId ?? before?.budgetId),
    )?.divisionId
    const affectedDivisionIds = new Set(
      [beforeDivisionId, afterDivisionId].filter(
        (v): v is string => v !== undefined,
      ),
    )
    let newDivisionBudgets = state.divisionBudgets
    for (const divisionId of affectedDivisionIds) {
      newDivisionBudgets = recalcDivisionBudgetsForDivision(
        {
          ...state,
          budgetBreakdowns: newBudgetBreakdowns,
          divisionBudgets: newDivisionBudgets,
        },
        divisionId,
      )
    }

    set({
      budgetBreakdowns: newBudgetBreakdowns,
      divisionBudgets: newDivisionBudgets,
    })
    const { id, ...patch } = data
    Promise.all([
      getDataAdapter().update('budgetBreakdowns', id, patch),
      persistChangedDivisionBudgets(state.divisionBudgets, newDivisionBudgets),
    ]).catch((error: unknown) => {
      set({
        budgetBreakdowns: state.budgetBreakdowns,
        divisionBudgets: state.divisionBudgets,
      })
      notifyPersistenceFailure('内訳の更新', error)
    })
  },

  deleteBudgetBreakdown: (id) => {
    const state = get()
    const target = state.budgetBreakdowns.find((b) => b.id === id)
    const newBudgetBreakdowns = state.budgetBreakdowns.filter(
      (b) => b.id !== id,
    )
    const budget = state.divisionBudgets.find((b) => b.id === target?.budgetId)
    const newDivisionBudgets = budget
      ? recalcDivisionBudgetsForDivision(
          { ...state, budgetBreakdowns: newBudgetBreakdowns },
          budget.divisionId,
        )
      : state.divisionBudgets

    set({
      budgetBreakdowns: newBudgetBreakdowns,
      divisionBudgets: newDivisionBudgets,
    })
    Promise.all([
      getDataAdapter().remove('budgetBreakdowns', id),
      persistChangedDivisionBudgets(state.divisionBudgets, newDivisionBudgets),
    ]).catch((error: unknown) => {
      set({
        budgetBreakdowns: state.budgetBreakdowns,
        divisionBudgets: state.divisionBudgets,
      })
      notifyPersistenceFailure('内訳の削除', error)
    })
  },

  addBudgetBreakdownActualRecord: (breakdownId, data) => {
    const previous = get().budgetBreakdowns
    const id = crypto.randomUUID()
    const newRecord: BudgetBreakdownActualRecord = { ...data, id }
    const target = previous.find((b) => b.id === breakdownId)
    const newActualRecords = [...(target?.actualRecords ?? []), newRecord]

    set({
      budgetBreakdowns: previous.map((b) =>
        b.id === breakdownId ? { ...b, actualRecords: newActualRecords } : b,
      ),
    })
    getDataAdapter()
      .update('budgetBreakdowns', breakdownId, {
        actualRecords: newActualRecords,
      })
      .catch((error: unknown) => {
        set({ budgetBreakdowns: previous })
        notifyPersistenceFailure('実績明細の追加', error)
      })

    return newRecord
  },

  updateBudgetBreakdownActualRecord: (breakdownId, recordId, patch) => {
    const previous = get().budgetBreakdowns
    const target = previous.find((b) => b.id === breakdownId)
    const newActualRecords = (target?.actualRecords ?? []).map((r) =>
      r.id === recordId ? { ...r, ...patch } : r,
    )

    set({
      budgetBreakdowns: previous.map((b) =>
        b.id === breakdownId ? { ...b, actualRecords: newActualRecords } : b,
      ),
    })
    getDataAdapter()
      .update('budgetBreakdowns', breakdownId, {
        actualRecords: newActualRecords,
      })
      .catch((error: unknown) => {
        set({ budgetBreakdowns: previous })
        notifyPersistenceFailure('実績明細の更新', error)
      })
  },

  deleteBudgetBreakdownActualRecord: (breakdownId, recordId) => {
    const previous = get().budgetBreakdowns
    const target = previous.find((b) => b.id === breakdownId)
    const newActualRecords = (target?.actualRecords ?? []).filter(
      (r) => r.id !== recordId,
    )

    set({
      budgetBreakdowns: previous.map((b) =>
        b.id === breakdownId ? { ...b, actualRecords: newActualRecords } : b,
      ),
    })
    getDataAdapter()
      .update('budgetBreakdowns', breakdownId, {
        actualRecords: newActualRecords,
      })
      .catch((error: unknown) => {
        set({ budgetBreakdowns: previous })
        notifyPersistenceFailure('実績明細の削除', error)
      })
  },

  setEstimatedUnitPrice: (amount) => {
    const previous = get().estimatedUnitPrice
    set({ estimatedUnitPrice: amount })
    persistAppSettings({ estimatedUnitPrice: amount }, () =>
      set({ estimatedUnitPrice: previous }),
    )
  },

  setDefaultCoefficient: (amount) => {
    const previous = get().defaultCoefficient
    set({ defaultCoefficient: amount })
    persistAppSettings({ defaultCoefficient: amount }, () =>
      set({ defaultCoefficient: previous }),
    )
  },

  setProjectCoefficient: (projectId, coefficient) => {
    const previous = get().projectCoefficients
    const next = { ...previous, [projectId]: coefficient }
    set({ projectCoefficients: next })
    persistAppSettings({ projectCoefficients: next }, () =>
      set({ projectCoefficients: previous }),
    )
  },

  getProjectCoefficient: (projectId) => {
    const { projectCoefficients, defaultCoefficient } = get()
    return projectCoefficients[projectId] ?? defaultCoefficient ?? 1
  },

  setExchangeRate: (rate) => {
    const state = get()
    const monthKey = getCurrentMonthKey()
    const existingIndex = state.exchangeRateHistory.findIndex(
      (e) => e.effectiveFrom === monthKey,
    )
    const newHistory =
      existingIndex >= 0
        ? state.exchangeRateHistory.map((e, i) =>
            i === existingIndex ? { ...e, rate } : e,
          )
        : [...state.exchangeRateHistory, { effectiveFrom: monthKey, rate }]

    // 為替レート変更はAI利用費（＄）を通じて全部門のinitialAmountに影響しうるため、
    // 対象部門を1件に絞らず全部門を再計算する
    const newDivisionBudgets = recalcAllDivisionBudgets({
      ...state,
      exchangeRateHistory: newHistory,
    })

    set({
      exchangeRateHistory: newHistory,
      divisionBudgets: newDivisionBudgets,
    })
    persistAppSettings({ exchangeRateHistory: newHistory }, () =>
      set({ exchangeRateHistory: state.exchangeRateHistory }),
    )
    persistChangedDivisionBudgets(
      state.divisionBudgets,
      newDivisionBudgets,
    ).catch((error: unknown) => {
      set({ divisionBudgets: state.divisionBudgets })
      notifyPersistenceFailure('為替レート変更に伴う予算再計算', error)
    })
  },

  getApplicableExchangeRate: (targetMonth) => {
    // 同名のインポート関数（shared/utils/budget-utils）に処理を委譲する
    return getApplicableExchangeRate(get().exchangeRateHistory, targetMonth)
  },

  setWorkdaysPerMonth: (days) => {
    const previous = get().workdaysPerMonth
    set({ workdaysPerMonth: days })
    persistAppSettings({ workdaysPerMonth: days }, () =>
      set({ workdaysPerMonth: previous }),
    )
  },

  setSkillReviewCycleMonths: (months) => {
    const previous = get().skillReviewCycleMonths
    set({ skillReviewCycleMonths: months })
    persistAppSettings({ skillReviewCycleMonths: months }, () =>
      set({ skillReviewCycleMonths: previous }),
    )
  },

  setBaselineStaleThreshold: (ratio) => {
    const previous = get().baselineStaleThreshold
    set({ baselineStaleThreshold: ratio })
    persistAppSettings({ baselineStaleThreshold: ratio }, () =>
      set({ baselineStaleThreshold: previous }),
    )
  },

  setHoursPerDay: (hours) => {
    const previous = get().hoursPerDay
    set({ hoursPerDay: hours })
    persistAppSettings({ hoursPerDay: hours }, () =>
      set({ hoursPerDay: previous }),
    )
  },

  setHoursPerFunctionPoint: (hours) => {
    const previous = get().hoursPerFunctionPoint
    set({ hoursPerFunctionPoint: hours })
    persistAppSettings({ hoursPerFunctionPoint: hours }, () =>
      set({ hoursPerFunctionPoint: previous }),
    )
  },

  setSummaryBudgetProgressGapThreshold: (ratio) => {
    const previous = get().summaryBudgetProgressGapThreshold
    set({ summaryBudgetProgressGapThreshold: ratio })
    persistAppSettings({ summaryBudgetProgressGapThreshold: ratio }, () =>
      set({ summaryBudgetProgressGapThreshold: previous }),
    )
  },

  setSummarySpiWarningThreshold: (value) => {
    const previous = get().summarySpiWarningThreshold
    set({ summarySpiWarningThreshold: value })
    persistAppSettings({ summarySpiWarningThreshold: value }, () =>
      set({ summarySpiWarningThreshold: previous }),
    )
  },

  setBudgetBreakdownActual: (id, month, amount) => {
    const previous = get().budgetBreakdowns
    const target = previous.find((b) => b.id === id)
    if (!target) return
    const monthlyActuals = { ...target.monthlyActuals }
    if (amount === null) {
      delete monthlyActuals[month]
    } else {
      monthlyActuals[month] = amount
    }

    set({
      budgetBreakdowns: previous.map((b) =>
        b.id === id ? { ...b, monthlyActuals } : b,
      ),
    })
    getDataAdapter()
      .update('budgetBreakdowns', id, { monthlyActuals })
      .catch((error: unknown) => {
        set({ budgetBreakdowns: previous })
        notifyPersistenceFailure('月次実績の更新', error)
      })
  },

  setAiUsageBudget: (
    divisionId,
    fiscalYear,
    month,
    budgetAmount,
    sectionId = null,
    providerId = null,
  ) => {
    const state = get()
    const existing = state.aiUsageEntries.find(
      (e) =>
        e.divisionId === divisionId &&
        e.fiscalYear === fiscalYear &&
        e.month === month &&
        (e.sectionId ?? null) === (sectionId ?? null) &&
        (e.providerId ?? null) === (providerId ?? null),
    )

    if (existing) {
      const newEntries = state.aiUsageEntries.map((e) =>
        e.id === existing.id ? { ...e, budgetAmount } : e,
      )
      const newDivisionBudgets = recalcDivisionBudgetsForDivision(
        { ...state, aiUsageEntries: newEntries },
        divisionId,
      )
      set({ aiUsageEntries: newEntries, divisionBudgets: newDivisionBudgets })
      Promise.all([
        getDataAdapter().update('aiUsageEntries', existing.id, {
          budgetAmount,
        }),
        persistChangedDivisionBudgets(
          state.divisionBudgets,
          newDivisionBudgets,
        ),
      ]).catch((error: unknown) => {
        set({
          aiUsageEntries: state.aiUsageEntries,
          divisionBudgets: state.divisionBudgets,
        })
        notifyPersistenceFailure('AI利用費予算の更新', error)
      })
      return
    }

    const id = crypto.randomUUID()
    const newEntry: AiUsageEntry = {
      id,
      divisionId,
      sectionId,
      providerId,
      fiscalYear,
      month,
      budgetAmount,
      actualAmount: null,
    }
    const newEntries = [...state.aiUsageEntries, newEntry]
    const newDivisionBudgets = recalcDivisionBudgetsForDivision(
      { ...state, aiUsageEntries: newEntries },
      divisionId,
    )
    set({ aiUsageEntries: newEntries, divisionBudgets: newDivisionBudgets })
    Promise.all([
      getDataAdapter()
        .create(
          'aiUsageEntries',
          {
            divisionId,
            sectionId,
            providerId,
            fiscalYear,
            month,
            budgetAmount,
            actualAmount: null,
          },
          { id },
        )
        .then((created) => {
          set((s) => ({
            aiUsageEntries: s.aiUsageEntries.map((e) =>
              e.id === id ? created : e,
            ),
          }))
        }),
      persistChangedDivisionBudgets(state.divisionBudgets, newDivisionBudgets),
    ]).catch((error: unknown) => {
      set({
        aiUsageEntries: state.aiUsageEntries,
        divisionBudgets: state.divisionBudgets,
      })
      notifyPersistenceFailure('AI利用費予算の追加', error)
    })
  },

  setAiUsageActual: (
    divisionId,
    fiscalYear,
    month,
    actualAmount,
    sectionId = null,
    providerId = null,
  ) => {
    const previous = get().aiUsageEntries
    const existing = previous.find(
      (e) =>
        e.divisionId === divisionId &&
        e.fiscalYear === fiscalYear &&
        e.month === month &&
        (e.sectionId ?? null) === (sectionId ?? null) &&
        (e.providerId ?? null) === (providerId ?? null),
    )

    // actualAmount は予算総額（initialAmount）に影響しないため再計算不要
    if (existing) {
      set({
        aiUsageEntries: previous.map((e) =>
          e.id === existing.id ? { ...e, actualAmount } : e,
        ),
      })
      getDataAdapter()
        .update('aiUsageEntries', existing.id, { actualAmount })
        .catch((error: unknown) => {
          set({ aiUsageEntries: previous })
          notifyPersistenceFailure('AI利用費実績の更新', error)
        })
      return
    }

    const id = crypto.randomUUID()
    const newEntry: AiUsageEntry = {
      id,
      divisionId,
      sectionId,
      providerId,
      fiscalYear,
      month,
      budgetAmount: 0,
      actualAmount,
    }
    set({ aiUsageEntries: [...previous, newEntry] })
    getDataAdapter()
      .create(
        'aiUsageEntries',
        {
          divisionId,
          sectionId,
          providerId,
          fiscalYear,
          month,
          budgetAmount: 0,
          actualAmount,
        },
        { id },
      )
      .then((created) => {
        set((s) => ({
          aiUsageEntries: s.aiUsageEntries.map((e) =>
            e.id === id ? created : e,
          ),
        }))
      })
      .catch((error: unknown) => {
        set((s) => ({
          aiUsageEntries: s.aiUsageEntries.filter((e) => e.id !== id),
        }))
        notifyPersistenceFailure('AI利用費実績の追加', error)
      })
  },

  addAiUsageProvider: (divisionId, name, plan = null) => {
    const state = get()
    const now = new Date().toISOString()
    const maxSortOrder = state.aiUsageProviders
      .filter((p) => p.divisionId === divisionId)
      .reduce((max, p) => Math.max(max, p.sortOrder), -1)
    const id = crypto.randomUUID()
    const newProvider: AiUsageProvider = {
      id,
      divisionId,
      name,
      plan,
      sortOrder: maxSortOrder + 1,
      createdAt: now,
      updatedAt: now,
    }
    set({ aiUsageProviders: [...state.aiUsageProviders, newProvider] })
    getDataAdapter()
      .create(
        'aiUsageProviders',
        {
          divisionId,
          name,
          plan,
          sortOrder: newProvider.sortOrder,
          createdAt: now,
          updatedAt: now,
        },
        { id },
      )
      .then((created) => {
        set((s) => ({
          aiUsageProviders: s.aiUsageProviders.map((p) =>
            p.id === id ? created : p,
          ),
        }))
      })
      .catch((error: unknown) => {
        set({ aiUsageProviders: state.aiUsageProviders })
        notifyPersistenceFailure('プロバイダの追加', error)
      })
    return newProvider
  },

  updateAiUsageProvider: (id, name, plan = null) => {
    const previous = get().aiUsageProviders
    const now = new Date().toISOString()
    set({
      aiUsageProviders: previous.map((p) =>
        p.id === id ? { ...p, name, plan, updatedAt: now } : p,
      ),
    })
    getDataAdapter()
      .update(
        'aiUsageProviders',
        id,
        { name, plan, updatedAt: now },
        // 楽観ロック
        { expectedUpdatedAt: previous.find((p) => p.id === id)?.updatedAt },
      )
      .then((saved) => {
        // サーバーが確定した行（特にサーバー時計のupdatedAt）をローカルへ反映する。
        // 反映しないと次回の楽観ロック期待値がクライアント時計のまま残り、
        // 単独ユーザーでも2回目の更新が必ず412になる
        set((state) => ({
          aiUsageProviders: state.aiUsageProviders.map((x) =>
            x.id === id ? saved : x,
          ),
        }))
      })
      .catch((error: unknown) => {
        set({ aiUsageProviders: previous })
        notifyPersistenceFailure('プロバイダの更新', error)
      })
  },

  deleteAiUsageProvider: (id) => {
    const state = get()
    const target = state.aiUsageProviders.find((p) => p.id === id)
    const newProviders = state.aiUsageProviders.filter((p) => p.id !== id)
    // 紐づくAiUsageEntry（providerId一致）も併せて削除する（月次予算・実績データごと削除）。
    // サーバー側はaiUsageEntries.providerId→aiUsageProviders.idがON DELETE CASCADEのため、
    // プロバイダ削除が先に処理されると個別remove()が404になりうる（tolerate404で対応）
    const relatedEntryIds = state.aiUsageEntries
      .filter((e) => (e.providerId ?? null) === id)
      .map((e) => e.id)
    const newEntries = state.aiUsageEntries.filter(
      (e) => (e.providerId ?? null) !== id,
    )
    const newDivisionBudgets = target
      ? recalcDivisionBudgetsForDivision(
          { ...state, aiUsageEntries: newEntries },
          target.divisionId,
        )
      : state.divisionBudgets

    set({
      aiUsageProviders: newProviders,
      aiUsageEntries: newEntries,
      divisionBudgets: newDivisionBudgets,
    })
    Promise.all([
      getDataAdapter().remove('aiUsageProviders', id).catch(tolerate404),
      ...relatedEntryIds.map((entryId) =>
        getDataAdapter().remove('aiUsageEntries', entryId).catch(tolerate404),
      ),
      persistChangedDivisionBudgets(state.divisionBudgets, newDivisionBudgets),
    ]).catch((error: unknown) => {
      set({
        aiUsageProviders: state.aiUsageProviders,
        aiUsageEntries: state.aiUsageEntries,
        divisionBudgets: state.divisionBudgets,
      })
      notifyPersistenceFailure('プロバイダの削除', error)
    })
  },

  getOrCreateAiUsageMemberAllocations: (
    divisionId,
    fiscalYear,
    month,
    memberIds,
    providerId = null,
  ) => {
    const state = get()
    const existing = state.aiUsageMemberAllocations.filter(
      (a) =>
        a.divisionId === divisionId &&
        a.fiscalYear === fiscalYear &&
        a.month === month &&
        (a.providerId ?? null) === (providerId ?? null),
    )
    const existingMemberIds = new Set(existing.map((a) => a.memberId))
    const missingMemberIds = memberIds.filter(
      (id) => !existingMemberIds.has(id),
    )

    if (missingMemberIds.length === 0) {
      return existing
    }

    const newAllocations: AiUsageMemberAllocation[] = missingMemberIds.map(
      (memberId) => ({
        id: crypto.randomUUID(),
        divisionId,
        fiscalYear,
        month,
        memberId,
        providerId,
        monthlyBudget: 0,
        bufferAmount: 0,
        actualAmount: 0,
        bufferActualAmount: 0,
      }),
    )

    set({
      aiUsageMemberAllocations: [
        ...state.aiUsageMemberAllocations,
        ...newAllocations,
      ],
    })
    Promise.all(
      newAllocations.map((a) =>
        getDataAdapter()
          .create(
            'aiUsageMemberAllocations',
            {
              divisionId: a.divisionId,
              fiscalYear: a.fiscalYear,
              month: a.month,
              memberId: a.memberId,
              providerId: a.providerId,
              monthlyBudget: a.monthlyBudget,
              bufferAmount: a.bufferAmount,
              actualAmount: a.actualAmount,
              bufferActualAmount: a.bufferActualAmount,
            },
            { id: a.id },
          )
          .then((created) => {
            set((s) => ({
              aiUsageMemberAllocations: s.aiUsageMemberAllocations.map((x) =>
                x.id === a.id ? created : x,
              ),
            }))
          }),
      ),
    ).catch((error: unknown) => {
      const newIds = new Set(newAllocations.map((a) => a.id))
      set((s) => ({
        aiUsageMemberAllocations: s.aiUsageMemberAllocations.filter(
          (a) => !newIds.has(a.id),
        ),
      }))
      notifyPersistenceFailure('メンバー配分の作成', error)
    })

    return [...existing, ...newAllocations]
  },

  setAiUsageMemberAllocation: (id, patch) => {
    const state = get()
    const target = state.aiUsageMemberAllocations.find((a) => a.id === id)
    if (!target) return
    const newAllocations = state.aiUsageMemberAllocations.map((a) =>
      a.id === id ? { ...a, ...patch } : a,
    )

    // actualAmount/bufferActualAmountの変更時のみ、部門全体・プロバイダ未分類のAiUsageEntry.actualAmountへ同期する
    if (
      patch.actualAmount === undefined &&
      patch.bufferActualAmount === undefined
    ) {
      set({ aiUsageMemberAllocations: newAllocations })
      getDataAdapter()
        .update('aiUsageMemberAllocations', id, patch)
        .catch((error: unknown) => {
          set({ aiUsageMemberAllocations: state.aiUsageMemberAllocations })
          notifyPersistenceFailure('メンバー配分の更新', error)
        })
      return
    }

    const newEntries = syncAiUsageActualForDivisionMonth(
      { ...state, aiUsageMemberAllocations: newAllocations },
      target.divisionId,
      target.fiscalYear,
      target.month,
    )
    const syncedEntry = newEntries.find(
      (e) =>
        e.divisionId === target.divisionId &&
        e.fiscalYear === target.fiscalYear &&
        e.month === target.month &&
        (e.sectionId ?? null) === null &&
        (e.providerId ?? null) === null,
    )
    const syncedEntryExistedBefore = state.aiUsageEntries.some(
      (e) => e.id === syncedEntry?.id,
    )

    set({
      aiUsageMemberAllocations: newAllocations,
      aiUsageEntries: newEntries,
    })

    const syncPromise: Promise<unknown> = !syncedEntry
      ? Promise.resolve()
      : syncedEntryExistedBefore
        ? getDataAdapter().update('aiUsageEntries', syncedEntry.id, {
            actualAmount: syncedEntry.actualAmount,
          })
        : getDataAdapter()
            .create(
              'aiUsageEntries',
              {
                divisionId: syncedEntry.divisionId,
                sectionId: syncedEntry.sectionId,
                providerId: syncedEntry.providerId,
                fiscalYear: syncedEntry.fiscalYear,
                month: syncedEntry.month,
                budgetAmount: syncedEntry.budgetAmount,
                actualAmount: syncedEntry.actualAmount,
              },
              { id: syncedEntry.id },
            )
            .then((created) => {
              set((s) => ({
                aiUsageEntries: s.aiUsageEntries.map((e) =>
                  e.id === syncedEntry.id ? created : e,
                ),
              }))
            })

    Promise.all([
      getDataAdapter().update('aiUsageMemberAllocations', id, patch),
      syncPromise,
    ]).catch((error: unknown) => {
      set({
        aiUsageMemberAllocations: state.aiUsageMemberAllocations,
        aiUsageEntries: state.aiUsageEntries,
      })
      notifyPersistenceFailure('メンバー配分の更新', error)
    })
  },

  bulkSetAiUsageMemberMonthlyBudget: (
    divisionId,
    fiscalYear,
    month,
    amount,
    memberIds,
    providerId = null,
  ) => {
    const previous = get().aiUsageMemberAllocations
    const targets = previous.filter(
      (a) =>
        a.divisionId === divisionId &&
        a.fiscalYear === fiscalYear &&
        a.month === month &&
        (a.providerId ?? null) === (providerId ?? null) &&
        (memberIds === undefined || memberIds.includes(a.memberId)),
    )
    if (targets.length === 0) return
    const targetIds = new Set(targets.map((t) => t.id))
    set({
      aiUsageMemberAllocations: previous.map((a) =>
        targetIds.has(a.id) ? { ...a, monthlyBudget: amount } : a,
      ),
    })
    getDataAdapter()
      .bulkUpdate(
        'aiUsageMemberAllocations',
        targets.map((t) => ({ id: t.id, patch: { monthlyBudget: amount } })),
      )
      .catch((error: unknown) => {
        set({ aiUsageMemberAllocations: previous })
        notifyPersistenceFailure('個人予算の一律設定', error)
      })
  },

  bulkSetAiUsageMemberBufferAmount: (
    divisionId,
    fiscalYear,
    month,
    amount,
    memberIds,
    providerId = null,
  ) => {
    const previous = get().aiUsageMemberAllocations
    const targets = previous.filter(
      (a) =>
        a.divisionId === divisionId &&
        a.fiscalYear === fiscalYear &&
        a.month === month &&
        (a.providerId ?? null) === (providerId ?? null) &&
        (memberIds === undefined || memberIds.includes(a.memberId)),
    )
    if (targets.length === 0) return
    const targetIds = new Set(targets.map((t) => t.id))
    set({
      aiUsageMemberAllocations: previous.map((a) =>
        targetIds.has(a.id) ? { ...a, bufferAmount: amount } : a,
      ),
    })
    getDataAdapter()
      .bulkUpdate(
        'aiUsageMemberAllocations',
        targets.map((t) => ({ id: t.id, patch: { bufferAmount: amount } })),
      )
      .catch((error: unknown) => {
        set({ aiUsageMemberAllocations: previous })
        notifyPersistenceFailure('バッファの一律設定', error)
      })
  },

  addSaasContract: (data) => {
    const state = get()
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const newContract: SaasContract = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    }
    const newSaasContracts = [...state.saasContracts, newContract]
    const newDivisionBudgets = recalcDivisionBudgetsForDivision(
      { ...state, saasContracts: newSaasContracts },
      newContract.divisionId,
    )

    set({
      saasContracts: newSaasContracts,
      divisionBudgets: newDivisionBudgets,
    })
    Promise.all([
      getDataAdapter()
        .create(
          'saasContracts',
          { ...data, createdAt: now, updatedAt: now },
          { id },
        )
        .then((created) => {
          set((s) => ({
            saasContracts: s.saasContracts.map((c) =>
              c.id === id ? created : c,
            ),
          }))
        }),
      persistChangedDivisionBudgets(state.divisionBudgets, newDivisionBudgets),
    ]).catch((error: unknown) => {
      set({
        saasContracts: state.saasContracts,
        divisionBudgets: state.divisionBudgets,
      })
      notifyPersistenceFailure('SaaS契約の追加', error)
    })

    return newContract
  },

  updateSaasContract: (data) => {
    const state = get()
    const before = state.saasContracts.find((c) => c.id === data.id)
    const now = new Date().toISOString()
    const newSaasContracts = state.saasContracts.map((c) =>
      c.id === data.id ? { ...c, ...data, updatedAt: now } : c,
    )
    const affectedDivisionIds = new Set(
      [before?.divisionId, data.divisionId].filter(
        (v): v is string => v !== undefined,
      ),
    )
    let newDivisionBudgets = state.divisionBudgets
    for (const divisionId of affectedDivisionIds) {
      newDivisionBudgets = recalcDivisionBudgetsForDivision(
        {
          ...state,
          saasContracts: newSaasContracts,
          divisionBudgets: newDivisionBudgets,
        },
        divisionId,
      )
    }

    set({
      saasContracts: newSaasContracts,
      divisionBudgets: newDivisionBudgets,
    })
    const { id, ...patch } = data
    Promise.all([
      getDataAdapter().update(
        'saasContracts',
        id,
        { ...patch, updatedAt: now },
        // 楽観ロック。連動するdivisionBudgetsの再計算は
        // 副作用のため期待値を送らない（本体が通れば整合する）
        {
          expectedUpdatedAt: state.saasContracts.find((c) => c.id === id)
            ?.updatedAt,
        },
      ),
      persistChangedDivisionBudgets(state.divisionBudgets, newDivisionBudgets),
    ])
      .then(([saved]) => {
        // サーバーが確定した行（特にサーバー時計のupdatedAt）をローカルへ反映する。
        // 反映しないと次回の楽観ロック期待値がクライアント時計のまま残り、
        // 単独ユーザーでも2回目の更新が必ず412になる
        set((current) => ({
          saasContracts: current.saasContracts.map((c) =>
            c.id === id ? saved : c,
          ),
        }))
      })
      .catch((error: unknown) => {
        set({
          saasContracts: state.saasContracts,
          divisionBudgets: state.divisionBudgets,
        })
        notifyPersistenceFailure('SaaS契約の更新', error)
      })
  },

  deleteSaasContract: (id) => {
    const state = get()
    const target = state.saasContracts.find((c) => c.id === id)
    const newSaasContracts = state.saasContracts.filter((c) => c.id !== id)
    const newDivisionBudgets = target
      ? recalcDivisionBudgetsForDivision(
          { ...state, saasContracts: newSaasContracts },
          target.divisionId,
        )
      : state.divisionBudgets

    set({
      saasContracts: newSaasContracts,
      divisionBudgets: newDivisionBudgets,
    })
    Promise.all([
      getDataAdapter().remove('saasContracts', id),
      persistChangedDivisionBudgets(state.divisionBudgets, newDivisionBudgets),
    ]).catch((error: unknown) => {
      set({
        saasContracts: state.saasContracts,
        divisionBudgets: state.divisionBudgets,
      })
      notifyPersistenceFailure('SaaS契約の削除', error)
    })
  },

  setSaasContractActual: (id, month, amount) => {
    const previous = get().saasContracts
    const target = previous.find((c) => c.id === id)
    if (!target) return
    const monthlyActuals = { ...target.monthlyActuals }
    if (amount === null) {
      delete monthlyActuals[month]
    } else {
      monthlyActuals[month] = amount
    }

    set({
      saasContracts: previous.map((c) =>
        c.id === id ? { ...c, monthlyActuals } : c,
      ),
    })
    getDataAdapter()
      .update('saasContracts', id, { monthlyActuals })
      .catch((error: unknown) => {
        set({ saasContracts: previous })
        notifyPersistenceFailure('SaaS契約実績の更新', error)
      })
  },

  getDivisionBudget: (divisionId, fiscalYear) => {
    return get().divisionBudgets.find(
      (b) => b.divisionId === divisionId && b.fiscalYear === fiscalYear,
    )
  },

  getAdjustmentsByBudget: (budgetId) => {
    return get().budgetAdjustments.filter((a) => a.budgetId === budgetId)
  },

  getBreakdownsByBudget: (budgetId) => {
    return get().budgetBreakdowns.filter((b) => b.budgetId === budgetId)
  },

  getDivisionBudgetTotal: (divisionId, fiscalYear) => {
    const budget = get().getDivisionBudget(divisionId, fiscalYear)
    if (!budget) return 0
    const adjustmentTotal = get()
      .getAdjustmentsByBudget(budget.id)
      .reduce(
        (sum, a) =>
          sum + (a.adjustmentType === 'decrease' ? -a.amount : a.amount),
        0,
      )
    return budget.initialAmount + adjustmentTotal
  },

  getAiUsageEntries: (divisionId, fiscalYear) => {
    return get().aiUsageEntries.filter(
      (e) => e.divisionId === divisionId && e.fiscalYear === fiscalYear,
    )
  },

  // AiUsageEntry.actualAmount/budgetAmountは＄建てのため、
  // 他の万円建て集計と合算する前に、各エントリの対象月に有効な為替レートで万円に換算する
  // （requirements10）
  getAiUsageTotal: (divisionId, fiscalYear) => {
    return sumAiUsageAmountInManYen(
      get().getAiUsageEntries(divisionId, fiscalYear),
      get().exchangeRateHistory,
      (e) => e.actualAmount,
    )
  },

  getAiUsageBudgetTotal: (divisionId, fiscalYear) => {
    return sumAiUsageAmountInManYen(
      get().getAiUsageEntries(divisionId, fiscalYear),
      get().exchangeRateHistory,
      (e) => e.budgetAmount,
    )
  },

  getAiUsageEntriesBySection: (divisionId, sectionId, fiscalYear) => {
    return get()
      .getAiUsageEntries(divisionId, fiscalYear)
      .filter((e) => (e.sectionId ?? null) === (sectionId ?? null))
  },

  getAiUsageBudgetAmountForMonth: (
    divisionId,
    sectionId,
    fiscalYear,
    month,
    providerId,
  ) => {
    // プロバイダ導入により同一部門/課/月に複数エントリ
    // （プロバイダごと）が存在しうるため、providerId省略時は全プロバイダ分を合算する
    // （この関数のみ「省略＝フィルタなし」とする）。
    // providerIdを明示的に渡す（nullも含む）とそのプロバイダのみに絞り込む。
    // 注意: getAiUsageMemberAllocationsByMonth等の他のproviderId対応関数は逆に
    // 「省略＝プロバイダ未分類（null）のみ」がデフォルトのため、このAiUsageEntry系関数との
    // 意味の違いを混同しないこと
    return get()
      .getAiUsageEntriesBySection(divisionId, sectionId, fiscalYear)
      .filter(
        (e) =>
          e.month === month &&
          (providerId === undefined ||
            (e.providerId ?? null) === (providerId ?? null)),
      )
      .reduce((sum, e) => sum + e.budgetAmount, 0)
  },

  getAiUsageProvidersByDivision: (divisionId) => {
    return get()
      .aiUsageProviders.filter((p) => p.divisionId === divisionId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
  },

  getSaasContractsByDivision: (divisionId) => {
    return get().saasContracts.filter((c) => c.divisionId === divisionId)
  },

  getSaasAnnualCostTotal: (divisionId) => {
    return calcSaasContractsTotalCost(
      get().getSaasContractsByDivision(divisionId),
    )
  },

  getAiUsageMemberAllocationsByMonth: (
    divisionId,
    fiscalYear,
    month,
    providerId = null,
  ) => {
    return get().aiUsageMemberAllocations.filter(
      (a) =>
        a.divisionId === divisionId &&
        a.fiscalYear === fiscalYear &&
        a.month === month &&
        (a.providerId ?? null) === (providerId ?? null),
    )
  },

  getPersonnelCost: (divisionId, fiscalYear, startMonth) => {
    const sections = useTeamStore
      .getState()
      .sections.filter((s) => s.divisionId === divisionId)
    const members = useMembersStore.getState().members
    const getMemberMonthlyTotal =
      useAssignmentStore.getState().getMemberMonthlyTotal

    return calcDivisionExpectedRevenue(
      sections,
      members,
      getMemberMonthlyTotal,
      fiscalYear,
      startMonth,
    )
  },

  getProperPersonnelCost: (divisionId, fiscalYear, startMonth) => {
    const sections = useTeamStore
      .getState()
      .sections.filter((s) => s.divisionId === divisionId)
    const members = useMembersStore.getState().members
    const companies = useCompaniesStore.getState().companies
    const getMemberMonthlyTotal =
      useAssignmentStore.getState().getMemberMonthlyTotal

    return calcDivisionProperExpectedRevenue(
      sections,
      members,
      companies,
      getMemberMonthlyTotal,
      fiscalYear,
      startMonth,
    )
  },

  getEstimatedUnitPrice: () => {
    return get().estimatedUnitPrice
  },

  getBudgetOverview: (divisionId, fiscalYear) => {
    const breakdowns = get().budgetBreakdowns.filter((b) => {
      const budget = get().divisionBudgets.find((db) => db.id === b.budgetId)
      return (
        budget?.divisionId === divisionId && budget.fiscalYear === fiscalYear
      )
    })
    const projectPersonnelTotal = breakdowns
      .filter((b) => b.category === 'project_personnel')
      .reduce((sum, b) => sum + b.amount, 0)
    const projectExpenseTotal = breakdowns
      .filter((b) => b.category === 'project_expense')
      .reduce((sum, b) => sum + b.amount, 0)
    const generalExpenseTotal = breakdowns
      .filter((b) => b.category === 'general_expense')
      .reduce((sum, b) => sum + b.amount, 0)

    const aiUsageBudgetTotal = get().getAiUsageBudgetTotal(
      divisionId,
      fiscalYear,
    )
    const saasCostTotal = get().getSaasAnnualCostTotal(divisionId)

    const estimatedUnitPrice = get().estimatedUnitPrice
    const personnelPlanBudgetTotal = usePersonnelPlanStore
      .getState()
      .getPersonnelPlansByDivision(divisionId, fiscalYear)
      .reduce((sum, entry) => {
        const headcountTotal = Object.values(entry.monthlyHeadcount).reduce(
          (s, h) => s + h,
          0,
        )
        return sum + headcountTotal * estimatedUnitPrice
      }, 0)

    // 担当部門一致・トップレベル案件のWBS概算予算額（人月換算×概算単価×係数）。
    // 既にBudgetBreakdownへ手動計上済み（projectIdで紐付け済み）の案件は二重計上を避けるため除外する
    const linkedProjectIds = new Set(
      breakdowns.filter((b) => b.projectId).map((b) => b.projectId as string),
    )
    const { projects, getProjectTree } = useProjectsStore.getState()
    const efforts = useEffortsStore.getState().efforts
    const getWbsSettings = useWbsSettingsStore.getState().getSettings
    const defaultCoefficient = get().defaultCoefficient
    const projectCoefficients = get().projectCoefficients
    const projectTree = getProjectTree()
    const divisionRoots = projectTree.filter(
      (p) =>
        projects.find((proj) => proj.id === p.id)?.divisionId === divisionId &&
        !linkedProjectIds.has(p.id),
    )
    const projectWbsEstimateTotal = divisionRoots.reduce((sum, root) => {
      const settings = getWbsSettings(root.id)
      const columnIds = settings.effortColumns
        .filter((c) => c.enabled)
        .map((c) => c.id)
      const effortDays =
        computeProjectTotalEffort([root], columnIds, efforts).get(root.id) ?? 0
      const effortMonths = effortDays / get().workdaysPerMonth
      const coefficient = projectCoefficients[root.id] ?? defaultCoefficient
      return (
        sum +
        calcProjectEstimateBudget(effortMonths, estimatedUnitPrice, coefficient)
      )
    }, 0)

    const grandTotal =
      projectPersonnelTotal +
      projectExpenseTotal +
      generalExpenseTotal +
      aiUsageBudgetTotal +
      saasCostTotal +
      personnelPlanBudgetTotal +
      projectWbsEstimateTotal

    return {
      projectPersonnelTotal,
      projectExpenseTotal,
      generalExpenseTotal,
      aiUsageBudgetTotal,
      saasCostTotal,
      personnelPlanBudgetTotal,
      projectWbsEstimateTotal,
      grandTotal,
    }
  },

  getAiUsageTotalForDivisions: (divisionIds, fiscalYear) =>
    sumAcrossDivisions(divisionIds, (id) =>
      get().getAiUsageTotal(id, fiscalYear),
    ),

  getAiUsageBudgetTotalForDivisions: (divisionIds, fiscalYear) =>
    sumAcrossDivisions(divisionIds, (id) =>
      get().getAiUsageBudgetTotal(id, fiscalYear),
    ),

  getSaasAnnualCostTotalForDivisions: (divisionIds) =>
    sumAcrossDivisions(divisionIds, (id) => get().getSaasAnnualCostTotal(id)),

  getBudgetOverviewForDivisions: (divisionIds, fiscalYear) => {
    const overviews = divisionIds.map((id) =>
      get().getBudgetOverview(id, fiscalYear),
    )
    return overviews.reduce<BudgetOverview>(
      (acc, o) => ({
        projectPersonnelTotal:
          acc.projectPersonnelTotal + o.projectPersonnelTotal,
        projectExpenseTotal: acc.projectExpenseTotal + o.projectExpenseTotal,
        generalExpenseTotal: acc.generalExpenseTotal + o.generalExpenseTotal,
        aiUsageBudgetTotal: acc.aiUsageBudgetTotal + o.aiUsageBudgetTotal,
        saasCostTotal: acc.saasCostTotal + o.saasCostTotal,
        personnelPlanBudgetTotal:
          acc.personnelPlanBudgetTotal + o.personnelPlanBudgetTotal,
        projectWbsEstimateTotal:
          acc.projectWbsEstimateTotal + o.projectWbsEstimateTotal,
        grandTotal: acc.grandTotal + o.grandTotal,
      }),
      {
        projectPersonnelTotal: 0,
        projectExpenseTotal: 0,
        generalExpenseTotal: 0,
        aiUsageBudgetTotal: 0,
        saasCostTotal: 0,
        personnelPlanBudgetTotal: 0,
        projectWbsEstimateTotal: 0,
        grandTotal: 0,
      },
    )
  },
}))
