# Database統合スキーマ・フォームバリデーション

> [`docs/data-model.md`](../../data-model.md) から分割した詳細リファレンス。常時ロードされないため、必要なときにこのファイルを直接Readする。

### Database（`database.ts`）

全データ統合スキーマ（JSON永続化用）。

| フィールド        | 型                          | 備考          |
| ----------------- | --------------------------- | ------------- |
| `version`         | `string`                    | スキーマバージョン |
| `fiscalYear`      | `number`（2000〜2100）      | 対象年度      |
| `projects`        | `Project[]`                 | 必須          |
| `members`         | `Member[]`                  | 必須          |
| `efforts`         | `EffortEntry[]`             | 任意          |
| `wbsSettings`     | `WbsSettings`               | 任意          |
| `scheduleEntries` | `ScheduleEntry[]`           | 任意          |
| `dependencies`    | `PhaseDependency[]`         | 任意          |
| `scheduleSettingsEntries` | `PhaseSettingsEntry[]` | 任意          |
| `wbsColumnSettingsEntries` | `WbsSettingsEntry[]`  | 任意          |
| `assignments`     | `AssignmentEntry[]`         | 任意          |
| `techTags`             | `TechTag[]`                 | 任意          |
| `techTagCategories`    | `TechTagCategory[]`         | 任意          |
| `techTagSubCategories` | `TechTagSubCategory[]`      | 任意          |
| `divisions`            | `Division[]`                | 任意          |
| `sections`             | `Section[]`                 | 任意          |
| `companies`            | `Company[]`                 | 任意          |
| `divisionBudgets`      | `DivisionBudget[]`          | 任意          |
| `budgetAdjustments`    | `BudgetAdjustment[]`        | 任意          |
| `budgetBreakdowns`     | `BudgetBreakdown[]`         | 任意          |
| `aiUsageEntries`       | `AiUsageEntry[]`            | 任意          |
| `aiUsageMemberAllocations` | `AiUsageMemberAllocation[]` | 任意      |
| `aiUsageProviders`     | `AiUsageProvider[]`         | 任意          |
| `saasContracts`        | `SaasContract[]`            | 任意          |
| `personnelPlans`       | `PersonnelPlanEntry[]`      | 任意          |
| `skillEvaluations`     | `SkillEvaluation[]`         | 任意          |
| `skillRoadmapGoals`    | `SkillRoadmapGoal[]`        | 任意          |
| `projectProgressEntries` | `ProjectProgressEntry[]`  | 任意          |
| `projectBaselines`     | `ProjectBaseline[]`         | 任意          |
| `riskEntries`          | `RiskEntry[]`               | 任意（非公開の設計文書） |
| `estimateSnapshots`    | `EstimateSnapshot[]`        | 任意（非公開の設計文書） |
| `changeRequests`       | `ChangeRequest[]`           | 任意          |
| `billingMilestones`    | `BillingMilestone[]`        | 任意          |
| `wbsTemplates`         | `WbsTemplate[]`             | 任意          |
| `documentTemplates`    | `DocumentTemplate[]`        | 任意          |
| `monthlyActualsConfirmations` | `MonthlyActualsConfirmation[]` | 任意（P1-a） |
| `actualsImportLogs`    | `ActualsImportLog[]`        | 任意（P1-a） |
| `monthlyCloseEvents`   | `MonthlyCloseEvent[]`       | 任意（P1-b） |
| `taskSyncLogs`         | `TaskSyncLog[]`             | 任意（P1-c改） |
| `csvMappingProfiles`   | `CsvMappingProfile[]`       | 任意 |
| `estimatedUnitPrice`   | `number`（0以上、任意）     | 全社共通の概算単価（万円）。人員計画の予算額算出に使用 |
| `defaultCoefficient`   | `number`（0より大きい、任意） | 案件タブの係数デフォルト値（全社共通・単一値） |
| `projectCoefficients`  | `Record<string, number>`（任意） | 案件別の係数（key: projectId、value: 係数）。未設定の案件は`defaultCoefficient`を使用 |
| `exchangeRateHistory`  | `ExchangeRateEntry[]`（任意） | 為替レート設定の履歴（全社共通・単一設定）。AI利用費（＄建て）の万円換算に使用 |
| `workdaysPerMonth`     | `number`（0より大きい、任意） | 人月換算の1人月あたり人日（P0-a設定化）。未設定時は従来の固定値20（`WORKDAYS_PER_MONTH`）へフォールバック |
| `skillReviewCycleMonths` | `number`（1以上の整数、任意） | スキル定期評価レビューの周期（月）。未設定時は固定値3（`SKILL_REVIEW_CYCLE_MONTHS`） |
| `baselineStaleThreshold` | `number`（0より大きく1以下、任意） | ベースライン乖離の再凍結警告閾値（比率）。未設定時は固定値0.1=±10%（`BASELINE_STALE_THRESHOLD`） |
| `hoursPerDay` | `number`（0より大きい、任意） | 時間換算（1人日あたりの時間）。CSV取込の時間→人月換算に使用（P1-a）。未設定時は固定値8（`HOURS_PER_DAY`）へフォールバック。システム設定（Layout）から編集、appSettings PATCH対象 |
| `summaryBudgetProgressGapThreshold` | `number`（0より大きく1以下、任意） | プロジェクトサマリーR4「予算先行」の警告閾値（予算消化率−進捗率の比率）。未設定時は0.15=15pt（`SUMMARY_BUDGET_PROGRESS_GAP_THRESHOLD`）。システム設定から編集、appSettings PATCH対象 |
| `hoursPerFunctionPoint` | `number`（0より大きい、任意） | 簡易FPの人時/FP。未設定時は固定値10（`HOURS_PER_FUNCTION_POINT`）。全社設定「見積・単価」から編集、appSettings PATCH対象 |
| `summarySpiWarningThreshold` | `number`（0より大きく2以下、任意） | プロジェクトサマリーR5「SPI低下」の警告閾値（これ未満で警告）。未設定時は0.9（`SUMMARY_SPI_WARNING_THRESHOLD`）。システム設定から編集、appSettings PATCH対象 |
| `metadata`        | `Metadata`                  | 必須          |

