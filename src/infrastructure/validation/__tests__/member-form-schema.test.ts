import { describe, expect, it } from 'vitest'
import { memberFormSchema } from '../schemas'

describe('memberFormSchema', () => {
  describe('startDate と endDate のバリデーション', () => {
    it('終了日が開始日以降の場合は成功する', () => {
      const result = memberFormSchema.safeParse({
        name: '田中太郎',
        sectionId: null,
        role: 'エンジニア',
        isActive: true,
        startDate: '2025-04-01',
        endDate: '2025-04-30',
        unitPriceHistory: [],
      })

      expect(result.success).toBe(true)
    })

    it('終了日と開始日が同じ日付の場合は成功する', () => {
      const result = memberFormSchema.safeParse({
        name: '田中太郎',
        sectionId: null,
        role: 'エンジニア',
        isActive: true,
        startDate: '2025-04-01',
        endDate: '2025-04-01',
        unitPriceHistory: [],
      })

      expect(result.success).toBe(true)
    })

    it('終了日が開始日より前の場合は失敗する', () => {
      const result = memberFormSchema.safeParse({
        name: '田中太郎',
        sectionId: null,
        role: 'エンジニア',
        isActive: true,
        startDate: '2025-04-30',
        endDate: '2025-04-01',
        unitPriceHistory: [],
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          '終了日は開始日以降の日付を指定してください',
        )
        expect(result.error.issues[0]?.path).toEqual(['endDate'])
      }
    })

    it('開始日のみ設定されている場合は成功する', () => {
      const result = memberFormSchema.safeParse({
        name: '田中太郎',
        sectionId: null,
        role: 'エンジニア',
        isActive: true,
        startDate: '2025-04-01',
        endDate: null,
        unitPriceHistory: [],
      })

      expect(result.success).toBe(true)
    })

    it('終了日のみ設定されている場合は成功する', () => {
      const result = memberFormSchema.safeParse({
        name: '田中太郎',
        sectionId: null,
        role: 'エンジニア',
        isActive: true,
        startDate: null,
        endDate: '2025-04-30',
        unitPriceHistory: [],
      })

      expect(result.success).toBe(true)
    })

    it('開始日・終了日が両方nullの場合は成功する', () => {
      const result = memberFormSchema.safeParse({
        name: '田中太郎',
        sectionId: null,
        role: 'エンジニア',
        isActive: true,
        startDate: null,
        endDate: null,
        unitPriceHistory: [],
      })

      expect(result.success).toBe(true)
    })
  })

  describe('必須フィールドのバリデーション', () => {
    it('氏名が空文字の場合は失敗する', () => {
      const result = memberFormSchema.safeParse({
        name: '',
        sectionId: null,
        role: 'エンジニア',
        isActive: true,
        startDate: null,
        endDate: null,
        unitPriceHistory: [],
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual(['name'])
      }
    })

    it('氏名が100文字を超える場合は失敗する', () => {
      const result = memberFormSchema.safeParse({
        name: 'あ'.repeat(101),
        sectionId: null,
        role: 'エンジニア',
        isActive: true,
        startDate: null,
        endDate: null,
        unitPriceHistory: [],
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual(['name'])
      }
    })

    it('役割が100文字を超える場合は失敗する', () => {
      const result = memberFormSchema.safeParse({
        name: '田中太郎',
        sectionId: null,
        role: 'あ'.repeat(101),
        isActive: true,
        startDate: null,
        endDate: null,
        unitPriceHistory: [],
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual(['role'])
      }
    })
  })

  describe('デフォルト値', () => {
    it('sectionIdのデフォルトはnull', () => {
      const result = memberFormSchema.safeParse({
        name: '田中太郎',
        role: 'エンジニア',
        isActive: true,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.sectionId).toBe(null)
        expect(result.data.startDate).toBe(null)
        expect(result.data.endDate).toBe(null)
        expect(result.data.unitPriceHistory).toEqual([])
      }
    })

    it('companyId/contractUnitPriceHistoryのデフォルトはnull/空配列', () => {
      const result = memberFormSchema.safeParse({
        name: '田中太郎',
        role: 'エンジニア',
        isActive: true,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.companyId).toBe(null)
        expect(result.data.contractUnitPriceHistory).toEqual([])
      }
    })
  })

  describe('所属会社・契約単価履歴のバリデーション', () => {
    it('companyIdとcontractUnitPriceHistoryを指定して成功する', () => {
      const companyId = crypto.randomUUID()
      const result = memberFormSchema.safeParse({
        name: '田中太郎',
        sectionId: null,
        companyId,
        role: 'エンジニア',
        isActive: true,
        startDate: null,
        endDate: null,
        unitPriceHistory: [],
        contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: 70 }],
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.companyId).toBe(companyId)
        expect(result.data.contractUnitPriceHistory).toEqual([
          { effectiveFrom: '2025-04', amount: 70 },
        ])
      }
    })

    it('契約単価が負の値の場合は失敗する', () => {
      const result = memberFormSchema.safeParse({
        name: '田中太郎',
        role: 'エンジニア',
        isActive: true,
        contractUnitPriceHistory: [{ effectiveFrom: '2025-04', amount: -1 }],
      })

      expect(result.success).toBe(false)
    })

    it('companyIdが不正なUUID形式の場合は失敗する', () => {
      const result = memberFormSchema.safeParse({
        name: '田中太郎',
        role: 'エンジニア',
        isActive: true,
        companyId: 'not-a-uuid',
      })

      expect(result.success).toBe(false)
    })
  })

  describe('契約形態のバリデーション', () => {
    it('contractTypeのデフォルトはnull', () => {
      const result = memberFormSchema.safeParse({
        name: '田中太郎',
        role: 'エンジニア',
        isActive: true,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.contractType).toBe(null)
      }
    })

    it.each(['請負', '準委任', '派遣', '正社員'] as const)(
      'contractType="%s"を指定して成功する',
      (contractType) => {
        const result = memberFormSchema.safeParse({
          name: '田中太郎',
          role: 'エンジニア',
          isActive: true,
          contractType,
        })

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.contractType).toBe(contractType)
        }
      },
    )

    it('contractTypeにnullを指定して成功する（未設定）', () => {
      const result = memberFormSchema.safeParse({
        name: '田中太郎',
        role: 'エンジニア',
        isActive: true,
        contractType: null,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.contractType).toBe(null)
      }
    })

    it('contractTypeが4値以外の場合は失敗する', () => {
      const result = memberFormSchema.safeParse({
        name: '田中太郎',
        role: 'エンジニア',
        isActive: true,
        contractType: '業務委託',
      })

      expect(result.success).toBe(false)
    })
  })
})

