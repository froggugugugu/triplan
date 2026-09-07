import { describe, expect, it } from 'vitest'
import { MemberSchema, ProjectSchema } from '@/shared/types'

describe('ProjectSchema', () => {
  it('should validate a correct project', () => {
    const project = {
      id: crypto.randomUUID(),
      code: 'P001',
      name: 'システム開発',
      parentId: null,
      level: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    expect(() => ProjectSchema.parse(project)).not.toThrow()
  })

  it('should reject empty name', () => {
    const project = {
      id: crypto.randomUUID(),
      code: 'P001',
      name: '',
      parentId: null,
      level: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    expect(() => ProjectSchema.parse(project)).toThrow()
  })

  it('should accept valid parentId', () => {
    const parentId = crypto.randomUUID()
    const project = {
      id: crypto.randomUUID(),
      code: 'P001-01',
      name: 'サブ案件',
      parentId,
      level: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    expect(() => ProjectSchema.parse(project)).not.toThrow()
  })

  it('should assign default values for status and confidence when missing', () => {
    const project = {
      id: crypto.randomUUID(),
      code: 'P001',
      name: 'テスト案件',
      parentId: null,
      level: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const parsed = ProjectSchema.parse(project)
    expect(parsed.status).toBe('not_started')
    expect(parsed.confidence).toBeNull()
  })

  it('should accept all valid status values', () => {
    const base = {
      id: crypto.randomUUID(),
      code: 'P001',
      name: 'テスト案件',
      parentId: null,
      level: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    for (const status of ['not_started', 'active', 'completed'] as const) {
      const parsed = ProjectSchema.parse({ ...base, status })
      expect(parsed.status).toBe(status)
    }
  })

  it('should reject invalid status value', () => {
    const project = {
      id: crypto.randomUUID(),
      code: 'P001',
      name: 'テスト案件',
      parentId: null,
      level: 0,
      status: 'invalid',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    expect(() => ProjectSchema.parse(project)).toThrow()
  })

  it('should accept all valid confidence values including null', () => {
    const base = {
      id: crypto.randomUUID(),
      code: 'P001',
      name: 'テスト案件',
      parentId: null,
      level: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    for (const confidence of ['S', 'A', 'B', 'C', null] as const) {
      const parsed = ProjectSchema.parse({ ...base, confidence })
      expect(parsed.confidence).toBe(confidence)
    }
  })

  it('should reject invalid confidence value', () => {
    const project = {
      id: crypto.randomUUID(),
      code: 'P001',
      name: 'テスト案件',
      parentId: null,
      level: 0,
      confidence: 'D',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    expect(() => ProjectSchema.parse(project)).toThrow()
  })

  describe('completedAt（EVの過去週再現用の完了日）', () => {
    const base = {
      id: crypto.randomUUID(),
      code: 'P001',
      name: 'テスト案件',
      parentId: null,
      level: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    it('未指定でもパースできる（既存データとの後方互換）', () => {
      const parsed = ProjectSchema.parse(base)
      expect(parsed.completedAt).toBeUndefined()
    })

    it('YYYY-MM-DD形式の日付を受け付ける', () => {
      const parsed = ProjectSchema.parse({ ...base, completedAt: '2026-08-15' })
      expect(parsed.completedAt).toBe('2026-08-15')
    })

    it('nullを受け付ける（完了チェックを外した状態）', () => {
      const parsed = ProjectSchema.parse({ ...base, completedAt: null })
      expect(parsed.completedAt).toBeNull()
    })

    // 反証: 日時形式やスラッシュ区切りなど、YYYY-MM-DD以外の文字列は拒否する
    // （完了日の比較は文字列の辞書順で行うため、形式が揃っていないと誤判定になる）
    it('反証: YYYY-MM-DD以外の形式は拒否する', () => {
      expect(() =>
        ProjectSchema.parse({
          ...base,
          completedAt: '2026-08-15T00:00:00.000Z',
        }),
      ).toThrow()
      expect(() =>
        ProjectSchema.parse({ ...base, completedAt: '2026/08/15' }),
      ).toThrow()
      expect(() =>
        ProjectSchema.parse({ ...base, completedAt: '2026-8-15' }),
      ).toThrow()
    })
  })

  describe('contractType / masterDueDate（商流属性、PROPOSAL §2.1）', () => {
    const base = {
      id: crypto.randomUUID(),
      code: 'P001',
      name: 'テスト案件',
      parentId: null,
      level: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    it('未指定・nullでもパースできる（既存データとの後方互換）', () => {
      expect(() => ProjectSchema.parse(base)).not.toThrow()
      expect(() =>
        ProjectSchema.parse({
          ...base,
          contractType: null,
          masterDueDate: null,
        }),
      ).not.toThrow()
    })

    it('契約形態の4値を受け付ける', () => {
      for (const value of ['請負', '準委任', '派遣', '混在']) {
        expect(() =>
          ProjectSchema.parse({ ...base, contractType: value }),
        ).not.toThrow()
      }
    })

    // 反証: Member側の'正社員'は案件レベルでは意味を成さないため拒否する
    it('反証: 契約形態に定義外の値（正社員等）は拒否する', () => {
      expect(() =>
        ProjectSchema.parse({ ...base, contractType: '正社員' }),
      ).toThrow()
    })

    it('マスター納期はYYYY-MM-DD形式を受け付ける', () => {
      const parsed = ProjectSchema.parse({
        ...base,
        masterDueDate: '2026-03-31',
      })
      expect(parsed.masterDueDate).toBe('2026-03-31')
    })

    // 反証: 形式が揃っていないと納期超過判定（文字列の辞書順比較）が誤動作する
    it('反証: マスター納期がYYYY-MM-DD以外の形式は拒否する', () => {
      expect(() =>
        ProjectSchema.parse({ ...base, masterDueDate: '2026/03/31' }),
      ).toThrow()
      expect(() =>
        ProjectSchema.parse({
          ...base,
          masterDueDate: '2026-03-31T00:00:00.000Z',
        }),
      ).toThrow()
    })
  })

  describe('clientName / contractAmount / priority（人・モノ・金の三位一体強化）', () => {
    const base = {
      id: crypto.randomUUID(),
      code: 'P001',
      name: 'テスト案件',
      parentId: null,
      level: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    it('clientName/contractAmount/priorityを省略しても成功する（後方互換）', () => {
      const parsed = ProjectSchema.parse(base)
      expect(parsed.clientName).toBeUndefined()
      expect(parsed.contractAmount).toBeUndefined()
      expect(parsed.priority).toBeUndefined()
    })

    it('clientName/contractAmount/priorityにnullを指定して成功する', () => {
      const parsed = ProjectSchema.parse({
        ...base,
        clientName: null,
        contractAmount: null,
        priority: null,
      })
      expect(parsed.clientName).toBeNull()
      expect(parsed.contractAmount).toBeNull()
      expect(parsed.priority).toBeNull()
    })

    it('有効な値を指定して成功する', () => {
      const parsed = ProjectSchema.parse({
        ...base,
        clientName: '株式会社サンプル',
        contractAmount: 1200,
        priority: 'high',
      })
      expect(parsed.clientName).toBe('株式会社サンプル')
      expect(parsed.contractAmount).toBe(1200)
      expect(parsed.priority).toBe('high')
    })

    it('contractAmountが負の値の場合は拒否する', () => {
      expect(() =>
        ProjectSchema.parse({ ...base, contractAmount: -1 }),
      ).toThrow()
    })

    it('priorityが不正な値の場合は拒否する', () => {
      expect(() =>
        ProjectSchema.parse({ ...base, priority: 'urgent' }),
      ).toThrow()
    })

    it('clientNameが200文字を超える場合は拒否する', () => {
      expect(() =>
        ProjectSchema.parse({ ...base, clientName: 'あ'.repeat(201) }),
      ).toThrow()
    })
  })
})

describe('MemberSchema', () => {
  it('should validate a correct member', () => {
    const member = {
      id: crypto.randomUUID(),
      name: '山田太郎',
      sectionId: null,
      role: 'エンジニア',
      isActive: true,
      startDate: null,
      endDate: null,
      unitPriceHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    expect(() => MemberSchema.parse(member)).not.toThrow()
  })

  it('should reject empty name', () => {
    const member = {
      id: crypto.randomUUID(),
      name: '',
      sectionId: null,
      role: 'エンジニア',
      isActive: true,
      startDate: null,
      endDate: null,
      unitPriceHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    expect(() => MemberSchema.parse(member)).toThrow()
  })

  it('should accept a valid contractType', () => {
    const member = {
      id: crypto.randomUUID(),
      name: '山田太郎',
      sectionId: null,
      contractType: '請負',
      role: 'エンジニア',
      isActive: true,
      startDate: null,
      endDate: null,
      unitPriceHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    expect(() => MemberSchema.parse(member)).not.toThrow()
  })

  it('should reject an invalid contractType', () => {
    const member = {
      id: crypto.randomUUID(),
      name: '山田太郎',
      sectionId: null,
      contractType: '業務委託',
      role: 'エンジニア',
      isActive: true,
      startDate: null,
      endDate: null,
      unitPriceHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    expect(() => MemberSchema.parse(member)).toThrow()
  })

  describe('email（人・モノ・金の三位一体強化: 外部連携キー）', () => {
    const base = {
      id: crypto.randomUUID(),
      name: '山田太郎',
      sectionId: null,
      role: 'エンジニア',
      isActive: true,
      startDate: null,
      endDate: null,
      unitPriceHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    it('emailを省略しても成功する（後方互換）', () => {
      const parsed = MemberSchema.parse(base)
      expect(parsed.email).toBeUndefined()
    })

    it('emailにnullを指定して成功する（未設定）', () => {
      const parsed = MemberSchema.parse({ ...base, email: null })
      expect(parsed.email).toBeNull()
    })

    it('有効なメールアドレスを指定して成功する', () => {
      const parsed = MemberSchema.parse({
        ...base,
        email: 'yamada@example.com',
      })
      expect(parsed.email).toBe('yamada@example.com')
    })

    it('不正な形式のメールアドレスは拒否する', () => {
      expect(() =>
        MemberSchema.parse({ ...base, email: 'not-an-email' }),
      ).toThrow()
    })
  })
})
