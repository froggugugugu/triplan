import {
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  ClipboardList,
  FolderKanban,
  Moon,
  Network,
  Sun,
  Users,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Button } from '@/shared/components/ui/button'
import { useAppStore } from '@/stores'

/* ------------------------------------------------------------------ */
/*  Flow Diagram (React component)                                    */
/* ------------------------------------------------------------------ */

interface FlowNodeProps {
  icon: React.ElementType
  label: string
  sub: string
  color: string
  delay?: string
}

function FlowNode({
  icon: Icon,
  label,
  sub,
  color,
  delay = '0ms',
}: FlowNodeProps) {
  return (
    <div
      className="group flex flex-col items-center gap-2 animate-fade-in-up"
      style={{ animationDelay: delay }}
    >
      <div
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg transition-transform duration-300 group-hover:scale-110 sm:h-16 sm:w-16',
          color,
        )}
      >
        <Icon className="h-6 w-6 text-white sm:h-7 sm:w-7" />
      </div>
      <div className="text-center whitespace-nowrap">
        <p className="text-xs font-bold text-foreground sm:text-sm">{label}</p>
        <p className="text-[10px] text-muted-foreground sm:text-xs">{sub}</p>
      </div>
    </div>
  )
}

function FlowArrow({ delay = '0ms' }: { delay?: string }) {
  return (
    <div
      className="flex items-center justify-center animate-fade-in-up"
      style={{ animationDelay: delay }}
    >
      <div className="hidden h-0.5 w-6 bg-border sm:block lg:w-10" />
      <ArrowRight className="h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" />
    </div>
  )
}

function FlowBrace({ delay = '0ms' }: { delay?: string }) {
  return (
    <div
      className="flex items-center justify-center animate-fade-in-up"
      style={{ animationDelay: delay }}
    >
      <div className="flex flex-col items-center gap-0.5">
        <div className="h-6 w-0.5 bg-border sm:h-8" />
        <ArrowRight className="h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" />
      </div>
    </div>
  )
}

