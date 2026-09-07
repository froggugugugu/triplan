import { describe, expect, it } from 'vitest'
import {
  CreateProjectBaselineSchema,
  DatabaseSchema,
  ProjectBaselineSchema,
} from '@/shared/types'

function baseBaseline(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    version: 1,
    approvedAt: '2026-08-15',
    reason: '当初計画',
    bacAmount: 1000,
    monthlyPlannedCost: { '2026-04': 300, '2026-05': 150 },
    plannedAllocations: [
      {
        memberId: crypto.randomUUID(),
        monthlyValues: { '2026-04': 1, '2026-05': 0.5 },
      },
    ],
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('ProjectBaselineSchema', () => {
  it('必須フィールドが揃っていればパースできる', () => {
    expect(() => ProjectBaselineSchema.parse(baseBaseline())).not.toThrow()
  })

  it('配分率が空でもパースできる（アサイン未登録の案件を凍結した場合）', () => {
    expect(() =>
      ProjectBaselineSchema.parse(
        baseBaseline({ monthlyPlannedCost: {}, plannedAllocations: [] }),
      ),
    ).not.toThrow()
  })

  // 反証: versionは1起点の連番。0や負値を許すと有効ベースラインの判定が壊れる
  it('反証: versionが0以下だと拒否する', () => {
    expect(() =>
      ProjectBaselineSchema.parse(baseBaseline({ version: 0 })),
    ).toThrow()
    expect(() =>
      ProjectBaselineSchema.parse(baseBaseline({ version: -1 })),
    ).toThrow()
  })

  // 反証: versionが小数だと採番（最大値+1）が破綻する
  it('反証: versionが整数でないと拒否する', () => {
    expect(() =>
      ProjectBaselineSchema.parse(baseBaseline({ version: 1.5 })),
    ).toThrow()
  })

  // 反証: approvedAtは履歴パネルの表示・比較に使うため形式を固定する
  it('反証: approvedAtがYYYY-MM-DD形式でないと拒否する', () => {
    expect(() =>
      ProjectBaselineSchema.parse(
        baseBaseline({ approvedAt: '2026-08-15T00:00:00.000Z' }),
      ),
    ).toThrow()
  })

  // 反証: 凍結理由が空だと「なぜ再凍結したか」を追えなくなる
  it('反証: reasonが空文字だと拒否する', () => {
    expect(() =>
      ProjectBaselineSchema.parse(baseBaseline({ reason: '' })),
    ).toThrow()
  })

  it('反証: reasonが200文字を超えると拒否する', () => {
    expect(() =>
      ProjectBaselineSchema.parse(baseBaseline({ reason: 'あ'.repeat(201) })),
    ).toThrow()
  })

  it('反証: bacAmountが負値だと拒否する', () => {
    expect(() =>
      ProjectBaselineSchema.parse(baseBaseline({ bacAmount: -1 })),
    ).toThrow()
  })

  it('反証: 月次計画コストに負値が含まれると拒否する', () => {
    expect(() =>
      ProjectBaselineSchema.parse(
        baseBaseline({ monthlyPlannedCost: { '2026-04': -100 } }),
      ),
    ).toThrow()
  })

  it('CreateProjectBaselineSchemaはidを要求しない', () => {
    const { id: _id, ...withoutId } = baseBaseline()
    expect(() => CreateProjectBaselineSchema.parse(withoutId)).not.toThrow()
  })
})

describe('DatabaseSchema（projectBaselines）', () => {
  const emptyDatabase = {
    version: '1.0.0',
    fiscalYear: 2026,
    projects: [],
    members: [],
    metadata: {
      lastModified: new Date().toISOString(),
      createdBy: 'test',
      version: '1.0.0',
    },
  }

  // 後方互換: 既存データにprojectBaselinesが無くても読み込めること
  it('projectBaselinesを持たない既存データもパースできる', () => {
    const parsed = DatabaseSchema.parse(emptyDatabase)
    expect(parsed.projectBaselines).toBeUndefined()
  })

  it('projectBaselinesを含むデータをパースできる', () => {
    const parsed = DatabaseSchema.parse({
      ...emptyDatabase,
      projectBaselines: [baseBaseline()],
    })
    expect(parsed.projectBaselines).toHaveLength(1)
  })
})
