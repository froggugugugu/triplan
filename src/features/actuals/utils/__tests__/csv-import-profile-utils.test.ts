import { describe, expect, it } from 'vitest'
import {
  mappingToProfileColumns,
  profileToMapping,
  unitFromProfile,
} from '../csv-import-profile-utils'

const HEADERS = ['氏名', 'PJコード', '年月', '工数', 'タスク名']

describe('mappingToProfileColumns / profileToMapping', () => {
  it('マッピング→プロファイル→マッピングの往復で同じ列割当に戻る', () => {
    const mapping = { member: 0, project: 1, period: 2, value: 3, task: 4 }
    const columns = mappingToProfileColumns(mapping, HEADERS)
    const applied = profileToMapping({ columns }, HEADERS)
    expect(applied.mapping).toEqual(mapping)
    expect(applied.missing).toEqual([])
  })

  it('反証: 列名で突合するため、列の並びが変わったファイルにも正しく適用できる', () => {
    const columns = mappingToProfileColumns(
      { member: 0, project: 1, period: 2, value: 3 },
      HEADERS,
    )
    // 列順を入れ替えた別ファイル
    const reordered = ['工数', '年月', '氏名', 'PJコード']
    const applied = profileToMapping({ columns }, reordered)
    expect(applied.mapping).toEqual({
      member: 2,
      project: 3,
      period: 1,
      value: 0,
    })
  })

  it('反証: プロファイルの列名が今回のファイルに無い役割はマッピングへ含めずmissingへ報告する', () => {
    const columns = mappingToProfileColumns(
      { member: 0, project: 1, period: 2, value: 3 },
      HEADERS,
    )
    const applied = profileToMapping({ columns }, ['氏名', '年月', '工数'])
    expect(applied.mapping).toEqual({ member: 0, period: 1, value: 2 })
    expect(applied.missing).toHaveLength(1)
    expect(applied.missing[0]).toContain('PJコード')
  })

  it('反証: 未割当の任意役割（task）はenabled:falseで保存され、適用時もマッピングへ含めない', () => {
    const columns = mappingToProfileColumns(
      { member: 0, project: 1, period: 2, value: 3 },
      HEADERS,
    )
    const taskColumn = columns.find((c) => c.field === 'task')
    expect(taskColumn?.enabled).toBe(false)
    const applied = profileToMapping({ columns }, HEADERS)
    expect(applied.mapping.task).toBeUndefined()
  })

  it('反証: 定義外の役割キーを持つ列は無視する（プロファイルの将来拡張・手書きデータへの耐性）', () => {
    const applied = profileToMapping(
      {
        columns: [
          { field: 'unknownRole', header: '氏名', enabled: true, order: 0 },
          { field: 'member', header: '氏名', enabled: true, order: 1 },
        ],
      },
      HEADERS,
    )
    expect(applied.mapping).toEqual({ member: 0 })
  })
})

describe('unitFromProfile', () => {
  it('optionsのunitを復元し、不正値・未設定は人月へフォールバックする', () => {
    expect(unitFromProfile({ options: { unit: 'hour' } })).toBe('hour')
    expect(unitFromProfile({ options: { unit: 'manDay' } })).toBe('manDay')
    expect(unitFromProfile({ options: { unit: 'invalid' } })).toBe('manMonth')
    expect(unitFromProfile({ options: undefined })).toBe('manMonth')
    expect(unitFromProfile({ options: { unit: 123 } })).toBe('manMonth')
  })
})