function ConceptDiagram() {
  return (
    <div className="w-full max-w-4xl mx-auto px-4">
      {/* Desktop layout */}
      <div className="hidden md:flex md:items-center md:justify-center md:gap-2 lg:gap-3">
        {/* Input group */}
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card/50 px-4 py-5 backdrop-blur-sm lg:gap-3 lg:px-6">
          <FlowNode
            icon={Users}
            label="チーム"
            sub="誰が"
            color="bg-emerald-500"
            delay="100ms"
          />
          <FlowNode
            icon={FolderKanban}
            label="プロジェクト"
            sub="どのプロジェクトに"
            color="bg-blue-500"
            delay="200ms"
          />
          <FlowNode
            icon={Network}
            label="WBS"
            sub="何の作業を"
            color="bg-violet-500"
            delay="300ms"
          />
          <FlowNode
            icon={Calendar}
            label="スケジュール"
            sub="いつ"
            color="bg-amber-500"
            delay="400ms"
          />
        </div>

        <FlowArrow delay="500ms" />

        {/* Process */}
        <div
          className="flex items-center rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 px-4 py-5 animate-fade-in-up"
          style={{ animationDelay: '600ms' }}
        >
          <FlowNode
            icon={ClipboardList}
            label="アサイン"
            sub="枠にリソースを配置"
            color="bg-primary"
            delay="600ms"
          />
        </div>

        <FlowArrow delay="700ms" />

        {/* Output */}
        <div className="animate-fade-in-up" style={{ animationDelay: '800ms' }}>
          <FlowNode
            icon={BarChart3}
            label="ダッシュボード"
            sub="稼働率を可視化"
            color="bg-rose-500"
            delay="800ms"
          />
        </div>
      </div>

      {/* Mobile layout (vertical) */}
      <div className="flex flex-col items-center gap-4 md:hidden">
        <div className="grid grid-cols-2 gap-4 rounded-2xl border border-border bg-card/50 p-5 backdrop-blur-sm">
          <FlowNode
            icon={Users}
            label="チーム"
            sub="誰が"
            color="bg-emerald-500"
            delay="100ms"
          />
          <FlowNode
            icon={FolderKanban}
            label="プロジェクト"
            sub="どのプロジェクトに"
            color="bg-blue-500"
            delay="200ms"
          />
          <FlowNode
            icon={Network}
            label="WBS"
            sub="何の作業を"
            color="bg-violet-500"
            delay="300ms"
          />
          <FlowNode
            icon={Calendar}
            label="スケジュール"
            sub="いつ"
            color="bg-amber-500"
            delay="400ms"
          />
        </div>

        <FlowBrace delay="500ms" />

        <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 px-8 py-5">
          <FlowNode
            icon={ClipboardList}
            label="アサイン"
            sub="枠にリソースを配置"
            color="bg-primary"
            delay="600ms"
          />
        </div>

        <FlowBrace delay="700ms" />

        <FlowNode
          icon={BarChart3}
          label="ダッシュボード"
          sub="稼働率を可視化"
          color="bg-rose-500"
          delay="800ms"
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Feature cards                                                     */
/* ------------------------------------------------------------------ */

const features = [
  {
    icon: Users,
    title: 'チーム管理',
    description:
      '部門・課・担当者を組織階層で管理。単価履歴や技術タグで人材を可視化。',
  },
  {
    icon: FolderKanban,
    title: 'プロジェクト管理',
    description:
      '最大5階層のツリー構造でプロジェクトを整理。確度・ステータスで進捗を把握。',
  },
  {
    icon: Network,
    title: 'WBS',
    description:
      'プロジェクトごとに工数列を定義し、作業を細分化。技術タグとの紐付けも対応。',
  },
  {
    icon: Calendar,
    title: 'スケジュール',
    description: 'ガントチャートで工程を視覚化。工程間の依存関係も定義可能。',
  },
  {
    icon: ClipboardList,
    title: 'アサイン',
    description:
      'タスク×担当者の月次配分をグリッドで入力。超過割当を自動検知。',
  },
  {
    icon: BarChart3,
    title: 'ダッシュボード',
    description: '稼働率・充足率・スキル分布をチャートで俯瞰。意思決定を支援。',
  },
]

/* ------------------------------------------------------------------ */
/*  Landing Page                                                      */
/* ------------------------------------------------------------------ */

export function LandingPage() {
  const navigate = useNavigate()
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="fixed top-0 right-0 left-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <span className="text-lg font-bold tracking-tight">triplan</span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="テーマ切替"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
            <Button size="sm" onClick={() => navigate('/dashboard')}>
              アプリを開く
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative flex min-h-[80vh] flex-col items-center justify-center overflow-hidden px-4 pt-14 sm:px-6">
        {/* Background decoration */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full bg-primary/5 blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col items-center gap-8 sm:gap-10">
          {/* Title */}
          <div className="flex flex-col items-center gap-4 text-center animate-fade-in-up">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm sm:text-sm">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              オフラインで動作 / インストール不要
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
              枠を作って、リソースを当て込む
            </h1>
            <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
              年度単位でプロジェクト・担当者・工数・スケジュールを一元管理。
              <br className="hidden sm:block" />
              チームの稼働率を可視化し、最適なリソース配分を実現します。
            </p>
            <div className="flex gap-3 pt-2">
              <Button size="lg" onClick={() => navigate('/dashboard')}>
                はじめる
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Concept Diagram */}
          <ConceptDiagram />
        </div>
      </section>

      {/* Steps explanation */}
      <section className="border-t border-border bg-muted/30 px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-10 text-center text-xl font-bold sm:text-2xl">
            5ステップでリソースを最適化
          </h2>
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute top-0 bottom-0 left-6 hidden w-0.5 bg-border sm:block" />
            <div className="flex flex-col gap-6 sm:gap-8">
              {[
                {
                  step: '1',
                  label: 'チームを登録',
                  desc: '部門・課を作成し、担当者を配置します。単価履歴や技術スキルも管理できます。',
                  color: 'bg-emerald-500',
                },
                {
                  step: '2',
                  label: 'プロジェクトを定義',
                  desc: 'プロジェクトを階層ツリーで作成し、作業の「枠」を定義します。確度やステータスでプロジェクトを分類できます。',
                  color: 'bg-blue-500',
                },
                {
                  step: '3',
                  label: 'WBSで細分化',
                  desc: '枠ごとに工数列を設定し、作業内容を具体化します。',
                  color: 'bg-violet-500',
                },
                {
                  step: '4',
                  label: 'スケジュールを設定',
                  desc: 'ガントチャートで工程と期間を定義し、枠に「いつ」の概念を加えます。',
                  color: 'bg-amber-500',
                },
                {
                  step: '5',
                  label: 'アサインを実行',
                  desc: '担当者を月次で枠に配分します。超過割当は自動で検知されます。',
                  color: 'bg-primary',
                },
              ].map(({ step, label, desc, color }) => (
                <div key={step} className="flex items-start gap-4 sm:gap-6">
                  <div
                    className={cn(
                      'relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white shadow-md',
                      color,
                    )}
                  >
                    {step}
                  </div>
                  <div className="pt-1">
                    <h3 className="text-base font-semibold sm:text-lg">
                      {label}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-10 text-center text-xl font-bold sm:text-2xl">
            主な機能
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="group rounded-xl border border-border bg-card p-5 transition-shadow duration-200 hover:shadow-md"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mb-1.5 text-sm font-semibold">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-muted/30 px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
          <h2 className="text-xl font-bold sm:text-2xl">
            リソース管理をはじめましょう
          </h2>
          <p className="text-sm text-muted-foreground sm:text-base">
            データはブラウザのlocalStorageに保存されます。
            アカウント登録やサーバーは不要です。
          </p>
          <Button size="lg" onClick={() => navigate('/dashboard')}>
            ダッシュボードへ
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-4 py-6 sm:px-6">
        <p className="text-center text-xs text-muted-foreground">
          triplan &mdash; People, Things and Money in one plan
        </p>
      </footer>
    </div>
  )
}
