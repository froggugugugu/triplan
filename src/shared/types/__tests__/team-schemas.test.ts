import { describe, expect, it } from 'vitest'
import {
  BudgetBreakdownCategorySchema,
  BudgetBreakdownSchema,
  SaasContractSchema,
  UpdateBudgetBreakdownSchema,
  UpdateSaasContractSchema,
} from '@/shared/types/budget'
import { CompanySchema } from '@/shared/types/company'
import { DatabaseSchema } from '@/shared/types/database'
import { DivisionSchema } from '@/shared/types/division'
import {
  ContractUnitPriceEntrySchema,
  MemberSchema,
  UnitPriceEntrySchema,
} from '@/shared/types/member'
import { SectionSchema } from '@/shared/types/section'

describe('DivisionSchema', () => {
  const validDivision = {
    id: crypto.randomUUID(),
    name: '開発本部',
    sortOrder: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  it('正しい部門データをバリデーションできる', () => {
    expect(() => DivisionSchema.parse(validDivision)).not.toThrow()
  })

  it('名前が空の場合にエラーになる', () => {
    expect(() => DivisionSchema.parse({ ...validDivision, name: '' })).toThrow()
  })

  it('名前が100文字を超える場合にエラーになる', () => {
    expect(() =>
      DivisionSchema.parse({ ...validDivision, name: 'a'.repeat(101) }),
    ).toThrow()
  })

  it('名前が100文字ちょうどの場合は成功する', () => {
    expect(() =>
      DivisionSchema.parse({ ...validDivision, name: 'a'.repeat(100) }),
    ).not.toThrow()
  })

  it('sortOrderが負の場合にエラーになる', () => {
    expect(() =>
      DivisionSchema.parse({ ...validDivision, sortOrder: -1 }),
    ).toThrow()
  })

  it('idがUUID形式でない場合にエラーになる', () => {
    expect(() =>
      DivisionSchema.parse({ ...validDivision, id: 'not-a-uuid' }),
    ).toThrow()
  })
})

describe('SectionSchema', () => {
  const validSection = {
    id: crypto.randomUUID(),
    divisionId: crypto.randomUUID(),
    name: '第1開発課',
    sortOrder: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  it('正しい課データをバリデーションできる', () => {
    expect(() => SectionSchema.parse(validSection)).not.toThrow()
  })

  it('名前が空の場合にエラーになる', () => {
    expect(() => SectionSchema.parse({ ...validSection, name: '' })).toThrow()
  })

  it('名前が100文字を超える場合にエラーになる', () => {
    expect(() =>
      SectionSchema.parse({ ...validSection, name: 'a'.repeat(101) }),
    ).toThrow()
  })

  it('divisionIdがない場合にエラーになる', () => {
    const { divisionId: _, ...withoutDivisionId } = validSection
    expect(() => SectionSchema.parse(withoutDivisionId)).toThrow()
  })

  it('divisionIdがUUID形式でない場合にエラーになる', () => {
    expect(() =>
      SectionSchema.parse({ ...validSection, divisionId: 'invalid' }),
    ).toThrow()
  })
})

describe('UnitPriceEntrySchema', () => {
  it('正しい単価エントリをバリデーションできる', () => {
    const entry = { effectiveFrom: '2025-04', amount: 100 }
    expect(() => UnitPriceEntrySchema.parse(entry)).not.toThrow()
  })

  it('effectiveFromがYYYY-MM形式でない場合にエラーになる', () => {
    expect(() =>
      UnitPriceEntrySchema.parse({ effectiveFrom: '2025-4', amount: 100 }),
    ).toThrow()
    expect(() =>
      UnitPriceEntrySchema.parse({
        effectiveFrom: '2025-04-01',
        amount: 100,
      }),
    ).toThrow()
    expect(() =>
      UnitPriceEntrySchema.parse({ effectiveFrom: 'invalid', amount: 100 }),
    ).toThrow()
  })

  it('amountが負の場合にエラーになる', () => {
    expect(() =>
      UnitPriceEntrySchema.parse({ effectiveFrom: '2025-04', amount: -1 }),
    ).toThrow()
  })

  it('amountが0の場合は成功する', () => {
    expect(() =>
      UnitPriceEntrySchema.parse({ effectiveFrom: '2025-04', amount: 0 }),
    ).not.toThrow()
  })

  it('amountが小数の場合も成功する', () => {
    const entry = { effectiveFrom: '2025-04', amount: 99.5 }
    expect(() => UnitPriceEntrySchema.parse(entry)).not.toThrow()
  })
})

describe('CompanySchema', () => {
  const validCompany = {
    id: crypto.randomUUID(),
    name: '株式会社A',
    sortOrder: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  it('正しい所属会社データをバリデーションできる', () => {
    expect(() => CompanySchema.parse(validCompany)).not.toThrow()
  })

  it('名前が空の場合にエラーになる', () => {
    expect(() => CompanySchema.parse({ ...validCompany, name: '' })).toThrow()
  })

  it('名前が100文字を超える場合にエラーになる', () => {
    expect(() =>
      CompanySchema.parse({ ...validCompany, name: 'a'.repeat(101) }),
    ).toThrow()
  })

  it('sortOrderが負の場合にエラーになる', () => {
    expect(() =>
      CompanySchema.parse({ ...validCompany, sortOrder: -1 }),
    ).toThrow()
  })

  it('isProperを省略した場合デフォルトはfalse', () => {
    const parsed = CompanySchema.parse(validCompany)
    expect(parsed.isInternal).toBe(false)
  })

  it('isInternal=trueを指定できる', () => {
    const parsed = CompanySchema.parse({ ...validCompany, isInternal: true })
    expect(parsed.isInternal).toBe(true)
  })
})

describe('ContractUnitPriceEntrySchema', () => {
  it('正しい契約単価エントリをバリデーションできる', () => {
    const entry = { effectiveFrom: '2025-04', amount: 70 }
    expect(() => ContractUnitPriceEntrySchema.parse(entry)).not.toThrow()
  })

  it('effectiveFromがYYYY-MM形式でない場合にエラーになる', () => {
    expect(() =>
      ContractUnitPriceEntrySchema.parse({
        effectiveFrom: '2025-4',
        amount: 70,
      }),
    ).toThrow()
  })

  it('amountが負の場合にエラーになる', () => {
    expect(() =>
      ContractUnitPriceEntrySchema.parse({
        effectiveFrom: '2025-04',
        amount: -1,
      }),
    ).toThrow()
  })
})

describe('MemberSchema（新フィールド対応）', () => {
  const validMember = {
    id: crypto.randomUUID(),
    name: '田中太郎',
    sectionId: crypto.randomUUID(),
    role: 'エンジニア',
    isActive: true,
    startDate: '2025-04-01',
    endDate: null,
    unitPriceHistory: [{ effectiveFrom: '2025-04', amount: 100 }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  it('新フィールドを含む正しいメンバーデータをバリデーションできる', () => {
    expect(() => MemberSchema.parse(validMember)).not.toThrow()
  })

  it('sectionIdがnullの場合（未所属）も成功する', () => {
    expect(() =>
      MemberSchema.parse({ ...validMember, sectionId: null }),
    ).not.toThrow()
  })

  it('startDateがnullの場合も成功する', () => {
    expect(() =>
      MemberSchema.parse({ ...validMember, startDate: null }),
    ).not.toThrow()
  })

  it('endDateが設定されている場合も成功する', () => {
    expect(() =>
      MemberSchema.parse({ ...validMember, endDate: '2026-03-31' }),
    ).not.toThrow()
  })

  it('unitPriceHistoryが空配列の場合も成功する', () => {
    expect(() =>
      MemberSchema.parse({ ...validMember, unitPriceHistory: [] }),
    ).not.toThrow()
  })

  it('unitPriceHistoryに複数エントリがある場合も成功する', () => {
    const member = {
      ...validMember,
      unitPriceHistory: [
        { effectiveFrom: '2025-04', amount: 100 },
        { effectiveFrom: '2025-10', amount: 120 },
      ],
    }
    expect(() => MemberSchema.parse(member)).not.toThrow()
  })

  it('後方互換: departmentフィールドがあっても成功する', () => {
    expect(() =>
      MemberSchema.parse({ ...validMember, department: '開発部' }),
    ).not.toThrow()
  })

  it('techTagIdsがオプションで受け付けられる', () => {
    const member = {
      ...validMember,
      techTagIds: [crypto.randomUUID(), crypto.randomUUID()],
    }
    expect(() => MemberSchema.parse(member)).not.toThrow()
  })

  it('companyId/contractUnitPriceHistoryを省略しても成功する（後方互換）', () => {
    const parsed = MemberSchema.parse(validMember)
    expect(parsed.companyId).toBeUndefined()
    expect(parsed.contractUnitPriceHistory).toBeUndefined()
  })

  it('companyIdとcontractUnitPriceHistoryを指定して成功する', () => {
    const companyId = crypto.randomUUID()
    const member = {
      ...validMember,
      companyId,
      contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 70 }],
    }
    const parsed = MemberSchema.parse(member)
    expect(parsed.companyId).toBe(companyId)
    expect(parsed.contractUnitPriceHistory).toEqual([
      { effectiveFrom: '2025-04', amount: 70 },
    ])
  })

  it('companyIdがnullの場合（未設定）も成功する', () => {
    expect(() =>
      MemberSchema.parse({ ...validMember, companyId: null }),
    ).not.toThrow()
  })
})

describe('DatabaseSchema（divisions/sections対応）', () => {
  const baseDb = {
    version: '1.0.0',
    fiscalYear: 2025,
    projects: [],
    members: [],
    metadata: {
      lastModified: new Date().toISOString(),
      createdBy: 'system',
      version: '1.0.0',
    },
  }

  it('divisions/sectionsがない場合もバリデーションに成功する（後方互換）', () => {
    expect(() => DatabaseSchema.parse(baseDb)).not.toThrow()
  })

  it('estimatedUnitPriceがない場合もバリデーションに成功する（後方互換）', () => {
    const parsed = DatabaseSchema.parse(baseDb)
    expect(parsed.estimatedUnitPrice).toBeUndefined()
  })

  it('estimatedUnitPriceを指定してバリデーションできる', () => {
    const parsed = DatabaseSchema.parse({ ...baseDb, estimatedUnitPrice: 80 })
    expect(parsed.estimatedUnitPrice).toBe(80)
  })

  it('estimatedUnitPriceが負の場合はエラーになる', () => {
    expect(() =>
      DatabaseSchema.parse({ ...baseDb, estimatedUnitPrice: -1 }),
    ).toThrow()
  })

  it('空のdivisions/sectionsを受け付ける', () => {
    const db = { ...baseDb, divisions: [], sections: [] }
    expect(() => DatabaseSchema.parse(db)).not.toThrow()
  })

  it('正しいdivisions/sectionsデータを受け付ける', () => {
    const divisionId = crypto.randomUUID()
    const db = {
      ...baseDb,
      divisions: [
        {
          id: divisionId,
          name: '開発本部',
          sortOrder: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      sections: [
        {
          id: crypto.randomUUID(),
          divisionId,
          name: '第1課',
          sortOrder: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    }
    const parsed = DatabaseSchema.parse(db)
    expect(parsed.divisions).toHaveLength(1)
    expect(parsed.sections).toHaveLength(1)
  })

  it('companiesがない場合もバリデーションに成功する（後方互換）', () => {
    expect(() => DatabaseSchema.parse(baseDb)).not.toThrow()
  })

  it('正しいcompaniesデータを受け付ける', () => {
    const db = {
      ...baseDb,
      companies: [
        {
          id: crypto.randomUUID(),
          name: '株式会社A',
          sortOrder: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    }
    const parsed = DatabaseSchema.parse(db)
    expect(parsed.companies).toHaveLength(1)
  })

  it('budgetBreakdownsがない場合もバリデーションに成功する（後方互換）', () => {
    expect(() => DatabaseSchema.parse(baseDb)).not.toThrow()
  })

  it('正しいbudgetBreakdownsデータを受け付ける', () => {
    const db = {
      ...baseDb,
      budgetBreakdowns: [
        {
          id: crypto.randomUUID(),
          budgetId: crypto.randomUUID(),
          category: 'project_personnel',
          label: '案件A',
          amount: 1000,
          recordedAt: '2025-04-01',
          createdAt: new Date().toISOString(),
        },
      ],
    }
    const parsed = DatabaseSchema.parse(db)
    expect(parsed.budgetBreakdowns).toHaveLength(1)
  })

  it('personnelPlansがない場合もバリデーションに成功する（後方互換）', () => {
    expect(() => DatabaseSchema.parse(baseDb)).not.toThrow()
  })

  it('正しいpersonnelPlansデータを受け付ける', () => {
    const db = {
      ...baseDb,
      personnelPlans: [
        {
          id: crypto.randomUUID(),
          divisionId: crypto.randomUUID(),
          fiscalYear: 2025,
          category: 'personnel_internal' as const,
          monthlyHeadcount: { '2025-04': 2 },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    }
    const parsed = DatabaseSchema.parse(db)
    expect(parsed.personnelPlans).toHaveLength(1)
  })
})

describe('BudgetBreakdownSchema拡張（概算・案件リンク・一般経費・月次実績）', () => {
  const validBreakdown = {
    id: crypto.randomUUID(),
    budgetId: crypto.randomUUID(),
    category: 'project_personnel' as const,
    label: '案件A',
    amount: 1000,
    recordedAt: '2025-04-01',
    createdAt: new Date().toISOString(),
  }

  it('新規フィールドが未設定でもバリデーションに成功する（既存データとの後方互換）', () => {
    const parsed = BudgetBreakdownSchema.parse(validBreakdown)
    expect(parsed.estimateAmount).toBeUndefined()
    expect(parsed.coefficient).toBeUndefined()
    expect(parsed.projectId).toBeUndefined()
    expect(parsed.monthlyActuals).toBeUndefined()
  })

  it('estimateAmount/coefficient/projectId/monthlyActualsを指定してバリデーションできる', () => {
    const projectId = crypto.randomUUID()
    const parsed = BudgetBreakdownSchema.parse({
      ...validBreakdown,
      estimateAmount: 800,
      coefficient: 1.25,
      projectId,
      monthlyActuals: { '2025-04': 100 },
    })
    expect(parsed.estimateAmount).toBe(800)
    expect(parsed.coefficient).toBe(1.25)
    expect(parsed.projectId).toBe(projectId)
    expect(parsed.monthlyActuals).toEqual({ '2025-04': 100 })
  })

  it('projectIdはnullを許容する（案件未選択）', () => {
    expect(() =>
      BudgetBreakdownSchema.parse({ ...validBreakdown, projectId: null }),
    ).not.toThrow()
  })

  it('categoryにgeneral_expenseを受け付ける', () => {
    expect(() =>
      BudgetBreakdownSchema.parse({
        ...validBreakdown,
        category: 'general_expense',
      }),
    ).not.toThrow()
  })

  it('coefficientが0以下の場合はエラーになる', () => {
    expect(() =>
      BudgetBreakdownSchema.parse({ ...validBreakdown, coefficient: 0 }),
    ).toThrow()
  })

  it('estimateAmountが負の場合はエラーになる', () => {
    expect(() =>
      BudgetBreakdownSchema.parse({ ...validBreakdown, estimateAmount: -1 }),
    ).toThrow()
  })

  it('projectIdがuuid形式でない場合はエラーになる', () => {
    expect(() =>
      BudgetBreakdownSchema.parse({
        ...validBreakdown,
        projectId: 'not-a-uuid',
      }),
    ).toThrow()
  })
})

describe('UpdateBudgetBreakdownSchema', () => {
  it('idのみ必須で、他は任意項目としてバリデーションできる', () => {
    const id = crypto.randomUUID()
    const parsed = UpdateBudgetBreakdownSchema.parse({
      id,
      label: '案件A（修正後）',
      amount: 1200,
    })
    expect(parsed.id).toBe(id)
    expect(parsed.label).toBe('案件A（修正後）')
    expect(parsed.amount).toBe(1200)
  })

  it('idがない場合はエラーになる', () => {
    expect(() =>
      UpdateBudgetBreakdownSchema.parse({ label: '案件A' }),
    ).toThrow()
  })

  it('monthlyActualsを渡してもスキーマ上は無視される（専用アクション経由に限定）', () => {
    const parsed = UpdateBudgetBreakdownSchema.parse({
      id: crypto.randomUUID(),
      monthlyActuals: { '2025-04': 100 },
    })
    expect(parsed).not.toHaveProperty('monthlyActuals')
  })
})

describe('BudgetBreakdownCategorySchema', () => {
  it('project_personnel/project_expense/general_expenseを受け付ける', () => {
    expect(() =>
      BudgetBreakdownCategorySchema.parse('project_personnel'),
    ).not.toThrow()
    expect(() =>
      BudgetBreakdownCategorySchema.parse('project_expense'),
    ).not.toThrow()
    expect(() =>
      BudgetBreakdownCategorySchema.parse('general_expense'),
    ).not.toThrow()
  })

  it('未定義の値はエラーになる', () => {
    expect(() => BudgetBreakdownCategorySchema.parse('other')).toThrow()
  })
})

describe('SaasContractSchema拡張（monthlyActuals）', () => {
  const validContract = {
    id: crypto.randomUUID(),
    name: 'Test SaaS',
    divisionId: crypto.randomUUID(),
    contractType: 'annual' as const,
    amount: 100,
    paymentCycle: 'annual' as const,
    contractStartDate: '2025-04-01',
    nextRenewalDate: '2026-03-31',
    note: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  it('monthlyActualsが未設定でもバリデーションに成功する（既存データとの後方互換）', () => {
    const parsed = SaasContractSchema.parse(validContract)
    expect(parsed.monthlyActuals).toBeUndefined()
  })

  it('monthlyActualsを指定してバリデーションできる', () => {
    const parsed = SaasContractSchema.parse({
      ...validContract,
      monthlyActuals: { '2025-04': 50 },
    })
    expect(parsed.monthlyActuals).toEqual({ '2025-04': 50 })
  })
})

describe('UpdateSaasContractSchema（monthlyActualsは専用アクション限定）', () => {
  it('UpdateSaasContract型にmonthlyActualsが存在しない（型定義レベルの除外を確認）', () => {
    // UpdateSaasContractSchema.parse自体は引数がunknown型のため、
    // 実際の保護境界はストア側 updateSaasContract(data: UpdateSaasContract) の
    // 引数型チェック（budget-store.test.ts参照）。ここでは型定義から
    // monthlyActualsキーが除去されていることをランタイムでも確認する。
    const parsed = UpdateSaasContractSchema.parse({
      id: crypto.randomUUID(),
      amount: 150,
    })
    expect(parsed).not.toHaveProperty('monthlyActuals')
    expect(parsed.amount).toBe(150)
  })
})
