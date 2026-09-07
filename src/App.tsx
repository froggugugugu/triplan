import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from '@/features/auth/components/RequireAuth'
import { TourMenuButton } from '@/features/guide-tour/components/TourMenuButton'
import { TourProvider } from '@/features/guide-tour/components/TourProvider'
import { FinancialAccessGuard } from '@/shared/components/FinancialAccessGuard'
import { Layout } from '@/shared/components/Layout'
import { Toaster } from '@/shared/components/ui/toaster'

/**
 * ページコンポーネントはすべてルート単位で遅延ロードする（の
 * 負債解消=単一チャンク2.9MB警告）。AG Grid・Recharts・ガント等の重量ライブラリが
 * 使用ページのチャンクへ分離され、初回表示（LandingPage/DashboardPage）が軽くなる。
 * named exportのため`.then()`でdefaultへ変換する
 */
const MonthlyActualsPage = lazy(() =>
  import('@/features/actuals/pages/MonthlyActualsPage').then((m) => ({
    default: m.MonthlyActualsPage,
  })),
)
const MyTasksPage = lazy(() =>
  import('@/features/my-tasks/pages/MyTasksPage').then((m) => ({
    default: m.MyTasksPage,
  })),
)
const AuditLogsPage = lazy(() =>
  import('@/features/admin/pages/AuditLogsPage').then((m) => ({
    default: m.AuditLogsPage,
  })),
)
const ApiKeysPage = lazy(() =>
  import('@/features/admin/pages/ApiKeysPage').then((m) => ({
    default: m.ApiKeysPage,
  })),
)
const NotificationSettingsPage = lazy(() =>
  import('@/features/admin/pages/NotificationSettingsPage').then((m) => ({
    default: m.NotificationSettingsPage,
  })),
)
const ExternalToolsPage = lazy(() =>
  import('@/features/admin/pages/ExternalToolsPage').then((m) => ({
    default: m.ExternalToolsPage,
  })),
)
const SsoSettingsPage = lazy(() =>
  import('@/features/admin/pages/SsoSettingsPage').then((m) => ({
    default: m.SsoSettingsPage,
  })),
)
const UserManagementPage = lazy(() =>
  import('@/features/admin/pages/UserManagementPage').then((m) => ({
    default: m.UserManagementPage,
  })),
)
const AssignmentPage = lazy(() =>
  import('@/features/assignment/pages/AssignmentPage').then((m) => ({
    default: m.AssignmentPage,
  })),
)
const LoginPage = lazy(() =>
  import('@/features/auth/pages/LoginPage').then((m) => ({
    default: m.LoginPage,
  })),
)
const BudgetPage = lazy(() =>
  import('@/features/budget/pages/BudgetPage').then((m) => ({
    default: m.BudgetPage,
  })),
)
const CompaniesPage = lazy(() =>
  import('@/features/companies/pages/CompaniesPage').then((m) => ({
    default: m.CompaniesPage,
  })),
)
const DashboardPage = lazy(() =>
  import('@/features/dashboard/pages/DashboardPage').then((m) => ({
    default: m.DashboardPage,
  })),
)
const DocumentTemplatesPage = lazy(() =>
  import('@/features/document-templates/pages/DocumentTemplatesPage').then(
    (m) => ({ default: m.DocumentTemplatesPage }),
  ),
)
const LandingPage = lazy(() =>
  import('@/features/landing/pages/LandingPage').then((m) => ({
    default: m.LandingPage,
  })),
)
const ProjectsPage = lazy(() =>
  import('@/features/projects/pages/ProjectsPage').then((m) => ({
    default: m.ProjectsPage,
  })),
)
const PortfolioPage = lazy(() =>
  import('@/features/projects/pages/PortfolioPage').then((m) => ({
    default: m.PortfolioPage,
  })),
)
const ProjectSummaryPage = lazy(() =>
  import('@/features/projects/pages/ProjectSummaryPage').then((m) => ({
    default: m.ProjectSummaryPage,
  })),
)
const EstimatesPage = lazy(() =>
  import('@/features/estimates/pages/EstimatesPage').then((m) => ({
    default: m.EstimatesPage,
  })),
)
const WbsPage = lazy(() =>
  import('@/features/projects/pages/WbsPage').then((m) => ({
    default: m.WbsPage,
  })),
)
const WbsSettingsPage = lazy(() =>
  import('@/features/projects/pages/WbsSettingsPage').then((m) => ({
    default: m.WbsSettingsPage,
  })),
)
const WbsTemplatesPage = lazy(() =>
  import('@/features/projects/pages/WbsTemplatesPage').then((m) => ({
    default: m.WbsTemplatesPage,
  })),
)
const ReportsPage = lazy(() =>
  import('@/features/reports/pages/ReportsPage').then((m) => ({
    default: m.ReportsPage,
  })),
)
const PhaseSettingsPage = lazy(() =>
  import('@/features/schedule/pages/PhaseSettingsPage').then((m) => ({
    default: m.PhaseSettingsPage,
  })),
)
const SchedulePage = lazy(() =>
  import('@/features/schedule/pages/SchedulePage').then((m) => ({
    default: m.SchedulePage,
  })),
)
const StatementsPage = lazy(() =>
  import('@/features/statements/pages/StatementsPage').then((m) => ({
    default: m.StatementsPage,
  })),
)
const TeamPage = lazy(() =>
  import('@/features/team/pages/TeamPage').then((m) => ({
    default: m.TeamPage,
  })),
)
const TechTagsPage = lazy(() =>
  import('@/features/tech-tags/pages/TechTagsPage').then((m) => ({
    default: m.TechTagsPage,
  })),
)

