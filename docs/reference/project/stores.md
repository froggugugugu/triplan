# Zustandストア一覧（責務の詳細）

> [`docs/project.md`](../../project.md) から分割した詳細リファレンス。常時ロードされないため、必要なときにこのファイルを直接Readする。

## Zustandストア一覧

| ストア                   | 責務                                                         |
| ------------------------ | ------------------------------------------------------------ |
| `app-store`              | 年度管理、テーマ、フォントサイズ、ローディング、初期設定ウィザード状態（`setupCardDismissed`/`demoDataActive`は永続化、`isSetupWizardOpen`/`setupWizardInitialStep`は非永続） |
| `projects-store`         | 案件CRUD、ツリー構造、コード自動採番                         |
| `members-store`          | 担当者CRUD、役割マスタ抽出、課別・未所属・年度内在籍セレクタ |
| `team-store`             | 部門・課CRUD（組織階層管理）                                 |
| `companies-store`        | 所属会社CRUD（全社共通マスタ、内部リソースフラグ=isInternal、旧isProper。取引先属性=インボイス登録番号・支払サイトは`CompanyExtras`引数で追加/更新、undefined=変更なし/null=クリアの3値）、削除時のメンバーcompanyId解除 |
| `assignment-note-store`  | 体制メモ（`assignmentNotes`）のCRUDと、アサイン表スナップショット（`assignmentSnapshots`、追記専用＝更新アクションなし・削除は可）のCRUD。どちらも`/assignment`が参照する「アサイン表の周辺情報」のため1ストアにまとめる |
| `assignment-store`       | アサイン管理CRUD、月次配分値の更新（計画は1.0上限）、実績の例外入力`updateActualMonthlyValue`（null=クリア、計画と同値はキー削除の正規化）・計画外実績の追加`addActualEntry`（該当レコードが無ければmonthlyValues空で新規作成）、担当者別月次集計。**月次締めガード**（P1-b）: 締め済み月は計画・実績の変更、締め月に値を持つレコードの削除を6アクション全ての前段で拒否（actuals-storeの締め状態をgetState()参照） |
| `budget-store`           | 部門予算（内訳から自動計算）・その他予算変更（増額/減額、旧「予算追加履歴」）・部門予算内訳（月次実績・実績明細・更新・削除アクション含む）・AI利用費（部門/課単位・メンバー別配分含む）・SaaS費用（月次実績アクション含む）のCRUD、人件費/プロパー人件費算出セレクタ、概算単価・係数（全社共通デフォルト＋案件別）の管理、部門予算俯瞰セレクタ、全部門横断集計セレクタ（`getBudgetOverviewForDivisions`・`getAiUsageTotalForDivisions`・`getAiUsageBudgetTotalForDivisions`・`getSaasAnnualCostTotalForDivisions`） |
| `personnel-plan-store`   | 人員計画の4固定区分（人件費内部リソース/外部リソース・追加予定内部リソース/外部リソース、旧プロパー/プロパー以外）のCRUD、月別予定人数・実績人数の管理、実績人数自動算出セレクタ |
| `project-progress-store` | 案件×週次進捗率スナップショット（`projectProgressEntries`）のCRUD、`setWeeklyProgress`（upsert）アクション。EVM（PV/EV/AC）機能のEV算出に使用（現在はWBS完了チェックからの工数加重導出が主軸で、本ストアは明示的な手入力の上書きとして優先される） |
| `estimate-store`         | 見積スナップショット（`estimateSnapshots`）の追記専用CRUD。`recordEstimate`（版を案件内で自動採番。方法と根拠の整合をZodで検証し、通らなければ何も書かずnull）・`revokeLatestEstimate`（最新版のみ削除）・`getEstimateHistory`/`getLatestEstimate`。投稿者名はサーバーがスタンプ |
| `project-baseline-store` | 計画のスナップショット（`projectBaselines`）のCRUD、`freezeBaseline`（版を自動採番して凍結）・`revokeLatestBaseline`（最新版のみ取り消し可）アクション、`getActiveBaseline`/`getBaselineHistory`セレクタ。EVMのPV（計画値）の基準線。非公開の設計文書参照 |
| `risk-store`             | リスク登録簿（`riskEntries`）のCRUD（非公開の設計文書）。確率×影響の3段階評価・対応方針・オーナー（弱参照）・対応期限。追記専用にしない（評価の見直しが本質、変更履歴は監査証跡が拾う）。重大度は保存せず`deriveRiskSeverity`で都度導出 |
| `org-design-store` | 組織設計の案（`orgDesignDrafts`）。`createDraft`（現在の課・所属を`createDesignFromCurrentOrg`で複製）・`duplicateDraft`・`renameDraft`（trim後1〜100文字以外はfalse）・`saveDesign`（teams/placementsのみ更新、楽観ロック）・`deleteDraft`。**本番の team-store / members-store へは書き込まない** |
| `member-preference-store` | 担当者の希望（`memberPreferences`）。`savePreference`は1担当者1件のupsert（`CreateMemberPreferenceSchema`で検証し、了解日なし等は保存せずfalse）・`deletePreference`（了解の取り下げ）。postgresモードはサーバーが閲覧範囲を絞って返す |
| `change-request-store`   | 変更管理（`changeRequests`）のCRUD。`approveChangeRequest`は受注額差分・新納期を対象Projectの`contractAmount`/`masterDueDate`へ自動反映（工数差分はWBSへの手動反映＋再凍結を促す）。承認/却下済みは削除不可（追跡性の保持）。PROPOSAL §4.4 |
| `billing-milestone-store` | 請求マイルストン（`billingMilestones`）のCRUD・ステータス遷移（予定→検収済→請求済→入金済）。売上計上・受注残の算出は`features/projects/utils/billing-milestone-utils.ts`。PROPOSAL §4.3 |
| `efforts-store`          | WBS工数データ管理                                            |
| `schedule-store`         | スケジュールエントリ、工程依存関係                           |
| `schedule-settings-store`| 工程定義（案件×1レコード=`PhaseSettingsEntry`、最大15件、色・有効/無効・並び順）。DataAdapter経由（第11弾）、旧Zustand persist（独立localStorageキー`schedule-settings-storage`）からの1回限りレガシー移行を内蔵 |
| `wbs-settings-store`     | WBS工数列設定（案件×1レコード=`WbsSettingsEntry`、最大10列）。DataAdapter経由（第11弾）、旧Zustand persist（独立localStorageキー`wbs-settings-storage`）からの1回限りレガシー移行を内蔵 |
| `wbs-template-store`     | WBSテンプレートのストック管理（CRUD）、初回のみ標準テンプレートを1件シード（seedStandardTemplate） |
| `document-template-store` | ドキュメントテンプレート（`documentTemplates`）のCRUD、初回のみIPA準拠の標準テンプレート一式をシード（seedStandardDocumentTemplates、`shared/data/document-template-master.ts`の固定UUIDを維持＝WBSテンプレートからの紐づけ前提） |
| `csv-mapping-store`      | 汎用CSVマッピングプロファイル（`csvMappingProfiles`）のCRUD、`getProfilesForSource`セレクタ（sourceKey×direction絞り込み・名前順）。 |
| `task-sync-store`        | 外部完了同期ログ（`taskSyncLogs`、P1-c改）の追記専用CRUD（`addTaskSyncLog`）。完了状態そのものはprojects-storeが受け皿 |
| `tech-tags-store`        | 技術タグCRUD、カテゴリ/サブカテゴリCRUD、マスタデータシード   |
| `skill-store`            | スキル評価履歴（`skillEvaluations`）・成長ロードマップ目標（`skillRoadmapGoals`）の追記専用CRUD、現在レベル・現在目標導出セレクタ |
| `tour-store`             | ガイドツアー状態管理（永続化なし）。保持するのは開始/終了と対象ツアーのみで、**現在のステップ位置は持たない**（react-joyride 3.2はステップ遷移中に非同期段階が入り、外部から`stepIndex`を制御すると更新が漏れてツアーが止まるため）        |
| `actuals-store`          | 月次実績の周辺エンティティ（P1-a）: 確定マーク`monthlyActualsConfirmations`（全社×月1レコード、`confirmMonth`は既存があればconfirmedAt更新=再確定。締め済み月は拒否）・CSV取込履歴`actualsImportLogs`（追記専用`addImportLog`）・**月次締めイベント`monthlyCloseEvents`**（P1-b。追記専用`closeMonth`/`reopenMonth`（解除は理由必須）、締め状態は月ごとの最新イベントから導出=`isMonthClosed`/`getLatestCloseEvent`）のCRUD、`getConfirmation`セレクタ |
| `auth-store`             | postgresモード専用の認証状態（アクセストークンはメモリ上のみ、localStorage/sessionStorageには保存しない）。login/logout/restoreSession（restoreSessionはsingle-flight＝並行リフレッシュによるトークンローテーション競合でセッションが失われるのを防ぐ） |

全ストアはZustand 5 + localStorage永続化（jsonStorage経由）。tour-store・auth-storeのみ永続化なし。
