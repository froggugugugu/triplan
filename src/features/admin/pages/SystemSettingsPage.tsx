import { Eye, EyeOff, Sparkles } from 'lucide-react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/shared/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import { Label } from '@/shared/components/ui/label'
import { NumericInput } from '@/shared/components/ui/numeric-input'
import { getApplicableExchangeRate } from '@/shared/utils/budget-utils'
import { useAppStore, useBudgetStore } from '@/stores'

/**
 * 全社設定。
 *
 * 従来はサイドバーのポップオーバー内で11項目を直接編集しており、
 * 縦に長い一覧をスクロールしながら小さな入力欄を触る形だった。
 * 用途ごとに3つのカードへ分け、各項目に「どこへ効くか」の説明を添える。
 *
 * 値の保存先は`DataAdapter.updateAppSettings()`（postgresモードは
 * `PATCH /api/appSettings`＝`settings:manage`権限が必要）。
 */

/** 設定1件分の行。ラベル・説明・入力を縦に並べる */
function SettingRow({
  id,
  label,
  description,
  children,
}: {
  id: string
  label: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

const CURRENT_MONTH = () => new Date().toISOString().slice(0, 7)

export function SystemSettingsPage() {
  const navigate = useNavigate()
  const isPostgresMode =
    (import.meta.env.VITE_STORAGE_MODE ?? 'local') === 'postgres'
  const fiscalYearStartMonth = useAppStore((s) => s.fiscalYearStartMonth)
  const showFinancials = useAppStore((s) => s.showFinancials)
  const toggleShowFinancials = useAppStore((s) => s.toggleShowFinancials)
  const openSetupWizard = useAppStore((s) => s.openSetupWizard)
  const setFiscalYearStartMonth = useAppStore((s) => s.setFiscalYearStartMonth)

  const loadBudgetData = useBudgetStore((s) => s.loadBudgetData)
  const estimatedUnitPrice = useBudgetStore((s) => s.estimatedUnitPrice)
  const setEstimatedUnitPrice = useBudgetStore((s) => s.setEstimatedUnitPrice)
  const defaultCoefficient = useBudgetStore((s) => s.defaultCoefficient)
  const setDefaultCoefficient = useBudgetStore((s) => s.setDefaultCoefficient)
  const exchangeRateHistory = useBudgetStore((s) => s.exchangeRateHistory)
  const setExchangeRate = useBudgetStore((s) => s.setExchangeRate)
  const workdaysPerMonth = useBudgetStore((s) => s.workdaysPerMonth)
  const setWorkdaysPerMonth = useBudgetStore((s) => s.setWorkdaysPerMonth)
  const hoursPerDay = useBudgetStore((s) => s.hoursPerDay)
  const setHoursPerDay = useBudgetStore((s) => s.setHoursPerDay)
  const hoursPerFunctionPoint = useBudgetStore((s) => s.hoursPerFunctionPoint)
  const setHoursPerFunctionPoint = useBudgetStore(
    (s) => s.setHoursPerFunctionPoint,
  )
  const skillReviewCycleMonths = useBudgetStore((s) => s.skillReviewCycleMonths)
  const setSkillReviewCycleMonths = useBudgetStore(
    (s) => s.setSkillReviewCycleMonths,
  )
  const baselineStaleThreshold = useBudgetStore((s) => s.baselineStaleThreshold)
  const setBaselineStaleThreshold = useBudgetStore(
    (s) => s.setBaselineStaleThreshold,
  )
  const summaryBudgetProgressGapThreshold = useBudgetStore(
    (s) => s.summaryBudgetProgressGapThreshold,
  )
  const setSummaryBudgetProgressGapThreshold = useBudgetStore(
    (s) => s.setSummaryBudgetProgressGapThreshold,
  )
  const summarySpiWarningThreshold = useBudgetStore(
    (s) => s.summarySpiWarningThreshold,
  )
  const setSummarySpiWarningThreshold = useBudgetStore(
    (s) => s.setSummarySpiWarningThreshold,
  )

  // 設定値は budget-store が保持する。未ロードのまま書き込むと
  // 他フィールドを空で上書きする事故になるため、必ず先に読む
  useEffect(() => {
    loadBudgetData()
  }, [loadBudgetData])

  const currentRate = getApplicableExchangeRate(
    exchangeRateHistory ?? [],
    CURRENT_MONTH(),
  )

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="font-bold text-2xl">全社設定</h1>
        <p className="text-muted-foreground text-sm">
          すべての案件・部門に共通で適用される値です。変更は保存と同時に反映されます
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">基本</CardTitle>
          <CardDescription>年度の区切りと工数の換算単位</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingRow
            id="fiscalYearStartMonth"
            label="年度開始月"
            description="全画面の年度表示・月次集計の起点になります"
          >
            <select
              id="fiscalYearStartMonth"
              aria-label="年度開始月"
              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
              value={fiscalYearStartMonth}
              onChange={(e) => setFiscalYearStartMonth(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                <option key={month} value={month}>
                  {month}月
                </option>
              ))}
            </select>
          </SettingRow>

          <SettingRow
            id="workdaysPerMonth"
            label="人月換算（人日/人月）"
            description="WBS概算予算・EVMのBAC・CSV帳票の人月換算に使います"
          >
            <NumericInput
              id="workdaysPerMonth"
              className="w-24 text-right"
              value={workdaysPerMonth ?? 20}
              onValueChange={setWorkdaysPerMonth}
            />
            <span className="text-muted-foreground text-sm">人日</span>
          </SettingRow>

          <SettingRow
            id="hoursPerDay"
            label="時間換算（時間/人日）"
            description="実績CSV取込で時間を人月へ換算するときに使います"
          >
            <NumericInput
              id="hoursPerDay"
              className="w-24 text-right"
              value={hoursPerDay ?? 8}
              onValueChange={setHoursPerDay}
            />
            <span className="text-muted-foreground text-sm">時間</span>
          </SettingRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">見積・単価</CardTitle>
          <CardDescription>
            概算予算の算出（総工数 × 概算単価 × 係数）と通貨換算に使う値
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingRow
            id="estimatedUnitPrice"
            label="概算単価"
            description="人月あたりの見積単価。案件別の単価が無いときの既定値です"
          >
            <NumericInput
              id="estimatedUnitPrice"
              className="w-28 text-right"
              value={estimatedUnitPrice ?? 0}
              onValueChange={setEstimatedUnitPrice}
            />
            <span className="text-muted-foreground text-sm">万円</span>
          </SettingRow>

          <SettingRow
            id="defaultCoefficient"
            label="係数（デフォルト）"
            description="案件別に係数を設定していない場合に適用されます"
          >
            <NumericInput
              id="defaultCoefficient"
              className="w-24 text-right"
              value={defaultCoefficient ?? 1}
              onValueChange={setDefaultCoefficient}
            />
          </SettingRow>

          <SettingRow
            id="hoursPerFunctionPoint"
            label="人時/FP（簡易FPの換算）"
            description="見積画面の簡易FPで、1ファンクションポイントあたりの工数（時間）。完了案件の実績 人時/FP を見て自社の値へ寄せてください"
          >
            <NumericInput
              id="hoursPerFunctionPoint"
              className="w-24 text-right"
              value={hoursPerFunctionPoint ?? 10}
              onValueChange={setHoursPerFunctionPoint}
            />
            <span className="text-muted-foreground text-sm">時間</span>
          </SettingRow>

          <SettingRow
            id="exchangeRate"
            label="為替レート（＄→円）"
            description="AI利用費（＄建て）を万円建ての集計へ合算するときに使います。変更は今月から適用され、過去月の集計は変わりません"
          >
            <NumericInput
              id="exchangeRate"
              className="w-24 text-right"
              value={currentRate}
              onValueChange={setExchangeRate}
            />
            <span className="text-muted-foreground text-sm">円</span>
          </SettingRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">警告のしきい値</CardTitle>
          <CardDescription>
            アラートセンターとプロジェクトサマリーの判定に使う基準値
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingRow
            id="baselineStaleThreshold"
            label="ベースライン乖離"
            description="現行BACと凍結時BACの差がこれを超えると再凍結を促します"
          >
            <NumericInput
              id="baselineStaleThreshold"
              className="w-24 text-right"
              value={Math.round((baselineStaleThreshold ?? 0.1) * 100)}
              onValueChange={(v) => setBaselineStaleThreshold(v / 100)}
            />
            <span className="text-muted-foreground text-sm">%</span>
          </SettingRow>

          <SettingRow
            id="summaryBudgetProgressGapThreshold"
            label="予算先行の警告"
            description="予算消化率が進捗率をこれ以上上回ると警告します"
          >
            <NumericInput
              id="summaryBudgetProgressGapThreshold"
              className="w-24 text-right"
              value={Math.round(
                (summaryBudgetProgressGapThreshold ?? 0.15) * 100,
              )}
              onValueChange={(v) =>
                setSummaryBudgetProgressGapThreshold(v / 100)
              }
            />
            <span className="text-muted-foreground text-sm">pt</span>
          </SettingRow>

          <SettingRow
            id="summarySpiWarningThreshold"
            label="SPI警告"
            description="スケジュール効率指標がこれを下回ると警告します"
          >
            <NumericInput
              id="summarySpiWarningThreshold"
              className="w-24 text-right"
              value={summarySpiWarningThreshold ?? 0.9}
              onValueChange={setSummarySpiWarningThreshold}
            />
          </SettingRow>

          <SettingRow
            id="skillReviewCycleMonths"
            label="スキルレビュー周期"
            description="最後の評価からこの期間を過ぎると「要見直し」として通知します"
          >
            <NumericInput
              id="skillReviewCycleMonths"
              className="w-24 text-right"
              value={skillReviewCycleMonths ?? 3}
              onValueChange={setSkillReviewCycleMonths}
            />
            <span className="text-muted-foreground text-sm">ヶ月</span>
          </SettingRow>
        </CardContent>
      </Card>

      {/* 金額の表示（localモードのみ。postgresモードはロールのfinancials:readで制御するため
          トグル自体を出さない＝抜け道を作らない） */}
      {!isPostgresMode && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">表示</CardTitle>
            <CardDescription>この端末での見え方</CardDescription>
          </CardHeader>
          <CardContent>
            <SettingRow
              id="showFinancials"
              label="金額の表示"
              description="OFFにすると予算・単価・受注額などの金額情報を隠します（画面共有や協力会社の同席時向け）"
            >
              <Button
                id="showFinancials"
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                // トグルなので押下状態を支援技術へ伝える（ラベルがアクセシブルネームを
                // 担うため、ボタン文言の「表示中/非表示」だけでは状態が読み取れない）
                aria-pressed={showFinancials}
                onClick={toggleShowFinancials}
              >
                {showFinancials ? (
                  <>
                    <Eye className="h-4 w-4" />
                    表示中
                  </>
                ) : (
                  <>
                    <EyeOff className="h-4 w-4" />
                    非表示
                  </>
                )}
              </Button>
            </SettingRow>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">セットアップ</CardTitle>
          <CardDescription>
            組織・担当者・最初のプロジェクトをGUIで登録し直せます
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => {
              // ウィザード本体はDashboardPageがマウントしているため、
              // 開く指示を出してからダッシュボードへ移動する
              openSetupWizard()
              navigate('/dashboard')
            }}
          >
            <Sparkles className="h-4 w-4" />
            初期設定ウィザードを開く
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
