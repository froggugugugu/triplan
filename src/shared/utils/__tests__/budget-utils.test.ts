import { describe, expect, it } from 'vitest'
import type { AssignmentEntry } from '@/shared/types/assignment'
import type { ExchangeRateEntry, SaasContract } from '@/shared/types/budget'
import type { Company } from '@/shared/types/company'
import type { Member, UnitPriceEntry } from '@/shared/types/member'
import type { Section } from '@/shared/types/section'
import {
  calcActiveHeadcountByMonth,
  calcDivisionBudget,
  calcDivisionExpectedRevenue,
  calcDivisionProperExpectedRevenue,
  calcEstimateBreakdownAmount,
  calcExpectedRevenue,
  calcMembersRevenueBudgetMonthly,
  calcRevenueBudget,
  calcRevenueBudgetMonthly,
  calcSaasActualTotal,
  calcSaasAnnualCost,
  calcSaasContractsActualTotal,
  calcSaasContractsTotalCost,
  calcSectionBudget,
  calcSectionExpectedRevenue,
  convertUsdToManYen,
  getActiveFiscalMonths,
  getApplicableExchangeRate,
  getApplicableUnitPrice,
  getNewlyOutOfRangeAssignmentMonths,
  isMonthWithinContractRange,
  isProperMember,
  sumAcrossDivisions,
} from '@/shared/utils/budget-utils'

// ヘルパー: テスト用メンバーを生成
function createTestMember(
  overrides: Partial<Member> & { startDate: string | null },
): Member {
  const { startDate, ...rest } = overrides
  return {
    id: 'member-1',
    name: 'テスト太郎',
    sectionId: null,
    role: 'エンジニア',
    isActive: true,
    techTagIds: [],
    startDate,
    endDate: null,
    unitPriceHistory: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...rest,
  }
}

