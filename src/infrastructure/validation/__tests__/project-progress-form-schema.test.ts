import { describe, expect, it } from 'vitest'
import { projectProgressFormSchema } from '@/infrastructure/validation/schemas'

const validData = {
  projectId: crypto.randomUUID(),
  weekKey: '2025-W15',
  progressRate: 50,
}

describe('projectProgressFormSchema', () => {
  it('正常な入力をバリデーションできる', () => {
    expect(() => projectProgressFormSchema.parse(validData)).not.toThrow()
  })

  it('projectIdが未指定の場合はエラーになる', () => {
    const { projectId, ...rest } = validData
    expect(() => projectProgressFormSchema.parse(rest)).toThrow()
  })

  it('反証: projectIdがUUID形式でない場合はエラーになる', () => {
    expect(() =>
      projectProgressFormSchema.parse({
        ...validData,
        projectId: 'not-a-uuid',
      }),
    ).toThrow()
  })

  it('反証: weekKeyがISO週番号形式（YYYY-Www）でない場合はエラーになる', () => {
    expect(() =>
      projectProgressFormSchema.parse({ ...validData, weekKey: '2025-04' }),
    ).toThrow()
    expect(() =>
      projectProgressFormSchema.parse({ ...validData, weekKey: '2025-15' }),
    ).toThrow()
    expect(() =>
      projectProgressFormSchema.parse({ ...validData, weekKey: 'W15-2025' }),
    ).toThrow()
  })

  it('progressRateが0の場合はエラーにならない（下限境界）', () => {
    expect(() =>
      projectProgressFormSchema.parse({ ...validData, progressRate: 0 }),
    ).not.toThrow()
  })

  it('progressRateが100の場合はエラーにならない（上限境界）', () => {
    expect(() =>
      projectProgressFormSchema.parse({ ...validData, progressRate: 100 }),
    ).not.toThrow()
  })

  it('反証: progressRateが負数の場合はエラーになる', () => {
    expect(() =>
      projectProgressFormSchema.parse({ ...validData, progressRate: -1 }),
    ).toThrow()
  })

  it('反証: progressRateが100を超える場合はエラーになる', () => {
    expect(() =>
      projectProgressFormSchema.parse({ ...validData, progressRate: 100.1 }),
    ).toThrow()
  })
})
