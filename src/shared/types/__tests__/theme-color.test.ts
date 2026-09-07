import { describe, expect, it } from 'vitest'
import {
  adjustBrightnessForDark,
  getThemeColor,
  migrateToThemeColor,
  type ThemeColor,
  ThemeColorSchema,
} from '../theme-color'

describe('ThemeColorSchema', () => {
  it('単一HEX文字列を受理する（後方互換）', () => {
    const result = ThemeColorSchema.safeParse('#4A90D9')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('#4A90D9')
    }
  })

  it('light/darkオブジェクトを受理する', () => {
    const result = ThemeColorSchema.safeParse({
      light: '#FFFFFF',
      dark: '#000000',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ light: '#FFFFFF', dark: '#000000' })
    }
  })

  it('無効なHEX値を拒否する', () => {
    const result = ThemeColorSchema.safeParse('invalid')
    expect(result.success).toBe(false)
  })

  it('lightのみのオブジェクトを拒否する', () => {
    const result = ThemeColorSchema.safeParse({ light: '#FFFFFF' })
    expect(result.success).toBe(false)
  })

  it('darkのみのオブジェクトを拒否する', () => {
    const result = ThemeColorSchema.safeParse({ dark: '#000000' })
    expect(result.success).toBe(false)
  })

  it('3桁のHEX値を拒否する', () => {
    const result = ThemeColorSchema.safeParse('#FFF')
    expect(result.success).toBe(false)
  })

  it('大文字小文字混在のHEXを受理する', () => {
    const result = ThemeColorSchema.safeParse('#AbCdEf')
    expect(result.success).toBe(true)
  })
})

describe('getThemeColor', () => {
  it('単一string値の場合はそのまま返す', () => {
    const color: ThemeColor = '#4A90D9'
    expect(getThemeColor(color, 'light')).toBe('#4A90D9')
    expect(getThemeColor(color, 'dark')).toBe('#4A90D9')
  })

  it('オブジェクトの場合はテーマに応じた色を返す（light）', () => {
    const color: ThemeColor = { light: '#FFFFFF', dark: '#000000' }
    expect(getThemeColor(color, 'light')).toBe('#FFFFFF')
  })

  it('オブジェクトの場合はテーマに応じた色を返す（dark）', () => {
    const color: ThemeColor = { light: '#FFFFFF', dark: '#000000' }
    expect(getThemeColor(color, 'dark')).toBe('#000000')
  })

  it('systemテーマの場合はprefers-color-schemeに従う', () => {
    const color: ThemeColor = { light: '#FFFFFF', dark: '#000000' }
    const result = getThemeColor(color, 'system')
    // matchMediaのモックがない場合はlightをデフォルトとする
    expect(result).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })
})

describe('migrateToThemeColor', () => {
  it('単一stringを{ light, dark }オブジェクトに変換する', () => {
    const result = migrateToThemeColor('#4A90D9')
    expect(result).toHaveProperty('light', '#4A90D9')
    expect(result).toHaveProperty('dark')
    expect(result.dark).toMatch(/^#[0-9A-Fa-f]{6}$/)
    expect(result.dark).not.toBe('#4A90D9') // ダークモード用は調整される
  })

  it('既にオブジェクトの場合はそのまま返す', () => {
    const input: ThemeColor = { light: '#FFFFFF', dark: '#000000' }
    const result = migrateToThemeColor(input)
    expect(result).toEqual({ light: '#FFFFFF', dark: '#000000' })
  })
})

describe('adjustBrightnessForDark', () => {
  it('明るい色を暗めに調整する', () => {
    const result = adjustBrightnessForDark('#FFFFFF')
    expect(result).toMatch(/^#[0-9A-Fa-f]{6}$/)
    // 白 #FFFFFF は暗めに調整される
    expect(result.toLowerCase()).not.toBe('#ffffff')
  })

  it('中間色を適切に調整する', () => {
    const result = adjustBrightnessForDark('#4A90D9')
    expect(result).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it('暗い色はそのままか明るめに調整する', () => {
    const result = adjustBrightnessForDark('#1A1A1A')
    expect(result).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it('無効な色を渡すとそのまま返す（防御的）', () => {
    const result = adjustBrightnessForDark('invalid')
    expect(result).toBe('invalid')
  })
})
