import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/stores/app-store'

/**
 * app-storeはテーマ・フォントサイズ・年度など**全画面に効く基盤**でありながら
 * テストが無く、分岐カバレッジが29%だった（の品質改善で計測して発覚）。
 *
 * とくにフォントサイズは「CSS変数へ`setProperty`するだけで、それを`var()`で参照する
 * CSSが無く機能が丸ごと死んでいた」という実バグの前歴がある（development-patterns.md §10）。
 * ここではストアの状態遷移とDOMへの反映を固定する。
 */

const mockChangeFiscalYear = vi.fn()
vi.mock('@/infrastructure/storage', () => ({
  jsonStorage: {
    load: vi.fn(() => ({ fiscalYear: 2031 })),
    changeFiscalYear: (year: number) => mockChangeFiscalYear(year),
  },
}))

const INITIAL = useAppStore.getState()

function fontSizeVar(): string {
  return document.documentElement.style.getPropertyValue('--app-font-size')
}

describe('useAppStore', () => {
  beforeEach(() => {
    useAppStore.setState(INITIAL, true)
    document.documentElement.style.removeProperty('--app-font-size')
    document.documentElement.classList.remove('light', 'dark')
  })

  describe('テーマ', () => {
    it('lightを選ぶとhtmlへlightクラスが付く', () => {
      useAppStore.getState().setTheme('light')
      expect(document.documentElement.classList.contains('light')).toBe(true)
      expect(useAppStore.getState().theme).toBe('light')
    })

    it('darkへ切り替えると前のクラスが残らない', () => {
      useAppStore.getState().setTheme('light')
      useAppStore.getState().setTheme('dark')
      expect(document.documentElement.classList.contains('light')).toBe(false)
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })

    it('反証: systemはクラスを付けない（OS設定に委ねる）', () => {
      useAppStore.getState().setTheme('dark')
      useAppStore.getState().setTheme('system')
      expect(document.documentElement.classList.contains('dark')).toBe(false)
      expect(document.documentElement.classList.contains('light')).toBe(false)
    })
  })

  describe('フォントサイズ', () => {
    it('設定するとCSS変数へ反映される', () => {
      useAppStore.getState().setFontSize('lg')
      expect(fontSizeVar()).toBe('18px')
    })

    it('increase/decreaseで1段ずつ動く', () => {
      useAppStore.getState().setFontSize('base')
      useAppStore.getState().increaseFontSize()
      expect(useAppStore.getState().fontSize).toBe('lg')
      expect(fontSizeVar()).toBe('18px')

      useAppStore.getState().decreaseFontSize()
      expect(useAppStore.getState().fontSize).toBe('base')
      expect(fontSizeVar()).toBe('16px')
    })

    it('反証: 上限（xl）でincreaseしても変わらない', () => {
      useAppStore.getState().setFontSize('xl')
      useAppStore.getState().increaseFontSize()
      expect(useAppStore.getState().fontSize).toBe('xl')
    })

    it('反証: 下限（sm）でdecreaseしても変わらない', () => {
      useAppStore.getState().setFontSize('sm')
      useAppStore.getState().decreaseFontSize()
      expect(useAppStore.getState().fontSize).toBe('sm')
    })
  })

  describe('金額の表示トグル（localモードの利便機能）', () => {
    it('toggleで反転する', () => {
      const before = useAppStore.getState().showFinancials
      useAppStore.getState().toggleShowFinancials()
      expect(useAppStore.getState().showFinancials).toBe(!before)
      useAppStore.getState().toggleShowFinancials()
      expect(useAppStore.getState().showFinancials).toBe(before)
    })
  })

  describe('初期設定ウィザード', () => {
    it('開始ステップを指定して開ける', () => {
      useAppStore.getState().openSetupWizard('basics')
      expect(useAppStore.getState().isSetupWizardOpen).toBe(true)
      expect(useAppStore.getState().setupWizardInitialStep).toBe('basics')
    })

    it('既定はwelcomeから開く', () => {
      useAppStore.getState().openSetupWizard()
      expect(useAppStore.getState().setupWizardInitialStep).toBe('welcome')
    })

    it('閉じても開始ステップは保持される（再開の起点を失わない）', () => {
      useAppStore.getState().openSetupWizard('basics')
      useAppStore.getState().closeSetupWizard()
      expect(useAppStore.getState().isSetupWizardOpen).toBe(false)
      expect(useAppStore.getState().setupWizardInitialStep).toBe('basics')
    })
  })

  describe('initialize', () => {
    it('保存済みDBの年度を取り込み、テーマとフォントサイズをDOMへ適用する', () => {
      useAppStore.setState({ theme: 'dark', fontSize: 'xl', isLoading: true })
      useAppStore.getState().initialize()

      expect(useAppStore.getState().fiscalYear).toBe(2031)
      expect(useAppStore.getState().isLoading).toBe(false)
      expect(document.documentElement.classList.contains('dark')).toBe(true)
      expect(fontSizeVar()).toBe('20px')
    })
  })

  describe('年度・ローディング', () => {
    it('年度の変更は永続化層へも伝える（表示だけ変わって保存が追従しない事故の防止）', () => {
      mockChangeFiscalYear.mockClear()
      useAppStore.getState().setFiscalYear(2030)
      expect(useAppStore.getState().fiscalYear).toBe(2030)
      expect(mockChangeFiscalYear).toHaveBeenCalledWith(2030)
    })

    it('反証: 年度開始月の変更は永続化層を呼ばない（UI設定のみ）', () => {
      mockChangeFiscalYear.mockClear()
      useAppStore.getState().setFiscalYearStartMonth(1)
      expect(useAppStore.getState().fiscalYearStartMonth).toBe(1)
      expect(mockChangeFiscalYear).not.toHaveBeenCalled()
    })

    it('ローディングとエラーを設定できる', () => {
      useAppStore.getState().setLoading(true)
      expect(useAppStore.getState().isLoading).toBe(true)
      useAppStore.getState().setError('失敗しました')
      expect(useAppStore.getState().error).toBe('失敗しました')
      useAppStore.getState().setError(null)
      expect(useAppStore.getState().error).toBeNull()
    })
  })
})