describe('budget-utils', () => {
  // =========================================================================
  // getActiveFiscalMonths
  // =========================================================================
  describe('getActiveFiscalMonths', () => {
    it('メンバーA: startDate 2025-02-11, endDate null, FY2024（4月開始）→ 2ヶ月（2月, 3月）', () => {
      const result = getActiveFiscalMonths('2025-02-11', null, 2024, 4)
      expect(result).toEqual(['2025-02', '2025-03'])
    })

    it('メンバーA: startDate 2025-02-11, endDate null, FY2025（4月開始）→ 12ヶ月', () => {
      const result = getActiveFiscalMonths('2025-02-11', null, 2025, 4)
      expect(result).toEqual([
        '2025-04',
        '2025-05',
        '2025-06',
        '2025-07',
        '2025-08',
        '2025-09',
        '2025-10',
        '2025-11',
        '2025-12',
        '2026-01',
        '2026-02',
        '2026-03',
      ])
    })

    it('メンバーB: startDate 2025-05-11, endDate 2026-02-11, FY2025 → 10ヶ月（5月〜2月）', () => {
      const result = getActiveFiscalMonths('2025-05-11', '2026-02-11', 2025, 4)
      expect(result).toEqual([
        '2025-05',
        '2025-06',
        '2025-07',
        '2025-08',
        '2025-09',
        '2025-10',
        '2025-11',
        '2025-12',
        '2026-01',
        '2026-02',
      ])
    })

    it('メンバーB: startDate 2025-05-11, endDate 2026-02-11, FY2024 → 空（重複なし）', () => {
      const result = getActiveFiscalMonths('2025-05-11', '2026-02-11', 2024, 4)
      expect(result).toEqual([])
    })

    it('startDateがnullの場合は空配列を返す', () => {
      const result = getActiveFiscalMonths(null, null, 2025, 4)
      expect(result).toEqual([])
    })

    it('startMonth=1（1月始まり）の場合: FY2025 = 2025-01 ～ 2025-12', () => {
      const result = getActiveFiscalMonths('2024-06-01', null, 2025, 1)
      expect(result).toEqual([
        '2025-01',
        '2025-02',
        '2025-03',
        '2025-04',
        '2025-05',
        '2025-06',
        '2025-07',
        '2025-08',
        '2025-09',
        '2025-10',
        '2025-11',
        '2025-12',
      ])
    })

    it('startMonth=10（10月始まり）の場合: FY2025 = 2025-10 ～ 2026-09', () => {
      const result = getActiveFiscalMonths('2025-01-01', null, 2025, 10)
      expect(result).toEqual([
        '2025-10',
        '2025-11',
        '2025-12',
        '2026-01',
        '2026-02',
        '2026-03',
        '2026-04',
        '2026-05',
        '2026-06',
        '2026-07',
        '2026-08',
        '2026-09',
      ])
    })

    it('メンバーの在籍期間が年度の一部のみ重なる場合', () => {
      // startDate 2025-06-15, endDate 2025-09-20, FY2025（4月開始）
      const result = getActiveFiscalMonths('2025-06-15', '2025-09-20', 2025, 4)
      expect(result).toEqual(['2025-06', '2025-07', '2025-08', '2025-09'])
    })

    it('endDateがstartDateと同じ月の場合は1ヶ月', () => {
      const result = getActiveFiscalMonths('2025-06-01', '2025-06-30', 2025, 4)
      expect(result).toEqual(['2025-06'])
    })
  })

  // =========================================================================
  // getApplicableUnitPrice
  // =========================================================================
  describe('getApplicableUnitPrice', () => {
    it('単一エントリで対象月が一致する場合、その金額を返す', () => {
      const history: UnitPriceEntry[] = [
        { effectiveFrom: '2025-04', amount: 100 },
      ]
      expect(getApplicableUnitPrice(history, '2025-04')).toBe(100)
    })

    it('単一エントリで対象月が後の場合、その金額を返す', () => {
      const history: UnitPriceEntry[] = [
        { effectiveFrom: '2025-04', amount: 100 },
      ]
      expect(getApplicableUnitPrice(history, '2025-08')).toBe(100)
    })

    it('複数エントリの場合、直近の適用エントリを返す', () => {
      const history: UnitPriceEntry[] = [
        { effectiveFrom: '2025-02', amount: 100 },
        { effectiveFrom: '2025-05', amount: 110 },
        { effectiveFrom: '2025-10', amount: 120 },
      ]
      // 2025-04はeffectiveFrom 2025-02の価格
      expect(getApplicableUnitPrice(history, '2025-04')).toBe(100)
      // 2025-05はeffectiveFrom 2025-05の価格
      expect(getApplicableUnitPrice(history, '2025-05')).toBe(110)
      // 2025-09はeffectiveFrom 2025-05の価格
      expect(getApplicableUnitPrice(history, '2025-09')).toBe(110)
      // 2025-10はeffectiveFrom 2025-10の価格
      expect(getApplicableUnitPrice(history, '2025-10')).toBe(120)
      // 2026-03はeffectiveFrom 2025-10の価格
      expect(getApplicableUnitPrice(history, '2026-03')).toBe(120)
    })

    it('エントリが空の場合は0を返す', () => {
      expect(getApplicableUnitPrice([], '2025-04')).toBe(0)
    })

    it('対象月が全エントリより前の場合は0を返す', () => {
      const history: UnitPriceEntry[] = [
        { effectiveFrom: '2025-05', amount: 110 },
      ]
      expect(getApplicableUnitPrice(history, '2025-04')).toBe(0)
    })

    it('ソートされていないエントリでも正しく動作する', () => {
      const history: UnitPriceEntry[] = [
        { effectiveFrom: '2025-10', amount: 120 },
        { effectiveFrom: '2025-02', amount: 100 },
        { effectiveFrom: '2025-05', amount: 110 },
      ]
      expect(getApplicableUnitPrice(history, '2025-07')).toBe(110)
    })

    it('effectiveFromと対象月が完全一致する場合はその金額を返す', () => {
      const history: UnitPriceEntry[] = [
        { effectiveFrom: '2025-04', amount: 100 },
        { effectiveFrom: '2025-07', amount: 150 },
      ]
      expect(getApplicableUnitPrice(history, '2025-07')).toBe(150)
    })
  })

  // =========================================================================
  // calcRevenueBudget
  // =========================================================================
  describe('calcRevenueBudget', () => {
    it('仕様例: メンバーC FY2024 売上予算 = 200（100×2ヶ月）', () => {
      const memberC = createTestMember({
        startDate: '2025-02-11',
        endDate: null,
        unitPriceHistory: [
          { effectiveFrom: '2025-02', amount: 100 },
          { effectiveFrom: '2025-05', amount: 110 },
          { effectiveFrom: '2025-10', amount: 120 },
        ],
      })
      expect(calcRevenueBudget(memberC, 2024, 4)).toBe(200)
    })

    it('仕様例: メンバーC FY2025 売上予算 = 1370（100×1 + 110×5 + 120×6）', () => {
      const memberC = createTestMember({
        startDate: '2025-02-11',
        endDate: null,
        unitPriceHistory: [
          { effectiveFrom: '2025-02', amount: 100 },
          { effectiveFrom: '2025-05', amount: 110 },
          { effectiveFrom: '2025-10', amount: 120 },
        ],
      })
      expect(calcRevenueBudget(memberC, 2025, 4)).toBe(1370)
    })

    it('unitPriceHistoryが空の場合は0を返す', () => {
      const member = createTestMember({
        startDate: '2025-04-01',
        unitPriceHistory: [],
      })
      expect(calcRevenueBudget(member, 2025, 4)).toBe(0)
    })

    it('アクティブ月がない場合は0を返す', () => {
      const member = createTestMember({
        startDate: '2026-04-01',
        unitPriceHistory: [{ effectiveFrom: '2026-04', amount: 100 }],
      })
      // FY2024にはアクティブ月なし
      expect(calcRevenueBudget(member, 2024, 4)).toBe(0)
    })

    it('startDateがnullの場合は0を返す', () => {
      const member = createTestMember({
        startDate: null,
        unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
      })
      expect(calcRevenueBudget(member, 2025, 4)).toBe(0)
    })
  })

  // =========================================================================
  // calcExpectedRevenue
  // =========================================================================
  describe('calcExpectedRevenue', () => {
    const memberC = createTestMember({
      id: 'member-c',
      startDate: '2025-02-11',
      endDate: null,
      unitPriceHistory: [
        { effectiveFrom: '2025-02', amount: 100 },
        { effectiveFrom: '2025-05', amount: 110 },
        { effectiveFrom: '2025-10', amount: 120 },
      ],
    })

    it('アサイン率1.0の場合、売上予算と同額（FY2025 = 1370）', () => {
      const getMemberMonthlyTotal = (_memberId: string, _monthKey: string) =>
        1.0
      expect(calcExpectedRevenue(memberC, getMemberMonthlyTotal, 2025, 4)).toBe(
        1370,
      )
    })

    it('アサイン率0.5の場合、売上予算の半額（FY2025 = 685）', () => {
      const getMemberMonthlyTotal = (_memberId: string, _monthKey: string) =>
        0.5
      expect(calcExpectedRevenue(memberC, getMemberMonthlyTotal, 2025, 4)).toBe(
        685,
      )
    })

    it('アサイン率0の場合、0を返す', () => {
      const getMemberMonthlyTotal = (_memberId: string, _monthKey: string) =>
        0.0
      expect(calcExpectedRevenue(memberC, getMemberMonthlyTotal, 2025, 4)).toBe(
        0,
      )
    })

    it('月ごとにアサイン率が異なる場合', () => {
      // FY2024: 2月(100), 3月(100) のメンバーC
      // 2月: rate=0.5 → 50, 3月: rate=1.0 → 100 = 合計150
      const getMemberMonthlyTotal = (
        _memberId: string,
        monthKey: string,
      ): number => {
        if (monthKey === '2025-02') return 0.5
        if (monthKey === '2025-03') return 1.0
        return 0
      }
      expect(calcExpectedRevenue(memberC, getMemberMonthlyTotal, 2024, 4)).toBe(
        150,
      )
    })

    it('startDateがnullの場合は0を返す', () => {
      const member = createTestMember({
        startDate: null,
        unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
      })
      const getMemberMonthlyTotal = () => 1.0
      expect(calcExpectedRevenue(member, getMemberMonthlyTotal, 2025, 4)).toBe(
        0,
      )
    })

    it('正しいmemberIdがコールバックに渡される', () => {
      const calls: string[] = []
      const getMemberMonthlyTotal = (
        memberId: string,
        _monthKey: string,
      ): number => {
        calls.push(memberId)
        return 1.0
      }
      calcExpectedRevenue(memberC, getMemberMonthlyTotal, 2024, 4)
      // FY2024でメンバーCは2ヶ月アクティブ
      expect(calls).toHaveLength(2)
      expect(calls.every((id) => id === 'member-c')).toBe(true)
    })
  })

  // =========================================================================
  // calcSectionBudget / calcSectionExpectedRevenue
  // =========================================================================
  describe('calcSectionBudget', () => {
    it('複数メンバーの売上予算を合算する', () => {
      const members: Member[] = [
        createTestMember({
          id: 'member-1',
          startDate: '2025-04-01',
          unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
        }),
        createTestMember({
          id: 'member-2',
          startDate: '2025-04-01',
          unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 80 }],
        }),
      ]
      // member-1: 100×12 = 1200, member-2: 80×12 = 960 → 2160
      expect(calcSectionBudget(members, 2025, 4)).toBe(2160)
    })

    it('メンバーが空の場合は0を返す', () => {
      expect(calcSectionBudget([], 2025, 4)).toBe(0)
    })
  })

  describe('calcSectionExpectedRevenue', () => {
    it('複数メンバーの見込売上を合算する', () => {
      const members: Member[] = [
        createTestMember({
          id: 'member-1',
          startDate: '2025-04-01',
          unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
        }),
        createTestMember({
          id: 'member-2',
          startDate: '2025-04-01',
          unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 80 }],
        }),
      ]
      const getMemberMonthlyTotal = () => 1.0
      // member-1: 100×12 = 1200, member-2: 80×12 = 960 → 2160
      expect(
        calcSectionExpectedRevenue(members, getMemberMonthlyTotal, 2025, 4),
      ).toBe(2160)
    })

    it('メンバーが空の場合は0を返す', () => {
      const getMemberMonthlyTotal = () => 1.0
      expect(
        calcSectionExpectedRevenue([], getMemberMonthlyTotal, 2025, 4),
      ).toBe(0)
    })
  })

  // =========================================================================
  // calcDivisionBudget / calcDivisionExpectedRevenue
  // =========================================================================
  describe('calcDivisionBudget', () => {
    it('部門配下の全課のメンバーの売上予算を合算する', () => {
      const sections: Section[] = [
        {
          id: 'section-1',
          divisionId: 'div-1',
          name: '第1課',
          sortOrder: 0,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
        {
          id: 'section-2',
          divisionId: 'div-1',
          name: '第2課',
          sortOrder: 1,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ]
      const allMembers: Member[] = [
        createTestMember({
          id: 'member-1',
          sectionId: 'section-1',
          startDate: '2025-04-01',
          unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
        }),
        createTestMember({
          id: 'member-2',
          sectionId: 'section-2',
          startDate: '2025-04-01',
          unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 80 }],
        }),
        // 別部門のメンバー（含めない）
        createTestMember({
          id: 'member-3',
          sectionId: 'section-other',
          startDate: '2025-04-01',
          unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 200 }],
        }),
      ]
      // section-1: 100×12=1200, section-2: 80×12=960 → 2160
      expect(calcDivisionBudget(sections, allMembers, 2025, 4)).toBe(2160)
    })

    it('課が空の場合は0を返す', () => {
      expect(calcDivisionBudget([], [], 2025, 4)).toBe(0)
    })
  })

  describe('calcDivisionExpectedRevenue', () => {
    it('部門配下の全課のメンバーの見込売上を合算する', () => {
      const sections: Section[] = [
        {
          id: 'section-1',
          divisionId: 'div-1',
          name: '第1課',
          sortOrder: 0,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ]
      const allMembers: Member[] = [
        createTestMember({
          id: 'member-1',
          sectionId: 'section-1',
          startDate: '2025-04-01',
          unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
        }),
      ]
      const getMemberMonthlyTotal = () => 0.5
      // member-1: 100×0.5×12 = 600
      expect(
        calcDivisionExpectedRevenue(
          sections,
          allMembers,
          getMemberMonthlyTotal,
          2025,
          4,
        ),
      ).toBe(600)
    })

    it('課が空の場合は0を返す', () => {
      const getMemberMonthlyTotal = () => 1.0
      expect(
        calcDivisionExpectedRevenue([], [], getMemberMonthlyTotal, 2025, 4),
      ).toBe(0)
    })
  })

  // =========================================================================
  // isProperMember / calcDivisionProperExpectedRevenue
  // =========================================================================
  describe('isProperMember', () => {
    const companies: Company[] = [
      {
        id: 'company-proper',
        name: '自社',
        sortOrder: 0,
        isInternal: true,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 'company-partner',
        name: '協力会社',
        sortOrder: 1,
        isInternal: false,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ]

    it('companyIdが未設定（null）の場合はプロパー扱い', () => {
      const member = createTestMember({
        startDate: '2025-04-01',
        companyId: null,
      })
      expect(isProperMember(member, companies)).toBe(true)
    })

    it('isInternal=trueの会社に所属する場合はプロパー扱い', () => {
      const member = createTestMember({
        startDate: '2025-04-01',
        companyId: 'company-proper',
      })
      expect(isProperMember(member, companies)).toBe(true)
    })

    it('isInternal=falseの会社に所属する場合はプロパー扱いではない', () => {
      const member = createTestMember({
        startDate: '2025-04-01',
        companyId: 'company-partner',
      })
      expect(isProperMember(member, companies)).toBe(false)
    })

    it('companyIdが存在しない会社を指す場合はプロパー扱い（フォールバック）', () => {
      const member = createTestMember({
        startDate: '2025-04-01',
        companyId: 'nonexistent',
      })
      expect(isProperMember(member, companies)).toBe(true)
    })
  })

  describe('calcDivisionProperExpectedRevenue', () => {
    const sections: Section[] = [
      {
        id: 'section-1',
        divisionId: 'div-1',
        name: '第1課',
        sortOrder: 0,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ]
    const companies: Company[] = [
      {
        id: 'company-partner',
        name: '協力会社',
        sortOrder: 0,
        isInternal: false,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ]

    it('プロパー社員のみの見込売上を合算し、非プロパーは除外する', () => {
      const members: Member[] = [
        createTestMember({
          id: 'member-proper',
          sectionId: 'section-1',
          startDate: '2025-04-01',
          companyId: null,
          unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
        }),
        createTestMember({
          id: 'member-partner',
          sectionId: 'section-1',
          startDate: '2025-04-01',
          companyId: 'company-partner',
          unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 200 }],
        }),
      ]
      const getMemberMonthlyTotal = () => 1.0
      // プロパー社員のみ: 100×12 = 1200（非プロパーの200×12は除外）
      expect(
        calcDivisionProperExpectedRevenue(
          sections,
          members,
          companies,
          getMemberMonthlyTotal,
          2025,
          4,
        ),
      ).toBe(1200)
    })
  })

  // =========================================================================
  // calcSaasAnnualCost / calcSaasContractsTotalCost
  // =========================================================================
  describe('calcSaasAnnualCost', () => {
    function createTestContract(
      overrides: Partial<SaasContract>,
    ): SaasContract {
      return {
        id: 'contract-1',
        name: 'Test SaaS',
        divisionId: 'div-1',
        contractType: 'annual',
        amount: 10,
        paymentCycle: 'annual',
        contractStartDate: '2025-04-01',
        nextRenewalDate: '2026-03-31',
        note: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        ...overrides,
      }
    }

    it('月次払いの場合は月額×12を返す', () => {
      const contract = createTestContract({
        paymentCycle: 'monthly',
        amount: 10,
      })
      expect(calcSaasAnnualCost(contract)).toBe(120)
    })

    it('年次払いの場合は金額をそのまま返す', () => {
      const contract = createTestContract({
        paymentCycle: 'annual',
        amount: 100,
      })
      expect(calcSaasAnnualCost(contract)).toBe(100)
    })

    it('複数契約の年間コスト合計を算出する', () => {
      const contracts = [
        createTestContract({ paymentCycle: 'monthly', amount: 10 }),
        createTestContract({ paymentCycle: 'annual', amount: 50 }),
      ]
      expect(calcSaasContractsTotalCost(contracts)).toBe(170)
    })

    it('契約が空の場合は0を返す', () => {
      expect(calcSaasContractsTotalCost([])).toBe(0)
    })

    it('calcSaasActualTotal: 対象年度の月次実績合計を返す', () => {
      const contract = createTestContract({
        monthlyActuals: { '2025-04': 90, '2025-05': 100, '2024-03': 9999 },
      })
      const monthKeys = ['2025-04', '2025-05', '2025-06']
      // 対象年度外（2024-03）は集計に含まれない
      expect(calcSaasActualTotal(contract, monthKeys)).toBe(190)
    })

    it('calcSaasActualTotal: monthlyActuals未設定の場合は0を返す', () => {
      const contract = createTestContract({})
      expect(calcSaasActualTotal(contract, ['2025-04'])).toBe(0)
    })

    it('calcSaasContractsActualTotal: 部門内の複数契約の実績を合算する', () => {
      const contracts = [
        createTestContract({
          id: 'contract-1',
          monthlyActuals: { '2025-04': 90, '2025-05': 100 },
        }),
        createTestContract({
          id: 'contract-2',
          monthlyActuals: { '2025-04': 30, '2025-06': 20 },
        }),
      ]
      const monthKeys = ['2025-04', '2025-05', '2025-06']
      expect(calcSaasContractsActualTotal(contracts, monthKeys)).toBe(240)
    })

    it('calcSaasContractsActualTotal: 契約が空配列の場合は0を返す', () => {
      expect(calcSaasContractsActualTotal([], ['2025-04'])).toBe(0)
    })
  })

  // =========================================================================
  // calcEstimateBreakdownAmount
  // =========================================================================
  describe('calcEstimateBreakdownAmount', () => {
    it('概算額×係数を整数（万円）に四捨五入して返す', () => {
      expect(calcEstimateBreakdownAmount(800, 1.25)).toBe(1000)
    })

    it('小数点以下が0.5ちょうどの場合は切り上げる（四捨五入）', () => {
      // 3 * 0.5 = 1.5 → 2
      expect(calcEstimateBreakdownAmount(3, 0.5)).toBe(2)
      // 5 * 0.5 = 2.5 → 3
      expect(calcEstimateBreakdownAmount(5, 0.5)).toBe(3)
    })

    it('小数点以下が0.5未満の場合は切り捨てる', () => {
      // 10 * 1.2 = 12.0... 未満切り捨て確認用に 1 * 0.4 = 0.4 → 0
      expect(calcEstimateBreakdownAmount(1, 0.4)).toBe(0)
    })

    it('概算額が0の場合は0を返す', () => {
      expect(calcEstimateBreakdownAmount(0, 1.5)).toBe(0)
    })

    it('係数が1の場合は概算額をそのまま返す（四捨五入のみ）', () => {
      expect(calcEstimateBreakdownAmount(500, 1)).toBe(500)
    })

    it('同一入力に対して常に同一の出力を返す（決定論性）', () => {
      const results = Array.from({ length: 5 }, () =>
        calcEstimateBreakdownAmount(777, 1.33),
      )
      expect(new Set(results).size).toBe(1)
    })
  })

  // =========================================================================
  // calcActiveHeadcountByMonth（人員計画「人件費」区分の実績人数集計）
  // =========================================================================
  describe('calcActiveHeadcountByMonth', () => {
    const companies: Company[] = [
      {
        id: 'company-partner',
        name: '協力会社',
        sortOrder: 0,
        isInternal: false,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ]

    it('プロパーメンバーのみを月別にカウントする', () => {
      const members: Member[] = [
        createTestMember({
          id: 'member-proper',
          startDate: '2025-04-01',
          companyId: null,
        }),
        createTestMember({
          id: 'member-partner',
          startDate: '2025-04-01',
          companyId: 'company-partner',
        }),
      ]
      const result = calcActiveHeadcountByMonth(
        members,
        companies,
        true,
        2025,
        4,
      )
      expect(result['2025-04']).toBe(1)
    })

    it('プロパー以外メンバーのみを月別にカウントする', () => {
      const members: Member[] = [
        createTestMember({
          id: 'member-proper',
          startDate: '2025-04-01',
          companyId: null,
        }),
        createTestMember({
          id: 'member-partner',
          startDate: '2025-04-01',
          companyId: 'company-partner',
        }),
      ]
      const result = calcActiveHeadcountByMonth(
        members,
        companies,
        false,
        2025,
        4,
      )
      expect(result['2025-04']).toBe(1)
      expect(result['2025-05']).toBe(1)
    })

    it('在籍期間外の月はカウントしない', () => {
      const members: Member[] = [
        createTestMember({
          id: 'member-1',
          startDate: '2025-04-01',
          endDate: '2025-05-31',
          companyId: null,
        }),
      ]
      const result = calcActiveHeadcountByMonth(
        members,
        companies,
        true,
        2025,
        4,
      )
      expect(result['2025-05']).toBe(1)
      expect(result['2025-06']).toBeUndefined()
    })

    it('複数メンバーが在籍する月は合算される', () => {
      const members: Member[] = [
        createTestMember({
          id: 'member-1',
          startDate: '2025-04-01',
          companyId: null,
        }),
        createTestMember({
          id: 'member-2',
          startDate: '2025-04-01',
          companyId: null,
        }),
      ]
      const result = calcActiveHeadcountByMonth(
        members,
        companies,
        true,
        2025,
        4,
      )
      expect(result['2025-04']).toBe(2)
    })

    it('メンバーが空の場合は空オブジェクトを返す', () => {
      expect(calcActiveHeadcountByMonth([], companies, true, 2025, 4)).toEqual(
        {},
      )
    })

    // 反証: companiesマスタに存在しないcompanyIdを持つメンバーが、
    // isProperMemberのフォールバック仕様（プロパー扱い）どおりに
    // プロパー区分側へ正しくカウントされるか
    it('companiesマスタに存在しないcompanyIdのメンバーはプロパー扱いでカウントされる', () => {
      const members: Member[] = [
        createTestMember({
          id: 'member-unknown-company',
          startDate: '2025-04-01',
          companyId: 'nonexistent-company',
        }),
      ]
      const properResult = calcActiveHeadcountByMonth(
        members,
        companies,
        true,
        2025,
        4,
      )
      const nonProperResult = calcActiveHeadcountByMonth(
        members,
        companies,
        false,
        2025,
        4,
      )
      expect(properResult['2025-04']).toBe(1)
      expect(nonProperResult['2025-04']).toBeUndefined()
    })

    // 反証: 在籍終了済み（endDateが過去）のメンバーが、対象年度の月には
    // 誤ってカウントされないか
    it('対象年度より前に退職したメンバーはカウントしない', () => {
      const members: Member[] = [
        createTestMember({
          id: 'member-retired',
          startDate: '2023-04-01',
          endDate: '2024-03-31',
          companyId: null,
        }),
      ]
      const result = calcActiveHeadcountByMonth(
        members,
        companies,
        true,
        2025,
        4,
      )
      expect(result).toEqual({})
    })
  })

  // =========================================================================
  // calcRevenueBudgetMonthly / calcMembersRevenueBudgetMonthly（実績金額の月別内訳）
  // =========================================================================
  describe('calcRevenueBudgetMonthly', () => {
    it('在籍月ごとに適用単価を割り当てる', () => {
      const member = createTestMember({
        startDate: '2025-04-01',
        endDate: '2025-05-31',
        unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
      })
      const result = calcRevenueBudgetMonthly(member, 2025, 4)
      expect(result).toEqual({ '2025-04': 100, '2025-05': 100 })
    })

    it('単価改定が月の途中にある場合は月ごとに適用単価が切り替わる', () => {
      const member = createTestMember({
        startDate: '2025-04-01',
        endDate: '2025-05-31',
        unitPriceHistory: [
          { effectiveFrom: '2025-04', amount: 100 },
          { effectiveFrom: '2025-05', amount: 150 },
        ],
      })
      const result = calcRevenueBudgetMonthly(member, 2025, 4)
      expect(result).toEqual({ '2025-04': 100, '2025-05': 150 })
    })

    it('在籍していない年度の場合は空オブジェクトを返す', () => {
      const member = createTestMember({ startDate: null })
      expect(calcRevenueBudgetMonthly(member, 2025, 4)).toEqual({})
    })
  })

  describe('calcMembersRevenueBudgetMonthly', () => {
    it('複数メンバーの月別実績金額を合算する（按分なし・全額計上）', () => {
      const members: Member[] = [
        createTestMember({
          id: 'member-1',
          startDate: '2025-04-01',
          unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
        }),
        createTestMember({
          id: 'member-2',
          startDate: '2025-04-01',
          unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 80 }],
        }),
      ]
      const result = calcMembersRevenueBudgetMonthly(members, 2025, 4)
      expect(result['2025-04']).toBe(180)
    })

    it('メンバーが空の場合は空オブジェクトを返す', () => {
      expect(calcMembersRevenueBudgetMonthly([], 2025, 4)).toEqual({})
    })
  })

  describe('getApplicableExchangeRate', () => {
    function createRate(
      overrides: Partial<ExchangeRateEntry> = {},
    ): ExchangeRateEntry {
      return { effectiveFrom: '2025-04', rate: 150, ...overrides }
    }

    it('対象月以前で最新のレートを返す', () => {
      const history = [
        createRate({ effectiveFrom: '2025-04', rate: 150 }),
        createRate({ effectiveFrom: '2025-07', rate: 160 }),
        createRate({ effectiveFrom: '2025-10', rate: 170 }),
      ]
      expect(getApplicableExchangeRate(history, '2025-08')).toBe(160)
    })

    it('対象月ちょうどのエントリを適用する（境界値）', () => {
      const history = [
        createRate({ effectiveFrom: '2025-04', rate: 150 }),
        createRate({ effectiveFrom: '2025-07', rate: 160 }),
      ]
      expect(getApplicableExchangeRate(history, '2025-07')).toBe(160)
    })

    it('対象月より未来のレートは無視する', () => {
      const history = [
        createRate({ effectiveFrom: '2025-04', rate: 150 }),
        createRate({ effectiveFrom: '2026-01', rate: 200 }),
      ]
      expect(getApplicableExchangeRate(history, '2025-12')).toBe(150)
    })

    it('対象月より前のエントリが無い場合は0を返す（未設定を表す）', () => {
      const history = [createRate({ effectiveFrom: '2025-04', rate: 150 })]
      expect(getApplicableExchangeRate(history, '2025-01')).toBe(0)
    })

    it('履歴が空の場合は0を返す', () => {
      expect(getApplicableExchangeRate([], '2025-04')).toBe(0)
    })

    // 反証: 履歴が挿入順どおりでなくても正しく最新値を選ぶか（effectiveFrom順にソートしているか）
    it('履歴が時系列順に格納されていなくても正しく判定する', () => {
      const history = [
        createRate({ effectiveFrom: '2025-10', rate: 170 }),
        createRate({ effectiveFrom: '2025-04', rate: 150 }),
        createRate({ effectiveFrom: '2025-07', rate: 160 }),
      ]
      expect(getApplicableExchangeRate(history, '2025-08')).toBe(160)
    })
  })

  describe('convertUsdToManYen', () => {
    it('＄金額×レートを10000で除算して万円に換算する', () => {
      // 100＄ × 150円 = 15000円 = 1.5万円
      expect(convertUsdToManYen(100, 150)).toBe(1.5)
    })

    it('レートが0の場合は0を返す（未設定時のガード）', () => {
      expect(convertUsdToManYen(100, 0)).toBe(0)
    })

    it('＄金額が0の場合は0を返す', () => {
      expect(convertUsdToManYen(0, 150)).toBe(0)
    })

    it('小数を含む結果でも丸めない', () => {
      // 33＄ × 150円 = 4950円 = 0.495万円
      expect(convertUsdToManYen(33, 150)).toBeCloseTo(0.495)
    })
  })

  describe('sumAcrossDivisions', () => {
    it('部門ID配列それぞれのセレクタ結果を合算する', () => {
      const values: Record<string, number> = { a: 100, b: 200, c: 50 }
      expect(sumAcrossDivisions(['a', 'b', 'c'], (id) => values[id] ?? 0)).toBe(
        350,
      )
    })

    it('部門ID配列が空の場合は0を返す', () => {
      expect(sumAcrossDivisions([], () => 999)).toBe(0)
    })

    // 反証: 単一部門集計と全部門集計（部門1件のみ）の結果が一致すること
    it('反証: 部門ID配列が1件のみの場合は単一部門集計と同じ値を返す', () => {
      const getValue = (id: string) => (id === 'div-x' ? 42 : 0)
      expect(sumAcrossDivisions(['div-x'], getValue)).toBe(getValue('div-x'))
    })

    it('反証: セレクタが負値を返しても正しく合算する（残予算等の負値もありうるため）', () => {
      const values: Record<string, number> = { a: -100, b: 300 }
      expect(sumAcrossDivisions(['a', 'b'], (id) => values[id] ?? 0)).toBe(200)
    })
  })

  describe('isMonthWithinContractRange', () => {
    it('契約単価履歴が空配列の場合は常にtrue（範囲制約なし。内部リソース等）', () => {
      const member = createTestMember({
        startDate: null,
        contractUnitPriceHistory: [],
      })
      expect(isMonthWithinContractRange(member, '2020-01')).toBe(true)
      expect(isMonthWithinContractRange(member, '2099-12')).toBe(true)
    })

    it('反証: 契約単価履歴がundefined（未設定）でも常にtrue', () => {
      const member = createTestMember({
        startDate: null,
        contractUnitPriceHistory: undefined,
      })
      expect(isMonthWithinContractRange(member, '2020-01')).toBe(true)
    })

    it('契約開始月（最も古いeffectiveFrom）以降はtrue', () => {
      const member = createTestMember({
        startDate: null,
        contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
      })
      expect(isMonthWithinContractRange(member, '2025-04')).toBe(true)
      expect(isMonthWithinContractRange(member, '2025-05')).toBe(true)
    })

    it('反証: 契約開始月より前はfalse', () => {
      const member = createTestMember({
        startDate: null,
        contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
      })
      expect(isMonthWithinContractRange(member, '2025-03')).toBe(false)
    })

    it('複数エントリがある場合は最も古いeffectiveFromを契約開始月とする', () => {
      const member = createTestMember({
        startDate: null,
        contractUnitPriceHistory: [
          { effectiveFrom: '2025-06', amount: 120 },
          { effectiveFrom: '2025-04', amount: 100 },
        ],
      })
      expect(isMonthWithinContractRange(member, '2025-04')).toBe(true)
      expect(isMonthWithinContractRange(member, '2025-03')).toBe(false)
    })

    it('endDateが設定されている場合、その月以前はtrue', () => {
      const member = createTestMember({
        startDate: null,
        contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
        endDate: '2025-09-15',
      })
      expect(isMonthWithinContractRange(member, '2025-09')).toBe(true)
    })

    it('反証: endDateの月より後はfalse', () => {
      const member = createTestMember({
        startDate: null,
        contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
        endDate: '2025-09-15',
      })
      expect(isMonthWithinContractRange(member, '2025-10')).toBe(false)
    })

    it('反証: endDateがnull（在籍中）の場合は上限なし', () => {
      const member = createTestMember({
        startDate: null,
        contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
        endDate: null,
      })
      expect(isMonthWithinContractRange(member, '2099-12')).toBe(true)
    })
  })

  describe('getNewlyOutOfRangeAssignmentMonths', () => {
    function makeAssignment(
      overrides: Partial<AssignmentEntry> = {},
    ): AssignmentEntry {
      return {
        id: crypto.randomUUID(),
        projectId: crypto.randomUUID(),
        taskId: crypto.randomUUID(),
        memberId: 'member-1',
        monthlyValues: {},
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        ...overrides,
      }
    }

    it('編集前は範囲内・編集後に範囲外になった月を検出する', () => {
      const oldMember = createTestMember({
        startDate: null,
        contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
      })
      const newMember = createTestMember({
        startDate: null,
        contractUnitPriceHistory: [{ effectiveFrom: '2025-06', amount: 100 }],
      })
      const assignments = [
        makeAssignment({ monthlyValues: { '2025-04': 0.5, '2025-06': 0.5 } }),
      ]
      const result = getNewlyOutOfRangeAssignmentMonths(
        oldMember,
        newMember,
        assignments,
      )
      expect(result).toEqual([
        { assignmentId: assignments[0]?.id, monthKey: '2025-04' },
      ])
    })

    it('反証: 編集前から既に範囲外だった月は対象外（今回の編集と無関係な既存不整合）', () => {
      const oldMember = createTestMember({
        startDate: null,
        contractUnitPriceHistory: [{ effectiveFrom: '2025-06', amount: 100 }],
      })
      const newMember = createTestMember({
        startDate: null,
        contractUnitPriceHistory: [{ effectiveFrom: '2025-08', amount: 100 }],
      })
      // 2025-04は編集前(契約開始2025-06)時点で既に範囲外
      const assignments = [
        makeAssignment({ monthlyValues: { '2025-04': 0.5 } }),
      ]
      const result = getNewlyOutOfRangeAssignmentMonths(
        oldMember,
        newMember,
        assignments,
      )
      expect(result).toEqual([])
    })

    it('反証: 編集前後とも範囲内のままの月は対象外', () => {
      const oldMember = createTestMember({
        startDate: null,
        contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
      })
      const newMember = createTestMember({
        startDate: null,
        contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 150 }],
      })
      const assignments = [
        makeAssignment({ monthlyValues: { '2025-05': 0.5 } }),
      ]
      expect(
        getNewlyOutOfRangeAssignmentMonths(oldMember, newMember, assignments),
      ).toEqual([])
    })

    it('反証: 値が0のアサイン月は対象外（実質未アサインのため）', () => {
      const oldMember = createTestMember({
        startDate: null,
        contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
      })
      const newMember = createTestMember({
        startDate: null,
        contractUnitPriceHistory: [{ effectiveFrom: '2025-06', amount: 100 }],
      })
      const assignments = [makeAssignment({ monthlyValues: { '2025-04': 0 } })]
      expect(
        getNewlyOutOfRangeAssignmentMonths(oldMember, newMember, assignments),
      ).toEqual([])
    })

    it('反証: 他メンバーのアサインは対象外', () => {
      const oldMember = createTestMember({
        id: 'member-1',
        startDate: null,
        contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
      })
      const newMember = createTestMember({
        id: 'member-1',
        startDate: null,
        contractUnitPriceHistory: [{ effectiveFrom: '2025-06', amount: 100 }],
      })
      const assignments = [
        makeAssignment({
          memberId: 'other-member',
          monthlyValues: { '2025-04': 0.5 },
        }),
      ]
      expect(
        getNewlyOutOfRangeAssignmentMonths(oldMember, newMember, assignments),
      ).toEqual([])
    })

    it('複数アサイン・複数月を横断して新たに範囲外になった月のみ返す', () => {
      const oldMember = createTestMember({
        id: 'member-1',
        startDate: null,
        contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
      })
      const newMember = createTestMember({
        id: 'member-1',
        startDate: null,
        contractUnitPriceHistory: [{ effectiveFrom: '2025-06', amount: 100 }],
      })
      const assignmentA = makeAssignment({
        monthlyValues: { '2025-04': 0.3, '2025-06': 0.4 },
      })
      const assignmentB = makeAssignment({
        monthlyValues: { '2025-05': 0.2 },
      })
      const result = getNewlyOutOfRangeAssignmentMonths(oldMember, newMember, [
        assignmentA,
        assignmentB,
      ])
      expect(result).toEqual(
        expect.arrayContaining([
          { assignmentId: assignmentA.id, monthKey: '2025-04' },
          { assignmentId: assignmentB.id, monthKey: '2025-05' },
        ]),
      )
      expect(result).toHaveLength(2)
    })
  })
})