describe('memberFormSchema - capacityRatio（稼働率上限）', () => {
  const base = {
    name: '田中太郎',
    sectionId: null,
    role: 'エンジニア',
    isActive: true,
    startDate: null,
    endDate: null,
    unitPriceHistory: [],
  }

  it('未指定でも成功する（既定1.0として扱うため）', () => {
    const result = memberFormSchema.safeParse(base)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.capacityRatio).toBeUndefined()
  })

  it('0より大きく1.0以下の値を受け付ける', () => {
    for (const value of [0.1, 0.5, 0.8, 1]) {
      expect(
        memberFormSchema.safeParse({ ...base, capacityRatio: value }).success,
      ).toBe(true)
    }
  })

  // 反証: 上限1.0超は「1人月を超えて稼働できる」ことになり、超過判定の意味が失われる
  it('反証: 1.0を超える値は拒否する', () => {
    const result = memberFormSchema.safeParse({ ...base, capacityRatio: 1.5 })
    expect(result.success).toBe(false)
  })

  // 反証: 0以下だとどの配分を入れても常に超過になり、アサイン自体ができなくなる
  it('反証: 0以下の値は拒否する', () => {
    expect(
      memberFormSchema.safeParse({ ...base, capacityRatio: 0 }).success,
    ).toBe(false)
    expect(
      memberFormSchema.safeParse({ ...base, capacityRatio: -0.5 }).success,
    ).toBe(false)
  })
})

describe('契約単価履歴の精算幅（準委任）', () => {
  const base = {
    name: '精算テスト',
    sectionId: null,
    companyId: '00000000-0000-4000-8000-000000000001',
    role: '',
    isActive: true,
    startDate: null,
    endDate: null,
    unitPriceHistory: [],
  }
  const entry = (settlement: Record<string, number>) => ({
    ...base,
    contractUnitPriceHistory: [
      { effectiveFrom: '2026-04', amount: 80, ...settlement },
    ],
  })

  it('上下限が揃っていれば受理する（境界: 上限=下限も可）', () => {
    expect(
      memberFormSchema.safeParse(
        entry({ settlementLowerHours: 140, settlementUpperHours: 180 }),
      ).success,
    ).toBe(true)
    expect(
      memberFormSchema.safeParse(
        entry({ settlementLowerHours: 160, settlementUpperHours: 160 }),
      ).success,
    ).toBe(true)
  })

  it('反証: 片側のみの入力・上下逆転は拒否する', () => {
    expect(
      memberFormSchema.safeParse(entry({ settlementLowerHours: 140 })).success,
    ).toBe(false)
    expect(
      memberFormSchema.safeParse(
        entry({ settlementLowerHours: 180, settlementUpperHours: 140 }),
      ).success,
    ).toBe(false)
  })

  it('反証: 両方0（NumericInputの空欄）は未設定として受理する', () => {
    expect(
      memberFormSchema.safeParse(
        entry({ settlementLowerHours: 0, settlementUpperHours: 0 }),
      ).success,
    ).toBe(true)
  })
})
