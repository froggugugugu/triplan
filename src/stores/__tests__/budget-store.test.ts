import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonStorage } from '@/infrastructure/storage'
import { BudgetAdjustmentSchema } from '@/shared/types/budget'
import type { Database } from '@/shared/types/database'
import { calcDivisionExpectedRevenue } from '@/shared/utils/budget-utils'
import { useAssignmentStore } from '@/stores/assignment-store'
import { useBudgetStore } from '@/stores/budget-store'
import { useCompaniesStore } from '@/stores/companies-store'
import { useEffortsStore } from '@/stores/efforts-store'
import { useMembersStore } from '@/stores/members-store'
import { usePersonnelPlanStore } from '@/stores/personnel-plan-store'
import { useProjectsStore } from '@/stores/projects-store'
import { useTeamStore } from '@/stores/team-store'

const mockDb: Partial<Database> = {
  version: '1.0.0',
  fiscalYear: 2025,
  projects: [],
  members: [],
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
  metadata: {
    lastModified: new Date().toISOString(),
    createdBy: 'test',
    version: '1.0.0',
  },
}

// budget-storeの7エンティティ（divisionBudgets等）はDataAdapter（LocalJsonAdapter）経由に
// 移行済み（17ストアのDataAdapter配線・第14弾）。LocalJsonAdapterのupdate()/remove()は
// 「jsonStorage.load()で都度最新状態を読み直し、対象idをlist.findIndex()で探す」実装のため、
// 単発の固定値を返す静的モック（旧: `load: vi.fn(() => ({ ...mockDb }))`）だと、同一テスト内で
// addXxx()（create）→updateXxx()/deleteXxx()と連鎖する操作で、update/removeが「対象が
// 見つからない」まま常に失敗する（createのsave()呼び出しが後続のload()に反映されないため）。
// jsonStorage.save()の内容を次のload()が返すようミュータブルな状態を持たせ、実際の
// read-modify-writeループを模倣する（vi.mockのホイスティング制約によりvi.hoisted()で保持）
const { getMockDbState, setMockDbState } = vi.hoisted(() => {
  let state: unknown = null
  return {
    getMockDbState: () => state,
    setMockDbState: (next: unknown) => {
      state = next
    },
  }
})

vi.mock('@/infrastructure/storage', () => ({
  jsonStorage: {
    load: vi.fn(() => getMockDbState()),
    save: vi.fn((db: unknown) => setMockDbState(db)),
  },
}))

const mockLoad = vi.mocked(jsonStorage.load)
const mockSave = vi.mocked(jsonStorage.save)

