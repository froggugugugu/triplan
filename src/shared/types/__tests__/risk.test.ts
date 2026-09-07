import { describe, expect, it } from 'vitest'
import { DatabaseSchema } from '../database'
import {
  CreateRiskEntrySchema,
  RiskEntrySchema,
  UpdateRiskEntrySchema,
} from '../risk'

const VALID = {
  id: '00000000-0000-4000-8000-0000000000a1',
  projectId: '00000000-0000-4000-8000-0000000000a2',
  title: '主要メンバーの離任リスク',
  probability: 'high',
  impact: 'medium',
  status: 'open',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

describe('RiskEntrySchema', () => {
  it('最小構成（任意フィールド無し）を受理し、statusの既定値はopen', () => {
    const { status: _s, ...withoutStatus } = VALID
    const parsed = RiskEntrySchema.parse(withoutStatus)
    expect(parsed.status).toBe('open')
    expect(parsed.response).toBeUndefined()
    expect(parsed.ownerMemberId).toBeUndefined()
  })

  it('全フィールド構成を受理する', () => {
    const parsed = RiskEntrySchema.parse({
      ...VALID,
      response: '代替要員の育成を前倒しする（軽減）',
      ownerMemberId: '00000000-0000-4000-8000-0000000000a3',
      dueDate: '2026-09-30',
      note: '10月の契約更新時期に注意',
    })
    expect(parsed.dueDate).toBe('2026-09-30')
  })

  it('3段階evaluationの定義外の値を拒否する（反証）', () => {
    expect(
      RiskEntrySchema.safeParse({ ...VALID, probability: 'critical' }).success,
    ).toBe(false)
    expect(RiskEntrySchema.safeParse({ ...VALID, impact: '' }).success).toBe(
      false,
    )
    expect(
      RiskEntrySchema.safeParse({ ...VALID, status: 'pending' }).success,
    ).toBe(false)
  })

  it('response/noteのnull（サーバーtext列の未設定）を受理する（export往復の反証）', () => {
    const parsed = RiskEntrySchema.parse({
      ...VALID,
      response: null,
      note: null,
    })
    expect(parsed.response).toBeNull()
  })

  it('空のタイトルを拒否する（反証）', () => {
    expect(RiskEntrySchema.safeParse({ ...VALID, title: '' }).success).toBe(
      false,
    )
  })

  it('暦に存在しない対応期限を拒否する（反証: DateOnlySchemaの暦検証）', () => {
    expect(
      RiskEntrySchema.safeParse({ ...VALID, dueDate: '2026-02-30' }).success,
    ).toBe(false)
    expect(
      RiskEntrySchema.safeParse({ ...VALID, dueDate: '2024-02-29' }).success,
    ).toBe(true)
  })

  it('CreateはID・日時を含まない（DB既定値now()へ委譲する契約）', () => {
    const created = CreateRiskEntrySchema.parse({
      projectId: VALID.projectId,
      title: VALID.title,
      probability: 'low',
      impact: 'low',
      createdAt: '2026-08-01T00:00:00.000Z',
    })
    expect('createdAt' in created).toBe(false)
    expect('id' in created).toBe(false)
  })

  it('UpdateはprojectIdを受け付けない（案件の付け替えを許さない）', () => {
    const updated = UpdateRiskEntrySchema.parse({
      id: VALID.id,
      projectId: '00000000-0000-4000-8000-0000000000ff',
      title: '更新後タイトル',
    })
    expect('projectId' in updated).toBe(false)
    expect(updated.title).toBe('更新後タイトル')
  })
})

describe('DatabaseSchemaへの統合', () => {
  it('riskEntries付きのデータベースをparseできる', () => {
    const parsed = DatabaseSchema.parse({
      version: '1.0.0',
      fiscalYear: 2026,
      projects: [],
      members: [],
      riskEntries: [VALID],
      metadata: {
        lastModified: '2026-08-01T00:00:00.000Z',
        createdBy: 'test',
        version: '1.0.0',
      },
    })
    expect(parsed.riskEntries).toHaveLength(1)
  })

  it('riskEntriesが無い既存データもparseできる（後方互換の反証）', () => {
    const parsed = DatabaseSchema.parse({
      version: '1.0.0',
      fiscalYear: 2026,
      projects: [],
      members: [],
      metadata: {
        lastModified: '2026-08-01T00:00:00.000Z',
        createdBy: 'test',
        version: '1.0.0',
      },
    })
    expect(parsed.riskEntries).toBeUndefined()
  })
})
