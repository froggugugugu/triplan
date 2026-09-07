import {
  Banknote,
  BarChart3,
  Calculator,
  Calendar,
  CalendarCheck,
  ClipboardList,
  FileSpreadsheet,
  FolderKanban,
  Gauge,
  LayoutGrid,
  LogOut,
  Moon,
  Network,
  PanelLeftClose,
  Settings,
  Sun,
  UserCheck,
  UserCircle,
  Users,
  Wallet,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  GlobalSearchDialog,
  GlobalSearchTrigger,
} from '@/shared/components/GlobalSearchDialog'
import { Button } from '@/shared/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/components/ui/popover'
import { useCanViewFinancials } from '@/shared/hooks/use-financial-visibility'
import {
  useAppStore,
  useAuthStore,
  useBudgetStore,
  useScheduleSettingsStore,
  useWbsSettingsStore,
} from '@/stores'
import type { Theme } from '@/stores/app-store'

interface LayoutProps {
  children: ReactNode
  sidebarExtra?: ReactNode
}

interface NavItem {
  to: string
  label: string
  icon: typeof BarChart3
  tourId: string
  /** 金額系メニュー（financials:read相当の可視性がない場合に非表示） */
  financial?: boolean
  /** 認証がある場合のみ表示するメニュー（localモードでは「自分」が存在しない） */
  authenticatedOnly?: boolean
}

/**
 * サイドバーのナビゲーション。業務の時系列に沿ってグループ化する:
 * - 先頭（見出しなし）: ダッシュボード＝毎日の入口（アラートセンター・EVM）
 * - 計画: 年度・案件開始時に上から順に整える流れ
 *   （体制 → プロジェクト → WBS → スケジュール → アサイン → 予算）
 * - 月次: 毎月の締め業務を上から順に流す（実績入力 → 明細確認 → 帳票出力）
 */
const navSections: { heading: string | null; items: NavItem[] }[] = [
  {
    heading: null,
    items: [
      {
        to: '/dashboard',
        label: 'ダッシュボード',
        icon: BarChart3,
        tourId: 'nav-dashboard',
      },
      {
        // 週次の入口: 全プロジェクト×健全性判定の一覧
        to: '/portfolio',
        label: 'ポートフォリオ',
        icon: LayoutGrid,
        tourId: 'nav-portfolio',
      },
      {
        to: '/my-tasks',
        label: '自分の担当',
        icon: UserCheck,
        tourId: 'nav-my-tasks',
        // ログインユーザーと担当者の紐づけが前提のためpostgresモード専用
        authenticatedOnly: true,
      },
    ],
  },
  {
    heading: '計画',
    items: [
      { to: '/team', label: 'チーム', icon: Users, tourId: 'nav-team' },
      {
        to: '/projects',
        label: 'プロジェクト',
        icon: FolderKanban,
        tourId: 'nav-projects',
      },
      {
        to: '/project-summary',
        label: 'プロジェクトサマリー',
        icon: Gauge,
        tourId: 'nav-project-summary',
      },
      {
        // 見積はWBSより前の作業（引合・提案）のためWBSの手前に置く
        to: '/estimates',
        label: '見積',
        icon: Calculator,
        tourId: 'nav-estimates',
        financial: true,
      },
      { to: '/wbs', label: 'WBS', icon: Network, tourId: 'nav-wbs' },
      {
        to: '/schedule',
        label: 'スケジュール',
        icon: Calendar,
        tourId: 'nav-schedule',
      },
      {
        to: '/assignment',
        label: 'アサイン',
        icon: ClipboardList,
        tourId: 'nav-assignment',
      },
      {
        to: '/budget',
        label: '予算管理',
        icon: Wallet,
        tourId: 'nav-budget',
        financial: true,
      },
    ],
  },
  {
    heading: '月次',
    items: [
      {
        to: '/monthly-actuals',
        label: '月次実績',
        icon: CalendarCheck,
        tourId: 'nav-monthly-actuals',
      },
      {
        to: '/statements',
        label: '月次明細',
        icon: Banknote,
        tourId: 'nav-statements',
        financial: true,
      },
      {
        to: '/reports',
        label: 'レポート',
        icon: FileSpreadsheet,
        tourId: 'nav-reports',
      },
    ],
  },
]

