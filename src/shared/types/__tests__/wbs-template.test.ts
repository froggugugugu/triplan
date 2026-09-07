import { describe, expect, it } from 'vitest'
import {
  CreateWbsTemplateSchema,
  UpdateWbsTemplateSchema,
  WbsTemplateNodeSchema,
  WbsTemplateSchema,
} from '../wbs-template'

describe('WbsTemplateNodeSchema', () => {
  it('name単体（子・完了条件なし）を受け付ける', () => {
    const result = WbsTemplateNodeSchema.safeParse({ name: '要求整理' })
    expect(result.success).toBe(true)
  })

  it('completionCriteria・childrenを含む形を受け付ける', () => {
    const result = WbsTemplateNodeSchema.safeParse({
      name: 'ITa',
      children: [
        { name: 'ITa方針', completionCriteria: '承認済み' },
        { name: 'ITa報告', completionCriteria: '提出済み' },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('孫階層（再帰）を受け付ける', () => {
    const result = WbsTemplateNodeSchema.safeParse({
      name: 'ルート',
      children: [
        {
          name: '中間',
          children: [{ name: '孫', completionCriteria: '完了' }],
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  // 反証: nameが空文字の場合は拒否される
  it('反証: nameが空文字の場合はバリデーションエラーになる', () => {
    const result = WbsTemplateNodeSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })

  // 反証: 孫階層のnameが不正でも再帰的に検出される
  it('反証: 孫階層のnameが空文字の場合も再帰的に検出される', () => {
    const result = WbsTemplateNodeSchema.safeParse({
      name: 'ルート',
      children: [{ name: '' }],
    })
    expect(result.success).toBe(false)
  })

  it('documentTemplateIds（ドキュメントテンプレート紐づけ）を受け付ける', () => {
    const result = WbsTemplateNodeSchema.safeParse({
      name: '要件定義',
      documentTemplateIds: [crypto.randomUUID(), crypto.randomUUID()],
      children: [
        { name: '業務要件定義書', documentTemplateIds: [crypto.randomUUID()] },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('documentTemplateIds未指定（既存データ）も引き続き受け付ける（後方互換）', () => {
    const result = WbsTemplateNodeSchema.safeParse({ name: '要件定義' })
    expect(result.success).toBe(true)
  })

  // 反証: UUID形式でないidは拒否される（E2Eシードの静かな失敗と同種の事故防止）
  it('反証: documentTemplateIdsにUUID形式でない値が含まれる場合はエラーになる', () => {
    const result = WbsTemplateNodeSchema.safeParse({
      name: '要件定義',
      documentTemplateIds: ['doc-1'],
    })
    expect(result.success).toBe(false)
  })

  // 反証: 孫階層のdocumentTemplateIdsも再帰的に検証される
  it('反証: 孫階層の不正なdocumentTemplateIdsも再帰的に検出される', () => {
    const result = WbsTemplateNodeSchema.safeParse({
      name: 'ルート',
      children: [{ name: '子', documentTemplateIds: ['not-a-uuid'] }],
    })
    expect(result.success).toBe(false)
  })
})

describe('WbsTemplateSchema', () => {
  const base = {
    id: crypto.randomUUID(),
    name: '標準テンプレート',
    nodes: [{ name: '要求整理', completionCriteria: '合意済み' }],
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
  }

  it('正しい形式を受け付ける', () => {
    expect(WbsTemplateSchema.safeParse(base).success).toBe(true)
  })

  it('nodesが空配列でも受け付ける（新規作成直後の空テンプレート）', () => {
    expect(WbsTemplateSchema.safeParse({ ...base, nodes: [] }).success).toBe(
      true,
    )
  })

  // 反証: nameが空文字の場合は拒否される
  it('反証: テンプレート名が空文字の場合はエラーになる', () => {
    expect(WbsTemplateSchema.safeParse({ ...base, name: '' }).success).toBe(
      false,
    )
  })
})

describe('CreateWbsTemplateSchema / UpdateWbsTemplateSchema', () => {
  it('CreateはID・日時を含まない', () => {
    const result = CreateWbsTemplateSchema.safeParse({
      name: '新規テンプレート',
      nodes: [],
    })
    expect(result.success).toBe(true)
  })

  it('Updateはidのみ必須で他は任意', () => {
    const result = UpdateWbsTemplateSchema.safeParse({
      id: crypto.randomUUID(),
    })
    expect(result.success).toBe(true)
  })

  // 反証: Updateでもidが無ければエラーになる
  it('反証: Updateでidが無い場合はエラーになる', () => {
    const result = UpdateWbsTemplateSchema.safeParse({ name: '更新' })
    expect(result.success).toBe(false)
  })
})
