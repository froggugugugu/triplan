# データモデル

> **このファイルは毎セッション常時ロードされる。** 索引と要約だけを置き、非空行300行以内を保つ。
> 機能の経緯・設計判断・フィールド仕様などの詳細は `docs/reference/` 配下へ書き、ここからは1行で参照する。

Zodスキーマ定義は `src/shared/types/` に配置。
フォームバリデーションは `src/infrastructure/validation/schemas.ts` に配置。

## エンティティ索引

フィールド仕様・派生型・設計判断は右列のリファレンスを参照（`reference/data-model/`配下）。

| エンティティ | 型定義（`src/shared/types/`） | 概要 | 詳細 |
| ------------ | ----------------------------- | ---- | ---- |
| Project | `project.ts` | 案件の階層ツリー（最大5レベル）。`level===0`が案件、以降がタスク | [schemas-org-assignment](reference/data-model/schemas-org-assignment.md) |
| Division / Section / Company | `division.ts` `section.ts` `company.ts` | 部門・課・所属会社（全社共通マスタ） | 同上 |
| Member（UnitPriceEntry / ContractUnitPriceEntry） | `member.ts` | 担当者。単価履歴（見積用）と契約単価履歴（支払用）を別管理 | 同上 |
| SkillEvaluation / SkillRoadmapGoal | `skill.ts` | スキル評価履歴・成長目標（追記専用） | 同上 |
| OrgDesignDraft / OrgDesignTeam | `org-design.ts` | 組織設計の試算の案（本番を変えないスナップショット） | [schemas-org-assignment](reference/data-model/schemas-org-assignment.md) |
| MemberPreference | `member-preference.ts` | 担当者の希望（本人了解済み・自由記述なし・people:sensitive-read） | 同上 |
| AssignmentEntry | `assignment.ts` | タスク×担当者の月次配分（計画0〜1、実績は上限なし） | 同上 |
| AssignmentNote / AssignmentSnapshot | `assignment-note.ts` `assignment-snapshot.ts` | 体制メモ・体制の記録 | 同上 |
| RiskEntry | `risk.ts` | リスク登録簿（重大度は保存せず導出） | 同上 |
| EffortEntry | `effort.ts` | WBS工数（案件×列） | 同上 |
| PhaseDefinition / PhaseSettings / ScheduleEntry / PhaseDependency / PhaseSettingsEntry | `schedule.ts` | 工程定義・スケジュール・依存関係 | [schemas-schedule-wbs-master](reference/data-model/schemas-schedule-wbs-master.md) |
| WbsSettings / EffortColumn / WbsSettingsEntry | `wbs-settings.ts` | WBS工数列設定（案件×1レコード） | 同上 |
| WbsTemplate / DocumentTemplate | `wbs-template.ts` `document-template.ts` | テンプレートのストック | 同上 |
| TechTag / TechTagCategory / TechTagSubCategory | `tech-tag.ts` `tech-tag-category.ts` | 技術タグマスタ | 同上 |
| 認証関連（UserRole・Permission・AuthUser） | `auth.ts` | postgresモード専用のロール・権限 | 同上 |
| Snapshot | `snapshot.ts` | 全データのスナップショット履歴（最大20件） | 同上 |
| DivisionBudget / BudgetBreakdown / BudgetAdjustment | `budget.ts` | 部門予算・内訳・その他予算変更 | [schemas-budget](reference/data-model/schemas-budget.md) |
| AiUsageProvider / AiUsageEntry / AiUsageMemberAllocation / ExchangeRateEntry | `budget.ts` | AI利用費（＄建て）・為替レート履歴 | 同上 |
| SaasContract | `budget.ts` | SaaS契約 | 同上 |
| PersonnelPlanEntry | `personnel-plan.ts` | 人員計画（4固定区分） | 同上 |
| ProjectProgressEntry / ProjectBaseline | `project-progress.ts` `project-baseline.ts` | EVMの進捗率・PV基準線。EVMコアアルゴリズムの説明もここ | [schemas-evm-commerce-actuals](reference/data-model/schemas-evm-commerce-actuals.md) |
| ChangeRequest / BillingMilestone | `change-request.ts` `billing-milestone.ts` | 変更管理・請求マイルストン | 同上 |
| MonthlyActualsConfirmation / ActualsImportLog / MonthlyCloseEvent | `actuals.ts` | 月次実績の確定・取込履歴・月次締めイベント | 同上 |
| TaskSyncLog | `task-sync.ts` | 外部完了同期ログ（追記専用） | 同上 |
| CsvMappingProfile | `csv-mapping.ts` | 汎用CSVマッピングプロファイル | 同上 |
| EstimateSnapshot | `estimate-snapshot.ts` | 見積スナップショット（追記専用） | 同上 |
| Database | `database.ts` | 全データ統合スキーマ（JSON永続化用）・全社設定値 | [database](reference/data-model/database.md) |

## その他のリファレンス

| ファイル | 内容 |
| -------- | ---- |
| [reference/data-model/database.md](reference/data-model/database.md) | `Database`の全フィールド・年度月変換ユーティリティ・フォームバリデーション一覧（`infrastructure/validation/schemas.ts`） |
| [reference/data-model/validation-rules.md](reference/data-model/validation-rules.md) | 重要なバリデーションルール（稼働率上限・月次締め・契約単価範囲・楽観ロック・監査証跡・予算集計・EVM・精算など） |
| [reference/data-model/drizzle.md](reference/data-model/drizzle.md) | Drizzle ORMスキーマの設計原則・重要な設計判断・既知の制限事項 |

## データモデル共通の原則

詳細と根拠は各リファレンスにある。スキーマを触る前に該当箇所を読むこと。

- **新フィールドは`optional`で追加する**（既存データのパースを壊さない）。`.default()`は出力型が必須になるため原則使わず、利用箇所で`?? 既定値`する
- **月次データのキーは暦月`"YYYY-MM"`**、週次は`"YYYY-Www"`（ISO週）。日付のみの値は`DateOnlySchema`で暦の実在まで検証する
- **追記専用エンティティ**（更新APIなし）: BudgetAdjustment・SkillEvaluation・SkillRoadmapGoal・ProjectBaseline・EstimateSnapshot・ActualsImportLog・MonthlyCloseEvent・TaskSyncLog。「現況」は保存せず履歴の最新から都度導出する
- **導出値は保存しない**: リスクの重大度・不確実性コーンの幅・見積の差分・月次締め状態・有効なベースライン
- **認証・監査・サーバー専用テーブルから業務テーブルへはFKを張らない**（弱参照）。`TRUNCATE ... CASCADE`の巻き込みと、削除後に証跡を残すため
- **計画（`monthlyValues`）は0.0〜1.0、実績（`actualMonthlyValues`）は0以上・上限なし**。未入力の実績はキー自体を持たず「計画どおり」として扱う
- **締め済み月は計画・実績とも変更不可**（UI／ストア／サーバーの3層で強制）
- **`Create*Schema`にdatetime文字列を含むエンティティをtimestamp列へ入れるときは、サーバーの`beforeCreate`でDateへ変換する**
- appSettingsへフィールドを追加するときは6箇所をセットで更新する（`docs/development-patterns.md` §10の索引から「ストア・永続化」を参照）