const themeOptions: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: 'light', icon: Sun, label: 'ライト' },
  { value: 'dark', icon: Moon, label: 'ダーク' },
]

export function Layout({ children, sidebarExtra }: LayoutProps) {
  const navigate = useNavigate()
  const theme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)
  const isSidebarCollapsed = useAppStore((state) => state.isSidebarCollapsed)
  const toggleSidebar = useAppStore((state) => state.toggleSidebar)
  const canViewFinancials = useCanViewFinancials()
  const isLocalMode =
    (import.meta.env.VITE_STORAGE_MODE ?? 'local') !== 'postgres'

  // 横断検索パレット。Cmd+K（Ctrl+K）で開閉する
  const [searchOpen, setSearchOpen] = useState(false)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        // ブラウザ既定（Firefoxの検索バー等）を止めてパレットを開く
        event.preventDefault()
        setSearchOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])
  const currentUser = useAuthStore((s) => s.currentUser)
  const logout = useAuthStore((s) => s.logout)
  // postgresモードのみ。localモードは認証が無いためログアウトの概念自体が無い
  const isPostgresMode =
    (import.meta.env.VITE_STORAGE_MODE ?? 'local') === 'postgres'
  const handleLogout = useCallback(async () => {
    await logout()
    // ルートガード（RequireAuth）が未認証を検知して/loginへ送るが、
    // 現在地によっては再描画が走らないため明示的に遷移する
    navigate('/login', { replace: true })
  }, [logout, navigate])
  // 為替レート履歴の変更を検知して再レンダーされるよう購読する
  useBudgetStore((s) => s.exchangeRateHistory)
  const loadBudgetData = useBudgetStore((s) => s.loadBudgetData)
  const loadScheduleSettings = useScheduleSettingsStore(
    (s) => s.loadScheduleSettings,
  )
  const loadWbsSettings = useWbsSettingsStore((s) => s.loadWbsSettings)

  // 概算単価・係数の変更をこの画面から直接保存できるようにするため、
  // budget-store（jsonStorage方式）を事前にハイドレートしておく。
  // 未ロードのまま setEstimatedUnitPrice 等を呼ぶと、他フィールド（空配列）が
  // 上書き保存され既存の予算データが消えてしまうため必須
  useEffect(() => {
    loadBudgetData()
  }, [loadBudgetData])

  // schedule-settings-store/wbs-settings-storeは案件別工程設定・WBS列設定を
  // スケジュール・WBS・案件・アサイン・予算・EVMの各画面から横断参照するため、
  // Layout（アプリ全体で1回だけマウントされる外殻）でロードする
  // （budget-storeのloadBudgetDataと同じ「共有レイヤーは画面横断で一度だけロード」方針）
  useEffect(() => {
    loadScheduleSettings()
    loadWbsSettings()
  }, [loadScheduleSettings, loadWbsSettings])

  return (
    <div className="flex h-screen bg-background text-foreground">
      <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      {/* Sidebar */}
      <aside
        data-tour="sidebar"
        className={cn(
          'flex h-full flex-col border-r border-border bg-card transition-[width] duration-200',
          isSidebarCollapsed ? 'w-[60px]' : 'w-[180px]',
        )}
      >
        {/* Logo / Title + Collapse toggle */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-2">
          {isSidebarCollapsed ? (
            <button
              type="button"
              className="mx-auto text-base font-bold hover:text-accent-foreground transition-colors"
              onClick={toggleSidebar}
              title="サイドバーを開く"
            >
              RF
            </button>
          ) : (
            <span className="truncate text-sm font-bold pl-1">triplan</span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-7 w-7 shrink-0', isSidebarCollapsed && 'hidden')}
            onClick={toggleSidebar}
            title="サイドバーを閉じる"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Nav Items（金額系メニューはfinancials:read相当の可視性がない場合に非表示） */}
        <nav className="flex-1 overflow-y-auto px-2 py-2">
          <div className="flex flex-col gap-1">
            {/* 横断検索。Cmd+Kを知らなくても辿り着けるよう導線を置く */}
            <GlobalSearchTrigger
              collapsed={isSidebarCollapsed}
              onClick={() => setSearchOpen(true)}
            />
            {navSections.map((section) => {
              const items = section.items.filter(
                ({ financial, authenticatedOnly }) =>
                  (!financial || canViewFinancials) &&
                  (!authenticatedOnly || !isLocalMode),
              )
              if (items.length === 0) return null
              return (
                <div
                  key={section.heading ?? 'top'}
                  className="flex flex-col gap-1"
                >
                  {section.heading &&
                    (isSidebarCollapsed ? (
                      // 折りたたみ時は見出しの代わりに区切り線でグループを示す
                      <div className="mx-2 my-1 h-px bg-border" />
                    ) : (
                      <p className="px-3 pt-3 pb-0.5 text-xs font-medium text-muted-foreground">
                        {section.heading}
                      </p>
                    ))}
                  {items.map(({ to, label, icon: Icon, tourId }) => (
                    <NavLink
                      key={to}
                      to={to}
                      data-tour={tourId}
                      title={isSidebarCollapsed ? label : undefined}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center rounded-md transition-colors',
                          // 現在地はホバー（accent）と区別できるprimary系で示す
                          isActive
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                          isSidebarCollapsed
                            ? 'justify-center px-2 py-2'
                            : 'gap-3 px-3 py-2',
                        )
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!isSidebarCollapsed && (
                        <span className="truncate text-sm font-medium">
                          {label}
                        </span>
                      )}
                    </NavLink>
                  ))}
                </div>
              )
            })}
          </div>
        </nav>

        {/* Bottom actions */}
        <div className="shrink-0 border-t border-border px-2 py-2">
          <div
            className={cn(
              'flex',
              isSidebarCollapsed
                ? 'flex-col items-center gap-1'
                : 'items-center gap-1',
            )}
          >
            {/* Theme toggle */}
            <div data-tour="theme-toggle" className="contents">
              {themeOptions.map(({ value, icon: Icon, label: themeLabel }) => (
                <Button
                  key={value}
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'h-7 w-7',
                    theme === value && 'bg-accent text-accent-foreground',
                  )}
                  onClick={() => setTheme(value)}
                  aria-label={themeLabel}
                  title={themeLabel}
                >
                  <Icon className="h-3.5 w-3.5" />
                </Button>
              ))}
            </div>

            {/* Settings popover */}
            {!isSidebarCollapsed && <div className="flex-1" />}
            {sidebarExtra}
            {/* ログアウト。auth-storeのlogoutは以前から実装されていたが
                UIから呼ぶ導線が無く、ログイン後に抜ける手段が無かった */}
            {isPostgresMode && currentUser && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={`${currentUser.name}（${currentUser.email}）`}
                    aria-label="アカウント"
                  >
                    <UserCircle className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="right" align="end" className="w-60 p-1">
                  <div className="px-2 py-1.5">
                    <p className="truncate font-medium text-sm">
                      {currentUser.name}
                    </p>
                    <p className="truncate text-muted-foreground text-xs">
                      {currentUser.email}
                    </p>
                    <p className="mt-1 text-muted-foreground text-xs">
                      ロール: {currentUser.role}
                    </p>
                  </div>
                  <div className="my-1 border-border border-t" />
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                    onClick={() => void handleLogout()}
                  >
                    <LogOut className="h-4 w-4 shrink-0" />
                    ログアウト
                  </button>
                </PopoverContent>
              </Popover>
            )}
            {/* 管理画面への入口。
                従来はここに設定11項目の直接編集と10画面への遷移が同居しており、
                縦長のポップオーバーをスクロールしながら小さな入力欄を触る形だった。
                専用画面（/admin）へ集約し、ここは入口だけにする */}
            <Button
              data-tour="settings-button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="管理画面（全社設定・マスタ）"
              aria-label="管理画面を開く"
              onClick={() => navigate('/admin/settings')}
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[1800px] px-4 py-4">{children}</div>
      </main>
    </div>
  )
}
