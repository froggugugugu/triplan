import { describe, expect, it } from 'vitest'
import {
  aiUsageMemberAllocationFormSchema,
  aiUsageProviderFormSchema,
  budgetBreakdownFormSchema,
  otherExpenseActualFormSchema,
  saasContractFormSchema,
} from '@/infrastructure/validation/schemas'

const validSaasContract = {
  name: 'GitHub Copilot',
  divisionId: crypto.randomUUID(),
  contractType: 'annual' as const,
  amount: 100,
  paymentCycle: 'annual' as const,
  contractStartDate: '2025-04-01',
  nextRenewalDate: '2026-03-31',
  note: null,
}

describe('saasContractFormSchema', () => {
  it('正しいデータでバリデーション成功', () => {
    const result = saasContractFormSchema.safeParse(validSaasContract)
    expect(result.success).toBe(true)
  })

  it('headcount/unitPriceを省略しても成功する', () => {
    const result = saasContractFormSchema.safeParse(validSaasContract)
    expect(result.success).toBe(true)
  })

  it('headcount/unitPriceを指定して成功する', () => {
    const result = saasContractFormSchema.safeParse({
      ...validSaasContract,
      headcount: 5,
      unitPrice: 2,
    })
    expect(result.success).toBe(true)
  })

  it('headcountが0以下の場合エラー', () => {
    const result = saasContractFormSchema.safeParse({
      ...validSaasContract,
      headcount: 0,
    })
    expect(result.success).toBe(false)
  })

  it('unitPriceが負の場合エラー', () => {
    const result = saasContractFormSchema.safeParse({
      ...validSaasContract,
      unitPrice: -1,
    })
    expect(result.success).toBe(false)
  })

  it('amountHistoryを指定して成功する', () => {
    const result = saasContractFormSchema.safeParse({
      ...validSaasContract,
      amountHistory: [
        { effectiveFrom: '2025-04', amount: 80 },
        { effectiveFrom: '2025-10', amount: 100 },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('amountHistoryのeffectiveFromがYYYY-MM形式でない場合エラー', () => {
    const result = saasContractFormSchema.safeParse({
      ...validSaasContract,
      amountHistory: [{ effectiveFrom: '2025/04', amount: 80 }],
    })
    expect(result.success).toBe(false)
  })

  it('nextRenewalDateがcontractStartDateより前の場合エラー', () => {
    const result = saasContractFormSchema.safeParse({
      ...validSaasContract,
      contractStartDate: '2025-04-01',
      nextRenewalDate: '2025-03-01',
    })
    expect(result.success).toBe(false)
  })

  it('planを省略しても成功する（後方互換）', () => {
    const result = saasContractFormSchema.safeParse(validSaasContract)
    expect(result.success).toBe(true)
  })

  it('planを指定して成功する', () => {
    const result = saasContractFormSchema.safeParse({
      ...validSaasContract,
      plan: 'Business',
    })
    expect(result.success).toBe(true)
  })

  it('planにnullを指定して成功する', () => {
    const result = saasContractFormSchema.safeParse({
      ...validSaasContract,
      plan: null,
    })
    expect(result.success).toBe(true)
  })

  it('反証: planが101文字の場合エラー', () => {
    const result = saasContractFormSchema.safeParse({
      ...validSaasContract,
      plan: 'a'.repeat(101),
    })
    expect(result.success).toBe(false)
  })

  it('反証: planが100文字ちょうどの場合は成功する（境界値）', () => {
    const result = saasContractFormSchema.safeParse({
      ...validSaasContract,
      plan: 'a'.repeat(100),
    })
    expect(result.success).toBe(true)
  })
})

describe('aiUsageProviderFormSchema', () => {
  it('正しいデータでバリデーション成功', () => {
    const result = aiUsageProviderFormSchema.safeParse({
      name: 'Anthropic',
      plan: 'Team',
    })
    expect(result.success).toBe(true)
  })

  it('planを省略しても成功する', () => {
    const result = aiUsageProviderFormSchema.safeParse({ name: 'Anthropic' })
    expect(result.success).toBe(true)
  })

  it('反証: nameが空文字の場合エラー', () => {
    const result = aiUsageProviderFormSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })

  it('反証: nameが101文字の場合エラー', () => {
    const result = aiUsageProviderFormSchema.safeParse({
      name: 'a'.repeat(101),
    })
    expect(result.success).toBe(false)
  })

  it('反証: nameが100文字ちょうどの場合は成功する（境界値）', () => {
    const result = aiUsageProviderFormSchema.safeParse({
      name: 'a'.repeat(100),
    })
    expect(result.success).toBe(true)
  })

  it('反証: planが101文字の場合エラー', () => {
    const result = aiUsageProviderFormSchema.safeParse({
      name: 'Anthropic',
      plan: 'a'.repeat(101),
    })
    expect(result.success).toBe(false)
  })
})

describe('budgetBreakdownFormSchema', () => {
  const validBreakdown = {
    category: 'project_personnel' as const,
    label: '案件A',
    amount: 1000,
    recordedAt: '2025-04-01',
  }

  it('正しいデータでバリデーション成功', () => {
    const result = budgetBreakdownFormSchema.safeParse(validBreakdown)
    expect(result.success).toBe(true)
  })

  it('project_expense区分でも成功する', () => {
    const result = budgetBreakdownFormSchema.safeParse({
      ...validBreakdown,
      category: 'project_expense',
    })
    expect(result.success).toBe(true)
  })

  it('不正な区分の場合エラー', () => {
    const result = budgetBreakdownFormSchema.safeParse({
      ...validBreakdown,
      category: 'invalid_category',
    })
    expect(result.success).toBe(false)
  })

  it('labelが空文字の場合エラー', () => {
    const result = budgetBreakdownFormSchema.safeParse({
      ...validBreakdown,
      label: '',
    })
    expect(result.success).toBe(false)
  })

  it('amountが負の場合エラー', () => {
    const result = budgetBreakdownFormSchema.safeParse({
      ...validBreakdown,
      amount: -1,
    })
    expect(result.success).toBe(false)
  })

  it('recordedAtがYYYY-MM-DD形式でない場合エラー', () => {
    const result = budgetBreakdownFormSchema.safeParse({
      ...validBreakdown,
      recordedAt: '2025-04',
    })
    expect(result.success).toBe(false)
  })

  it('general_expense区分でも成功する（projectId未指定）', () => {
    const result = budgetBreakdownFormSchema.safeParse({
      ...validBreakdown,
      category: 'general_expense',
    })
    expect(result.success).toBe(true)
  })

  it('estimateAmount/coefficientを指定して成功する', () => {
    const result = budgetBreakdownFormSchema.safeParse({
      ...validBreakdown,
      estimateAmount: 800,
      coefficient: 1.25,
    })
    expect(result.success).toBe(true)
  })

  it('coefficientが0以下の場合エラー', () => {
    const result = budgetBreakdownFormSchema.safeParse({
      ...validBreakdown,
      coefficient: 0,
    })
    expect(result.success).toBe(false)
  })

  it('project_personnel区分でprojectIdを指定して成功する', () => {
    const result = budgetBreakdownFormSchema.safeParse({
      ...validBreakdown,
      projectId: crypto.randomUUID(),
    })
    expect(result.success).toBe(true)
  })

  it('general_expense区分でprojectIdを指定するとエラー', () => {
    const result = budgetBreakdownFormSchema.safeParse({
      ...validBreakdown,
      category: 'general_expense',
      projectId: crypto.randomUUID(),
    })
    expect(result.success).toBe(false)
  })
})

describe('otherExpenseActualFormSchema', () => {
  const validRecord = {
    purchasedAt: '2025-04-10',
    itemLabel: '書籍代',
    amount: 30,
  }

  it('正しいデータでバリデーション成功', () => {
    const result = otherExpenseActualFormSchema.safeParse(validRecord)
    expect(result.success).toBe(true)
  })

  it('purchasedAtがYYYY-MM-DD形式でない場合エラー', () => {
    const result = otherExpenseActualFormSchema.safeParse({
      ...validRecord,
      purchasedAt: '2025-04',
    })
    expect(result.success).toBe(false)
  })

  it('itemLabelが空文字の場合エラー', () => {
    const result = otherExpenseActualFormSchema.safeParse({
      ...validRecord,
      itemLabel: '',
    })
    expect(result.success).toBe(false)
  })

  it('itemLabelが500文字までは成功する', () => {
    const result = otherExpenseActualFormSchema.safeParse({
      ...validRecord,
      itemLabel: 'a'.repeat(500),
    })
    expect(result.success).toBe(true)
  })

  it('itemLabelが500文字を超える場合エラー', () => {
    const result = otherExpenseActualFormSchema.safeParse({
      ...validRecord,
      itemLabel: 'a'.repeat(501),
    })
    expect(result.success).toBe(false)
  })

  it('amountが負の場合エラー', () => {
    const result = otherExpenseActualFormSchema.safeParse({
      ...validRecord,
      amount: -1,
    })
    expect(result.success).toBe(false)
  })

  it('amountが0の場合は成功する（0円以上を許容）', () => {
    const result = otherExpenseActualFormSchema.safeParse({
      ...validRecord,
      amount: 0,
    })
    expect(result.success).toBe(true)
  })

  it('noteを省略しても成功する（任意項目）', () => {
    const result = otherExpenseActualFormSchema.safeParse(validRecord)
    expect(result.success).toBe(true)
  })

  it('noteをnullにしても成功する', () => {
    const result = otherExpenseActualFormSchema.safeParse({
      ...validRecord,
      note: null,
    })
    expect(result.success).toBe(true)
  })

  it('noteが1000文字までは成功する', () => {
    const result = otherExpenseActualFormSchema.safeParse({
      ...validRecord,
      note: 'a'.repeat(1000),
    })
    expect(result.success).toBe(true)
  })

  it('noteが1000文字を超える場合エラー', () => {
    const result = otherExpenseActualFormSchema.safeParse({
      ...validRecord,
      note: 'a'.repeat(1001),
    })
    expect(result.success).toBe(false)
  })
})

describe('aiUsageMemberAllocationFormSchema', () => {
  it('正しいデータでバリデーション成功', () => {
    const result = aiUsageMemberAllocationFormSchema.safeParse({
      monthlyBudget: 10,
      bufferAmount: 2,
    })
    expect(result.success).toBe(true)
  })

  it('monthlyBudgetが負の場合エラー', () => {
    const result = aiUsageMemberAllocationFormSchema.safeParse({
      monthlyBudget: -1,
      bufferAmount: 0,
    })
    expect(result.success).toBe(false)
  })

  it('bufferAmountが負の場合エラー', () => {
    const result = aiUsageMemberAllocationFormSchema.safeParse({
      monthlyBudget: 0,
      bufferAmount: -1,
    })
    expect(result.success).toBe(false)
  })

  it('両方0の場合は成功する', () => {
    const result = aiUsageMemberAllocationFormSchema.safeParse({
      monthlyBudget: 0,
      bufferAmount: 0,
    })
    expect(result.success).toBe(true)
  })
})