const AdminAccessGuard = lazy(() =>
  import('@/features/admin/components/AdminAccessGuard').then((m) => ({
    default: m.AdminAccessGuard,
  })),
)
const AdminIndexRedirect = lazy(() =>
  import('@/features/admin/components/AdminIndexRedirect').then((m) => ({
    default: m.AdminIndexRedirect,
  })),
)
const AdminLayout = lazy(() =>
  import('@/features/admin/components/AdminLayout').then((m) => ({
    default: m.AdminLayout,
  })),
)
const SystemSettingsPage = lazy(() =>
  import('@/features/admin/pages/SystemSettingsPage').then((m) => ({
    default: m.SystemSettingsPage,
  })),
)
const DataManagementPage = lazy(() =>
  import('@/features/admin/pages/DataManagementPage').then((m) => ({
    default: m.DataManagementPage,
  })),
)

function App() {
  return (
    <>
      <Suspense
        fallback={
          <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
            読み込み中...
          </div>
        }
      >
        <Routes>
          {/* Landing page (no sidebar) */}
          <Route path="/" element={<LandingPage />} />

          {/* ログイン画面（postgresモードのみ意味を持つ。localモードでは未使用） */}
          <Route path="/login" element={<LoginPage />} />

          {/* 管理画面。本体（Layout）とは別レイアウトなので
              Layoutの外側にルートを置く。左ペイン＝メニュー／右ペイン＝内容で、
              「システムに戻る」で本体へ戻る。
              `path="*"`より前に置かないと本体側のルートに吸われる */}
          <Route
            path="/admin/*"
            element={
              <RequireAuth>
                <AdminLayout>
                  <Routes>
                    <Route path="/" element={<AdminIndexRedirect />} />
                    <Route
                      path="settings"
                      element={
                        <AdminAccessGuard permission="settings:manage">
                          <SystemSettingsPage />
                        </AdminAccessGuard>
                      }
                    />
                    <Route
                      path="data"
                      element={
                        // 全社データの入れ替えはサーバー側もadmin限定
                        <AdminAccessGuard permission="users:manage">
                          <DataManagementPage />
                        </AdminAccessGuard>
                      }
                    />

                    {/* マスタ */}
                    <Route path="companies" element={<CompaniesPage />} />
                    <Route path="tech-tags" element={<TechTagsPage />} />
                    <Route
                      path="wbs-templates"
                      element={<WbsTemplatesPage />}
                    />
                    <Route
                      path="document-templates"
                      element={<DocumentTemplatesPage />}
                    />

                    {/* 管理者（postgresモード専用。ロール判定は各ページのガードで行う） */}
                    <Route
                      path="users"
                      element={
                        <RequireAuth requiredRole="admin">
                          <UserManagementPage />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="sso-settings"
                      element={
                        <RequireAuth requiredRole="admin">
                          <SsoSettingsPage />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="notifications"
                      element={
                        <RequireAuth requiredRole="admin">
                          <NotificationSettingsPage />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="api-keys"
                      element={
                        <RequireAuth requiredRole="admin">
                          <ApiKeysPage />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="external-tools"
                      element={
                        <RequireAuth requiredRole="admin">
                          <ExternalToolsPage />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="audit-logs"
                      element={
                        <RequireAuth requiredRole="admin">
                          <AuditLogsPage />
                        </RequireAuth>
                      }
                    />
                  </Routes>
                </AdminLayout>
              </RequireAuth>
            }
          />

          {/* App pages (with sidebar layout) */}
          <Route
            path="*"
            element={
              <RequireAuth>
                <Layout sidebarExtra={<TourMenuButton />}>
                  <Routes>
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/team" element={<TeamPage />} />
                    <Route
                      path="/members"
                      element={<Navigate to="/team" replace />}
                    />
                    <Route path="/projects" element={<ProjectsPage />} />
                    <Route
                      path="/project-summary"
                      element={<ProjectSummaryPage />}
                    />
                    <Route path="/portfolio" element={<PortfolioPage />} />
                    <Route
                      path="/estimates"
                      element={
                        <FinancialAccessGuard>
                          <EstimatesPage />
                        </FinancialAccessGuard>
                      }
                    />
                    <Route path="/wbs" element={<WbsPage />} />
                    <Route
                      path="/wbs-settings/:projectId"
                      element={<WbsSettingsPage />}
                    />
                    {/* 旧URL。管理画面へ集約したためリダイレクトする */}
                    <Route
                      path="/wbs-templates"
                      element={<Navigate to="/admin/wbs-templates" replace />}
                    />
                    {/* 旧URL。管理画面へ集約したためリダイレクトする */}
                    <Route
                      path="/document-templates"
                      element={
                        <Navigate to="/admin/document-templates" replace />
                      }
                    />
                    <Route path="/schedule" element={<SchedulePage />} />
                    <Route
                      path="/schedule-settings/:projectId"
                      element={<PhaseSettingsPage />}
                    />
                    <Route path="/assignment" element={<AssignmentPage />} />
                    <Route
                      path="/monthly-actuals"
                      element={<MonthlyActualsPage />}
                    />
                    <Route
                      path="/budget"
                      element={
                        <FinancialAccessGuard>
                          <BudgetPage />
                        </FinancialAccessGuard>
                      }
                    />
                    <Route
                      path="/statements"
                      element={
                        <FinancialAccessGuard>
                          <StatementsPage />
                        </FinancialAccessGuard>
                      }
                    />
                    {/* 旧URL。管理画面へ集約したためリダイレクトする */}
                    <Route
                      path="/tech-tags"
                      element={<Navigate to="/admin/tech-tags" replace />}
                    />
                    {/* 旧URL。管理画面へ集約したためリダイレクトする */}
                    <Route
                      path="/companies"
                      element={<Navigate to="/admin/companies" replace />}
                    />
                    <Route path="/reports" element={<ReportsPage />} />
                    <Route
                      path="/my-tasks"
                      element={
                        <RequireAuth>
                          <MyTasksPage />
                        </RequireAuth>
                      }
                    />
                  </Routes>
                </Layout>
              </RequireAuth>
            }
          />
        </Routes>
      </Suspense>
      <TourProvider />
      <Toaster />
    </>
  )
}

export default App
