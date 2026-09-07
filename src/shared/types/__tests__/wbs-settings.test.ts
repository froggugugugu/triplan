import { describe, expect, it } from 'vitest'
import {
  createDefaultWbsSettings,
  DEFAULT_EFFORT_COLUMN_COLORS,
} from '../wbs-settings'

describe('createDefaultWbsSettings', () => {
  it('10列の工数列を生成する', () => {
    const settings = createDefaultWbsSettings()
    expect(settings.effortColumns).toHaveLength(10)
  })

  it('最初の3列が有効になっている', () => {
    const settings = createDefaultWbsSettings()
    const enabledColumns = settings.effortColumns.filter((col) => col.enabled)
    expect(enabledColumns).toHaveLength(3)
    expect(settings.effortColumns[0]?.enabled).toBe(true)
    expect(settings.effortColumns[1]?.enabled).toBe(true)
    expect(settings.effortColumns[2]?.enabled).toBe(true)
    expect(settings.effortColumns[3]?.enabled).toBe(false)
  })

  it('列IDが effort-1 から effort-10 まで連番になっている', () => {
    const settings = createDefaultWbsSettings()
    settings.effortColumns.forEach((col, index) => {
      expect(col.id).toBe(`effort-${index + 1}`)
    })
  })

  it('列のorderが0から9まで連番になっている', () => {
    const settings = createDefaultWbsSettings()
    settings.effortColumns.forEach((col, index) => {
      expect(col.order).toBe(index)
    })
  })

  it('デフォルト表示名が「区分」になっている', () => {
    const settings = createDefaultWbsSettings()
    settings.effortColumns.forEach((col) => {
      expect(col.displayName).toBe('区分')
    })
  })

  it('レベル別背景色のデフォルト値が設定されている', () => {
    const settings = createDefaultWbsSettings()
    expect(settings.levelColors).toBeDefined()
    const level0 = settings.levelColors?.['0']
    expect(level0).toBeDefined()
    expect(level0).toEqual({ light: '#e8f1fe', dark: '#000060' })
  })

  it('工数列にデフォルト背景色が設定されている', () => {
    const settings = createDefaultWbsSettings()
    settings.effortColumns.forEach((col, index) => {
      expect(col.backgroundColor).toEqual(DEFAULT_EFFORT_COLUMN_COLORS[index])
    })
  })

  it('lastModifiedが設定されている', () => {
    const settings = createDefaultWbsSettings()
    expect(settings.lastModified).toBeDefined()
    // ISO 8601形式の日時文字列であることを確認
    expect(() => new Date(settings.lastModified)).not.toThrow()
  })
})