// テスト環境ではgetDataAdapter()が実LocalJsonAdapterを返し、内部でこのファイルがモック化した
// jsonStorageへ透過的に委譲する。list/create/update/remove/bulkUpdateはいずれも非同期
// （Promiseを返す）ため、呼び出し直後に結果を検証するテストではマイクロタスクの解決を待つ必要がある
async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('useBudgetStore', () => {
  beforeEach(() => {
    setMockDbState({ ...mockDb })
    // 前のテストが仕込んだsticky実装（mockReturnValue等）を毎回ステートフル実装へ戻す。
    // 残ったままだとread-modify-write（LocalJsonAdapterのload→save）の読み元が固定
    // オブジェクトになり、連続保存が積み上がらない順序依存の失敗になる（P0-bで顕在化）
    mockLoad.mockImplementation(() => getMockDbState() as Database)
    mockSave.mockImplementation((db: unknown) => {
      setMockDbState(db)
    })
    useBudgetStore.setState({
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
      workdaysPerMonth: 20,
      skillReviewCycleMonths: 3,
      baselineStaleThreshold: 0.1,
    })
    useTeamStore.setState({ divisions: [], sections: [] })
    useMembersStore.setState({ members: [] })
    useAssignmentStore.setState({ assignments: [] })
    useCompaniesStore.setState({ companies: [] })
    usePersonnelPlanStore.setState({ personnelPlans: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('部門予算の登録・編集', () => {
    it('初期予算を新規登録できる', () => {
      const divisionId = crypto.randomUUID()
      const budget = useBudgetStore
        .getState()
        .setInitialBudget(divisionId, 2025, 10000)

      expect(budget.divisionId).toBe(divisionId)
      expect(budget.fiscalYear).toBe(2025)
      expect(budget.initialAmount).toBe(10000)
      expect(useBudgetStore.getState().divisionBudgets).toHaveLength(1)
    })

    it('同一部門×同一年度の予算は上書き編集される（レコードは増えない）', () => {
      const divisionId = crypto.randomUUID()
      useBudgetStore.getState().setInitialBudget(divisionId, 2025, 10000)
      const updated = useBudgetStore
        .getState()
        .setInitialBudget(divisionId, 2025, 12000)

      expect(updated.initialAmount).toBe(12000)
      expect(useBudgetStore.getState().divisionBudgets).toHaveLength(1)
    })

    it('異なる年度の予算は別レコードとして登録される', () => {
      const divisionId = crypto.randomUUID()
      useBudgetStore.getState().setInitialBudget(divisionId, 2025, 10000)
      useBudgetStore.getState().setInitialBudget(divisionId, 2026, 11000)

      expect(useBudgetStore.getState().divisionBudgets).toHaveLength(2)
    })
  })

  describe('予算調整（その他予算変更）の追記', () => {
    it('増額調整を履歴として記録できる', () => {
      const divisionId = crypto.randomUUID()
      const budget = useBudgetStore
        .getState()
        .setInitialBudget(divisionId, 2025, 10000)

      const adjustment = useBudgetStore.getState().addBudgetAdjustment({
        budgetId: budget.id,
        amount: 2000,
        adjustmentType: 'increase',
        reason: '期中受注に伴う追加',
        adjustedAt: '2025-07-01',
      })

      expect(adjustment.amount).toBe(2000)
      expect(adjustment.adjustmentType).toBe('increase')
      expect(adjustment.reason).toBe('期中受注に伴う追加')
      expect(useBudgetStore.getState().budgetAdjustments).toHaveLength(1)
    })

    it('減額調整を履歴として記録できる', () => {
      const divisionId = crypto.randomUUID()
      const budget = useBudgetStore
        .getState()
        .setInitialBudget(divisionId, 2025, 10000)

      const adjustment = useBudgetStore.getState().addBudgetAdjustment({
        budgetId: budget.id,
        amount: 1500,
        adjustmentType: 'decrease',
        reason: '契約内容見直しによる減額',
        adjustedAt: '2025-09-01',
      })

      expect(adjustment.amount).toBe(1500)
      expect(adjustment.adjustmentType).toBe('decrease')
      expect(useBudgetStore.getState().budgetAdjustments).toHaveLength(1)
    })

    it('adjustmentTypeを省略した既存データ（後方互換）はincreaseとして解釈される', () => {
      const legacyAdjustment = BudgetAdjustmentSchema.parse({
        id: crypto.randomUUID(),
        budgetId: crypto.randomUUID(),
        amount: 1000,
        reason: '旧データ',
        adjustedAt: '2025-06-01',
        createdAt: new Date().toISOString(),
      })

      expect(legacyAdjustment.adjustmentType).toBe('increase')
    })

    it('追加後も過去の履歴レコードが変更されない（追記専用性）', () => {
      const divisionId = crypto.randomUUID()
      const budget = useBudgetStore
        .getState()
        .setInitialBudget(divisionId, 2025, 10000)

      const first = useBudgetStore.getState().addBudgetAdjustment({
        budgetId: budget.id,
        amount: 1000,
        adjustmentType: 'increase',
        reason: '追加1',
        adjustedAt: '2025-06-01',
      })
      useBudgetStore.getState().addBudgetAdjustment({
        budgetId: budget.id,
        amount: 2000,
        adjustmentType: 'increase',
        reason: '追加2',
        adjustedAt: '2025-07-01',
      })

      const adjustments = useBudgetStore.getState().budgetAdjustments
      expect(adjustments).toHaveLength(2)
      const persistedFirst = adjustments.find((a) => a.id === first.id)
      expect(persistedFirst).toEqual(first)
    })

    it('現在の予算総額は初期予算＋全調整履歴（増額は加算・減額は減算）の合計として算出される', () => {
      const divisionId = crypto.randomUUID()
      const budget = useBudgetStore
        .getState()
        .setInitialBudget(divisionId, 2025, 10000)
      useBudgetStore.getState().addBudgetAdjustment({
        budgetId: budget.id,
        amount: 1000,
        adjustmentType: 'increase',
        reason: '追加1',
        adjustedAt: '2025-06-01',
      })
      useBudgetStore.getState().addBudgetAdjustment({
        budgetId: budget.id,
        amount: 500,
        adjustmentType: 'increase',
        reason: '追加2',
        adjustedAt: '2025-08-01',
      })

      const total = useBudgetStore
        .getState()
        .getDivisionBudgetTotal(divisionId, 2025)
      expect(total).toBe(11500)
    })

    it('減額調整を含む場合、予算総額からその分が差し引かれる', () => {
      const divisionId = crypto.randomUUID()
      const budget = useBudgetStore
        .getState()
        .setInitialBudget(divisionId, 2025, 10000)
      useBudgetStore.getState().addBudgetAdjustment({
        budgetId: budget.id,
        amount: 1000,
        adjustmentType: 'increase',
        reason: '追加1',
        adjustedAt: '2025-06-01',
      })
      useBudgetStore.getState().addBudgetAdjustment({
        budgetId: budget.id,
        amount: 300,
        adjustmentType: 'decrease',
        reason: '減額1',
        adjustedAt: '2025-08-01',
      })

      const total = useBudgetStore
        .getState()
        .getDivisionBudgetTotal(divisionId, 2025)
      expect(total).toBe(10700)
    })

    it('予算未登録の部門の総額は0を返す', () => {
      const total = useBudgetStore
        .getState()
        .getDivisionBudgetTotal(crypto.randomUUID(), 2025)
      expect(total).toBe(0)
    })
  })

  describe('AI利用費CRUD', () => {
    it('月次の予算額を登録できる', () => {
      const divisionId = crypto.randomUUID()
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 300)

      const entries = useBudgetStore
        .getState()
        .getAiUsageEntries(divisionId, 2025)
      expect(entries).toHaveLength(1)
      expect(entries[0]?.budgetAmount).toBe(300)
      expect(entries[0]?.actualAmount).toBeNull()
    })

    it('未記録月の実績はnullのまま保持され、0円と混同されない', () => {
      const divisionId = crypto.randomUUID()
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 300)

      const entries = useBudgetStore
        .getState()
        .getAiUsageEntries(divisionId, 2025)
      expect(entries[0]?.actualAmount).toBeNull()
      expect(entries[0]?.actualAmount).not.toBe(0)
    })

    it('実績額を登録すると未記録から確定値に変わる', () => {
      const divisionId = crypto.randomUUID()
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 300)
      useBudgetStore
        .getState()
        .setAiUsageActual(divisionId, 2025, '2025-04', 280)

      const entries = useBudgetStore
        .getState()
        .getAiUsageEntries(divisionId, 2025)
      expect(entries).toHaveLength(1)
      expect(entries[0]?.actualAmount).toBe(280)
    })

    it('実績合計は未記録月を除いて算出される', () => {
      const divisionId = crypto.randomUUID()
      // 為替レート1＄=1万円相当（10000円/＄）に設定し、＄→万円換算後も既存の期待値（万円換算前と
      // 同じ数値）で検証できるようにする（requirements10、AiUsageEntryは＄建て）
      useBudgetStore.setState({
        exchangeRateHistory: [{ effectiveFrom: '2020-01', rate: 10000 }],
      })
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 300)
      useBudgetStore
        .getState()
        .setAiUsageActual(divisionId, 2025, '2025-04', 280)
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-05', 300)
      // 2025-05は実績未登録のまま

      const total = useBudgetStore.getState().getAiUsageTotal(divisionId, 2025)
      expect(total).toBe(280)
    })
  })

  describe('AI利用費プロバイダ（AiUsageProvider）CRUD', () => {
    it('プロバイダを追加できる（sortOrderは部門内で0起点の連番）', () => {
      const divisionId = crypto.randomUUID()
      const p1 = useBudgetStore
        .getState()
        .addAiUsageProvider(divisionId, 'Anthropic', 'Team')
      const p2 = useBudgetStore
        .getState()
        .addAiUsageProvider(divisionId, 'OpenAI', 'Business')

      expect(p1.sortOrder).toBe(0)
      expect(p2.sortOrder).toBe(1)
      expect(p1.plan).toBe('Team')

      const providers = useBudgetStore
        .getState()
        .getAiUsageProvidersByDivision(divisionId)
      expect(providers).toHaveLength(2)
      expect(providers.map((p) => p.name)).toEqual(['Anthropic', 'OpenAI'])
    })

    it('反証: 部門が異なればsortOrderは互いに独立して0から始まる', () => {
      const divisionA = crypto.randomUUID()
      const divisionB = crypto.randomUUID()
      useBudgetStore.getState().addAiUsageProvider(divisionA, 'Anthropic')
      useBudgetStore.getState().addAiUsageProvider(divisionA, 'OpenAI')
      const pB = useBudgetStore
        .getState()
        .addAiUsageProvider(divisionB, 'Microsoft')

      expect(pB.sortOrder).toBe(0)
    })

    it('反証: planを省略した場合はnullになる', () => {
      const divisionId = crypto.randomUUID()
      const provider = useBudgetStore
        .getState()
        .addAiUsageProvider(divisionId, 'Anthropic')
      expect(provider.plan).toBeNull()
    })

    it('プロバイダの名前・プランを更新できる', () => {
      const divisionId = crypto.randomUUID()
      const provider = useBudgetStore
        .getState()
        .addAiUsageProvider(divisionId, 'Anthropic', 'Team')
      useBudgetStore
        .getState()
        .updateAiUsageProvider(provider.id, 'Anthropic', 'Enterprise')

      const updated = useBudgetStore
        .getState()
        .getAiUsageProvidersByDivision(divisionId)[0]
      expect(updated?.plan).toBe('Enterprise')
    })

    it('プロバイダを削除すると、紐づくAiUsageEntry（providerId一致）も削除される', () => {
      const divisionId = crypto.randomUUID()
      const provider = useBudgetStore
        .getState()
        .addAiUsageProvider(divisionId, 'Anthropic')
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 100, null, provider.id)
      // プロバイダ未分類の既存枠（レガシー）は削除対象外であることも同時に確認する
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 50)

      useBudgetStore.getState().deleteAiUsageProvider(provider.id)

      const entries = useBudgetStore
        .getState()
        .getAiUsageEntries(divisionId, 2025)
      expect(entries).toHaveLength(1)
      expect(entries[0]?.providerId ?? null).toBeNull()
      expect(entries[0]?.budgetAmount).toBe(50)
    })

    it('反証: 存在しないIDを削除してもクラッシュせず、既存データは変化しない', () => {
      const divisionId = crypto.randomUUID()
      useBudgetStore.getState().addAiUsageProvider(divisionId, 'Anthropic')
      expect(() =>
        useBudgetStore.getState().deleteAiUsageProvider(crypto.randomUUID()),
      ).not.toThrow()
      expect(
        useBudgetStore.getState().getAiUsageProvidersByDivision(divisionId),
      ).toHaveLength(1)
    })
  })

  describe('AI利用費のプロバイダ別予算・実績（AiUsageEntry.providerId）', () => {
    it('プロバイダごとに独立した予算額を登録・集計できる', () => {
      const divisionId = crypto.randomUUID()
      const anthropic = useBudgetStore
        .getState()
        .addAiUsageProvider(divisionId, 'Anthropic')
      const openai = useBudgetStore
        .getState()
        .addAiUsageProvider(divisionId, 'OpenAI')

      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 200, null, anthropic.id)
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 100, null, openai.id)

      const entries = useBudgetStore
        .getState()
        .getAiUsageEntries(divisionId, 2025)
      expect(entries).toHaveLength(2)

      // 部門合計は既存の合算ロジック（sumAiUsageAmountInManYen）がproviderId軸に関わらず
      // 全件合算するため、無改修でプロバイダ横断合計になることを確認する（反証: 既存ロジック無改修）
      useBudgetStore.setState({
        exchangeRateHistory: [{ effectiveFrom: '2020-01', rate: 10000 }],
      })
      const budgetTotal = useBudgetStore
        .getState()
        .getAiUsageBudgetTotal(divisionId, 2025)
      expect(budgetTotal).toBe(300)
    })

    it('反証: 同一プロバイダ・同一月への再設定は新規作成でなく上書きになる', () => {
      const divisionId = crypto.randomUUID()
      const provider = useBudgetStore
        .getState()
        .addAiUsageProvider(divisionId, 'Anthropic')
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 200, null, provider.id)
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 250, null, provider.id)

      const entries = useBudgetStore
        .getState()
        .getAiUsageEntries(divisionId, 2025)
      expect(entries).toHaveLength(1)
      expect(entries[0]?.budgetAmount).toBe(250)
    })

    it('プロバイダ別に実績額を手動入力できる（選択肢A: メンバー配分とは独立した入力経路）', () => {
      const divisionId = crypto.randomUUID()
      const provider = useBudgetStore
        .getState()
        .addAiUsageProvider(divisionId, 'Anthropic')
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 200, null, provider.id)
      useBudgetStore
        .getState()
        .setAiUsageActual(divisionId, 2025, '2025-04', 180, null, provider.id)

      const entries = useBudgetStore
        .getState()
        .getAiUsageEntries(divisionId, 2025)
      expect(entries[0]?.actualAmount).toBe(180)
    })

    it('反証: メンバー配分の実績同期（syncAiUsageActualForDivisionMonth）はプロバイダ別実績には一切書き込まない', () => {
      const divisionId = crypto.randomUUID()
      const provider = useBudgetStore
        .getState()
        .addAiUsageProvider(divisionId, 'Anthropic')
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 200, null, provider.id)
      useBudgetStore
        .getState()
        .setAiUsageActual(divisionId, 2025, '2025-04', 180, null, provider.id)

      const memberId = crypto.randomUUID()
      const [allocation] = useBudgetStore
        .getState()
        .getOrCreateAiUsageMemberAllocations(divisionId, 2025, '2025-04', [
          memberId,
        ])
      useBudgetStore
        .getState()
        .setAiUsageMemberAllocation(allocation?.id ?? '', {
          actualAmount: 999,
        })

      const entries = useBudgetStore
        .getState()
        .getAiUsageEntries(divisionId, 2025)
      const providerEntry = entries.find((e) => e.providerId === provider.id)
      const legacyEntry = entries.find((e) => (e.providerId ?? null) === null)

      // プロバイダ行の実績は手動入力値のまま変化しない
      expect(providerEntry?.actualAmount).toBe(180)
      // レガシー行（providerId=null, sectionId=null）にメンバー配分の実績が同期される
      expect(legacyEntry?.actualAmount).toBe(999)
    })

    it('getAiUsageBudgetAmountForMonthは同一部門/課/月の複数プロバイダ予算額を合算する（反証: 旧.find()実装なら1件しか拾えないケース）', () => {
      const divisionId = crypto.randomUUID()
      const anthropic = useBudgetStore
        .getState()
        .addAiUsageProvider(divisionId, 'Anthropic')
      const openai = useBudgetStore
        .getState()
        .addAiUsageProvider(divisionId, 'OpenAI')
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 200, null, anthropic.id)
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 100, null, openai.id)
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 50) // プロバイダ未分類分も加算対象

      const amount = useBudgetStore
        .getState()
        .getAiUsageBudgetAmountForMonth(divisionId, null, 2025, '2025-04')
      expect(amount).toBe(350)
    })

    it('後方互換: プロバイダを一切登録しない場合、従来通り部門に1エントリのみ作成される', () => {
      const divisionId = crypto.randomUUID()
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 300)
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 350)

      const entries = useBudgetStore
        .getState()
        .getAiUsageEntries(divisionId, 2025)
      expect(entries).toHaveLength(1)
      expect(entries[0]?.budgetAmount).toBe(350)
      expect(entries[0]?.providerId ?? null).toBeNull()
    })

    it('プロバイダ削除後、DivisionBudget.initialAmountがそのプロバイダの予算分だけ減算される', () => {
      const divisionId = crypto.randomUUID()
      useBudgetStore.getState().getOrCreateDivisionBudget(divisionId, 2025)
      useBudgetStore.setState({
        exchangeRateHistory: [{ effectiveFrom: '2020-01', rate: 10000 }],
      })
      const provider = useBudgetStore
        .getState()
        .addAiUsageProvider(divisionId, 'Anthropic')
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 200, null, provider.id)

      const before = useBudgetStore
        .getState()
        .getDivisionBudget(divisionId, 2025)
      expect(before?.initialAmount).toBe(200)

      useBudgetStore.getState().deleteAiUsageProvider(provider.id)

      const after = useBudgetStore
        .getState()
        .getDivisionBudget(divisionId, 2025)
      expect(after?.initialAmount).toBe(0)
    })
  })

  describe('AI利用費の課別予算（sectionId）', () => {
    it('sectionId省略時は部門全体レベル（sectionId=null）のレコードとして登録される', () => {
      const divisionId = crypto.randomUUID()
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 300)

      const entries = useBudgetStore
        .getState()
        .getAiUsageEntries(divisionId, 2025)
      expect(entries[0]?.sectionId ?? null).toBeNull()
    })

    it('同一部門・同一月でも部門レベルと課レベルは別レコードとして扱われる', () => {
      const divisionId = crypto.randomUUID()
      const sectionId = crypto.randomUUID()
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 300)
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 50, sectionId)

      const entries = useBudgetStore
        .getState()
        .getAiUsageEntries(divisionId, 2025)
      expect(entries).toHaveLength(2)
    })

    it('同一課の予算額を再設定すると同一レコードが上書きされる（別レコードが増えない）', () => {
      const divisionId = crypto.randomUUID()
      const sectionId = crypto.randomUUID()
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 50, sectionId)
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 80, sectionId)

      const entries = useBudgetStore
        .getState()
        .getAiUsageEntriesBySection(divisionId, sectionId, 2025)
      expect(entries).toHaveLength(1)
      expect(entries[0]?.budgetAmount).toBe(80)
    })

    it('getAiUsageEntriesBySectionは指定した課（またはnull=部門全体）のレコードのみ返す', () => {
      const divisionId = crypto.randomUUID()
      const sectionA = crypto.randomUUID()
      const sectionB = crypto.randomUUID()
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 300)
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 50, sectionA)
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 20, sectionB)

      expect(
        useBudgetStore
          .getState()
          .getAiUsageEntriesBySection(divisionId, null, 2025),
      ).toHaveLength(1)
      expect(
        useBudgetStore
          .getState()
          .getAiUsageEntriesBySection(divisionId, sectionA, 2025),
      ).toHaveLength(1)
      expect(
        useBudgetStore
          .getState()
          .getAiUsageEntriesBySection(divisionId, sectionA, 2025)[0]
          ?.budgetAmount,
      ).toBe(50)
    })

    it('getAiUsageBudgetAmountForMonthは対象月の予算額を返し、未登録の場合は0を返す', () => {
      const divisionId = crypto.randomUUID()
      const sectionId = crypto.randomUUID()
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 50, sectionId)

      expect(
        useBudgetStore
          .getState()
          .getAiUsageBudgetAmountForMonth(
            divisionId,
            sectionId,
            2025,
            '2025-04',
          ),
      ).toBe(50)
      expect(
        useBudgetStore
          .getState()
          .getAiUsageBudgetAmountForMonth(
            divisionId,
            sectionId,
            2025,
            '2025-05',
          ),
      ).toBe(0)
    })

    it('部門単位の集計（getAiUsageBudgetTotal）は課別エントリも自動的に合算する（ロールアップの回帰確認）', () => {
      const divisionId = crypto.randomUUID()
      const sectionA = crypto.randomUUID()
      const sectionB = crypto.randomUUID()
      useBudgetStore.setState({
        exchangeRateHistory: [{ effectiveFrom: '2020-01', rate: 10000 }],
      })
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 300)
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 50, sectionA)
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 20, sectionB)

      const total = useBudgetStore
        .getState()
        .getAiUsageBudgetTotal(divisionId, 2025)
      expect(total).toBe(370)
    })

    it('課の実績額もsetAiUsageActualで独立して更新できる', () => {
      const divisionId = crypto.randomUUID()
      const sectionId = crypto.randomUUID()
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 50, sectionId)
      useBudgetStore
        .getState()
        .setAiUsageActual(divisionId, 2025, '2025-04', 45, sectionId)

      const entries = useBudgetStore
        .getState()
        .getAiUsageEntriesBySection(divisionId, sectionId, 2025)
      expect(entries[0]?.actualAmount).toBe(45)
    })
  })

  describe('AI利用費メンバー配分（AiUsageMemberAllocation）', () => {
    it('対象メンバー分のレコード存在を保証する（getOrCreateAiUsageMemberAllocations）', () => {
      const divisionId = crypto.randomUUID()
      const memberIds = [crypto.randomUUID(), crypto.randomUUID()]

      const allocations = useBudgetStore
        .getState()
        .getOrCreateAiUsageMemberAllocations(
          divisionId,
          2025,
          '2025-04',
          memberIds,
        )

      expect(allocations).toHaveLength(2)
      expect(allocations.map((a) => a.memberId).sort()).toEqual(
        [...memberIds].sort(),
      )
      expect(allocations[0]?.monthlyBudget).toBe(0)
      expect(allocations[0]?.bufferAmount).toBe(0)
      expect(allocations[0]?.actualAmount).toBe(0)
    })

    it('既存レコードは上書きしない（personnel-plan-storeのgetOrCreateAllCategoriesと同様のパターン）', () => {
      const divisionId = crypto.randomUUID()
      const memberId = crypto.randomUUID()

      const first = useBudgetStore
        .getState()
        .getOrCreateAiUsageMemberAllocations(divisionId, 2025, '2025-04', [
          memberId,
        ])
      const firstAllocation = first[0]
      if (!firstAllocation) throw new Error('setup failed')
      useBudgetStore
        .getState()
        .setAiUsageMemberAllocation(firstAllocation.id, { monthlyBudget: 5 })

      const second = useBudgetStore
        .getState()
        .getOrCreateAiUsageMemberAllocations(divisionId, 2025, '2025-04', [
          memberId,
        ])

      expect(second).toHaveLength(1)
      expect(second[0]?.id).toBe(first[0]?.id)
      expect(second[0]?.monthlyBudget).toBe(5)
      expect(useBudgetStore.getState().aiUsageMemberAllocations).toHaveLength(1)
    })

    it('月が異なれば別レコードとして作成される', () => {
      const divisionId = crypto.randomUUID()
      const memberId = crypto.randomUUID()

      useBudgetStore
        .getState()
        .getOrCreateAiUsageMemberAllocations(divisionId, 2025, '2025-04', [
          memberId,
        ])
      useBudgetStore
        .getState()
        .getOrCreateAiUsageMemberAllocations(divisionId, 2025, '2025-05', [
          memberId,
        ])

      expect(useBudgetStore.getState().aiUsageMemberAllocations).toHaveLength(2)
    })

    // : メンバー別配分にプロバイダ軸を追加し、同一メンバー・同一月でも
    // プロバイダごとに独立した個人予算/バッファ/割当/バッファ割当を持てるようにする
    it('プロバイダが異なれば同一メンバー・同一月でも別レコードとして作成される', () => {
      const divisionId = crypto.randomUUID()
      const memberId = crypto.randomUUID()
      const providerA = useBudgetStore
        .getState()
        .addAiUsageProvider(divisionId, 'Anthropic')
      const providerB = useBudgetStore
        .getState()
        .addAiUsageProvider(divisionId, 'OpenAI')

      useBudgetStore
        .getState()
        .getOrCreateAiUsageMemberAllocations(
          divisionId,
          2025,
          '2025-04',
          [memberId],
          providerA.id,
        )
      useBudgetStore
        .getState()
        .getOrCreateAiUsageMemberAllocations(
          divisionId,
          2025,
          '2025-04',
          [memberId],
          providerB.id,
        )

      const allocations = useBudgetStore.getState().aiUsageMemberAllocations
      expect(allocations).toHaveLength(2)
      expect(new Set(allocations.map((a) => a.providerId))).toEqual(
        new Set([providerA.id, providerB.id]),
      )
    })

    // 反証: providerId省略時は従来どおりプロバイダ未分類（null）として扱われ、
    // 明示的にプロバイダを指定したレコードとは別物として管理される（後方互換）
    it('providerId省略時はプロバイダ未分類として扱われ、プロバイダ指定レコードとは独立する', () => {
      const divisionId = crypto.randomUUID()
      const memberId = crypto.randomUUID()
      const provider = useBudgetStore
        .getState()
        .addAiUsageProvider(divisionId, 'Anthropic')

      useBudgetStore
        .getState()
        .getOrCreateAiUsageMemberAllocations(divisionId, 2025, '2025-04', [
          memberId,
        ])
      useBudgetStore
        .getState()
        .getOrCreateAiUsageMemberAllocations(
          divisionId,
          2025,
          '2025-04',
          [memberId],
          provider.id,
        )

      expect(useBudgetStore.getState().aiUsageMemberAllocations).toHaveLength(2)
      const unclassified = useBudgetStore
        .getState()
        .getAiUsageMemberAllocationsByMonth(divisionId, 2025, '2025-04')
      expect(unclassified).toHaveLength(1)
      expect(unclassified[0]?.providerId ?? null).toBeNull()

      const providerScoped = useBudgetStore
        .getState()
        .getAiUsageMemberAllocationsByMonth(
          divisionId,
          2025,
          '2025-04',
          provider.id,
        )
      expect(providerScoped).toHaveLength(1)
      expect(providerScoped[0]?.providerId).toBe(provider.id)
    })

    it('bulkSetAiUsageMemberMonthlyBudget/BufferAmountにproviderIdを渡すと、そのプロバイダの配分のみ更新される', () => {
      const divisionId = crypto.randomUUID()
      const memberId = crypto.randomUUID()
      const providerA = useBudgetStore
        .getState()
        .addAiUsageProvider(divisionId, 'Anthropic')
      const providerB = useBudgetStore
        .getState()
        .addAiUsageProvider(divisionId, 'OpenAI')
      useBudgetStore
        .getState()
        .getOrCreateAiUsageMemberAllocations(
          divisionId,
          2025,
          '2025-04',
          [memberId],
          providerA.id,
        )
      useBudgetStore
        .getState()
        .getOrCreateAiUsageMemberAllocations(
          divisionId,
          2025,
          '2025-04',
          [memberId],
          providerB.id,
        )

      useBudgetStore
        .getState()
        .bulkSetAiUsageMemberMonthlyBudget(
          divisionId,
          2025,
          '2025-04',
          15,
          [memberId],
          providerA.id,
        )
      useBudgetStore
        .getState()
        .bulkSetAiUsageMemberBufferAmount(
          divisionId,
          2025,
          '2025-04',
          3,
          [memberId],
          providerA.id,
        )

      const providerAAllocation = useBudgetStore
        .getState()
        .getAiUsageMemberAllocationsByMonth(
          divisionId,
          2025,
          '2025-04',
          providerA.id,
        )[0]
      const providerBAllocation = useBudgetStore
        .getState()
        .getAiUsageMemberAllocationsByMonth(
          divisionId,
          2025,
          '2025-04',
          providerB.id,
        )[0]
      expect(providerAAllocation?.monthlyBudget).toBe(15)
      expect(providerAAllocation?.bufferAmount).toBe(3)
      // 別プロバイダ（OpenAI）の配分は影響を受けない
      expect(providerBAllocation?.monthlyBudget).toBe(0)
      expect(providerBAllocation?.bufferAmount).toBe(0)
    })

    // でAiUsageMemberAllocationにproviderId軸を追加したが、
    // syncAiUsageActualForDivisionMonthはあえてプロバイダ非依存のまま維持する。
    // プロバイダ別「実績額」（AiUsageGridの手動入力）とメンバー配分由来の自動集計が
    // 別レコードとして両方存在すると、部門合計セレクタで二重計上されるため
    // （コードレビュー指摘）。同期先は常にプロバイダ未分類のレガシー枠に限定する
    it('反証: プロバイダ付き配分のactualAmountを変更しても、プロバイダ別に手動入力したAiUsageEntry.actualAmountは変化しない（二重計上防止）', () => {
      const divisionId = crypto.randomUUID()
      const memberId = crypto.randomUUID()
      const provider = useBudgetStore
        .getState()
        .addAiUsageProvider(divisionId, 'Anthropic')
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 200, null, provider.id)
      useBudgetStore
        .getState()
        .setAiUsageActual(divisionId, 2025, '2025-04', 180, null, provider.id)

      const [allocation] = useBudgetStore
        .getState()
        .getOrCreateAiUsageMemberAllocations(
          divisionId,
          2025,
          '2025-04',
          [memberId],
          provider.id,
        )
      useBudgetStore
        .getState()
        .setAiUsageMemberAllocation(allocation?.id ?? '', { actualAmount: 77 })

      const entries = useBudgetStore
        .getState()
        .getAiUsageEntries(divisionId, 2025)
      const providerEntry = entries.find(
        (e) =>
          (e.providerId ?? null) === provider.id &&
          (e.sectionId ?? null) === null,
      )
      const legacyEntry = entries.find((e) => (e.providerId ?? null) === null)
      // プロバイダ別に手動入力した実績額(180)は変化しない
      expect(providerEntry?.actualAmount).toBe(180)
      // メンバー配分由来の同期はプロバイダ未分類のレガシー枠に反映される
      expect(legacyEntry?.actualAmount).toBe(77)
    })

    it('getAiUsageBudgetAmountForMonthにproviderIdを渡すと、そのプロバイダの予算額のみ合算する', () => {
      const divisionId = crypto.randomUUID()
      const providerA = useBudgetStore
        .getState()
        .addAiUsageProvider(divisionId, 'Anthropic')
      const providerB = useBudgetStore
        .getState()
        .addAiUsageProvider(divisionId, 'OpenAI')
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 200, null, providerA.id)
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 100, null, providerB.id)

      const providerAOnly = useBudgetStore
        .getState()
        .getAiUsageBudgetAmountForMonth(
          divisionId,
          null,
          2025,
          '2025-04',
          providerA.id,
        )
      const allProviders = useBudgetStore
        .getState()
        .getAiUsageBudgetAmountForMonth(divisionId, null, 2025, '2025-04')
      expect(providerAOnly).toBe(200)
      expect(allProviders).toBe(300)
    })

    it('setAiUsageMemberAllocationで個別に金額を微調整できる', () => {
      const divisionId = crypto.randomUUID()
      const memberId = crypto.randomUUID()
      const [allocation] = useBudgetStore
        .getState()
        .getOrCreateAiUsageMemberAllocations(divisionId, 2025, '2025-04', [
          memberId,
        ])
      if (!allocation) throw new Error('setup failed')

      useBudgetStore.getState().setAiUsageMemberAllocation(allocation.id, {
        monthlyBudget: 10,
        bufferAmount: 2,
        actualAmount: 8,
      })

      const updated = useBudgetStore
        .getState()
        .aiUsageMemberAllocations.find((a) => a.id === allocation.id)
      expect(updated?.monthlyBudget).toBe(10)
      expect(updated?.bufferAmount).toBe(2)
      expect(updated?.actualAmount).toBe(8)
    })

    it('setAiUsageMemberAllocationでactualAmountを変更すると、部門全体のAiUsageEntry.actualAmountに自動同期される（AiUsageGridの実績額列表示専用化に伴う整合性維持）', () => {
      const divisionId = crypto.randomUUID()
      const memberId1 = crypto.randomUUID()
      const memberId2 = crypto.randomUUID()
      const allocations = useBudgetStore
        .getState()
        .getOrCreateAiUsageMemberAllocations(divisionId, 2025, '2025-04', [
          memberId1,
          memberId2,
        ])
      const [a1, a2] = allocations
      if (!a1 || !a2) throw new Error('setup failed')

      useBudgetStore
        .getState()
        .setAiUsageMemberAllocation(a1.id, { actualAmount: 5 })
      useBudgetStore
        .getState()
        .setAiUsageMemberAllocation(a2.id, { actualAmount: 3 })

      const entry = useBudgetStore
        .getState()
        .aiUsageEntries.find(
          (e) =>
            e.divisionId === divisionId &&
            e.fiscalYear === 2025 &&
            e.month === '2025-04' &&
            (e.sectionId ?? null) === null,
        )
      expect(entry?.actualAmount).toBe(8)
    })

    it('bufferActualAmountを変更しても部門全体のAiUsageEntry.actualAmountに自動同期される（割当+バッファ割当の合計を同期する）', () => {
      const divisionId = crypto.randomUUID()
      const memberId = crypto.randomUUID()
      const [allocation] = useBudgetStore
        .getState()
        .getOrCreateAiUsageMemberAllocations(divisionId, 2025, '2025-04', [
          memberId,
        ])
      if (!allocation) throw new Error('setup failed')

      useBudgetStore
        .getState()
        .setAiUsageMemberAllocation(allocation.id, { actualAmount: 5 })
      useBudgetStore
        .getState()
        .setAiUsageMemberAllocation(allocation.id, { bufferActualAmount: 2 })

      const entry = useBudgetStore
        .getState()
        .aiUsageEntries.find(
          (e) =>
            e.divisionId === divisionId &&
            e.fiscalYear === 2025 &&
            e.month === '2025-04' &&
            (e.sectionId ?? null) === null,
        )
      // 割当5 + バッファ割当2 = 7
      expect(entry?.actualAmount).toBe(7)
    })

    // 反証: monthlyBudget/bufferAmountのみの変更ではAiUsageEntryが不要に新規作成されないか
    it('monthlyBudget/bufferAmountのみの変更ではAiUsageEntryの同期を行わない', () => {
      const divisionId = crypto.randomUUID()
      const memberId = crypto.randomUUID()
      const [allocation] = useBudgetStore
        .getState()
        .getOrCreateAiUsageMemberAllocations(divisionId, 2025, '2025-04', [
          memberId,
        ])
      if (!allocation) throw new Error('setup failed')

      useBudgetStore
        .getState()
        .setAiUsageMemberAllocation(allocation.id, { monthlyBudget: 10 })

      const entry = useBudgetStore
        .getState()
        .aiUsageEntries.find(
          (e) => e.divisionId === divisionId && e.month === '2025-04',
        )
      expect(entry).toBeUndefined()
    })

    it('bulkSetAiUsageMemberMonthlyBudgetで対象月の全メンバーの月間設定額を一括上書きする', () => {
      const divisionId = crypto.randomUUID()
      const memberIds = [crypto.randomUUID(), crypto.randomUUID()]
      useBudgetStore
        .getState()
        .getOrCreateAiUsageMemberAllocations(
          divisionId,
          2025,
          '2025-04',
          memberIds,
        )

      useBudgetStore
        .getState()
        .bulkSetAiUsageMemberMonthlyBudget(divisionId, 2025, '2025-04', 15)

      const allocations = useBudgetStore
        .getState()
        .getAiUsageMemberAllocationsByMonth(divisionId, 2025, '2025-04')
      expect(allocations.every((a) => a.monthlyBudget === 15)).toBe(true)
    })

    it('bulkSetAiUsageMemberBufferAmountで対象月の全メンバーのバッファ額を一括上書きする', () => {
      const divisionId = crypto.randomUUID()
      const memberIds = [crypto.randomUUID(), crypto.randomUUID()]
      useBudgetStore
        .getState()
        .getOrCreateAiUsageMemberAllocations(
          divisionId,
          2025,
          '2025-04',
          memberIds,
        )

      useBudgetStore
        .getState()
        .bulkSetAiUsageMemberBufferAmount(divisionId, 2025, '2025-04', 3)

      const allocations = useBudgetStore
        .getState()
        .getAiUsageMemberAllocationsByMonth(divisionId, 2025, '2025-04')
      expect(allocations.every((a) => a.bufferAmount === 3)).toBe(true)
    })

    it('一律設定は対象外の月・部門には影響しない', () => {
      const divisionId = crypto.randomUUID()
      const otherDivisionId = crypto.randomUUID()
      const memberId = crypto.randomUUID()
      useBudgetStore
        .getState()
        .getOrCreateAiUsageMemberAllocations(divisionId, 2025, '2025-04', [
          memberId,
        ])
      useBudgetStore
        .getState()
        .getOrCreateAiUsageMemberAllocations(divisionId, 2025, '2025-05', [
          memberId,
        ])
      useBudgetStore
        .getState()
        .getOrCreateAiUsageMemberAllocations(otherDivisionId, 2025, '2025-04', [
          memberId,
        ])

      useBudgetStore
        .getState()
        .bulkSetAiUsageMemberMonthlyBudget(divisionId, 2025, '2025-04', 15)

      const untouchedMonth = useBudgetStore
        .getState()
        .getAiUsageMemberAllocationsByMonth(divisionId, 2025, '2025-05')
      const untouchedDivision = useBudgetStore
        .getState()
        .getAiUsageMemberAllocationsByMonth(otherDivisionId, 2025, '2025-04')
      expect(untouchedMonth[0]?.monthlyBudget).toBe(0)
      expect(untouchedDivision[0]?.monthlyBudget).toBe(0)
    })

    // : 一律設定を課で絞り込んだメンバーのみに適用できるようにする
    it('bulkSetAiUsageMemberMonthlyBudgetにmemberIdsを渡すと指定メンバーのみ更新される', () => {
      const divisionId = crypto.randomUUID()
      const targetMemberId = crypto.randomUUID()
      const otherMemberId = crypto.randomUUID()
      useBudgetStore
        .getState()
        .getOrCreateAiUsageMemberAllocations(divisionId, 2025, '2025-04', [
          targetMemberId,
          otherMemberId,
        ])

      useBudgetStore
        .getState()
        .bulkSetAiUsageMemberMonthlyBudget(divisionId, 2025, '2025-04', 15, [
          targetMemberId,
        ])

      const allocations = useBudgetStore
        .getState()
        .getAiUsageMemberAllocationsByMonth(divisionId, 2025, '2025-04')
      expect(
        allocations.find((a) => a.memberId === targetMemberId)?.monthlyBudget,
      ).toBe(15)
      expect(
        allocations.find((a) => a.memberId === otherMemberId)?.monthlyBudget,
      ).toBe(0)
    })

    it('bulkSetAiUsageMemberBufferAmountにmemberIdsを渡すと指定メンバーのみ更新される', () => {
      const divisionId = crypto.randomUUID()
      const targetMemberId = crypto.randomUUID()
      const otherMemberId = crypto.randomUUID()
      useBudgetStore
        .getState()
        .getOrCreateAiUsageMemberAllocations(divisionId, 2025, '2025-04', [
          targetMemberId,
          otherMemberId,
        ])

      useBudgetStore
        .getState()
        .bulkSetAiUsageMemberBufferAmount(divisionId, 2025, '2025-04', 3, [
          targetMemberId,
        ])

      const allocations = useBudgetStore
        .getState()
        .getAiUsageMemberAllocationsByMonth(divisionId, 2025, '2025-04')
      expect(
        allocations.find((a) => a.memberId === targetMemberId)?.bufferAmount,
      ).toBe(3)
      expect(
        allocations.find((a) => a.memberId === otherMemberId)?.bufferAmount,
      ).toBe(0)
    })

    // 反証: memberIds省略時は既存どおり部門内全メンバーが対象のままであること(後方互換)
    it('memberIds省略時はbulkSetAiUsageMemberMonthlyBudgetが部門内全メンバーを対象にする', () => {
      const divisionId = crypto.randomUUID()
      const memberIds = [crypto.randomUUID(), crypto.randomUUID()]
      useBudgetStore
        .getState()
        .getOrCreateAiUsageMemberAllocations(
          divisionId,
          2025,
          '2025-04',
          memberIds,
        )

      useBudgetStore
        .getState()
        .bulkSetAiUsageMemberMonthlyBudget(divisionId, 2025, '2025-04', 15)

      const allocations = useBudgetStore
        .getState()
        .getAiUsageMemberAllocationsByMonth(divisionId, 2025, '2025-04')
      expect(allocations.every((a) => a.monthlyBudget === 15)).toBe(true)
    })

    it('getAiUsageMemberAllocationsByMonthで部門×年度×月のレコードのみ取得できる', () => {
      const divisionId = crypto.randomUUID()
      const memberId = crypto.randomUUID()
      useBudgetStore
        .getState()
        .getOrCreateAiUsageMemberAllocations(divisionId, 2025, '2025-04', [
          memberId,
        ])

      const result = useBudgetStore
        .getState()
        .getAiUsageMemberAllocationsByMonth(divisionId, 2025, '2025-04')
      expect(result).toHaveLength(1)

      const empty = useBudgetStore
        .getState()
        .getAiUsageMemberAllocationsByMonth(divisionId, 2025, '2025-05')
      expect(empty).toHaveLength(0)
    })
  })

  describe('SaaS契約CRUD', () => {
    const baseContract = {
      name: 'Test SaaS',
      divisionId: crypto.randomUUID(),
      contractType: 'annual' as const,
      amount: 120000,
      paymentCycle: 'monthly' as const,
      contractStartDate: '2025-04-01',
      nextRenewalDate: '2026-03-31',
      note: null,
    }

    it('SaaS契約を登録できる', () => {
      const contract = useBudgetStore.getState().addSaasContract(baseContract)
      expect(contract.name).toBe('Test SaaS')
      expect(useBudgetStore.getState().saasContracts).toHaveLength(1)
    })

    it('SaaS契約を更新できる', () => {
      const contract = useBudgetStore.getState().addSaasContract(baseContract)
      useBudgetStore
        .getState()
        .updateSaasContract({ id: contract.id, amount: 150000 })

      const updated = useBudgetStore
        .getState()
        .saasContracts.find((c) => c.id === contract.id)
      expect(updated?.amount).toBe(150000)
    })

    it('updateSaasContractの引数型にmonthlyActualsは存在しない（専用アクション限定を呼び出し境界で保証）', () => {
      const contract = useBudgetStore.getState().addSaasContract(baseContract)
      useBudgetStore.getState().updateSaasContract({
        id: contract.id,
        amount: 150000,
        // @ts-expect-error monthlyActualsはUpdateSaasContractの型に存在しない（setSaasContractActual専用）
        monthlyActuals: { '2025-04': 999 },
      })
    })

    it('SaaS契約を削除できる', () => {
      const contract = useBudgetStore.getState().addSaasContract(baseContract)
      useBudgetStore.getState().deleteSaasContract(contract.id)
      expect(useBudgetStore.getState().saasContracts).toHaveLength(0)
    })

    it('部門別にSaaS契約一覧を取得できる', () => {
      const divisionId = crypto.randomUUID()
      useBudgetStore.getState().addSaasContract({ ...baseContract, divisionId })
      useBudgetStore.getState().addSaasContract(baseContract)

      const contracts = useBudgetStore
        .getState()
        .getSaasContractsByDivision(divisionId)
      expect(contracts).toHaveLength(1)
    })
  })

  describe('getOrCreateDivisionBudget', () => {
    it('レコードが存在しない場合、initialAmount=0で新規作成する', () => {
      const divisionId = crypto.randomUUID()
      const budget = useBudgetStore
        .getState()
        .getOrCreateDivisionBudget(divisionId, 2025)

      expect(budget.divisionId).toBe(divisionId)
      expect(budget.fiscalYear).toBe(2025)
      expect(budget.initialAmount).toBe(0)
      expect(useBudgetStore.getState().divisionBudgets).toHaveLength(1)
    })

    it('既存レコードがある場合はそれを返し、新規作成しない', () => {
      const divisionId = crypto.randomUUID()
      const created = useBudgetStore
        .getState()
        .setInitialBudget(divisionId, 2025, 5000)
      const found = useBudgetStore
        .getState()
        .getOrCreateDivisionBudget(divisionId, 2025)

      expect(found.id).toBe(created.id)
      expect(found.initialAmount).toBe(5000)
      expect(useBudgetStore.getState().divisionBudgets).toHaveLength(1)
    })
  })

  describe('部門予算内訳（BudgetBreakdown）', () => {
    it('内訳を追加できる', () => {
      const divisionId = crypto.randomUUID()
      const budget = useBudgetStore
        .getState()
        .getOrCreateDivisionBudget(divisionId, 2025)

      const breakdown = useBudgetStore.getState().addBudgetBreakdown({
        budgetId: budget.id,
        category: 'project_personnel',
        label: '案件A',
        amount: 1200,
        recordedAt: '2025-04-01',
      })

      expect(breakdown.label).toBe('案件A')
      expect(useBudgetStore.getState().budgetBreakdowns).toHaveLength(1)
    })

    it('内訳追加後、過去のレコードは変更されない（追記専用性）', () => {
      const divisionId = crypto.randomUUID()
      const budget = useBudgetStore
        .getState()
        .getOrCreateDivisionBudget(divisionId, 2025)

      const first = useBudgetStore.getState().addBudgetBreakdown({
        budgetId: budget.id,
        category: 'project_personnel',
        label: '案件A',
        amount: 1200,
        recordedAt: '2025-04-01',
      })
      useBudgetStore.getState().addBudgetBreakdown({
        budgetId: budget.id,
        category: 'project_expense',
        label: '案件B 付帯費用',
        amount: 300,
        recordedAt: '2025-06-01',
      })

      const persistedFirst = useBudgetStore
        .getState()
        .budgetBreakdowns.find((b) => b.id === first.id)
      expect(persistedFirst).toEqual(first)
    })

    it('内訳を追加すると DivisionBudget.initialAmount が内訳合計に自動更新される', () => {
      const divisionId = crypto.randomUUID()
      const budget = useBudgetStore
        .getState()
        .getOrCreateDivisionBudget(divisionId, 2025)

      useBudgetStore.getState().addBudgetBreakdown({
        budgetId: budget.id,
        category: 'project_personnel',
        label: '案件A',
        amount: 1200,
        recordedAt: '2025-04-01',
      })
      useBudgetStore.getState().addBudgetBreakdown({
        budgetId: budget.id,
        category: 'project_expense',
        label: '案件A 付帯費用',
        amount: 300,
        recordedAt: '2025-05-01',
      })

      const updated = useBudgetStore
        .getState()
        .getDivisionBudget(divisionId, 2025)
      expect(updated?.initialAmount).toBe(1500)
    })
  })

  describe('部門予算内訳の更新・削除（追記専用原則の撤廃）', () => {
    it('内訳を更新できる（ラベル・金額の再編集）', () => {
      const divisionId = crypto.randomUUID()
      const budget = useBudgetStore
        .getState()
        .getOrCreateDivisionBudget(divisionId, 2025)
      const breakdown = useBudgetStore.getState().addBudgetBreakdown({
        budgetId: budget.id,
        category: 'project_personnel',
        label: '案件A',
        amount: 1200,
        recordedAt: '2025-04-01',
      })

      useBudgetStore.getState().updateBudgetBreakdown({
        id: breakdown.id,
        label: '案件A（修正後）',
        amount: 1500,
      })

      const updated = useBudgetStore
        .getState()
        .budgetBreakdowns.find((b) => b.id === breakdown.id)
      expect(updated?.label).toBe('案件A（修正後）')
      expect(updated?.amount).toBe(1500)
    })

    it('内訳を更新すると DivisionBudget.initialAmount が再計算される', () => {
      const divisionId = crypto.randomUUID()
      const budget = useBudgetStore
        .getState()
        .getOrCreateDivisionBudget(divisionId, 2025)
      const breakdown = useBudgetStore.getState().addBudgetBreakdown({
        budgetId: budget.id,
        category: 'project_personnel',
        label: '案件A',
        amount: 1200,
        recordedAt: '2025-04-01',
      })

      useBudgetStore
        .getState()
        .updateBudgetBreakdown({ id: breakdown.id, amount: 2000 })

      const updatedBudget = useBudgetStore
        .getState()
        .getDivisionBudget(divisionId, 2025)
      expect(updatedBudget?.initialAmount).toBe(2000)
    })

    // 反証: monthlyActualsを更新用データに含めても、型上・実行上ともに無視されるか
    // （setBudgetBreakdownActual専用アクションとの責務分離が壊れていないか）
    it('updateBudgetBreakdownの引数型にmonthlyActualsは存在しない（専用アクション限定）', () => {
      const divisionId = crypto.randomUUID()
      const budget = useBudgetStore
        .getState()
        .getOrCreateDivisionBudget(divisionId, 2025)
      const breakdown = useBudgetStore.getState().addBudgetBreakdown({
        budgetId: budget.id,
        category: 'general_expense',
        label: '一般経費',
        amount: 500,
        recordedAt: '2025-04-01',
      })
      useBudgetStore.getState().updateBudgetBreakdown({
        id: breakdown.id,
        // @ts-expect-error monthlyActualsはUpdateBudgetBreakdownの型に存在しない（setBudgetBreakdownActual専用）
        monthlyActuals: { '2025-04': 999 },
      })
    })

    it('内訳を削除できる', () => {
      const divisionId = crypto.randomUUID()
      const budget = useBudgetStore
        .getState()
        .getOrCreateDivisionBudget(divisionId, 2025)
      const breakdown = useBudgetStore.getState().addBudgetBreakdown({
        budgetId: budget.id,
        category: 'project_personnel',
        label: '案件A',
        amount: 1200,
        recordedAt: '2025-04-01',
      })

      useBudgetStore.getState().deleteBudgetBreakdown(breakdown.id)

      expect(useBudgetStore.getState().budgetBreakdowns).toHaveLength(0)
    })

    it('内訳を削除すると DivisionBudget.initialAmount が再計算される', () => {
      const divisionId = crypto.randomUUID()
      const budget = useBudgetStore
        .getState()
        .getOrCreateDivisionBudget(divisionId, 2025)
      const breakdown1 = useBudgetStore.getState().addBudgetBreakdown({
        budgetId: budget.id,
        category: 'project_personnel',
        label: '案件A',
        amount: 1200,
        recordedAt: '2025-04-01',
      })
      useBudgetStore.getState().addBudgetBreakdown({
        budgetId: budget.id,
        category: 'project_expense',
        label: '案件A 付帯費用',
        amount: 300,
        recordedAt: '2025-05-01',
      })

      useBudgetStore.getState().deleteBudgetBreakdown(breakdown1.id)

      const updatedBudget = useBudgetStore
        .getState()
        .getDivisionBudget(divisionId, 2025)
      expect(updatedBudget?.initialAmount).toBe(300)
    })

    // 反証: 他の内訳・他部門の予算に影響を与えないか（意図しない巻き込み削除・再計算がないか）
    it('削除は対象の内訳のみに影響し、他の内訳は残る', () => {
      const divisionId = crypto.randomUUID()
      const budget = useBudgetStore
        .getState()
        .getOrCreateDivisionBudget(divisionId, 2025)
      const breakdown1 = useBudgetStore.getState().addBudgetBreakdown({
        budgetId: budget.id,
        category: 'project_personnel',
        label: '案件A',
        amount: 1200,
        recordedAt: '2025-04-01',
      })
      const breakdown2 = useBudgetStore.getState().addBudgetBreakdown({
        budgetId: budget.id,
        category: 'project_expense',
        label: '案件A 付帯費用',
        amount: 300,
        recordedAt: '2025-05-01',
      })

      useBudgetStore.getState().deleteBudgetBreakdown(breakdown1.id)

      const remaining = useBudgetStore.getState().budgetBreakdowns
      expect(remaining).toHaveLength(1)
      expect(remaining[0]?.id).toBe(breakdown2.id)
    })

    // 反証: 存在しないidを更新・削除しようとしてもクラッシュせず、状態が変化しないか
    it('存在しないidのupdateBudgetBreakdownは既存データに影響を与えない', () => {
      const divisionId = crypto.randomUUID()
      const budget = useBudgetStore
        .getState()
        .getOrCreateDivisionBudget(divisionId, 2025)
      useBudgetStore.getState().addBudgetBreakdown({
        budgetId: budget.id,
        category: 'project_personnel',
        label: '案件A',
        amount: 1200,
        recordedAt: '2025-04-01',
      })

      expect(() =>
        useBudgetStore.getState().updateBudgetBreakdown({
          id: crypto.randomUUID(),
          amount: 9999,
        }),
      ).not.toThrow()
      expect(useBudgetStore.getState().budgetBreakdowns).toHaveLength(1)
      expect(useBudgetStore.getState().budgetBreakdowns[0]?.amount).toBe(1200)
    })

    it('存在しないidのdeleteBudgetBreakdownは既存データに影響を与えない', () => {
      const divisionId = crypto.randomUUID()
      const budget = useBudgetStore
        .getState()
        .getOrCreateDivisionBudget(divisionId, 2025)
      useBudgetStore.getState().addBudgetBreakdown({
        budgetId: budget.id,
        category: 'project_personnel',
        label: '案件A',
        amount: 1200,
        recordedAt: '2025-04-01',
      })

      expect(() =>
        useBudgetStore.getState().deleteBudgetBreakdown(crypto.randomUUID()),
      ).not.toThrow()
      expect(useBudgetStore.getState().budgetBreakdowns).toHaveLength(1)
    })
  })

  describe('その他費用の実績明細（BudgetBreakdownActualRecord）CRUD', () => {
    function setupBreakdown() {
      const divisionId = crypto.randomUUID()
      const budget = useBudgetStore
        .getState()
        .getOrCreateDivisionBudget(divisionId, 2025)
      const breakdown = useBudgetStore.getState().addBudgetBreakdown({
        budgetId: budget.id,
        category: 'general_expense',
        label: '一般経費',
        amount: 500,
        recordedAt: '2025-04-01',
      })
      return { divisionId, budget, breakdown }
    }

    it('実績明細を追加できる', () => {
      const { breakdown } = setupBreakdown()
      const record = useBudgetStore
        .getState()
        .addBudgetBreakdownActualRecord(breakdown.id, {
          purchasedAt: '2025-04-10',
          itemLabel: '書籍代',
          amount: 30,
        })

      expect(record.itemLabel).toBe('書籍代')
      const updated = useBudgetStore
        .getState()
        .budgetBreakdowns.find((b) => b.id === breakdown.id)
      expect(updated?.actualRecords).toHaveLength(1)
      expect(updated?.actualRecords?.[0]).toEqual(record)
    })

    it('複数件の実績明細を1つの予算枠に紐付けられる（予算1:実績Nの構造）', () => {
      const { breakdown } = setupBreakdown()
      useBudgetStore.getState().addBudgetBreakdownActualRecord(breakdown.id, {
        purchasedAt: '2025-04-10',
        itemLabel: '書籍代',
        amount: 30,
      })
      useBudgetStore.getState().addBudgetBreakdownActualRecord(breakdown.id, {
        purchasedAt: '2025-05-01',
        itemLabel: 'セミナー参加費',
        amount: 50,
      })

      const updated = useBudgetStore
        .getState()
        .budgetBreakdowns.find((b) => b.id === breakdown.id)
      expect(updated?.actualRecords).toHaveLength(2)
    })

    it('実績明細を更新できる', () => {
      const { breakdown } = setupBreakdown()
      const record = useBudgetStore
        .getState()
        .addBudgetBreakdownActualRecord(breakdown.id, {
          purchasedAt: '2025-04-10',
          itemLabel: '書籍代',
          amount: 30,
        })

      useBudgetStore
        .getState()
        .updateBudgetBreakdownActualRecord(breakdown.id, record.id, {
          amount: 45,
        })

      const updated = useBudgetStore
        .getState()
        .budgetBreakdowns.find((b) => b.id === breakdown.id)
      expect(updated?.actualRecords?.[0]?.amount).toBe(45)
      expect(updated?.actualRecords?.[0]?.itemLabel).toBe('書籍代')
    })

    it('実績明細を削除できる', () => {
      const { breakdown } = setupBreakdown()
      const record = useBudgetStore
        .getState()
        .addBudgetBreakdownActualRecord(breakdown.id, {
          purchasedAt: '2025-04-10',
          itemLabel: '書籍代',
          amount: 30,
        })

      useBudgetStore
        .getState()
        .deleteBudgetBreakdownActualRecord(breakdown.id, record.id)

      const updated = useBudgetStore
        .getState()
        .budgetBreakdowns.find((b) => b.id === breakdown.id)
      expect(updated?.actualRecords).toHaveLength(0)
    })

    it('実績明細の追加はDivisionBudget.initialAmountに影響しない（実績は予算枠の変動要因ではない）', () => {
      const { divisionId, breakdown } = setupBreakdown()
      const before = useBudgetStore
        .getState()
        .getDivisionBudget(divisionId, 2025)?.initialAmount

      useBudgetStore.getState().addBudgetBreakdownActualRecord(breakdown.id, {
        purchasedAt: '2025-04-10',
        itemLabel: '書籍代',
        amount: 9999,
      })

      const after = useBudgetStore
        .getState()
        .getDivisionBudget(divisionId, 2025)?.initialAmount
      expect(after).toBe(before)
      expect(after).toBe(500)
    })

    it('対象外の内訳レコードには一切影響しない', () => {
      const { budget, breakdown } = setupBreakdown()
      const other = useBudgetStore.getState().addBudgetBreakdown({
        budgetId: budget.id,
        category: 'general_expense',
        label: '別の一般経費',
        amount: 200,
        recordedAt: '2025-05-01',
      })

      useBudgetStore.getState().addBudgetBreakdownActualRecord(breakdown.id, {
        purchasedAt: '2025-04-10',
        itemLabel: '書籍代',
        amount: 30,
      })

      const untouched = useBudgetStore
        .getState()
        .budgetBreakdowns.find((b) => b.id === other.id)
      expect(untouched?.actualRecords ?? []).toHaveLength(0)
    })

    it('存在しない予算枠idを指定してもクラッシュせず、状態が変化しない', () => {
      const { breakdown } = setupBreakdown()
      expect(() =>
        useBudgetStore
          .getState()
          .addBudgetBreakdownActualRecord(crypto.randomUUID(), {
            purchasedAt: '2025-04-10',
            itemLabel: '書籍代',
            amount: 30,
          }),
      ).not.toThrow()

      const untouched = useBudgetStore
        .getState()
        .budgetBreakdowns.find((b) => b.id === breakdown.id)
      expect(untouched?.actualRecords ?? []).toHaveLength(0)
    })
  })

  describe('AI利用費・SaaS契約の予算総額への自動反映', () => {
    beforeEach(() => {
      // AiUsageEntryは＄建てのため、initialAmount等の万円建て集計に
      // 合算する際は為替レート換算を経由する（requirements10）。1＄=1万円相当（10000円/＄）に
      // 設定し、＄→万円換算後も既存の期待値（万円換算前と同じ数値）で検証できるようにする
      useBudgetStore.setState({
        exchangeRateHistory: [{ effectiveFrom: '2020-01', rate: 10000 }],
      })
    })

    it('AI利用費の月次予算額を設定すると initialAmount に年間合計が反映される', () => {
      const divisionId = crypto.randomUUID()
      useBudgetStore.getState().getOrCreateDivisionBudget(divisionId, 2025)

      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 300)
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-05', 200)

      const budget = useBudgetStore
        .getState()
        .getDivisionBudget(divisionId, 2025)
      expect(budget?.initialAmount).toBe(500)
    })

    it('実績額（actualAmount）の設定は initialAmount に影響しない', () => {
      const divisionId = crypto.randomUUID()
      useBudgetStore.getState().getOrCreateDivisionBudget(divisionId, 2025)
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 300)
      useBudgetStore
        .getState()
        .setAiUsageActual(divisionId, 2025, '2025-04', 999)

      const budget = useBudgetStore
        .getState()
        .getDivisionBudget(divisionId, 2025)
      expect(budget?.initialAmount).toBe(300)
    })

    it('SaaS契約を追加すると initialAmount に年間コストが反映される（月次払いは×12）', () => {
      const divisionId = crypto.randomUUID()
      useBudgetStore.getState().getOrCreateDivisionBudget(divisionId, 2025)

      useBudgetStore.getState().addSaasContract({
        name: 'Test SaaS',
        divisionId,
        contractType: 'annual',
        amount: 10,
        paymentCycle: 'monthly',
        contractStartDate: '2025-04-01',
        nextRenewalDate: '2026-03-31',
        note: null,
      })

      const budget = useBudgetStore
        .getState()
        .getDivisionBudget(divisionId, 2025)
      expect(budget?.initialAmount).toBe(120)
    })

    it('SaaS契約を削除すると initialAmount が再計算される', () => {
      const divisionId = crypto.randomUUID()
      useBudgetStore.getState().getOrCreateDivisionBudget(divisionId, 2025)
      const contract = useBudgetStore.getState().addSaasContract({
        name: 'Test SaaS',
        divisionId,
        contractType: 'annual',
        amount: 100,
        paymentCycle: 'annual',
        contractStartDate: '2025-04-01',
        nextRenewalDate: '2026-03-31',
        note: null,
      })

      useBudgetStore.getState().deleteSaasContract(contract.id)

      const budget = useBudgetStore
        .getState()
        .getDivisionBudget(divisionId, 2025)
      expect(budget?.initialAmount).toBe(0)
    })

    it('案件予算内訳・AI利用費・SaaS費用の合計が initialAmount になる', () => {
      const divisionId = crypto.randomUUID()
      const budget = useBudgetStore
        .getState()
        .getOrCreateDivisionBudget(divisionId, 2025)

      useBudgetStore.getState().addBudgetBreakdown({
        budgetId: budget.id,
        category: 'project_personnel',
        label: '案件A',
        amount: 1000,
        recordedAt: '2025-04-01',
      })
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 300)
      useBudgetStore.getState().addSaasContract({
        name: 'Test SaaS',
        divisionId,
        contractType: 'annual',
        amount: 200,
        paymentCycle: 'annual',
        contractStartDate: '2025-04-01',
        nextRenewalDate: '2026-03-31',
        note: null,
      })

      const updated = useBudgetStore
        .getState()
        .getDivisionBudget(divisionId, 2025)
      expect(updated?.initialAmount).toBe(1500)
    })

    it('getAiUsageBudgetTotalで年間の月次予算額合計を取得できる', () => {
      const divisionId = crypto.randomUUID()
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 300)
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-05', 200)

      const total = useBudgetStore
        .getState()
        .getAiUsageBudgetTotal(divisionId, 2025)
      expect(total).toBe(500)
    })

    it('getSaasAnnualCostTotalで部門のSaaS年間コスト合計を取得できる', () => {
      const divisionId = crypto.randomUUID()
      useBudgetStore.getState().addSaasContract({
        name: 'A',
        divisionId,
        contractType: 'annual',
        amount: 10,
        paymentCycle: 'monthly',
        contractStartDate: '2025-04-01',
        nextRenewalDate: '2026-03-31',
        note: null,
      })
      useBudgetStore.getState().addSaasContract({
        name: 'B',
        divisionId,
        contractType: 'annual',
        amount: 50,
        paymentCycle: 'annual',
        contractStartDate: '2025-04-01',
        nextRenewalDate: '2026-03-31',
        note: null,
      })

      const total = useBudgetStore.getState().getSaasAnnualCostTotal(divisionId)
      expect(total).toBe(170)
    })
  })

  describe('プロパー人件費セレクタ', () => {
    const baseMember = {
      name: 'テスト太郎',
      role: 'エンジニア',
      isActive: true,
      startDate: '2025-04-01',
      endDate: null,
      unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 80 }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    function setupDivision() {
      const divisionId = crypto.randomUUID()
      const sectionId = crypto.randomUUID()
      useTeamStore.setState({
        divisions: [],
        sections: [
          {
            id: sectionId,
            divisionId,
            name: '第1課',
            sortOrder: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      })
      return { divisionId, sectionId }
    }

    it('所属会社未設定のメンバーはプロパー扱いで集計対象になる', () => {
      const { divisionId, sectionId } = setupDivision()
      useMembersStore.setState({
        members: [{ ...baseMember, id: 'm1', sectionId, companyId: null }],
      })
      useAssignmentStore.setState({
        assignments: [
          {
            id: 'a1',
            projectId: 'p1',
            taskId: 't1',
            memberId: 'm1',
            monthlyValues: { '2025-04': 1.0 },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      })

      const cost = useBudgetStore
        .getState()
        .getProperPersonnelCost(divisionId, 2025, 4)
      expect(cost).toBe(80)
    })

    it('isInternal=trueの会社に所属するメンバーは集計対象になる', () => {
      const { divisionId, sectionId } = setupDivision()
      const company = useCompaniesStore.getState().addCompany('自社', true)
      useMembersStore.setState({
        members: [
          { ...baseMember, id: 'm1', sectionId, companyId: company.id },
        ],
      })
      useAssignmentStore.setState({
        assignments: [
          {
            id: 'a1',
            projectId: 'p1',
            taskId: 't1',
            memberId: 'm1',
            monthlyValues: { '2025-04': 1.0 },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      })

      const cost = useBudgetStore
        .getState()
        .getProperPersonnelCost(divisionId, 2025, 4)
      expect(cost).toBe(80)
    })

    it('isInternal=falseの会社に所属するメンバーは集計対象から除外される', () => {
      const { divisionId, sectionId } = setupDivision()
      const company = useCompaniesStore.getState().addCompany('協力会社', false)
      useMembersStore.setState({
        members: [
          { ...baseMember, id: 'm1', sectionId, companyId: company.id },
        ],
      })
      useAssignmentStore.setState({
        assignments: [
          {
            id: 'a1',
            projectId: 'p1',
            taskId: 't1',
            memberId: 'm1',
            monthlyValues: { '2025-04': 1.0 },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      })

      const cost = useBudgetStore
        .getState()
        .getProperPersonnelCost(divisionId, 2025, 4)
      expect(cost).toBe(0)
    })
  })

  describe('人件費セレクタ', () => {
    it('既存のcalcDivisionExpectedRevenueの算出結果と一致する（ロジック二重実装がないことの間接検証）', () => {
      const divisionId = crypto.randomUUID()
      const sectionId = crypto.randomUUID()

      useTeamStore.setState({
        divisions: [],
        sections: [
          {
            id: sectionId,
            divisionId,
            name: '第1課',
            sortOrder: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      })

      const member = {
        id: 'm1',
        name: '田中太郎',
        sectionId,
        role: 'エンジニア',
        isActive: true,
        startDate: '2025-04-01',
        endDate: null,
        unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 80 }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      useMembersStore.setState({ members: [member] })

      useAssignmentStore.setState({
        assignments: [
          {
            id: 'a1',
            projectId: 'p1',
            taskId: 't1',
            memberId: 'm1',
            monthlyValues: { '2025-04': 1.0 },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      })

      const fromStore = useBudgetStore
        .getState()
        .getPersonnelCost(divisionId, 2025, 4)

      const expected = calcDivisionExpectedRevenue(
        useTeamStore.getState().sections,
        useMembersStore.getState().members,
        useAssignmentStore.getState().getMemberMonthlyTotal,
        2025,
        4,
      )

      expect(fromStore).toBe(expected)
      expect(fromStore).toBe(80)
    })
  })

  describe('setBudgetBreakdownActual（月次実績・追記専用原則の限定的例外）', () => {
    function setupBreakdown() {
      const divisionId = crypto.randomUUID()
      const budget = useBudgetStore
        .getState()
        .getOrCreateDivisionBudget(divisionId, 2025)
      const breakdown = useBudgetStore.getState().addBudgetBreakdown({
        budgetId: budget.id,
        category: 'project_personnel',
        label: '案件A',
        amount: 1000,
        recordedAt: '2025-04-01',
      })
      return { divisionId, budget, breakdown }
    }

    it('月次実績を登録できる', () => {
      const { breakdown } = setupBreakdown()
      useBudgetStore
        .getState()
        .setBudgetBreakdownActual(breakdown.id, '2025-04', 90)

      const updated = useBudgetStore
        .getState()
        .budgetBreakdowns.find((b) => b.id === breakdown.id)
      expect(updated?.monthlyActuals).toEqual({ '2025-04': 90 })
    })

    it('複数月を登録しても既存月の値が消えない（マージされる）', () => {
      const { breakdown } = setupBreakdown()
      useBudgetStore
        .getState()
        .setBudgetBreakdownActual(breakdown.id, '2025-04', 90)
      useBudgetStore
        .getState()
        .setBudgetBreakdownActual(breakdown.id, '2025-05', 110)

      const updated = useBudgetStore
        .getState()
        .budgetBreakdowns.find((b) => b.id === breakdown.id)
      expect(updated?.monthlyActuals).toEqual({
        '2025-04': 90,
        '2025-05': 110,
      })
    })

    it('同一月に再登録すると上書きされる（前の値が残らない）', () => {
      const { breakdown } = setupBreakdown()
      useBudgetStore
        .getState()
        .setBudgetBreakdownActual(breakdown.id, '2025-04', 90)
      useBudgetStore
        .getState()
        .setBudgetBreakdownActual(breakdown.id, '2025-04', 120)

      const updated = useBudgetStore
        .getState()
        .budgetBreakdowns.find((b) => b.id === breakdown.id)
      expect(updated?.monthlyActuals).toEqual({ '2025-04': 120 })
    })

    it('nullで更新すると当該月のキーが削除され「未記録」に戻る', () => {
      const { breakdown } = setupBreakdown()
      useBudgetStore
        .getState()
        .setBudgetBreakdownActual(breakdown.id, '2025-04', 90)
      useBudgetStore
        .getState()
        .setBudgetBreakdownActual(breakdown.id, '2025-05', 110)

      useBudgetStore
        .getState()
        .setBudgetBreakdownActual(breakdown.id, '2025-04', null)

      const updated = useBudgetStore
        .getState()
        .budgetBreakdowns.find((b) => b.id === breakdown.id)
      expect(updated?.monthlyActuals).toEqual({ '2025-05': 110 })
      expect(updated?.monthlyActuals).not.toHaveProperty('2025-04')
    })

    it('対象外の内訳レコードには一切影響しない', () => {
      const { budget, breakdown } = setupBreakdown()
      const other = useBudgetStore.getState().addBudgetBreakdown({
        budgetId: budget.id,
        category: 'project_expense',
        label: '案件A 付帯費用',
        amount: 200,
        recordedAt: '2025-05-01',
      })

      useBudgetStore
        .getState()
        .setBudgetBreakdownActual(breakdown.id, '2025-04', 90)

      const untouched = useBudgetStore
        .getState()
        .budgetBreakdowns.find((b) => b.id === other.id)
      expect(untouched).toEqual(other)
      expect(untouched?.monthlyActuals).toBeUndefined()
    })

    it('amount/category/labelなど予算内容そのものは変更されない（追記専用の主要フィールドを保護）', () => {
      const { breakdown } = setupBreakdown()
      useBudgetStore
        .getState()
        .setBudgetBreakdownActual(breakdown.id, '2025-04', 90)

      const updated = useBudgetStore
        .getState()
        .budgetBreakdowns.find((b) => b.id === breakdown.id)
      expect(updated?.amount).toBe(breakdown.amount)
      expect(updated?.category).toBe(breakdown.category)
      expect(updated?.label).toBe(breakdown.label)
      expect(updated?.recordedAt).toBe(breakdown.recordedAt)
    })

    it('DivisionBudget.initialAmount に影響しない', () => {
      const { divisionId, breakdown } = setupBreakdown()
      const before = useBudgetStore
        .getState()
        .getDivisionBudget(divisionId, 2025)?.initialAmount

      useBudgetStore
        .getState()
        .setBudgetBreakdownActual(breakdown.id, '2025-04', 999999)

      const after = useBudgetStore
        .getState()
        .getDivisionBudget(divisionId, 2025)?.initialAmount
      expect(after).toBe(before)
      expect(after).toBe(1000)
    })

    it('存在しないIDを指定しても他のレコードやエラーを起こさない', () => {
      const { breakdown } = setupBreakdown()
      expect(() =>
        useBudgetStore
          .getState()
          .setBudgetBreakdownActual('nonexistent-id', '2025-04', 90),
      ).not.toThrow()

      const untouched = useBudgetStore
        .getState()
        .budgetBreakdowns.find((b) => b.id === breakdown.id)
      expect(untouched).toEqual(breakdown)
    })

    it('jsonStorage.saveが呼ばれる（DataAdapter経由・非同期）', async () => {
      const { breakdown } = setupBreakdown()
      mockSave.mockClear()
      useBudgetStore
        .getState()
        .setBudgetBreakdownActual(breakdown.id, '2025-04', 90)
      await flushMicrotasks()
      expect(mockSave).toHaveBeenCalled()
    })
  })

  describe('setSaasContractActual（月次実績・追記専用原則の限定的例外）', () => {
    function setupContract() {
      const divisionId = crypto.randomUUID()
      const contract = useBudgetStore.getState().addSaasContract({
        name: 'Test SaaS',
        divisionId,
        contractType: 'annual',
        amount: 100,
        paymentCycle: 'monthly',
        contractStartDate: '2025-04-01',
        nextRenewalDate: '2026-03-31',
        note: null,
      })
      return { divisionId, contract }
    }

    it('月次実績を登録できる', () => {
      const { contract } = setupContract()
      useBudgetStore
        .getState()
        .setSaasContractActual(contract.id, '2025-04', 95)

      const updated = useBudgetStore
        .getState()
        .saasContracts.find((c) => c.id === contract.id)
      expect(updated?.monthlyActuals).toEqual({ '2025-04': 95 })
    })

    it('amountHistory（契約金額改定履歴）とは独立して扱われる', () => {
      const { contract } = setupContract()
      useBudgetStore.getState().updateSaasContract({
        id: contract.id,
        amountHistory: [{ effectiveFrom: '2025-10', amount: 120 }],
      })
      useBudgetStore
        .getState()
        .setSaasContractActual(contract.id, '2025-04', 95)

      const updated = useBudgetStore
        .getState()
        .saasContracts.find((c) => c.id === contract.id)
      expect(updated?.amountHistory).toEqual([
        { effectiveFrom: '2025-10', amount: 120 },
      ])
      expect(updated?.monthlyActuals).toEqual({ '2025-04': 95 })
    })

    it('nullで更新すると当該月のキーが削除され「未記録」に戻る', () => {
      const { contract } = setupContract()
      useBudgetStore
        .getState()
        .setSaasContractActual(contract.id, '2025-04', 95)
      useBudgetStore
        .getState()
        .setSaasContractActual(contract.id, '2025-05', 100)

      useBudgetStore
        .getState()
        .setSaasContractActual(contract.id, '2025-04', null)

      const updated = useBudgetStore
        .getState()
        .saasContracts.find((c) => c.id === contract.id)
      expect(updated?.monthlyActuals).toEqual({ '2025-05': 100 })
      expect(updated?.monthlyActuals).not.toHaveProperty('2025-04')
    })

    it('対象外の契約には一切影響しない', () => {
      const { divisionId, contract } = setupContract()
      const other = useBudgetStore.getState().addSaasContract({
        name: 'Other SaaS',
        divisionId,
        contractType: 'annual',
        amount: 50,
        paymentCycle: 'annual',
        contractStartDate: '2025-04-01',
        nextRenewalDate: '2026-03-31',
        note: null,
      })

      useBudgetStore
        .getState()
        .setSaasContractActual(contract.id, '2025-04', 95)

      const untouched = useBudgetStore
        .getState()
        .saasContracts.find((c) => c.id === other.id)
      expect(untouched).toEqual(other)
    })

    it('DivisionBudget.initialAmount に影響しない', () => {
      const { divisionId } = setupContract()
      const contract = useBudgetStore
        .getState()
        .getSaasContractsByDivision(divisionId)[0]
      if (!contract) throw new Error('setup failed')

      const before = useBudgetStore
        .getState()
        .getDivisionBudget(divisionId, 2025)?.initialAmount

      useBudgetStore
        .getState()
        .setSaasContractActual(contract.id, '2025-04', 999999)

      const after = useBudgetStore
        .getState()
        .getDivisionBudget(divisionId, 2025)?.initialAmount
      expect(after).toBe(before)
    })

    it('存在しないIDを指定しても他のレコードやエラーを起こさない', () => {
      const { contract } = setupContract()
      expect(() =>
        useBudgetStore
          .getState()
          .setSaasContractActual('nonexistent-id', '2025-04', 90),
      ).not.toThrow()

      const untouched = useBudgetStore
        .getState()
        .saasContracts.find((c) => c.id === contract.id)
      expect(untouched).toEqual(contract)
    })
  })

  describe('概算単価（estimatedUnitPrice）CRUD', () => {
    it('概算単価を設定できる', () => {
      useBudgetStore.getState().setEstimatedUnitPrice(80)
      expect(useBudgetStore.getState().getEstimatedUnitPrice()).toBe(80)
    })

    it('未設定時の初期値は0', () => {
      expect(useBudgetStore.getState().getEstimatedUnitPrice()).toBe(0)
    })

    it('設定するとjsonStorage.saveが呼ばれる', () => {
      useBudgetStore.getState().setEstimatedUnitPrice(100)
      expect(mockSave).toHaveBeenCalled()
      const savedData = mockSave.mock.calls.at(-1)?.[0] as Database | undefined
      expect(savedData?.estimatedUnitPrice).toBe(100)
    })

    // 反証: 全社共通・単一値という仕様どおり、複数回の設定で最新値のみが残るか
    // （部門別に分かれてしまっていないか）
    it('複数回設定しても単一値として最新値のみが残る（部門別に分岐しない）', () => {
      useBudgetStore.getState().setEstimatedUnitPrice(80)
      useBudgetStore.getState().setEstimatedUnitPrice(90)
      expect(useBudgetStore.getState().getEstimatedUnitPrice()).toBe(90)
    })
  })

  describe('係数（defaultCoefficient / projectCoefficients）CRUD', () => {
    it('デフォルト係数を設定できる', () => {
      useBudgetStore.getState().setDefaultCoefficient(1.25)
      expect(useBudgetStore.getState().defaultCoefficient).toBe(1.25)
    })

    it('未設定時の初期値は1', () => {
      expect(useBudgetStore.getState().defaultCoefficient).toBe(1)
    })

    it('案件別の係数を設定できる', () => {
      const projectId = crypto.randomUUID()
      useBudgetStore.getState().setProjectCoefficient(projectId, 1.5)
      expect(useBudgetStore.getState().getProjectCoefficient(projectId)).toBe(
        1.5,
      )
    })

    it('案件別の係数が未設定の場合はdefaultCoefficientにフォールバックする', () => {
      const projectId = crypto.randomUUID()
      useBudgetStore.getState().setDefaultCoefficient(1.25)
      expect(useBudgetStore.getState().getProjectCoefficient(projectId)).toBe(
        1.25,
      )
    })

    it('defaultCoefficientも未設定の場合は1にフォールバックする', () => {
      const projectId = crypto.randomUUID()
      expect(useBudgetStore.getState().getProjectCoefficient(projectId)).toBe(1)
    })

    // 反証: ある案件の係数変更が他案件の係数に影響しないか
    it('1案件の係数を変更しても他案件の係数には影響しない', () => {
      const projectA = crypto.randomUUID()
      const projectB = crypto.randomUUID()
      useBudgetStore.getState().setProjectCoefficient(projectA, 2)
      useBudgetStore.getState().setProjectCoefficient(projectB, 3)
      useBudgetStore.getState().setProjectCoefficient(projectA, 5)

      expect(useBudgetStore.getState().getProjectCoefficient(projectA)).toBe(5)
      expect(useBudgetStore.getState().getProjectCoefficient(projectB)).toBe(3)
    })

    it('設定するとjsonStorage.saveが呼ばれる', () => {
      const projectId = crypto.randomUUID()
      useBudgetStore.getState().setDefaultCoefficient(1.1)
      useBudgetStore.getState().setProjectCoefficient(projectId, 1.2)
      expect(mockSave).toHaveBeenCalled()
      const savedData = mockSave.mock.calls.at(-1)?.[0] as Database | undefined
      expect(savedData?.defaultCoefficient).toBe(1.1)
      expect(savedData?.projectCoefficients?.[projectId]).toBe(1.2)
    })
  })

  describe('為替レート（exchangeRateHistory、requirements10）', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('setExchangeRateは「現在の月」を起点に履歴へ追記する', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2025, 5, 15)) // 2025-06-15

      useBudgetStore.getState().setExchangeRate(150)

      expect(useBudgetStore.getState().exchangeRateHistory).toEqual([
        { effectiveFrom: '2025-06', rate: 150 },
      ])
    })

    it('同一月内の再設定は追記せず上書きする（履歴が無駄に増えない）', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2025, 5, 1))

      useBudgetStore.getState().setExchangeRate(150)
      vi.setSystemTime(new Date(2025, 5, 20))
      useBudgetStore.getState().setExchangeRate(155)

      expect(useBudgetStore.getState().exchangeRateHistory).toEqual([
        { effectiveFrom: '2025-06', rate: 155 },
      ])
    })

    it('月をまたいで再設定すると過去分は保持したまま新しい履歴エントリが追加される', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2025, 5, 15)) // 2025-06
      useBudgetStore.getState().setExchangeRate(150)

      vi.setSystemTime(new Date(2025, 6, 1)) // 2025-07
      useBudgetStore.getState().setExchangeRate(160)

      expect(useBudgetStore.getState().exchangeRateHistory).toEqual([
        { effectiveFrom: '2025-06', rate: 150 },
        { effectiveFrom: '2025-07', rate: 160 },
      ])
    })

    it('getApplicableExchangeRateは対象月に有効な履歴上のレートを返す', () => {
      useBudgetStore.setState({
        exchangeRateHistory: [
          { effectiveFrom: '2025-04', rate: 150 },
          { effectiveFrom: '2025-07', rate: 160 },
        ],
      })
      expect(
        useBudgetStore.getState().getApplicableExchangeRate('2025-06'),
      ).toBe(150)
      expect(
        useBudgetStore.getState().getApplicableExchangeRate('2025-08'),
      ).toBe(160)
    })

    // 反証: AI利用費の月ごとに異なるレートが「そのタイミングで」正しく適用されるか
    // （固定レートではなく、エントリのmonthに応じて履歴から引き直しているか）
    it('AI利用費の集計は各エントリの対象月に有効なレートで換算される（レート変更をまたぐケース）', () => {
      const divisionId = crypto.randomUUID()
      useBudgetStore.setState({
        exchangeRateHistory: [
          { effectiveFrom: '2025-04', rate: 100 },
          { effectiveFrom: '2025-05', rate: 200 },
        ],
      })
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 10) // 10＄×100円=1000円=0.1万円
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-05', 10) // 10＄×200円=2000円=0.2万円

      const total = useBudgetStore
        .getState()
        .getAiUsageBudgetTotal(divisionId, 2025)
      expect(total).toBeCloseTo(0.3)
    })

    it('為替レートが対象月に及ぶ場合、AI利用費を持つ部門のinitialAmountが再計算される', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2025, 3, 15)) // 2025-04

      const divisionId = crypto.randomUUID()
      useBudgetStore.getState().getOrCreateDivisionBudget(divisionId, 2025)
      useBudgetStore.getState().setExchangeRate(100)
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 100) // 100＄×100円=1万円

      expect(
        useBudgetStore.getState().getDivisionBudget(divisionId, 2025)
          ?.initialAmount,
      ).toBe(1)

      // 同月内にレートを変更すると、同じ月のAI利用費エントリの円換算額・initialAmountも
      // 再計算される（そのタイミングでのレートで都度計算するため）
      useBudgetStore.getState().setExchangeRate(200)
      expect(
        useBudgetStore.getState().getDivisionBudget(divisionId, 2025)
          ?.initialAmount,
      ).toBe(2)
    })

    it('過去の月に設定したAI利用費は、その後の為替レート変更（未来の月起点）の影響を受けない', () => {
      const divisionId = crypto.randomUUID()
      useBudgetStore.setState({
        exchangeRateHistory: [{ effectiveFrom: '2020-01', rate: 100 }],
      })
      useBudgetStore.getState().getOrCreateDivisionBudget(divisionId, 2025)
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 100) // 100＄×100円=1万円

      expect(
        useBudgetStore.getState().getDivisionBudget(divisionId, 2025)
          ?.initialAmount,
      ).toBe(1)

      // setExchangeRateは「現在の月」を起点に追記するため、実行時点が2025-04より未来であれば
      // 2025-04時点の実効レートには影響しない（そのタイミングでのレートを使うため）
      useBudgetStore.getState().setExchangeRate(200)
      expect(
        useBudgetStore.getState().getDivisionBudget(divisionId, 2025)
          ?.initialAmount,
      ).toBe(1)
    })

    it('未設定（履歴が空）の場合はAI利用費が万円換算に反映されない（0扱い）', () => {
      const divisionId = crypto.randomUUID()
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 100)

      const total = useBudgetStore
        .getState()
        .getAiUsageBudgetTotal(divisionId, 2025)
      expect(total).toBe(0)
    })
  })

  describe('getBudgetOverview（部門予算俯瞰集計）', () => {
    it('内訳区分別・AI利用費・SaaS費用・人件費予算・総合計を算出する', () => {
      const divisionId = crypto.randomUUID()
      // AiUsageEntryは＄建てのため、1＄=1万円相当（10000円/＄）に設定して既存の期待値のまま検証する
      useBudgetStore.setState({
        exchangeRateHistory: [{ effectiveFrom: '2020-01', rate: 10000 }],
      })
      const budget = useBudgetStore
        .getState()
        .getOrCreateDivisionBudget(divisionId, 2025)
      useBudgetStore.getState().addBudgetBreakdown({
        budgetId: budget.id,
        category: 'project_personnel',
        label: '案件A',
        amount: 1000,
        recordedAt: '2025-04-01',
      })
      useBudgetStore.getState().addBudgetBreakdown({
        budgetId: budget.id,
        category: 'project_expense',
        label: '案件A 付帯費用',
        amount: 200,
        recordedAt: '2025-04-01',
      })
      useBudgetStore.getState().addBudgetBreakdown({
        budgetId: budget.id,
        category: 'general_expense',
        label: '一般経費',
        amount: 50,
        recordedAt: '2025-04-01',
      })
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 30)
      useBudgetStore.getState().addSaasContract({
        name: 'Test SaaS',
        divisionId,
        contractType: 'monthly',
        amount: 10,
        paymentCycle: 'monthly',
        contractStartDate: '2025-04-01',
        nextRenewalDate: '2026-03-31',
        note: null,
      })
      useBudgetStore.getState().setEstimatedUnitPrice(100)
      usePersonnelPlanStore
        .getState()
        .getOrCreateAllCategories(divisionId, 2025)
      const [personnelEntry] = usePersonnelPlanStore
        .getState()
        .getPersonnelPlansByDivision(divisionId, 2025)
      if (!personnelEntry) throw new Error('entry not found')
      usePersonnelPlanStore.getState().updatePersonnelPlanEntry({
        id: personnelEntry.id,
        monthlyHeadcount: { '2025-04': 1 },
      })

      const overview = useBudgetStore
        .getState()
        .getBudgetOverview(divisionId, 2025)

      expect(overview.projectPersonnelTotal).toBe(1000)
      expect(overview.projectExpenseTotal).toBe(200)
      expect(overview.generalExpenseTotal).toBe(50)
      expect(overview.aiUsageBudgetTotal).toBe(30)
      expect(overview.saasCostTotal).toBe(120) // 月次10×12
      expect(overview.personnelPlanBudgetTotal).toBe(100) // 1人×概算単価100
      expect(overview.grandTotal).toBe(1000 + 200 + 50 + 30 + 120 + 100)
    })

    it('データが何もない部門では全項目0を返す', () => {
      const divisionId = crypto.randomUUID()
      const overview = useBudgetStore
        .getState()
        .getBudgetOverview(divisionId, 2025)

      expect(overview.projectPersonnelTotal).toBe(0)
      expect(overview.projectExpenseTotal).toBe(0)
      expect(overview.generalExpenseTotal).toBe(0)
      expect(overview.aiUsageBudgetTotal).toBe(0)
      expect(overview.saasCostTotal).toBe(0)
      expect(overview.personnelPlanBudgetTotal).toBe(0)
      expect(overview.grandTotal).toBe(0)
    })

    // 反証: 他部門のデータが混入して合計値を歪めていないか
    it('他部門のデータは集計に含まれない', () => {
      const divisionId = crypto.randomUUID()
      const otherDivisionId = crypto.randomUUID()
      const otherBudget = useBudgetStore
        .getState()
        .getOrCreateDivisionBudget(otherDivisionId, 2025)
      useBudgetStore.getState().addBudgetBreakdown({
        budgetId: otherBudget.id,
        category: 'project_personnel',
        label: '他部門の案件',
        amount: 9999,
        recordedAt: '2025-04-01',
      })

      const overview = useBudgetStore
        .getState()
        .getBudgetOverview(divisionId, 2025)
      expect(overview.projectPersonnelTotal).toBe(0)
      expect(overview.grandTotal).toBe(0)
    })

    // 反証: 人員計画の4区分すべての予定人数が合算されるか（プロパー1区分だけに偏っていないか）
    it('人件費予算は4区分すべての予定人数を合算する', () => {
      const divisionId = crypto.randomUUID()
      useBudgetStore.getState().setEstimatedUnitPrice(100)
      const entries = usePersonnelPlanStore
        .getState()
        .getOrCreateAllCategories(divisionId, 2025)
      for (const entry of entries) {
        usePersonnelPlanStore.getState().updatePersonnelPlanEntry({
          id: entry.id,
          monthlyHeadcount: { '2025-04': 1 },
        })
      }

      const overview = useBudgetStore
        .getState()
        .getBudgetOverview(divisionId, 2025)
      // 4区分 × 1人 × 単価100 = 400
      expect(overview.personnelPlanBudgetTotal).toBe(400)
    })

    describe('projectWbsEstimateTotal', () => {
      beforeEach(() => {
        useProjectsStore.setState({ projects: [] })
        useEffortsStore.setState({ efforts: [] })
      })

      it('担当部門一致のトップレベル案件のWBS概算予算額を人月換算で合算する', () => {
        const divisionId = crypto.randomUUID()
        useBudgetStore.getState().setEstimatedUnitPrice(100)
        const project = useProjectsStore.getState().addProject({
          code: 'P001',
          name: 'テスト案件',
          parentId: null,
          level: 0,
          status: 'active',
          confidence: null,
          completed: false,
          divisionId,
        })
        useEffortsStore.getState().upsertEffort({
          projectId: project.id,
          columnId: 'effort-1',
          value: 40,
        })

        const overview = useBudgetStore
          .getState()
          .getBudgetOverview(divisionId, 2025)
        // 40人日 ÷ 20 = 2.0人月 × 概算単価100 × 係数1(デフォルト) = 200
        expect(overview.projectWbsEstimateTotal).toBe(200)
        expect(overview.grandTotal).toBe(200)
      })

      it('担当部門が異なる案件・未設定の案件は合算対象外', () => {
        const divisionId = crypto.randomUUID()
        const otherDivisionId = crypto.randomUUID()
        useBudgetStore.getState().setEstimatedUnitPrice(100)
        const otherProject = useProjectsStore.getState().addProject({
          code: 'P001',
          name: '他部門案件',
          parentId: null,
          level: 0,
          status: 'active',
          confidence: null,
          completed: false,
          divisionId: otherDivisionId,
        })
        const unsetProject = useProjectsStore.getState().addProject({
          code: 'P002',
          name: '未設定案件',
          parentId: null,
          level: 0,
          status: 'active',
          confidence: null,
          completed: false,
          divisionId: null,
        })
        useEffortsStore.getState().upsertEffort({
          projectId: otherProject.id,
          columnId: 'effort-1',
          value: 100,
        })
        useEffortsStore.getState().upsertEffort({
          projectId: unsetProject.id,
          columnId: 'effort-1',
          value: 100,
        })

        const overview = useBudgetStore
          .getState()
          .getBudgetOverview(divisionId, 2025)
        expect(overview.projectWbsEstimateTotal).toBe(0)
      })

      // 反証: BudgetBreakdownに手動計上済み（projectId紐付け済み）の案件はWBS概算側で
      // 二重計上されないか
      it('BudgetBreakdown.projectIdで既に手動計上済みの案件はWBS概算から除外する（二重計上防止）', () => {
        const divisionId = crypto.randomUUID()
        useBudgetStore.getState().setEstimatedUnitPrice(100)
        const project = useProjectsStore.getState().addProject({
          code: 'P001',
          name: 'テスト案件',
          parentId: null,
          level: 0,
          status: 'active',
          confidence: null,
          completed: false,
          divisionId,
        })
        useEffortsStore.getState().upsertEffort({
          projectId: project.id,
          columnId: 'effort-1',
          value: 40,
        })
        const budget = useBudgetStore
          .getState()
          .getOrCreateDivisionBudget(divisionId, 2025)
        useBudgetStore.getState().addBudgetBreakdown({
          budgetId: budget.id,
          category: 'project_personnel',
          label: 'テスト案件（手動計上）',
          amount: 500,
          recordedAt: '2025-04-01',
          projectId: project.id,
        })

        const overview = useBudgetStore
          .getState()
          .getBudgetOverview(divisionId, 2025)
        expect(overview.projectPersonnelTotal).toBe(500)
        // WBS概算(200)は手動計上済みのため除外され、0のまま
        expect(overview.projectWbsEstimateTotal).toBe(0)
      })

      it('係数（案件別）が設定されている場合はその係数を使用する', () => {
        const divisionId = crypto.randomUUID()
        useBudgetStore.getState().setEstimatedUnitPrice(100)
        const project = useProjectsStore.getState().addProject({
          code: 'P001',
          name: 'テスト案件',
          parentId: null,
          level: 0,
          status: 'active',
          confidence: null,
          completed: false,
          divisionId,
        })
        useEffortsStore.getState().upsertEffort({
          projectId: project.id,
          columnId: 'effort-1',
          value: 40,
        })
        useBudgetStore.getState().setProjectCoefficient(project.id, 1.5)

        const overview = useBudgetStore
          .getState()
          .getBudgetOverview(divisionId, 2025)
        // 2.0人月 × 100 × 1.5 = 300
        expect(overview.projectWbsEstimateTotal).toBe(300)
      })
    })
  })

  describe('全部門集計（ForDivisionsセレクタ）', () => {
    it('getAiUsageBudgetTotalForDivisionsは複数部門のAI利用費予算を合算する', () => {
      // AiUsageEntryは＄建てのため、1＄=1万円相当（10000円/＄）に設定して既存の期待値のまま検証する
      useBudgetStore.setState({
        exchangeRateHistory: [{ effectiveFrom: '2020-01', rate: 10000 }],
      })
      const divisionA = crypto.randomUUID()
      const divisionB = crypto.randomUUID()
      useBudgetStore.getState().setAiUsageBudget(divisionA, 2025, '2025-04', 30)
      useBudgetStore.getState().setAiUsageBudget(divisionB, 2025, '2025-04', 20)

      expect(
        useBudgetStore
          .getState()
          .getAiUsageBudgetTotalForDivisions([divisionA, divisionB], 2025),
      ).toBe(50)
    })

    it('getAiUsageTotalForDivisionsは複数部門のAI利用費実績を合算する', () => {
      useBudgetStore.setState({
        exchangeRateHistory: [{ effectiveFrom: '2020-01', rate: 10000 }],
      })
      const divisionA = crypto.randomUUID()
      const divisionB = crypto.randomUUID()
      useBudgetStore.getState().setAiUsageActual(divisionA, 2025, '2025-04', 15)
      useBudgetStore.getState().setAiUsageActual(divisionB, 2025, '2025-04', 25)

      expect(
        useBudgetStore
          .getState()
          .getAiUsageTotalForDivisions([divisionA, divisionB], 2025),
      ).toBe(40)
    })

    it('getSaasAnnualCostTotalForDivisionsは複数部門のSaaS年間コストを合算する', () => {
      const divisionA = crypto.randomUUID()
      const divisionB = crypto.randomUUID()
      useBudgetStore.getState().addSaasContract({
        name: 'A社SaaS',
        divisionId: divisionA,
        contractType: 'annual',
        amount: 1000,
        paymentCycle: 'annual',
        contractStartDate: '2025-04-01',
        nextRenewalDate: '2026-03-31',
        note: null,
      })
      useBudgetStore.getState().addSaasContract({
        name: 'B社SaaS',
        divisionId: divisionB,
        contractType: 'monthly',
        amount: 100,
        paymentCycle: 'monthly',
        contractStartDate: '2025-04-01',
        nextRenewalDate: '2026-03-31',
        note: null,
      })

      expect(
        useBudgetStore
          .getState()
          .getSaasAnnualCostTotalForDivisions([divisionA, divisionB]),
      ).toBe(1000 + 100 * 12)
    })

    it('getBudgetOverviewForDivisionsは複数部門の俯瞰集計を項目ごとに合算する', () => {
      const divisionA = crypto.randomUUID()
      const divisionB = crypto.randomUUID()
      const budgetA = useBudgetStore
        .getState()
        .getOrCreateDivisionBudget(divisionA, 2025)
      const budgetB = useBudgetStore
        .getState()
        .getOrCreateDivisionBudget(divisionB, 2025)
      useBudgetStore.getState().addBudgetBreakdown({
        budgetId: budgetA.id,
        category: 'project_personnel',
        label: 'A部門案件',
        amount: 1000,
        recordedAt: '2025-04-01',
      })
      useBudgetStore.getState().addBudgetBreakdown({
        budgetId: budgetB.id,
        category: 'project_personnel',
        label: 'B部門案件',
        amount: 500,
        recordedAt: '2025-04-01',
      })

      const overview = useBudgetStore
        .getState()
        .getBudgetOverviewForDivisions([divisionA, divisionB], 2025)
      expect(overview.projectPersonnelTotal).toBe(1500)
      expect(overview.grandTotal).toBe(1500)
    })

    // 反証: 全部門集計（部門1件のみ）は単一部門集計getBudgetOverviewの結果と一致するか
    // （整合性検証、FR-020受け入れ基準）
    it('反証: 部門を1件のみ渡した場合、getBudgetOverviewの結果と完全一致する', () => {
      const divisionId = crypto.randomUUID()
      const budget = useBudgetStore
        .getState()
        .getOrCreateDivisionBudget(divisionId, 2025)
      useBudgetStore.getState().addBudgetBreakdown({
        budgetId: budget.id,
        category: 'general_expense',
        label: '一般経費',
        amount: 77,
        recordedAt: '2025-04-01',
      })
      useBudgetStore
        .getState()
        .setAiUsageBudget(divisionId, 2025, '2025-04', 10)

      const single = useBudgetStore
        .getState()
        .getBudgetOverview(divisionId, 2025)
      const forDivisions = useBudgetStore
        .getState()
        .getBudgetOverviewForDivisions([divisionId], 2025)
      expect(forDivisions).toEqual(single)
    })

    // 反証: 部門ID配列が空の場合は全項目0を返す（例外を投げない）
    it('反証: 部門ID配列が空の場合はgetBudgetOverviewForDivisionsが全項目0を返す', () => {
      const overview = useBudgetStore
        .getState()
        .getBudgetOverviewForDivisions([], 2025)
      expect(overview.grandTotal).toBe(0)
      expect(overview.projectPersonnelTotal).toBe(0)
    })

    it('反証: 部門ID配列が空の場合は各ForDivisionsセレクタが0を返す', () => {
      expect(
        useBudgetStore.getState().getAiUsageBudgetTotalForDivisions([], 2025),
      ).toBe(0)
      expect(
        useBudgetStore.getState().getAiUsageTotalForDivisions([], 2025),
      ).toBe(0)
      expect(
        useBudgetStore.getState().getSaasAnnualCostTotalForDivisions([]),
      ).toBe(0)
    })
  })

  describe('loadBudgetData', () => {
    it('DataAdapter経由でdivisionBudgetsを読み込める', async () => {
      const divisionId = crypto.randomUUID()
      // loadBudgetData()は設定値の同期読み込み1回＋7エンティティ分のDataAdapter.list()
      // （内部でjsonStorage.load()を都度呼ぶ）が発火するため、mockReturnValueOnceでは
      // 最初の呼び出し（設定値側）にしか反映されない。全呼び出しで同じデータを返す
      // mockReturnValueを使う
      mockLoad.mockReturnValue({
        ...(mockDb as Database),
        divisionBudgets: [
          {
            id: crypto.randomUUID(),
            divisionId,
            fiscalYear: 2025,
            initialAmount: 5000,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      } as Database)

      useBudgetStore.getState().loadBudgetData()
      await flushMicrotasks()
      expect(useBudgetStore.getState().divisionBudgets).toHaveLength(1)
    })

    it('estimatedUnitPriceを読み込める', async () => {
      mockLoad.mockReturnValueOnce({
        ...(mockDb as Database),
        estimatedUnitPrice: 120,
      } as Database)

      useBudgetStore.getState().loadBudgetData()
      await flushMicrotasks()
      expect(useBudgetStore.getState().estimatedUnitPrice).toBe(120)
    })

    it('estimatedUnitPriceが未定義の場合は0になる（後方互換）', async () => {
      mockLoad.mockReturnValueOnce({ ...(mockDb as Database) } as Database)
      useBudgetStore.getState().loadBudgetData()
      await flushMicrotasks()
      expect(useBudgetStore.getState().estimatedUnitPrice).toBe(0)
    })

    it('aiUsageMemberAllocationsが未定義の場合は空配列になる（既存データとの後方互換）', async () => {
      const { aiUsageMemberAllocations: _omit, ...dbWithoutAllocations } =
        mockDb as Database
      mockLoad.mockReturnValue({
        ...dbWithoutAllocations,
      } as Database)
      useBudgetStore.getState().loadBudgetData()
      await flushMicrotasks()
      expect(useBudgetStore.getState().aiUsageMemberAllocations).toEqual([])
    })

    it('aiUsageMemberAllocationsを読み込める', async () => {
      const divisionId = crypto.randomUUID()
      mockLoad.mockReturnValue({
        ...(mockDb as Database),
        aiUsageMemberAllocations: [
          {
            id: crypto.randomUUID(),
            divisionId,
            fiscalYear: 2025,
            month: '2025-04',
            memberId: crypto.randomUUID(),
            monthlyBudget: 10,
            bufferAmount: 2,
            actualAmount: 8,
          },
        ],
      } as Database)

      useBudgetStore.getState().loadBudgetData()
      await flushMicrotasks()
      expect(useBudgetStore.getState().aiUsageMemberAllocations).toHaveLength(1)
    })

    it('defaultCoefficientが未定義の場合は1になる（後方互換）', async () => {
      mockLoad.mockReturnValueOnce({ ...(mockDb as Database) } as Database)
      useBudgetStore.getState().loadBudgetData()
      await flushMicrotasks()
      expect(useBudgetStore.getState().defaultCoefficient).toBe(1)
    })

    it('projectCoefficientsが未定義の場合は空オブジェクトになる（後方互換）', async () => {
      mockLoad.mockReturnValueOnce({ ...(mockDb as Database) } as Database)
      useBudgetStore.getState().loadBudgetData()
      await flushMicrotasks()
      expect(useBudgetStore.getState().projectCoefficients).toEqual({})
    })

    it('defaultCoefficient/projectCoefficientsを読み込める', async () => {
      const projectId = crypto.randomUUID()
      mockLoad.mockReturnValueOnce({
        ...(mockDb as Database),
        defaultCoefficient: 1.5,
        projectCoefficients: { [projectId]: 2 },
      } as Database)

      useBudgetStore.getState().loadBudgetData()
      await flushMicrotasks()
      expect(useBudgetStore.getState().defaultCoefficient).toBe(1.5)
      expect(useBudgetStore.getState().projectCoefficients[projectId]).toBe(2)
    })

    it('業務定数（P0-a）を読み込める。未定義時は従来のハードコード既定値になる', async () => {
      // 未定義（既存データ）→ 既定値
      mockLoad.mockReturnValueOnce({ ...(mockDb as Database) } as Database)
      useBudgetStore.getState().loadBudgetData()
      await flushMicrotasks()
      expect(useBudgetStore.getState().workdaysPerMonth).toBe(20)
      expect(useBudgetStore.getState().skillReviewCycleMonths).toBe(3)
      expect(useBudgetStore.getState().baselineStaleThreshold).toBe(0.1)

      // 設定済み → その値
      mockLoad.mockReturnValueOnce({
        ...(mockDb as Database),
        workdaysPerMonth: 18,
        skillReviewCycleMonths: 6,
        baselineStaleThreshold: 0.2,
      } as Database)
      useBudgetStore.getState().loadBudgetData()
      await flushMicrotasks()
      expect(useBudgetStore.getState().workdaysPerMonth).toBe(18)
      expect(useBudgetStore.getState().skillReviewCycleMonths).toBe(6)
      expect(useBudgetStore.getState().baselineStaleThreshold).toBe(0.2)
    })

    it('業務定数のsetterが即時反映され、appSettingsとして永続化される（P0-a）', async () => {
      useBudgetStore.getState().setWorkdaysPerMonth(18)
      useBudgetStore.getState().setSkillReviewCycleMonths(6)
      useBudgetStore.getState().setBaselineStaleThreshold(0.15)

      expect(useBudgetStore.getState().workdaysPerMonth).toBe(18)
      expect(useBudgetStore.getState().skillReviewCycleMonths).toBe(6)
      expect(useBudgetStore.getState().baselineStaleThreshold).toBe(0.15)

      await flushMicrotasks()
      const saved = getMockDbState() as Database
      expect(saved.workdaysPerMonth).toBe(18)
      expect(saved.skillReviewCycleMonths).toBe(6)
      expect(saved.baselineStaleThreshold).toBe(0.15)
    })

    // 反証: updateAppSettingsはフィールド単位パッチのため、片方の設定変更が
    // 他の設定フィールドを消さない（旧persistSettingsFieldsの全体上書き方式で
    // 起きえた「未ロードのまま保存すると他フィールドが既定値で上書きされる」事故の回帰テスト）
    it('反証: 概算単価の保存が業務定数など他の設定フィールドを消さない', async () => {
      setMockDbState({
        ...(mockDb as Database),
        workdaysPerMonth: 18,
        exchangeRateHistory: [{ effectiveFrom: '2026-01', rate: 150 }],
      })

      // 設定を未ロードのまま（ローカルstateは既定値のまま）概算単価だけを保存する
      useBudgetStore.getState().setEstimatedUnitPrice(95)
      await flushMicrotasks()

      const saved = getMockDbState() as Database
      expect(saved.estimatedUnitPrice).toBe(95)
      expect(saved.workdaysPerMonth).toBe(18)
      expect(saved.exchangeRateHistory).toEqual([
        { effectiveFrom: '2026-01', rate: 150 },
      ])
    })

    it('反証: 業務定数の永続化失敗時は元の値へロールバックされる', async () => {
      mockSave.mockImplementationOnce(() => {
        throw new Error('storage full')
      })
      useBudgetStore.getState().setWorkdaysPerMonth(18)
      expect(useBudgetStore.getState().workdaysPerMonth).toBe(18)
      await flushMicrotasks()
      expect(useBudgetStore.getState().workdaysPerMonth).toBe(20)
    })

    it('AiUsageEntryのsectionIdが未定義でも読み込める（既存データとの後方互換）', async () => {
      const divisionId = crypto.randomUUID()
      mockLoad.mockReturnValue({
        ...(mockDb as Database),
        aiUsageEntries: [
          {
            id: crypto.randomUUID(),
            divisionId,
            fiscalYear: 2025,
            month: '2025-04',
            budgetAmount: 100,
            actualAmount: null,
          },
        ],
      } as Database)

      useBudgetStore.getState().loadBudgetData()
      await flushMicrotasks()
      const entries = useBudgetStore.getState().aiUsageEntries
      expect(entries).toHaveLength(1)
      expect(entries[0]?.sectionId ?? null).toBeNull()
    })
  })
})
