# ディレクトリ構成: `src/shared/`・`infrastructure/`・`stores/`・`lib/`

> [`docs/architecture.md`](../../architecture.md) から分割した詳細リファレンス。常時ロードされないため、必要なときにこのファイルを直接Readする。

```
src/
├── shared/
│   ├── ag-grid-theme.ts   # AG Grid共通テーマ（shadcn/ui準拠、ダークモード自動対応）
│   ├── api/
│   │   └── external-tools-api.ts # 外部ツール接続管理＋API起票実行のAPIクライアント。
│   │                        features/admin（接続設定画面）とfeatures/projects（WBSのAPI起票）の
│   │                        双方から使うためshared配置（features間の直接依存は禁止）。
│   │                        APIトークンは書き込み専用でレスポンス型に平文フィールドを持たない
│   ├── components/
│   │   ├── DataExport.tsx / SnapshotHistory.tsx # JSONエクスポート/インポートとスナップショット履歴。
│   │   │                    features/reportsから移設（features/adminから使うため。
│   │   │                    features間の直接依存は禁止）
│   │   ├── Layout.tsx     # アプリ全体のレイアウト（ナビゲーション・アカウントメニュー・
│   │                    **アカウントメニュー**（postgresモードのみ。ログイン中のユーザー名/メール/
│   │                    ロールとログアウト。: auth-storeのlogoutは以前から実装済みだったが
│   │                    UIから呼ぶ導線が無く、ログイン後に抜ける手段が無かった）・
│   │   │                    **横断検索パレット**（Cmd+K/Ctrl+Kのkeydownをdocumentで
│   │   │                    購読して開閉、サイドバー先頭にGlobalSearchTriggerを配置）を含む。
│   │   │                    ナビは業務の時系列でグループ化（先頭=ダッシュボード／「計画」=
│   │   │                    チーム・プロジェクト・WBS・スケジュール・アサイン・予算管理／「月次」=
│   │   │                    月次実績・月次明細・レポート）。現在地はbg-primary/10+text-primaryで
│   │   │                    ホバー（accent）と区別。/reportsへの導線はサイドバー「レポート」に一本化
│   │   │                    （旧「データ管理」ボタンは廃止）。ポップオーバーはセクション化: 冒頭に
│   │   │                    年度開始月・金額の表示（local）／「全社設定値」=概算単価・係数・為替レート・
│   │   │                    人月換算・スキルレビュー周期・時間換算・ベースライン乖離閾値／
│   │   │                    「マスタ・テンプレート」=WBSテンプレート・ドキュメントテンプレート・技術タグ・
│   │   │                    所属会社／「管理者」=ユーザー管理・SSO設定・通知設定。max-h-[85vh]でスクロール可）
│   │   ├── NameInputDialog.tsx # 名称入力汎用ダイアログ（部門/課/所属会社の追加・編集で使用）
│   │   ├── FinancialAccessGuard.tsx # 金額専用ページ（/budget・/statements）のページ単位ガード。
│   │   │                    useCanViewFinancialsがfalseならページ本体を描画せず案内カードへ差し替える（フェイルクローズ）
│   │   ├── CsvMappingExportDialog.tsx # 汎用CSVエクスポートのマッピングエディタ。列の
│   │   │                    有効/無効・並び替え・ヘッダ名改名・ヘッダ有無をGUI編集し、プレビュー付きで
│   │   │                    BOM付きCSVをダウンロード。プロファイル保存/更新/削除。保存済みプロファイルに
│   │   │                    無い新フィールドは無効で末尾補完（ソース進化に耐える弱参照）。呼び出し側が
│   │   │                    ソース定義＋行データを渡す（汎用機能＋機能別特化の分担）
│   │   ├── GlobalSearchDialog.tsx # 横断検索パレット。Cmd+K（Ctrl+K）または
│   │   │                    サイドバー先頭の検索ボタンで開き、プロジェクト・タスク・担当者を
│   │   │                    1つの検索語で引いて該当画面へ遷移する（プロジェクト→
│   │   │                    /project-summary、タスク→ルート案件の/wbs、担当者→/team）。
│   │   │                    検索は`shared/utils/global-search.ts`の純関数で行うため
│   │   │                    cmdk内蔵フィルタは`shouldFilter={false}`で無効化する（二重に
│   │   │                    絞られて結果が消えるため）。GlobalSearchTriggerも同ファイル
│   │   ├── GettingStartedCard.tsx # ダッシュボード最上部の「はじめに」カード。業務データ空 or
│   │   │                    デモ試用中のみ表示、閉じると永続的に非表示（setupCardDismissed）。自動モーダルは
│   │   │                    開かない設計（空localStorageで起動する既存E2Eとの共存・再表示の煩わしさ回避）
│   │   ├── SetupWizardDialog.tsx # 初期設定ウィザード。ようこそ（デモ分岐/本番切り替え）→
│   │   │                    基本設定→組織→担当者→最初のプロジェクト（標準WBSテンプレート適用）→完了。
│   │   │                    各ステップ即コミット・スキップ可。features間依存禁止のためEvmPanelと同じ
│   │   │                    shared/components配置（開閉状態はapp-store、DashboardPageがマウント）
│   │   ├── EvmPanel.tsx   # EVM（PV/EV/AC）表示・週次進捗率入力。features/budgetから移設（依存方向ルール遵守）。部門文脈の書き込み操作を持つため、ProjectEvmDialogとは別コンポーネント。`readOnly` prop（デフォルトfalse）で週次進捗率入力フォームを非表示にでき、DashboardPageは常時readOnlyで使用（入力はWbsPage側の完了フラグロールアップに一本化）。ベースライン導入（非公開の設計文書）に伴い、当初計画（v1）の点線・版切替点の縦線・参照水平線（受注額／承認予算枠）・ベースライン履歴パネルを追加。BACの供給源はWBS工数0のとき予算枠（BudgetBreakdown）へ自動フォールバックする
│   │   └── ui/            # shadcn/uiコンポーネント（20個）
│   │       ├── badge, button, card, collapsible, combobox, command
│   │       ├── dialog, hover-card, input, label, multi-select-combobox, numeric-input
│   │       ├── popover, select, table, tabs, textarea, toast, toaster
│   │       └── theme-color-picker
│   ├── data/
│   │   ├── demo-data.ts       # デモデータ生成（generateDemoData）。元features/reports/data/から移設
│   │   │                        （初期設定ウィザードからも使うためshared化、旧位置はリエクスポート。
│   │   │                        demo-members.ts/demo-projects.tsも同時移設）
│   │   ├── tech-tag-master.ts  # 技術タグマスタデータ（17カテゴリ・199タグ）
│   │   ├── document-template-master.ts  # ドキュメントテンプレートのマスタデータ。IPA公開情報（共通フレーム2013・非機能要求グレード2018・機能要件の合意形成ガイド・ユーザのための要件定義ガイド第2版）ベースの33テンプレート。固定UUID（d0c00000-...連番）でSTANDARD_WBS_TEMPLATEからの紐づけを保証。本文はOKF v0.2準拠（frontmatterのtype必須）。createEmptyOkfContent（新規作成時の初期本文）もここ
│   │   └── wbs-template-master.ts  # 標準WBSテンプレートのマスタデータ（STANDARD_WBS_TEMPLATE）。要求整理〜リリース判定の全14工程。要求整理/要件定義/基本設計/詳細設計/実装/受け入れテスト/移行/リリース判定はIPA共通フレーム（SLCP-JCF）・非機能要求グレード準拠の成果物（要件定義書=業務要件/機能要件/非機能要件の3種、基本設計書=システム方式/画面/帳票/バッチ/データベース/外部IF設計書+結合テスト計画書の7種等）単位まで子ノードへ分解済み（2026-08-13拡充。ソフトウェア開発分析データ集2022は定量メトリクス集で成果物一覧を持たないため対象外とし、共通フレーム系の実務資料を参照）。UT/ITa/ITb/負荷試験は方針/計画/実施/報告の4点セット、セキュリティ試験/システムテストは単一ノードのまま。wbs-template-storeが初回シードに使用（stores→features依存禁止のためshared/data配下に配置）
│   ├── hooks/
│   │   ├── use-toast.ts
│   │   ├── use-theme-color.ts
│   │   └── use-financial-visibility.ts  # 金額情報の表示可否（useCanViewFinancials。
│   │                                      postgresモード=financials:read権限／localモード=app-storeの表示トグル）
│   │   ├── use-org-labels.ts  # 組織階層の呼称（useOrgLabels。全社設定orgLevel1Label/orgLevel2Label、既定「部門」「課」）
│   ├── types/             # Zodスキーマ定義（23ファイル + index.ts、estimate-snapshot.ts（superRefineで方法と根拠の整合を検証、`.partial()`が要る場面はEstimateSnapshotFieldsSchema）含む、budget.ts / company.ts / personnel-plan.ts / skill.ts / project-progress.ts / project-baseline.ts / change-request.ts / billing-milestone.ts / wbs-template.ts（再帰スキーマ、z.lazy使用）含む）
│   └── utils/             # 共有ユーティリティ
│       ├── tag-filter.ts       # タグ検索フィルタ
│       ├── project-display.ts  # プロジェクト名表示（確度付き）
│       ├── member-filter.ts    # メンバー部門・課フィルタ、所属会社複数選択フィルタ(filterMembersByCompanyIds)・
│       │                         内部/外部リソースフィルタ(filterMembersByInternal、budget-utils.tsの
│       │                         isProperMemberと同一セマンティクスを再利用)
│       ├── navigation-utils.ts # URLクエリパラメータと location.state の優先順位決定
│       ├── budget-utils.ts     # 売上予算・見込売上計算、案件概算予算額(calcProjectEstimateBudget(s))・
│       │                         人日→人月換算定数(WORKDAYS_PER_MONTH)・為替レート適用値取得
│       │                         (getApplicableExchangeRate)・＄→万円換算(convertUsdToManYen)・
│       │                         部門内SaaS契約群の実績合計(calcSaasContractsActualTotal、
│       │                         部門予算タブのSaaS費用列「実績合計」行に使用)・
│       │                         全部門横断集計ヘルパー(sumAcrossDivisions、)・
│       │                         万円建て金額表示の共通フォーマッタ(manYenFormatter、固定小数点2桁。
│       │                         予算管理画面全体の金額欄で使用、docs/development-patterns.md §7.5参照)
│       │                         （いずれもstores/budget-storeから参照するためshared化）
│       ├── allocation-input-utils.ts # 月次配分値入力のパースコア（parseAllocationInput、
│       │                         上限はoptions.maxで任意指定。計画=features/assignmentの
│       │                         parseAssignmentInputはmax:1のラッパー、実績=features/actualsは
│       │                         上限なしで使う。features間依存回避のためshared化、P1-a）
│       ├── effort-utils.ts     # WBS工数計算
│       ├── iso-week-utils.ts   # ISO 8601週番号ユーティリティ（getIsoWeekKey・getIsoWeekMonday/Sunday・
│       │                         getIsoWeeksInRange）＋ formatDateOnly（Date→"YYYY-MM-DD"、ローカル日付基準。
│       │                         toISOString().slice(0,10)はUTC変換で前日にずれるため、日付のみの値
│       │                         （completedAt・approvedAt等）の生成には必ずこちらを使う）。
│       │                         EVM機能が参照するためshared化。既存の月次キー（"YYYY-MM"）とは独立した時間軸
│       ├── wbs-progress-utils.ts # WBS進捗率の算出コア（calcWbsProgress=タスク数ベース・
│       │                         calcWbsProgressWeighted=工数加重・calcWbsProgressAtDate=任意基準日時点
│       │                         （completedAt基準、工数0の案件はタスク数ベースへ自動フォールバック）・
│       │                         hasAnyCompletedTask）。EV算出のためevm-utils（shared層）から参照するので
│       │                         shared化し、features/projects/utils/wbs-progress-utils.tsはリエクスポート＋
│       │                         getIncompleteVisibleIds（UI専用フィルタ）のみを持つ
│       ├── project-code-generator.ts # プロジェクトコード自動採番（generateProjectCode）。元features/projects/
│       │                         utils/code-generator.tsから移設（旧位置はリエクスポート）
│       ├── wbs-template-apply.ts # WBSテンプレート一括適用（applyWbsTemplate、store非依存・注入型）。
│       │                         元features/projects/utils/wbs-template.tsから移設（│       │                         初期設定ウィザードからも使うためshared化、旧位置はリエクスポート）
│       ├── csv-utils.ts        # CSV生成（escapeCsvField=RFC 4180準拠エスケープ・toCsvContent・
│       │                         CSV_BOM。Excelの文字化け防止のためUTF-8 BOM付きを既定とする）＋
│       │                         パース（parseCsv=RFC 4180準拠。BOM除去・クォート内カンマ/改行/
│       │                         2連クォート・CRLF/LF/CR混在・空行スキップ。CSV取込で使用、P1-a）
│       ├── alert-utils.ts      # アラートセンターのコアロジック（collectDueDateAlerts=納期超過critical/
│       │                         線形予測による遅延予測warning・collectUpcomingDueDateAlerts=納期接近info
│       │                         （14日前〜当日、超過案件は出さない=二重通知回避）・
│       │                         collectBillingAcceptanceAlerts=検収予定日の接近info/経過warning
│       │                         （plannedのみ、文面に金額を含めない）・collectRiskDueDateAlerts=
│       │                         リスク対応期限の超過warning/接近info（open・realizedのみ、非公開の設計文書）・collectCapacityAlerts=稼働率上限超過・
│       │                         collectBaselineStaleAlerts・collectSaasRenewalAlerts・
│       │                         collectBudgetOverrunAlerts=受注額比80%warning/100%critical・sortAlerts。
│       │                         DUE_SOON_THRESHOLD_DAYS=固定14日。すべて純粋関数で「現在日時」は引数注入）
│       ├── profitability-utils.ts # 案件別損益（calcProjectProfitability・isProjectBudgetOverrun）。
│       │                         budget-utils（evm-utils非依存）とevm-utils（budget-utils依存）の
│       │                         両方を使うため、循環依存を避けて独立ファイルに配置。
│       │                         元features/budget/utils/expense-budget-utils.tsから移設（リエクスポート維持）
│       ├── resource-histogram-utils.ts # 山積みグラフ用の集計（isMemberActiveInMonth・
│       │                         calcResourceHistogram＝月次の需要（アサイン合計）と供給（在籍メンバーの
│       │                         capacityRatio合計）・calcProjectMemberHistogram＝案件内の月×メンバー配分）
│       ├── evm-utils.ts        # EVM（PV/EV/AC）コアアルゴリズム。2026-08-15に「入力させないEVM」
│       │                         （非公開の設計文書）へ刷新: calcPvFromBaseline（ベースラインの
│       │                         月次計画コストを配分の形として使いBACへスケール）・getActiveBaseline（最大version）・
│       │                         buildBaselineSnapshot（現在のアサイン計画から凍結内容を構築）・
│       │                         resolvePlannedCost/rebuildPlannedCostWithLatestPrices（単価モードfrozen/latest）・
│       │                         isBaselineStale（±10%乖離で再凍結を促す）・resolveProgressRateAtWeek
│       │                         （週次手入力優先→WBS完了チェックの工数加重へフォールバック）・
│       │                         calcEvmSeries（オブジェクト引数化）。以下は従来からの関数:
│       │                         getFiscalYearWeekKeys・calcPvAtWeek（直線按分・ベースライン未凍結時のフォールバック）・
│       │                         getProgressRateAtWeek/calcEvAtWeek（直近値保持）・calcAcAtWeek（AssignmentEntry×Memberの
│       │                         人件費単価を月内日数按分で週次集計。契約単価優先・通常単価へフォールバック、で
│       │                         BudgetBreakdown.actualRecordsベースから置き換え）・isEvmInputEligible/isEvmChartEligible
│       │                         （対象案件抽出）・calcEvmSeries（統合）・
│       │                         SUMMARY_BUDGET_PROGRESS_GAP_THRESHOLD/SUMMARY_SPI_WARNING_THRESHOLD
│       │                         （プロジェクトサマリー判定の既定閾値。stores→features
│       │                         依存禁止のためBASELINE_STALE_THRESHOLDと同じくここに置き、
│       │                         features/projects/utils/project-summary-utilsがリエクスポート）。features/budgetから共有化
│       │                         （依存方向ルール遵守）+ __tests__/
│       ├── assignment-snapshot-utils.ts # アサインスナップショットの取得と差分（純関数）。
      │                         buildAssignmentSnapshotEntries=対象案件のアサインをタスク×メンバー
      │                         粒度で記録（配分が全て0の行は含めない・元オブジェクトを共有しない）／
      │                         diffAssignmentSnapshot=added/removed/changedと変化した月・増減量／
      │                         summarizeAssignmentDiff。**変化が無い行は返さない**（差分だけを見せる）
      ├── master-import-core.ts # マスタCSV一括登録の列定義とヘッダ解決（純関数）。
      │                         COLUMN_SPECS=**列定義の正本**（テンプレート生成・取込・画面表示が
      │                         これ1つを読む）／normalizeHeader=必須マーク`*`・前後空白・全角英数の
      │                         吸収／detectMonthColumns=YYYY-MM列の検出／buildTemplateCsv=
      │                         ヘッダのみのBOM付きテンプレート（**記入例の行は入れない**＝
      │                         消し忘れでサンプルが登録される事故の防止）
      ├── master-import-members.ts / master-import-projects.ts / master-import-assignments.ts
      │                       # 3種の突合（純関数）。既存と一致した行はskipして報告
      │                         （移行は新規登録が主）。projectsは親コードで階層を解決し
      │                         **行順に依存しない**（循環・親不明・5階層超はskip）、
      │                         assignmentsは横持ち（月が列）で締め済み月のセルを落とす
      ├── master-import-preview.ts # 「実際に登録される内容」の整形（純関数）。
      │                         既存マスタのidは名前へ引き直し、これから作るものは「（新規）」と
      │                         示す／プロジェクトは階層をインデントで／アサインは月を列にして
      │                         合計つき（配分の無い月は空欄＝「入力した0」と区別）。
      │                         **取り込まない行は含めない**（登録されるものだけを見せる）
      ├── master-import-apply.ts # 取込の適用。ストアのアクションを**注入**して
      │                         受け取りストア非依存（applyWbsTemplateと同じ形）。
      │                         マスタは重複作成せず、プロジェクトはlevel昇順＝親が先に作られる
      ├── color-contrast.ts   # 背景色に対して読める文字色を選ぶ（純関数）。
      │                         getRelativeLuminance/getContrastRatio（WCAG 2.1）と
      │                         pickReadableTextColor（白/黒の二択。**分岐点でも約4.58:1で
      │                         必ずAAを満たす**）。技術タグの色はユーザー指定のため
      │                         文字色を#fff固定にするとコントラスト不足になる（実測166件）
      ├── task-assignee-utils.ts # WBSの担当者表示（純関数）。
      │                         buildTaskAssigneeMap=タスクid→主担当（対象期間の配分が最大の
      │                         メンバー、同率は氏名比較で決定論的）＋他N名。実績の例外入力が
      │                         ある月は実績を優先（AC解決と同じ規則）。**タスク自身は担当者を
      │                         持たない**ためアサインからの派生表示で、データ追加はしない。
      │                         行ごとに解決するとO(タスク数 × アサイン数)になるため
      │                         呼び出し側（WbsPage）が一度だけMapを構築して渡す
      ├── my-task-utils.ts    # 「自分の担当タスク」の行モデル（純関数）。
│       │                         buildMyTaskRows=自分に配分があるタスクを期日の近い順
│       │                         （期日なしは末尾）で返す。対象月の配分が全て0のアサイン・
│       │                         削除済みタスクへの参照は行にしない。期日はresolveTaskDueDate
│       │                         を再利用。**金額を一切扱わない**（partnerが主な受益者のため）
│       ├── global-search.ts    # 横断検索のコア（純関数）。searchEntities=
│       │                         プロジェクト・タスク・担当者を検索語（コード・名前の部分一致、
│       │                         英字は大小無視）で引き、遷移先パスまで解決する。
│       │                         空クエリは空配列（全件を返してパレットを埋めない）・上限20件・
│       │                         退職者（isActive=false）は対象外・並びは完全一致＞前方一致＞
│       │                         部分一致→プロジェクト＞タスク＞担当者→辞書順の決定論的ソート
│       ├── task-phase-utils.ts # WBSタスクと工程（スケジュール）の紐づけコア（純関数）。
│       │                         **id→ノードの索引を配列参照キーのWeakMapでキャッシュする**
│       │                         （呼び出しごとに索引を作るとループから呼ばれた際に
│       │                         O(n²)になり、実測10,300件で22,990ms→18.9msへ改善）。
│       │                         `Project.phaseKey`を辿るfindRootProjectId／resolveTaskPhaseKey
│       │                         （自身→最も近い祖先を継承。循環参照でも無限ループしない上限つき）／
│       │                         resolveTaskDueDate（工程のScheduleEntry.endDate＝API起票の期日。
│       │                         工程未設定・スケジュール未登録はnullで、案件のマスター納期では代用しない）／
│       │                         calcPhaseProgress（工程に属するリーフの工数加重進捗。**紐づくタスクが
│       │                         0件ならnull**＝ガントで0%と描き分ける）。**task-creation-core.tsと同じく
│       │                         外部型に依存しない最小インターフェース**で受け、サーバー（API起票）と共用する
│       ├── task-sync-core.ts   # 完了同期の突合コア小関数（extractCodeFromSubject・
│       │                         resolveDateOnly）。クライアント（完了CSV取込）とサーバー
│       │                         （Webhook受信）の両方が使うためshared化（Phase 2。
│       │                         features/projects/utils/task-sync-utils.tsはリエクスポート）
│       ├── cost-breakdown-utils.ts # 原価4区分の算出コア（純関数、
│       │                         非公開の設計文書）。calcDivisionOverheadPool=
│       │                         部門×年度の間接費原資（一般経費実績明細＋SaaS実績＋AI利用費実績の
│       │                         為替換算）・buildProjectCostBreakdownMap=案件id→労務費（内部リソースの
│       │                         calcAcAtWeek）/外注費（実人件費−労務費=丸め跨ぎでも恒等式保証）/
│       │                         直接経費（案件紐づき実績明細=実付帯費用と同値）/間接費配賦
│       │                         （直接工数比例・divisionId未設定は0・基準合計0はゼロ除算回避）
│       ├── settlement-utils.ts # 準委任の月次精算コア（純関数）。精算幅の判定
│       │                         （幅内/控除/超過・境界は幅内）・時間換算・適用契約エントリ解決
│       │                         （getApplicableContractEntry）。statement-utilsとTeamMemberDialogが参照
│       ├── function-point-utils.ts # 簡易FP（NESMA）の重み表と換算（純関数）。
│       │                         FP_WEIGHTS（概算法=ILF×35/EIF×15、推定法=EI×4/EO×5/EQ×4/ILF×7/EIF×5）・
│       │                         calcTotalFp（数えない種別は0）・convertFpToEffortDays（2桁丸め）・
│       │                         calcEstimateAmount（calcProjectEstimateBudgetを再利用＝WBS概算と同じ丸め）・
│       │                         buildFpEstimate
│       ├── uncertainty-cone.ts # 不確実性コーンの定数表（純関数）。UNCERTAINTY_CONE
│       │                         （McConnell 6段階の幅。保存せず段階から都度導出）・calcConeBounds・
│       │                         calcErrorRatio（見積0はnull）・isWithinCone（境界は内側、epsilon）
│       ├── estimate-snapshot-utils.ts # 版の選択と差分（純関数）。getSnapshotsForProject
│       │                         （version昇順）・getLatestSnapshot・getLatestFpSnapshot・
│       │                         diffEstimateSnapshots（前版比とFP項目の追加/削除/件数変化を名前一致で。
│       │                         保存しない）
│       ├── estimate-retrospective-utils.ts # 振り返り（純関数）。calcActualEffortDays
│       │                         （当月以前の`actual ?? planned`合算×人日/人月、削除済みメンバー除外）・
│       │                         calcActualCostAmount（calcAcAtWeekを当週で）・resolveActualReference
│       │                         （完了時の記録があればそれ）・buildRetrospectiveRows・
│       │                         calcActualHoursPerFp（最新FP版のtotalFp）・median・calcCalibrationHint
│       └── skill-utils.ts      # レベル順序・ラベル定数(SKILL_LEVEL_ORDER/SKILL_LEVEL_LABELS)・
│                                  レベルアップ判定(isSkillLevelUp)・現在レベル導出(getCurrentSkillLevel)・
│                                  ロードマップ進捗算出(calcSkillRoadmapProgress)・
│                                  定期評価レビュー要否判定(isSkillEvaluationStale、固定3ヶ月
│                                  SKILL_REVIEW_CYCLE_MONTHS)（stores/skill-store・features/team・
│                                  features/dashboardから参照するためshared化）
│
├── infrastructure/
│   ├── storage/           # json-storage, snapshot-storage（+ index.ts）
│   ├── validation/        # schemas（+ index.ts）
│   └── adapters/          # DataAdapter抽象化（非公開の設計文書）。
│                             update()の第4引数`options.expectedUpdatedAt`で楽観ロック（│                             PostgresApiAdapterはX-Expected-Updated-Atヘッダーへ載せ、
│                             LocalJsonAdapterは受け取るが検証しない＝単一ユーザー前提）。
│                             data-adapter.ts（インターフェース）・entity-registry.ts（EntityMap、24エンティティ）・
│                             authenticated-fetch.ts（postgresモード用の認証付きfetch共通実装、401時1回だけの
│                             自動リトライ）・local-json-adapter.ts（既存jsonStorageのラップ、挙動変更なし）・
│                             postgres-api-adapter.ts（APIサーバーへfetch）・adapter-factory.ts
│                             （VITE_STORAGE_MODEでの選択。postgresモードは現状フェーズ6の業務エンティティ
│                             ルート実装待ちのためエラーを投げる）
│
├── stores/                # Zustand状態管理（25ストア（csv-mapping-store・risk-store・estimate-store含む） + reload-all-stores.ts（全21ストア再読込・loadDemoData・clearAllBusinessData）+ index.ts、budget-store / companies-store / personnel-plan-store / skill-store / project-progress-store / project-baseline-store / change-request-store / billing-milestone-store / wbs-template-store / document-template-store / auth-store含む）
│
├── test/                  # テストセットアップ（setup.ts のみ）
│
└── lib/
    └── utils.ts           # cn()ヘルパー（clsx + tailwind-merge）
```
```
