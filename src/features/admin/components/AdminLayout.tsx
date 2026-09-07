import {
  ArrowLeft,
  Building2,
  Database,
  FileText,
  KeyRound,
  Link2,
  ListTree,
  ScrollText,
  Settings2,
  ShieldCheck,
  Tags,
  Users,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Button } from '@/shared/components/ui/button'
import { hasPermission, type Permission } from '@/shared/types/auth'
import { useAuthStore } from '@/stores'

/**
 * 管理画面のレイアウト。
 *
 * 従来はシステム設定が**サイドバーのポップオーバー内で直接編集**（11項目）と
 * **別画面への遷移**（10画面）に分かれて同居しており、操作の種類が混在していた。
 * 管理系を本体から切り離した専用画面に集約し、左ペイン＝メニュー／
 * 右ペイン＝内容という一般的な構成にする。
 *
 * 本体（`Layout`）とは別のレイアウトなので、`/admin/*`はLayoutの**外側**に
 * ルートを置く（App.tsx参照）。行き来は左ペイン上部の「システムに戻る」で行う。
 */

interface AdminNavItem {
  to: string
  label: string
  icon: typeof Settings2
  /** postgresモードでのみ意味を持つ項目（localモードでは非表示） */
  postgresOnly?: boolean
  /**
   * この項目を開くのに要る権限。指定するとメニューから隠れる。
   * ページ側の`AdminAccessGuard`と同じ権限を指定すること
   * （メニューを隠すだけではURL直打ちで開けてしまうため、判定は二重に置く）
   */
  permission?: Permission
}

interface AdminNavGroup {
  label: string
  items: AdminNavItem[]
  /** このグループを表示してよいか（権限判定） */
  visible: (ctx: { isPostgres: boolean; canManageUsers: boolean }) => boolean
}

const NAV_GROUPS: AdminNavGroup[] = [
  {
    label: '設定',
    visible: () => true,
    items: [
      {
        to: '/admin/settings',
        label: '全社設定',
        icon: Settings2,
        permission: 'settings:manage',
      },
      {
        // 全社のデータを丸ごと入れ替える操作のため、サーバー側も
        // export/importはadmin限定（users:manage）
        to: '/admin/data',
        label: 'データ管理',
        icon: Database,
        permission: 'users:manage',
      },
    ],
  },
  {
    label: 'マスタ',
    visible: () => true,
    items: [
      { to: '/admin/companies', label: '所属会社', icon: Building2 },
      { to: '/admin/tech-tags', label: '技術タグ', icon: Tags },
      { to: '/admin/wbs-templates', label: 'WBSテンプレート', icon: ListTree },
      {
        to: '/admin/document-templates',
        label: 'ドキュメントテンプレート',
        icon: FileText,
      },
    ],
  },
  {
    label: '管理者',
    // ユーザー管理権限（admin）を持つ場合のみ。localモードには存在しない機能群
    visible: ({ isPostgres, canManageUsers }) => isPostgres && canManageUsers,
    items: [
      {
        to: '/admin/users',
        label: 'ユーザー',
        icon: Users,
        postgresOnly: true,
      },
      {
        to: '/admin/sso-settings',
        label: 'SSO設定',
        icon: ShieldCheck,
        postgresOnly: true,
      },
      {
        to: '/admin/notifications',
        label: '通知設定',
        icon: ScrollText,
        postgresOnly: true,
      },
      {
        to: '/admin/api-keys',
        label: 'APIキー',
        icon: KeyRound,
        postgresOnly: true,
      },
      {
        to: '/admin/external-tools',
        label: '外部ツール接続',
        icon: Link2,
        postgresOnly: true,
      },
      {
        to: '/admin/audit-logs',
        label: '監査証跡',
        icon: ScrollText,
        postgresOnly: true,
      },
    ],
  },
]

export function AdminLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.currentUser)
  const isPostgres =
    (import.meta.env.VITE_STORAGE_MODE ?? 'local') === 'postgres'
  // localモードは認証が無いため全機能を開ける（本体の他画面と同じ整理）
  const canManageUsers = isPostgres
    ? currentUser
      ? hasPermission(currentUser.role, 'users:manage')
      : false
    : true

  const allows = (permission: Permission | undefined) => {
    if (!permission) return true
    if (!isPostgres) return true
    return currentUser ? hasPermission(currentUser.role, permission) : false
  }

  const groups = NAV_GROUPS.filter((g) =>
    g.visible({ isPostgres, canManageUsers }),
  )
    .map((g) => ({ ...g, items: g.items.filter((i) => allows(i.permission)) }))
    // 権限で全項目が消えたグループは見出しだけ残さない
    .filter((g) => g.items.length > 0)

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="flex w-60 shrink-0 flex-col border-border border-r bg-card">
        <div className="border-border border-b p-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            システムに戻る
          </Button>
        </div>

        <div className="px-3 py-3">
          <p className="font-bold text-lg">管理画面</p>
          <p className="text-muted-foreground text-xs">
            全社設定とマスタの管理
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-3">
          {groups.map((group) => (
            <div key={group.label} className="mb-3">
              <p className="px-2 py-1 font-medium text-muted-foreground text-xs">
                {group.label}
              </p>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-accent',
                    )
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  )
}