Metadata: `lastModified`（datetime）、`createdBy`（string）、`version`（string）

ユーティリティ関数:
- `fiscalMonthToCalendarMonth()`: 年度月（1〜12）→ 暦月（4月始まり）
- `calendarMonthToFiscalMonth()`: 暦月 → 年度月
- `getFiscalMonthLabel()`: 年度月 → `"4月"`形式のラベル

## フォームバリデーション（`infrastructure/validation/schemas.ts`）

| スキーマ            | 対象             | 主なルール                                       |
| ------------------- | ---------------- | ------------------------------------------------ |
| `projectFormSchema` | 案件ダイアログ   | code必須、name必須、level 0〜5、status/confidence、clientName（200文字以内）/contractAmount（0以上）/priority（level===0のみ設定対象） |
| `memberFormSchema`  | 担当者ダイアログ | name必須、email任意（空文字/null/undefinedはnullへ正規化、`.email()`形式バリデーション）、sectionId/companyId/startDate/endDate/unitPriceHistory/contractUnitPriceHistory対応、endDate >= startDateバリデーション |
| `techTagFormSchema` | 技術タグダイアログ | name必須（1〜50文字）、color必須（HEX形式）、categoryId必須、subCategoryId任意、note任意（200文字以内） |
| `techTagCategoryFormSchema` | カテゴリダイアログ | name必須（1〜100文字） |
| `techTagSubCategoryFormSchema` | サブカテゴリダイアログ | categoryId必須、name必須（1〜100文字） |
| `saasContractFormSchema` | SaaS契約ダイアログ | name必須（1〜100文字）、plan任意（最大100文字）、divisionId必須、amount 0以上、headcount任意（1以上の整数）、unitPrice任意（0以上）、amountHistory任意、contractStartDate/nextRenewalDate必須、nextRenewalDate >= contractStartDateバリデーション |
| `budgetBreakdownFormSchema` | 部門予算内訳ダイアログ（追加・編集・削除、その他費用タブから`lockedCategory`固定で再利用） | category必須、label必須（1〜200文字）、amount 0以上、recordedAt必須（YYYY-MM-DD）、general_expenseの場合projectId指定不可 |
| `otherExpenseActualFormSchema` | その他費用の実績明細ダイアログ | purchasedAt必須（YYYY-MM-DD）、itemLabel必須（1〜500文字）、amount 0以上、note任意（最大1000文字） |
| `aiUsageMemberAllocationFormSchema` | AI利用費メンバー配分の一律設定 | monthlyBudget/bufferAmount 0以上 |
| `aiUsageProviderFormSchema` | AI利用費プロバイダ追加・編集ダイアログ（`AiUsageProviderDialog`） | name必須（1〜100文字）、plan任意（最大100文字） |
| `skillEvaluationFormSchema` | スキル評価記録フォーム（`MemberSkillPanel`） | techTagId必須、evaluatorType必須、afterLevel必須、evaluatedAt必須（YYYY-MM-DD）、note任意（最大500文字）。beforeLevelはフォーム入力対象外で送信直前に現在レベルから導出 |
| `skillRoadmapGoalFormSchema` | 成長ロードマップ目標設定フォーム（`MemberSkillPanel`） | techTagId必須、targetLevel必須、targetDate必須（YYYY-MM）、note任意（最大500文字） |
| `projectProgressFormSchema` | 案件×週次進捗率入力フォーム（`EvmPanel`） | projectId必須（uuid）、weekKey必須（YYYY-Www形式）、progressRate 0〜100（送信時に0.0〜1.0へ変換） |
| `loginFormSchema` | ログインフォーム（`LoginPage`、postgresモード専用） | email必須（メール形式）、password必須（空文字不可） |
| `createUserFormSchema` | ユーザー追加フォーム（`CreateUserDialog`、admin限定のユーザー管理画面） | email必須（メール形式）、name必須（1〜100文字）、password 8文字以上、role必須（admin/editor/viewer）。サーバー側`server/src/routes/users.ts`のバリデーションと一致させる |

`validateJsonImport()`: JSONインポート時のフォーマットバリデーション
