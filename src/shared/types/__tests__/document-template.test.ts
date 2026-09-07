import { describe, expect, it } from 'vitest'
import { DatabaseSchema } from '../database'
import {
  CreateDocumentTemplateSchema,
  DocumentTemplateSchema,
  UpdateDocumentTemplateSchema,
} from '../document-template'

const base = {
  id: crypto.randomUUID(),
  name: '要件定義書（業務要件）',
  phase: '要件定義',
  description: 'IPA共通フレーム準拠の業務要件定義書テンプレート',
  content: '---\ntitle: 業務要件定義書\n---\n\n# 業務要件定義書\n\n## 目的\n',
  sourceRefs: ['IPA 共通フレーム2013'],
  createdAt: '2026-08-16T00:00:00.000Z',
  updatedAt: '2026-08-16T00:00:00.000Z',
}

describe('DocumentTemplateSchema', () => {
  it('正しい形式を受け付ける', () => {
    expect(DocumentTemplateSchema.safeParse(base).success).toBe(true)
  })

  it('phase/descriptionはnullを受け付ける（工程横断の汎用テンプレート）', () => {
    const result = DocumentTemplateSchema.safeParse({
      ...base,
      phase: null,
      description: null,
    })
    expect(result.success).toBe(true)
  })

  it('contentは空文字を受け付ける（新規作成直後）', () => {
    expect(
      DocumentTemplateSchema.safeParse({ ...base, content: '' }).success,
    ).toBe(true)
  })

  it('sourceRefsは省略できる', () => {
    const { sourceRefs: _omit, ...withoutRefs } = base
    expect(DocumentTemplateSchema.safeParse(withoutRefs).success).toBe(true)
  })

  // 反証: 必須フィールドの欠落・不正値は拒否される
  it('反証: nameが空文字の場合はエラーになる', () => {
    expect(
      DocumentTemplateSchema.safeParse({ ...base, name: '' }).success,
    ).toBe(false)
  })

  it('反証: phaseフィールド自体が欠落している場合はエラーになる（nullableだがoptionalではない）', () => {
    const { phase: _omit, ...withoutPhase } = base
    expect(DocumentTemplateSchema.safeParse(withoutPhase).success).toBe(false)
  })

  it('反証: contentが100000文字を超える場合はエラーになる', () => {
    const result = DocumentTemplateSchema.safeParse({
      ...base,
      content: 'a'.repeat(100001),
    })
    expect(result.success).toBe(false)
  })

  it('反証: idがUUID形式でない場合はエラーになる', () => {
    expect(
      DocumentTemplateSchema.safeParse({ ...base, id: 'doc-1' }).success,
    ).toBe(false)
  })
})

describe('CreateDocumentTemplateSchema / UpdateDocumentTemplateSchema', () => {
  it('CreateはID・日時を含まない', () => {
    const result = CreateDocumentTemplateSchema.safeParse({
      name: '新規ドキュメントテンプレート',
      phase: null,
      description: null,
      content: '',
    })
    expect(result.success).toBe(true)
  })

  it('Updateはidのみ必須で他は任意', () => {
    expect(
      UpdateDocumentTemplateSchema.safeParse({ id: crypto.randomUUID() })
        .success,
    ).toBe(true)
  })

  // 反証: Updateでもidが無ければエラーになる
  it('反証: Updateでidが無い場合はエラーになる', () => {
    expect(
      UpdateDocumentTemplateSchema.safeParse({ name: '更新' }).success,
    ).toBe(false)
  })
})

describe('DatabaseSchemaへの統合（後方互換）', () => {
  const minimalDb = {
    version: '1.0.0',
    fiscalYear: 2026,
    projects: [],
    members: [],
    metadata: {
      lastModified: '2026-08-16T00:00:00.000Z',
      createdBy: 'test',
      version: '1.0.0',
    },
  }

  it('documentTemplatesフィールドなしの既存データもparseできる（後方互換）', () => {
    expect(DatabaseSchema.safeParse(minimalDb).success).toBe(true)
  })

  it('documentTemplatesを含むデータをparseできる', () => {
    const result = DatabaseSchema.safeParse({
      ...minimalDb,
      documentTemplates: [base],
    })
    expect(result.success).toBe(true)
  })

  // 反証: 配列内の不正レコードは検出される
  it('反証: documentTemplates内の不正レコードはエラーになる', () => {
    const result = DatabaseSchema.safeParse({
      ...minimalDb,
      documentTemplates: [{ ...base, name: '' }],
    })
    expect(result.success).toBe(false)
  })
})
