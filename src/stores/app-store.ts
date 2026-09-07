import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { jsonStorage } from '@/infrastructure/storage'

export type Theme = 'light' | 'dark' | 'system'
export type FontSize = 'sm' | 'base' | 'lg' | 'xl'

const FONT_SIZE_VALUES: Record<FontSize, string> = {
  sm: '14px',
  base: '16px',
  lg: '18px',
  xl: '20px',
}

function applyFontSize(fontSize: FontSize) {
  document.documentElement.style.setProperty(
    '--app-font-size',
    FONT_SIZE_VALUES[fontSize],
  )
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  if (theme !== 'system') {
    root.classList.add(theme)
  }
}

interface AppState {
  fiscalYear: number
  fiscalYearStartMonth: number
  isLoading: boolean
  error: string | null
  theme: Theme
  isFullscreen: boolean
  fontSize: FontSize
  isSidebarCollapsed: boolean
  /**
   * localモードの金額表示トグル。falseで金額情報（予算・単価・受注額等）を
   * 画面から隠す。認証が存在しないlocalモードで、画面共有・協力会社同席レビュー等の場面を
   * 想定した利便機能【仮定】。postgresモードでは権限（financials:read）が優先され、
   * この値は使われない（shared/hooks/use-financial-visibility.ts参照）
   */
  showFinancials: boolean
  /**
   * 初期設定ウィザード。
   * - `setupCardDismissed`: ダッシュボードの「はじめに」カードを閉じたか（永続化）
   * - `demoDataActive`: デモデータで試用中か（永続化。投入時にtrue・一括クリアでfalse）
   * - `isSetupWizardOpen`/`setupWizardInitialStep`: ウィザードの開閉と開始ステップ
   *   （UI状態のため永続化しない）
   */
  setupCardDismissed: boolean
  demoDataActive: boolean
  isSetupWizardOpen: boolean
  setupWizardInitialStep: 'welcome' | 'basics'
  // Actions
  setFiscalYear: (year: number) => void
  setFiscalYearStartMonth: (month: number) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setTheme: (theme: Theme) => void
  toggleFullscreen: () => void
  toggleSidebar: () => void
  setFontSize: (size: FontSize) => void
  increaseFontSize: () => void
  decreaseFontSize: () => void
  toggleShowFinancials: () => void
  dismissSetupCard: () => void
  setDemoDataActive: (active: boolean) => void
  openSetupWizard: (initialStep?: 'welcome' | 'basics') => void
  closeSetupWizard: () => void
  initialize: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      fiscalYear:
        new Date().getMonth() >= 3
          ? new Date().getFullYear()
          : new Date().getFullYear() - 1,
      fiscalYearStartMonth: 4,
      isLoading: false,
      error: null,
      theme: 'system' as Theme,
      isFullscreen: false,
      fontSize: 'sm' as FontSize,
      isSidebarCollapsed: false,
      showFinancials: true,
      setupCardDismissed: false,
      demoDataActive: false,
      isSetupWizardOpen: false,
      setupWizardInitialStep: 'welcome' as const,

      setFiscalYear: (year) => {
        set({ fiscalYear: year })
        jsonStorage.changeFiscalYear(year)
      },

      setFiscalYearStartMonth: (month) => {
        set({ fiscalYearStartMonth: month })
      },

      setLoading: (loading) => set({ isLoading: loading }),

      setError: (error) => set({ error }),

      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },

      toggleFullscreen: () => {
        set((state) => ({ isFullscreen: !state.isFullscreen }))
      },

      toggleSidebar: () => {
        set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed }))
      },

      setFontSize: (fontSize) => {
        applyFontSize(fontSize)
        set({ fontSize })
      },

      increaseFontSize: () => {
        const sizes: FontSize[] = ['sm', 'base', 'lg', 'xl']
        const { fontSize } = get()
        const idx = sizes.indexOf(fontSize)
        if (idx >= 0 && idx < sizes.length - 1) {
          const newSize = sizes[idx + 1] as FontSize
          applyFontSize(newSize)
          set({ fontSize: newSize })
        }
      },

      decreaseFontSize: () => {
        const sizes: FontSize[] = ['sm', 'base', 'lg', 'xl']
        const { fontSize } = get()
        const idx = sizes.indexOf(fontSize)
        if (idx > 0) {
          const newSize = sizes[idx - 1] as FontSize
          applyFontSize(newSize)
          set({ fontSize: newSize })
        }
      },

      toggleShowFinancials: () => {
        set((state) => ({ showFinancials: !state.showFinancials }))
      },

      dismissSetupCard: () => {
        set({ setupCardDismissed: true })
      },

      setDemoDataActive: (active) => {
        set({ demoDataActive: active })
      },

      openSetupWizard: (initialStep = 'welcome') => {
        set({ isSetupWizardOpen: true, setupWizardInitialStep: initialStep })
      },

      closeSetupWizard: () => {
        set({ isSetupWizardOpen: false })
      },

      initialize: () => {
        const db = jsonStorage.load()
        const { theme, fontSize } = get()
        applyTheme(theme)
        applyFontSize(fontSize)
        set({ fiscalYear: db.fiscalYear, isLoading: false })
      },
    }),
    {
      name: 'resource-manager-app',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted, version) => {
        const state = persisted as Record<string, unknown>
        if (version === 0) {
          // fontSizeはこれまでUIから変更する手段が一切なく（setFontSize等の呼び出し元がどこにも
          // 存在しなかった）、旧既定値'base'が意図せず永続化されていた。ユーザーが実際に選んだ値では
          // ないため、新しい既定値'sm'へ強制的にリセットする
          state.fontSize = 'sm'
        }
        return state
      },
      partialize: (state) => ({
        fiscalYear: state.fiscalYear,
        fiscalYearStartMonth: state.fiscalYearStartMonth,
        theme: state.theme,
        fontSize: state.fontSize,
        isSidebarCollapsed: state.isSidebarCollapsed,
        showFinancials: state.showFinancials,
        setupCardDismissed: state.setupCardDismissed,
        demoDataActive: state.demoDataActive,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.theme) {
          applyTheme(state.theme)
        }
        if (state?.fontSize) {
          applyFontSize(state.fontSize)
        }
      },
    },
  ),
)
