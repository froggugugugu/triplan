import { describe, expect, it } from 'vitest'
import {
  CreateCsvMappingProfileSchema,
  CsvMappingProfileSchema,
} from '@/shared/types/csv-mapping'
import { DatabaseSchema } from '@/shared/types/database'

const VALID = {
  id: '00000000-0000-4000-8000-000000000001',
  name: '会計ソフト向け仕訳',
  sourceKey: 'billing',
  direction: 'export' as const,
  columns: [
    { field: 'projectCode', header: '伝票番号', enabled: true, order: 0 },
  ],
  includeHeader: true,
  createdAt: '2026-08-18T00:00:00.000Z',
  updatedAt: '2026-08-18T00:00:00.000Z',
}

describe('CsvMappingProfileSchema', () => {
  it('正常なプロファイルを受理する', () => {
    expect(CsvMappingProfileSchema.safeParse(VALID).success).toBe(true)
  })

  it('反証: directionは定義外の値を拒否する', () => {
    expect(
      CsvMappingProfileSchema.safeParse({ ...VALID, direction: 'both' })
        .success,
    ).toBe(false)
  })

  it('反証: 列のheader空文字・order負数は拒否する', () => {
    expect(
      CsvMappingProfileSchema.safeParse({
        ...VALID,
        columns: [{ field: 'a', header: '', enabled: true, order: 0 }],
      }).success,
    ).toBe(false)
    expect(
      CsvMappingProfileSchema.safeParse({
        ...VALID,
        columns: [{ field: 'a', header: 'A', enabled: true, order: -1 }],
      }).success,
    ).toBe(false)
  })

  it('columns空配列は許容する（新規作成直後の編集途中状態）', () => {
    expect(
      CsvMappingProfileSchema.safeParse({ ...VALID, columns: [] }).success,
    ).toBe(true)
  })

  it('CreateスキーマはID・日時を含まない（サーバー側timestamp列の既定値に委譲）', () => {
    const parsed = CreateCsvMappingProfileSchema.safeParse({
      ...VALID,
      extra: 'stripped',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty('id')
      expect(parsed.data).not.toHaveProperty('createdAt')
      expect(parsed.data).not.toHaveProperty('extra')
    }
  })
})

describe('DatabaseSchemaへの統合', () => {
  const minimalDb = {
    version: '1.0.0',
    fiscalYear: 2026,
    projects: [],
    members: [],
    metadata: {
      lastModified: '2026-08-18T00:00:00.000Z',
      createdBy: 'test',
      version: '1.0.0',
    },
  }

  it('反証: csvMappingProfilesが無い既存データもparseに成功する（後方互換）', () => {
    expect(DatabaseSchema.safeParse(minimalDb).success).toBe(true)
  })

  it('csvMappingProfiles配列を受理し、配列内の不正レコードは検出する', () => {
    expect(
      DatabaseSchema.safeParse({
        ...minimalDb,
        csvMappingProfiles: [VALID],
      }).success,
    ).toBe(true)
    expect(
      DatabaseSchema.safeParse({
        ...minimalDb,
        csvMappingProfiles: [{ ...VALID, name: '' }],
      }).success,
    ).toBe(false)
  })
})
