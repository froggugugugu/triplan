# アーキテクチャ

## エントリーポイント

`src/main.tsx` → `src/App.tsx`

全ページコンポーネントはルート単位で遅延ロード（`React.lazy`＋`Suspense`）。
AG Grid・Recharts系は`vite.config.ts`の`manualChunks`で名前付きベンダーチャンクへ分離し、
初回表示はフレームワークコア＋対象ページのみを読む（旧: 単一チャンク2.9MB→初回約700KB）。
1000KB超のチャンク再出現はビルド警告＝退行として扱う。

プロバイダー構成（外側から）:

1. `StrictMode`（React）
2. `QueryClientProvider`（React Query、staleTime: 5分、retry: 1）
3. `BrowserRouter`（React Router）

## ディレクトリ構成（Feature-Sliced Design）

```
src/
├── main.tsx               # エントリーポイント（プロバイダー構成）
├── App.tsx                # ルーティング定義
├── index.css              # グローバルスタイル（Tailwind CSS）
├── vite-env.d.ts          # Vite型定義
│
├── features/
│   ├── projects/          # 案件管理（階層ツリー + WBS + EVM）
│   │   ├── components/    # BaselineFreezeDialog（EVMのPVの基準線を凍結する。版番号・BAC・アサイン計画総額・
│   │   │                    対象月数を提示し、凍結理由を入力させる。WbsPageから起動。最新版の取り消しは
│   │   │                    WbsPage側の確認ダイアログ＝revokeLatestBaseline）,
│   │   │                    ProjectCommerceDialog（商流管理。請求マイルストン（分割割付・4ステータス遷移・
│   │   │                    売上計上/受注残/配分ギャップ警告）と変更管理（申請→承認/却下、承認で受注額・
│   │   │                    納期をProjectへ自動反映）の2タブ。ProjectsPageの「商流」列Receiptアイコンから起動）,
│   │   │                    EvmLineChart（PV/EV/ACの3線チャートのPresentational部品。
│   │   │                    ProjectEvmDialogから抽出しProjectSummaryPageと共用。週ラベル変換
│   │   │                    formatWeekLabelもここ。参照線・ベースライン履歴を持つshared/components/
│   │   │                    EvmPanelのチャートとは別物＝機能差が大きく共通化しない）,
│   │   │                    ProjectResourceHistogram（案件内の月×メンバー別アサイン配分の積み上げ棒。
│   │   │                    PV曲線と同じデータの別表現で、ProjectEvmDialog下部に表示）,
│   │   │                    RiskRegisterDialog（リスク登録簿、非公開の設計文書。案件単位のリスクの一覧・追加・編集・状態変更・削除。重大度は確率×影響から都度導出、ProjectsPageのリスク列ShieldAlertアイコンから起動）,
│   │   │                    ProjectTree, TaskSyncImportDialog（完了CSV取込の3ステップウィザード。ツールプリセット
│   │   │                    （Backlog/Asana/Jira/GitHub/汎用）で列推定・完了語彙・判定モード（Asanaは
│   │   │                    Completed At非空=完了）を初期化。突合=外部ID→件名[コード]→名前、
│   │   │                    複数一致・非リーフskip。書込みはonApplyで委譲）,
│   │   │                    TaskSyncExportDialog（連携用WBSエクスポート。出力形式セレクタは
│   │   │                    TASK_SYNC_EXPORT_FORMATS（=TaskSyncToolからgithubを除いた4値）
│   │   │                    を列挙しツール別ヘッダ出し分け・件名[コード]＋直近親グループ列・BOM付き）,
│   │   │                    ProjectDialog（担当部門選択欄level===0のみ・**所属工程選択欄level>0のみ**
│   │   │                    （選択肢は案件の有効な工程、既定は「上位から継承」。
│   │   │                    有効な工程が0件なら欄ごと非表示＝選べない空セレクタを出さない）・
│   │   │                    完了条件入力欄・コード一意性検証
│   │   │                    （編集時の重複コード変更をブロック）・
│   │   │                    EVMの単価の扱い（evmUnitPriceMode）選択欄含む）, ProjectTreeGrid（列順: レベル/操作/小計/進捗/**担当者**/工数列群/説明/完了条件。
│   │                    担当者列は左固定でアサイン配分から導出した主担当（＋他N名）を表示する
│   │                    （`assigneeOf` propでMapを受け取り、非担当は淡色の「—」）＋**右端固定の「連携」列**（外部タスクへのディープリンク・起票状態の可視化。起票済み＝外部IDのリンク（target=_blank・rel=noopener noreferrer）／URL解決不能＝バッジのみ／未起票＝淡色の「—」。`toolBaseUrls` propでツール→baseUrlを受け取り、AG Gridのcontext経由でcellRendererへ渡す。**右端固定にしているのは列仮想化のため**＝非固定の末尾列は横スクロールするまでDOMに描画されず「一覧で起票状態が分かる」目的を満たせない）。非leaf行の文字色はライト/ダーク共通でデフォルト色を使用。「未完了のみ表示」フィルタ＝未完了リーフとその祖先のみ表示、localStorage永続化。進捗列の完了チェックボックス（最下層タスクのみ）はセルフォーカス時のプレーンEnterでもON/OFFをトグルできる＝Shift/Alt+Enter等の既存ショートカットと衝突しないようsuppressKeyboardEventで進捗列限定にAG Grid既定のEnter動作を上書き）, TechTagSelectDialog, ProjectEvmDialog（単一プロジェクト用EVM読み取り専用）, WhatIfSimulationDialog（人・モノ・金の三位一体強化: WBS工数ベースの概算予算が「高すぎる」と判断された際、どのタスク（機能）を削れば予算に収まりそうかを試算する読み取り専用ダイアログ。ProjectsPageから起動。チェックした（除外指定した）タスクとその配下を`calcWhatIfTotalEffort`（`shared/utils/effort-utils.ts`）で集計から除外し、現在の概算予算・シミュレーション後・削減額を即時表示する。実データ（`EffortEntry`等）は一切変更しない。`ProjectEvmDialog`と同じ設計方針でfeatures/budgetは一切importしない・依存方向ルール遵守）, WbsTemplateDialog（ストックしたWBSテンプレートから選択して適用するだけの軽量ピッカー。作成・編集はWbsTemplatesPageへ集約したため本ダイアログはツリー編集UIを持たない。「テンプレートを管理」ボタンでダイアログを閉じて`/wbs-templates`へ遷移）, WbsTemplateTreeGrid（WBSテンプレート編集用のAG Gridツリー。ProjectTreeGridと同じUX＝ドラッグでの親子変更（rowDrag+onRowDragEnd、自己/子孫ドロップは無視）・展開折りたたみ・インライン編集・操作アイコンでの子タスク追加/削除に加え、キーボードショートカットもProjectTreeGridと完全同一体系（Shift+Enter=下位層追加/Alt+Enter=同階層追加/Alt+←=階層上げ/Alt+→=階層下げ/Shift+←=閉じる/Shift+→=開く、Alt+矢印のブラウザ戻る/進む誤発火防止ラッパーも踏襲）。対象データはEditorNode（WbsTemplateNodeに編集用の安定id・常に配列のchildrenを付与したもの）で、レベル上限やコード採番は持たない）
│   │   ├── pages/         # PortfolioPage（/portfolio。全ルート案件×9ルール判定の健全性一覧＝週次の入口。行構築はutils/portfolio-utils.tsのbuildPortfolioRows）, ProjectsPage（EVM列・スケジュール列追加・「未割当工数」列アイコン実装。EVM列にプロジェクトサマリー遷移のGaugeアイコンを併設）, ProjectSummaryPage（/project-summary。決定論的9ルールの総合判定バッジ＋理由リストと金/モノ/人/リスク/商流の5区画を集約する読み取り専用ページ。金額はセクション単位マスク。?projectId=クエリパラメータ対応・WBS/スケジュール/アサインへの相互リンク）, WbsPage（対象週セレクタ・更新ボタン、EVMアイコン（ProjectEvmDialogを開く）・現在の進捗率の太字表示、「テンプレートを適用」ボタン（WbsTemplateDialogで選択→選択中プロジェクト配下に一括生成。マウント時にwbs-template-storeをロードし、ストックが0件なら標準テンプレートを自動シード）、「連携CSV出力」「完了CSV取込」ボタン＋完了同期履歴（直近5件）表示（適用はupdateProjectsBatchでcompleted/completedAt/外部ID学習のみ書込み＋addTaskSyncLog）を追加）, WbsSettingsPage, WbsTemplatesPage（`/wbs-templates`、システム設定メニューから遷移。WbsPageと同等のUI構成＝テンプレート選択セレクタ＋WbsTemplateTreeGridで新規作成・名称編集・工程/タスクのツリー編集を行う。グリッド操作のたびにupdateWbsTemplateで即時保存、WBS画面のセル編集と同じ即時保存方式）
│   │   └── utils/         # code-generator, tree-utils、portfolio-utils（ポートフォリオの行モデル構築・純関数。buildPortfolioRows=project-summary-utilsの9ルール判定を全ルート案件へ適用し悪い順の決定論ソート（critical→warning→good→unknown、同順位は指摘件数→コード昇順）。ストアゲッター注入型・完了済み案件は行にしない・金額可視性フィルタ後からoverallを導出）、external-task-url（外部タスクURLの解決・純関数、: buildExternalTaskUrl=起票済みタスクへのdeep link（backlog=`{baseUrl}/view/{key}`／jira=`{baseUrl}/browse/{key}`／asana=`app.asana.com/0/0/{gid}`／github=`github.com/{owner}/{repo}/issues/{n}`）。**外部IDが起票時の形式に合致しない／baseUrlがhttps以外・不在／未知のツールスラッグは全てnull**＝誤ったスペース・リポジトリへ飛ばすくらいならリンクを出さない。resolveToolBaseUrls=接続一覧→ツール別baseUrlマップ。`Project.externalSource`はツール名しか持たず接続を特定できないため、**同一ツールでbaseUrlが食い違う複数接続はnull**にしてリンクを抑止する）、task-sync-utils（完了同期コア・全て純関数、: ツールプリセット・列推定suggestTaskSyncMapping・extractCodeFromSubject・resolveDateOnly・collectLeafProjects・buildTaskSyncPlan=外部ID/コード/名前の3段突合＋複数一致skip＋最終行優先・buildWbsExportRows=リーフ＋直近親グループ列のツール別出力）、risk-utils（リスク登録簿の重大度導出・純関数、非公開の設計文書。deriveRiskSeverity=確率×影響3×3の決定論マップ・sortRiskEntries=open→realized→closed／重大度／期限昇順（null末尾）の決定論ソート・各種ラベル定数）、current-phase-utils（現在の工程判定）、project-summary-utils（プロジェクトサマリーの判定ルール・純関数。evaluateSummaryJudgments=9ルール評価（既存のcollectDueDateAlerts/collectCapacityAlerts/collectBudgetOverrunAlerts/isBaselineStale/calcBillingAllocationGapを再利用。新規はR4予算先行・R5 SPI低下・R9重大リスク=リスク登録簿の確率高×影響高がopenでwarning・risks未指定は後方互換で判定しない）・deriveOverallStatus・hasSummaryEvaluationBasis・filterJudgmentsByFinancialVisibility・calcCurrentEvmIndices（直近週のSPI/CPI）・buildProjectTeamRows（体制行、計画ベース・削除済みメンバー除外））、wbs-progress-utils（WBS完了フラグからの進捗率ロールアップcalcWbsProgress・「未完了のみ表示」フィルタ用のgetIncompleteVisibleIds）、wbs-template（applyWbsTemplateのみ。テンプレート定義本体はshared/data/wbs-template-master.tsへ移設済み＝stores→features依存禁止のため。STANDARD_WBS_TEMPLATE/WbsTemplateNode型はこのファイルからも後方互換でリエクスポート。applyWbsTemplateはstore非依存でaddProject/getProjects/templateを注入して使う）、wbs-template-editor-utils（WbsTemplateTreeGrid/WbsTemplatesPageのツリー編集用純粋関数。EditorNode型（安定id付き、childrenは常に配列）を軸に、toEditorNodes/fromEditorNodes（永続化形式との相互変換）・addRootEditorNode/addChildEditorNode/updateEditorNode/removeEditorNode（いずれもid指定のイミュータブル操作）・isDescendantEditorNode/moveEditorNode（ドラッグ&ドロップの移動先判定・末尾の子として移動、自己/子孫ドロップは無視）・addSiblingAfterEditorNode（Alt+Enter: 同階層追加、対象ノード直後への挿入）・promoteEditorNode/demoteEditorNode（Alt+←/→: 階層上げ/下げ。対象外の場合は引数のnodesをそのまま返す＝参照同一性で失敗判定できる設計）・countTemplateNodes（WbsTemplateNode[]のノード数、WbsTemplateDialogのタスク数バッジに使用））（+ リエクスポート: effort-utils）
│   │
│   ├── members/           # 担当者管理
│   │   ├── components/    # MemberDialog
│   │   └── pages/         # MembersPage
│   │
│   ├── actuals/           # 月次実績メンテナンス（/monthly-actuals、P1-a。P1-bで
│   │   │                    月次締め（ハードロック）を追加: 締め/解除ボタン（governance:approve、local常時可）・
│   │   │                    締め済みバッジ＞確定済みバッジ・締め済みバナー・グリッドreadOnly・
│   │   │                    解除理由必須ダイアログ・締め/解除履歴（直近5件=監査表示））
│   │   ├── components/    # MonthlyActualsGrid（AG Grid。実績セルは未入力=計画値のゴースト表示
│   │   │                    「(0.50)」薄色 vs 明示入力=通常色+bg-budget-actual/10。検証・row data
│   │   │                    反映はvalueSetterで完結し、onCellValueChangedは確定値の保存のみ＝
│   │   │                    valueSetterがdataへ書き込まないとevent.newValueがvalueGetter再解決で
│   │   │                    空文字になるAG Grid v33の挙動への対応。空欄Enter=クリア、不正値は
│   │   │                    toast+変更なし扱い。状態列にUndo2「計画どおりに戻す」ボタン。
│   │   │                    isFullWidthRow+MemberFullWidthRendererで担当者グループ行＝実績合計/
│   │   │                    稼働率上限/⚠超過警告）,
│   │   │                    AddUnplannedActualDialog（計画外実績の追加。メンバー→ルートプロジェクト→
│   │   │                    リーフタスクのCombobox+NumericInput）,
│   │   │                    CsvImportWizardDialog（汎用CSV取込の3ステップウィザード。①ファイル選択＝
│   │   │                    parseCsv+先頭5行プレビュー ②列マッピング（suggestColumnMappingで自動推定・
│   │   │                    shadcn Selectで手動修正）＋単位選択（人月/人日/時間） ③突合ドライラン＝
│   │   │                    buildImportPlanの結果表示（適用予定n件=上書きm/計画外k・スキップ理由・
│   │   │                    取込値vs計画の乖離）→適用。書込みはonApplyで呼び出し元へ委譲する
│   │   │                    Presentationalコンポーネント）
│   │   ├── pages/         # MonthlyActualsPage（月セレクタ◀ Input type="month" ▶・既定は前月・
│   │   │                    確定済み/未確定バッジ・確定ダイアログ（マークのみ、実績キーは書き込まない）・
│   │   │                    確定済み月の編集は警告トーストのみのソフトロック・空状態カード）
│   │   └── utils/         # monthly-actuals-utils（純関数群: buildMonthlyActualsRows=担当者名→
│   │                        プロジェクトコード→タスク名順の行モデル構築＋担当者グループ行、
│   │                        deriveActualCellStatus=planned/overridden/zeroActual、
│   │                        summarizeMonthlyActuals・shiftMonthKey・getDefaultTargetMonth（前月、
│   │                        now注入）・formatMonthLabel）、
│   │                        csv-import-utils（CSV取込コア・全て純関数: suggestColumnMapping=ヘッダ名
│   │                        からの列推定・resolvePeriodToMonth=YYYY-MM/日付→月キー・convertToManMonths=
│   │                        人日/時間→人月換算（workdaysPerMonth・hoursPerDay、0.01丸め）・
│   │                        buildImportPlan=メンバー解決（email大小無視優先→氏名、同名複数skip）／
│   │                        プロジェクト解決（コード→名称）／タスク解決（列指定→リーフ1件のみ自動）／
│   │                        人×プロジェクト×タスク×月への合算（丸めは合算後）／既存アサイン突合＝
│   │                        上書き/計画外の判別・per-row skip）+ __tests__/
│   │
│   ├── assignment/        # アサイン管理（タスク×担当者の月次配分）
│   │   ├── components/    # AssignmentNotesCard（体制メモ＝案件単位の申し送り。
│   │   │                    追加・編集・削除。headerActionでスナップショットボタンを差せる。
│   │   │                    **グリッドの表示条件（スケジュール登録済み）に依存させない**＝
│   │   │                    記録の閲覧はグリッドが出せない状態でも行えるべきため）,
│   │   │                    AssignmentSnapshotDialog（体制の記録と現在との差分表示。復元は持たない）,
│   │   │                    AssignmentTreeGrid（P1-b: 締め済み月の編集をhandleCellValueChangedで拒否＋
│   │   │                    値の書き戻し（契約範囲チェックと同型）、締め月列ヘッダに🔒表示）,
│   │   │                    MemberSummaryGrid, MemberCellEditor, MemberProjectAssignmentGrid（プロジェクト行クリック通知）
│   │   ├── pages/         # AssignmentPage（プロジェクト選択との双方向連携）
│   │   └── utils/         # assignment-utils（+ リエクスポート: project-display, member-filter）、keyboard-navigation-utils（編集中の上下キー行移動）
│   │
│   ├── schedule/          # スケジュール管理（ガントチャート）
│   │   ├── components/    # ScheduleGantt（`progressOf` propで工程キー→進捗率を受け取り、
│   │   │                    バーへWBSの完了チェックをロールアップ表示する。
│   │   │                    nullを返した工程はprogressキー自体を付けず進捗を描かない）,
│   │   │                    PhaseRow, DependencyDialog
│   │   ├── pages/         # SchedulePage, PhaseSettingsPage
│   │   └── utils/         # svar-gantt-utils + __tests__/
│   │
│   ├── team/              # チーム管理（組織階層・売上予算・スキル成長記録）
│   │   ├── components/    # TeamMemberDialog（幅広ダイアログ。編集時はTabsで「基本情報」（二列構成、
│   │   │                    左列に既存項目、右列に技術タグ）「スキル・成長記録」（MemberSkillPanel）を切替。
│   │   │                    新規追加時はスキル・成長記録タブなしで二列フォームのみ表示。
│   │   │                    基本情報タブの内容はMemberBasicFieldsサブコンポーネントに切り出し）,
│   │   │                    MemberSkillPanel（レベル一覧・成長タイムライン・成長ロードマップの3セクション。
│   │   │                    タブが開閉の役割を兼ねるため内部の折りたたみは持たない。保有タグ0件時は
│   │   │                    案内メッセージを表示）,
│   │   │                    SkillLevelBadge（レベル表示専用バッジ）,
│   │   │                    MemberRow（メンバー1行表示。保有スキルタグ全件をバッジ表示・所属会社名表示・
│   │   │                    契約形態（設定時のみテキスト表示、未設定は非表示）、
│   │   │                    旧TeamPage.tsxインライン実装を切り出し）,
│   │   │                    CompanyBreakdownHoverCard（部門/課の人数表記横のホバーアイコン。
│   │   │                    hover-card.tsx + company-breakdown-utils.tsを使用し所属会社別内訳を表示）,
│   │   │                    TeamMemberFilterBar（所属会社複数選択フィルタ+内部/外部リソース単一選択フィルタ。
│   │   │                    既存の部門・課グルーピングとは独立に全体へ横断適用）
│   │   ├── pages/         # TeamPage（所属会社・内部/外部リソースフィルタ状態を保持し、フィルタ適用後の
│   │   │                    メンバー一覧を部門・課ツリーへ渡す）
│   │   └── utils/         # リエクスポート: budget-utils、company-breakdown-utils（会社ごとの人数内訳集計
│   │                         calcCompanyBreakdown。companyId=nullは「未設定」バケットとして独立集計）
│   │
│   ├── companies/         # 所属会社マスタ管理（全社共通、契約単価は担当者管理側で入力、内部リソースフラグ=isInternal）
│   │   ├── components/    # CompanyDialog（「内部リソース（自社）として人件費計上する」チェックボックス、旧isProper）
│   │   └── pages/         # CompaniesPage（内部リソースの会社に「内部リソース」バッジ表示）
│   │
│   ├── budget/            # 予算管理（予実ダッシュボード・部門予算・案件・その他費用・AI利用費・SaaS費用・人員計画）
│   │   ├── components/    # DivisionBudgetPanel（案件予算/その他費用/AI利用費/SaaS費用/総合計の5列を
│   │   │                    各3行セル（予算合計/実績合計or人件費予算合計/残予算合計）で表示。総合計は
│   │   │                    上記4列の合計のみでその他予算変更（予算追加）は含まない。案件予算列の予算合計は
│   │   │                    担当部門一致案件のWBS概算予算額を合算。「その他のPJ予算」「その他予算変更」
│   │   │                    ボタン（旧「内訳」「追加履歴」）を配置）,
│   │   │                    ProjectBudgetView（AG Grid・係数列編集・原価4区分＋配賦後利益の5列（労務費/外注費/直接経費/間接費配賦/配賦後利益）・合計行pinnedBottomRowData（総工数は人月表示、
│   │   │                    getRowStyleで太字強調しDivisionBudgetPanelと視覚統一）、divisionId prop対応で部門フィルタ・全部門集計対応・割当/未割当工数列追加。
│   │   │                    末尾にプロジェクト別 概算予算額/割当済概算の棒グラフを表示）,
│   │   │                    OtherExpensePanel（合計行=予算合計/実績合計/残予算合計をTableFooterに表示。
│   │   │                    末尾に項目別 予算額/実績合計の棒グラフを表示）,
│   │   │                    OtherExpenseActualDialog（購入品目/備考Textarea。全カテゴリの実績明細（1:N）で
│   │   │                    BudgetBreakdownDialogからも再利用）,
│   │   │                    BudgetBreakdownDialog（allowedCategories?: BudgetBreakdownCategory[]で区分の
│   │   │                    絞り込み・種別選択を制御（1件のみなら固定表示）、履歴項目に実績明細ボタンを追加、
│   │   │                    案件選択時の担当部門ヒント表示、AI利用費集計は為替レート換算後）,
│   │   │                    BudgetAdjustmentDialog（「その他予算変更」に改称、増額/減額の区分選択に対応、
│   │   │                    履歴は符号付き表示）,
│   │   │                    AiUsageGrid（月=列の横方向Table、単位＄。上部に課セレクタ（常時表示、
│   │   │                    「部門全体」は選択肢として廃止済み）とプロバイダセレクタ
│   │   │                    （1件以上登録時のみ表示、選択状態をAiUsageMemberAllocationPanelと共有・
│   │   │）を配置。プロバイダ0件時は単一の予算額行のみ（後方互換）、
│   │   │                    1件以上の場合はセレクタで選択した1プロバイダの予算額/実績額行（両方手動入力）
│   │   │                    のみを表示し、未分類行は非表示化（データ・書き込みAPIは保持、予算合計行の
│   │   │                    算出には引き続き算入）。プロバイダ横断の予算合計/実績合計行は選択中プロバイダに
│   │   │                    関わらず常時表示。個人予算合計/バッファ合計/割当合計/バッファ割当合計は
│   │   │                    メンバー配分（プロバイダ軸付き）の月集計を表示する編集不可行で、選択中の課・
│   │   │                    プロバイダの両方に応じて絞り込む。末尾に月次予算合計/実績合計の推移折れ線グラフを表示,
│   │   │                    AiUsageProviderDialog（AIプロバイダ（Anthropic/OpenAI/Microsoft等）の名前・
│   │   │                    グレード/プラン追加編集ダイアログ）,
│   │   │                    AiUsageMemberAllocationPanel（課・プロバイダセレクタはAiUsageGridへ一本化済み
│   │   │                    のため本コンポーネントは持たない。単位＄、列順は個人予算/
│   │   │                    バッファ/割当/バッファ割当、残額計算式は予算-(割当+バッファ割当)、テーブル本体・
│   │   │                    フッター合計は表示中メンバー（課で絞り込み済み）かつ選択中プロバイダの配分のみを
│   │   │                    集計、一律設定は絞り込み済みメンバーと選択中プロバイダの両方が対象）,
│   │   │                    SaasContractTable（サービス名/プラン/予算額/実績額/残り予算・合計行、
│   │   │                    name→plan→nextRenewalDate順ソート。divisionId prop対応で部門フィルタ・全部門集計対応。
│   │   │                    末尾に契約別 予算額/実績額の棒グラフを表示）, SaasContractDialog
│   │   │                    （plan（グレード・プラン）入力欄を追加）,
│   │   │                    PersonnelCostSummary（「年間総合予算額」「年間総合実績額見込み」「残予算」
│   │   │                    「残契約概算工数」の4エリアを1パネルに横並び統合。「案件工数との比較」は
│   │   │                    独立パネルのまま。カード右上に現時点の内部/外部リソース
│   │   │                    人数（isActive基準の実チーム人数、人員計画の月別予定人数とは別軸）を表示し、
│   │   │                    「年間総合予算額」の内訳表示の下に「計算式: 内部 X人月×Y万円=Z万円 ／ 外部…」の
│   │   │                    実数入り計算式を表示する）,
│   │   │                    BudgetActualDashboard（年度末着地予測・月次推移はAI利用費を為替レートで万円換算。
│   │   │                    EVMパネルは持たない。EVMはDashboardPage（`/dashboard`）側にreadOnly表示で一本化済み）,
│   │   │                    PersonnelPlanPanel（4区分×12ヶ月の単一表＋末尾に全区分横断の「合計」行2行
│   │   │                    （予定人数合計・実績人数合計、月別）。区分ラベルは内部/外部リソース表記
│   │   │                    （人件費区分は「人数（内部/外部リソース）」、追加予定区分は
│   │   │                    「追加予定（内部/外部リソース）」）。末尾に区分別 予定人数推移の折れ線グラフ
│   │   │                    （4区分×固定配色＋合計行に対応する予定人数合計/実績人数合計の2本を濃色・
│   │   │                    太線で追加表示）を表示）,
│   │   │                    SaasActualGrid, AllDivisionsBudgetSummary（「全部門」選択時の読み取り専用集計カード、
│   │   │）
│   │   ├── pages/         # BudgetPage（部門セレクタ。タブ順: 予実ダッシュボード／部門予算一覧／プロジェクト／その他費用／AI利用費／SaaS費用／人員計画。初期表示は予実ダッシュボード。「全部門」選択肢（内部センチネル値__all_divisions__）をプロジェクト/SaaS費用タブに追加・他5タブに追加→AllDivisionsBudgetSummary表示。タブ内部keyは'project'のまま、表示ラベルのみ「プロジェクト」に汎用化）
│   │   └── utils/         # expense-budget-utils（警告しきい値判定・消化率・年度末予測・月次推移・その他費用実績合計・
│   │                         BudgetBreakdown[]の予算額合計(calcBudgetBreakdownAmountTotal)・実績明細合計
│   │                         (calcBudgetBreakdownActualRecordsTotal、部門予算タブ・その他費用タブの合計行に使用)・
│   │                         SaaS残り予算・AI利用費メンバー配分合計(calcAiUsageMemberAllocationTotal、個人予算/バッファ/割当/バッファ割当の4値)・
│   │                         案件タブ合計行(calcProjectRowsTotal、割当/未割当工数列追加、)・割当工数計算(calcAssignedEffortMonths、)、係数付き概算予算(calcProjectEstimateBudget(s))・
│   │                         WORKDAYS_PER_MONTH・残契約概算工数・SaaS年間コスト/実績合計・
│   │                         為替レート適用値取得(getApplicableExchangeRate)・＄→万円換算
│   │                         (convertUsdToManYen)はshared/utilsへリエクスポート）+ __tests__/
│   │
│   ├── tech-tags/         # 技術タグ管理（カテゴリ/サブカテゴリ対応）
│   │   ├── components/    # TechTagDialog
│   │   ├── pages/         # TechTagsPage
│   │   └── utils/         # リエクスポート: tech-tag-master, tag-filter
│   │
│   ├── dashboard/         # ダッシュボード（チャート・サマリー・EVM）
│   │   ├── components/    # AlertCenter（散在する警告判定を集約し重大度順に一覧表示。納期超過/遅延予測/
│   │   │                    納期接近/検収予定日の接近・経過/リスク対応期限/予算超過/稼働超過/ベースライン乖離/SaaS更新/
│   │   │                    スキルレビュー未実施。ダッシュボード最上部の「まず開く画面」）,
│   │   │                    ProjectAssignmentChart, MemberAssignmentChart, BudgetComparisonChart, UtilizationRateChart,
│   │   │                    ResourceDemandSupplyChart（要員の需要（月次アサイン合計の棒）と供給
│   │   │                    （在籍メンバーのcapacityRatio合計の線）を重ねた山積みグラフ。棒が線を超える月＝要員不足）,
│   │   │                    SkillDistributionChart（skillEvaluations propを渡すとカテゴリ×レベル別積み上げ棒グラフに切替、
│   │   │                    未指定時は従来のカテゴリ別単色棒グラフのまま後方互換）
│   │   ├── pages/         # DashboardPage（四半期レビュー未実施件数サマリーを部門・課フィルタ連動で表示。EVMパネル部門セレクタ・2分割レイアウト（ProjectAssignmentChart/BudgetComparisonChart横並び）追加。EvmPanelは`readOnly`指定で常時表示し、週次進捗率入力フォームは持たない。表示プロジェクトはEvmPanel内蔵のセレクタ（対象プロジェクトが2件以上のとき表示）で切替）
│   │   └── utils/         # dashboard-utils（集計・充足率・スキル分布・カテゴリ×レベル別スキル分布
│   │                         (getSkillLevelDistribution、代表レベルは上長評価優先)・
│   │                         定期評価レビュー未実施件数(getStaleSkillReviewCount)）
│   │
│   ├── guide-tour/        # 操作ガイダンスツアー（React Joyride 3.2）。TourProviderは
│   │                        uncontrolled（進行はjoyride側が管理）で、`onEvent`の
│   │                        `EVENTS.TOUR_END`だけをstopTourへ繋ぐ。ESCでの離脱は
│   │                        自前のkeydownで実装（3.2の`dismissKeyAction`は
│   │                        「次へ進む」で旧挙動と逆のため無効化）
│   │   ├── components/    # TourProvider, TourTooltip, TourMenuButton
│   │   ├── steps/         # ツアーステップ定義（global, dashboard, team, projects, wbs, schedule, assignment）
│   │   └── utils/         # tour-route-map + __tests__/
│   │
│   ├── my-tasks/          # 自分の担当（/my-tasks、postgresモード専用）
│   │   └── pages/         # MyTasksPage（ログインユーザーに紐づく担当者のアサインから
│   │                        今年度に配分のあるタスクを期日順に一覧。金額を一切表示しない
│   │                        ＝partnerにも開ける。未紐づけユーザーには案内を表示）
│   │
│   ├── estimates/         # 見積（/estimates、非公開の設計文書）。
│   │   │                    1案件フォーカスで記録／コーン／振り返りの3タブ。金額を持つためルート側で
│   │   │                    FinancialAccessGuardに包む（/budgetと同じ整理）
│   │   ├── components/    # EstimateRecordDialog（見積の記録。方法=簡易FP: NESMA概算法/推定法の
│   │   │                    項目行（名前／種別／件数）と合計FP・人日・人月・万円のライブ表示、
│   │   │                    「前回のFP項目をコピー」／方法=WBS: 現在のWBS概算を読み取り専用で表示／
│   │   │                    方法=手入力・実績: 人日と万円を直接入力（実績は現在の実績が初期値、段階は完了固定）。
│   │   │                    承認済みCRを選ぶとchangeRequestIdを紐づけラベルに表題を補完。
│   │   │                    行のkeyは行ごとのUUID（index keyにしない）），
│   │   │                    EstimateHistoryTable（版一覧: 版・記録日・段階・方法・工数・金額・幅・前版比・
│   │   │                    ラベル・記録者。前版比とFP項目の差分はdiffEstimateSnapshotsでUI側が導出），
│   │   │                    UncertaintyConeChart（Recharts ComposedChart。x=段階、y=万円。各段階の最新版の
│   │   │                    見積を線・幅（low〜high）を帯・実績を横線で描く。buildConePointsは純関数），
│   │   │                    UncertaintyConeInfo（Infoアイコン→Popover。3行の要旨＋段階×幅の表＋
│   │   │                    「なぜ狭まるのか」。段階セレクタの横とコーンタブの見出しに置く），
│   │   │                    EstimateRetrospectivePanel（比較する実績（完了時の記録／現在の実績）・
│   │   │                    実績 人時/FP vs 設定値・校正ヒント・版ごとの実績÷見積と幅の判定）
│   │   └── pages/         # EstimatesPage（案件セレクタ＝?projectId=の2段階解決・3タブ・「見積を記録」
│   │                        「最新版を取り消す」（確認ダイアログ）「実績を記録」・WBS/サマリーへの相互リンク。
│   │                        実績の基準日はマウント時に一度だけ確定）+ __tests__/
│   │
│   ├── document-templates/ # ドキュメントテンプレート管理（/document-templates）
│   │   └── pages/         # DocumentTemplatesPage（IPA準拠の標準テンプレート33件を初回シード。
│   │                        一覧（工程ラベル付きセレクタ）・新規作成（OKF準拠の初期本文）・
│   │                        名称/工程/説明/本文（マークダウン）のblur即時保存・削除・.mdダウンロード）
│   │
│   ├── statements/        # 月次明細（/statements。単価の二重管理を2方向の帳票に写す）
│   │   ├── pages/         # StatementsPage（対象月セレクタ・計画/実績トグル・タブ2面・CSV出力。
│   │   │                    協力会社への支払=会社→人→PJコード（契約単価×配分、単価0行は入力漏れとして
│   │   │                    警告色）／発注元向け=案件→会社→人（見積単価×配分、発注元名表示））
│   │   └── utils/         # statement-utils（buildPartnerPaymentLines=協力会社のみ・契約単価のみで
│   │                         フォールバックなし／buildClientStatementLines=全メンバー・見積単価／
│   │                         CSV行構築・合計。純粋関数）
│   ├── reports/           # レポート出力（CSV）・スナップショット・データ管理
│   │   ├── components/    # CsvReportExport（案件別収支表・要員別稼働表・部門予算予実表の3帳票を
│   │   │                    UTF-8 BOM付きCSVでダウンロード。行データ構築はutils/report-csv.tsが担い、
│   │   │                    本コンポーネントはストアからの入力集めとBlobダウンロード発火のみ）,
│   │   │                    DataExport, SnapshotHistory
│   │   ├── utils/         # report-csv（3帳票の行データ構築。既存の算出ロジック（概算予算・損益・
│   │   │                    進捗率・アサイン集計）を再利用し画面表示と同じ数値を保証する純粋関数）
│   │   └── pages/         # ReportsPage
│   │
│   ├── auth/              # 認証（postgresモード専用。localモードでは未使用）
│   │   ├── components/    # RequireAuth（ルートガード。localモードでは常にパススルー、requiredRole propで
│   │   │                    ロール制限も可能）
│   │   └── pages/         # LoginPage
│   │
│   └── admin/             # 管理画面（/admin/*）。全社設定・データ管理・マスタ・
│       │                    admin限定機能を業務画面とは別レイアウトへ集約。
│       │                    ルートはLayoutの外側（App.tsx）で、AdminLayoutが内部に<Routes>を持つ
│       ├── api/           # users-api（ユーザー管理API、DataAdapterの汎用CRUDには含めない専用クライアント）。
│       │                    外部ツール接続APIは`shared/api/external-tools-api.ts`に置く
│       │                    （features/projectsのWBS起票からも使うため。features間依存の回避）,
│       │                    notifications-api（通知チャンネル管理API。シークレットは
│       │                    書き込み専用でレスポンス型に平文フィールド自体が無い）,
│       │                    api-keys-api（APIキー管理API。平文キーは発行レスポンス
│       │                    でのみ得られる・openApiSpecUrl=OAS仕様書URL）,
│       │                    audit-logs-api（監査証跡の参照API。読み取りのみで
│       │                    書き込み関数を持たない＝改ざんの経路を作らない）
│       ├── components/    # MasterCsvImportCard（マスタCSV一括登録。3種の
│       │                    列一覧（COLUMN_SPECSを読むのでテンプレートと必ず一致）＋
│       │                    テンプレートDL＋取込。突合・適用はshared/utilsの純関数へ委譲し、
│       │                    ここはストアのアクションをdepsとして渡すだけ）,
│       │                    MasterCsvImportDialog（2ステップ=ファイル選択→ドライラン確認・適用。
│       │                    実績CSV取込（3ステップ）と違い列マッピングの段を持たない
│       │                    ＝テンプレートで列名を配っているため。**両ステップにプレビュー表**を
│       │                    持ち、①解釈前のCSV（列のずれ・文字化けの確認）②登録される内容
│       │                    （解釈後の値）を見せる。PreviewGridが両方の見た目を担う）,
│       │                    AdminLayout（左ペイン=メニュー（設定/マスタ/管理者）＋右ペイン=内容。
│       │                    「システムに戻る」で/dashboardへ。NAV_GROUPSはグループ単位の
│       │                    visible()に加えて項目単位のpermissionでも絞り、
│       │                    全項目が消えたグループは見出しごと出さない）,
│       │                    AdminAccessGuard（ページ側の権限ガード。FinancialAccessGuardと同型で、
│       │                    権限が無ければ中身を一切描画しない＝メニューを隠すだけでは
│       │                    URL直打ちで素通りするため）,
│       │                    AdminIndexRedirect（/adminの着地先。settings:manageが無い利用者を
│       │                    いきなり「権限がありません」に落とさず/admin/companiesへ送る）,
│       │                    CreateUserDialog, NotificationChannelDialog（追加・編集。プロバイダ別
│       │                    フィールド切替＝chatworkはAPIトークン+ルームID/他はWebhook URL。
│       │                    編集時の空欄=変更なし）
│       │                    ExternalToolConnectionDialog（接続の追加・編集。ツール別フィールド
│       │                    切替＝Backlog/JiraはURL・Jiraはメール。編集時のトークン空欄=変更なし）,
│       │                    ExternalToolTargetDialog（起票先設定。保存済みトークンで
│       │                    /metadataから選択肢を引く2段階フローの後半。GitHubはowner/repo直接入力）
│       └── pages/         # SystemSettingsPage（/admin/settings。旧サイドバーの
│                            ポップオーバーで直接編集していた11項目を基本／見積・単価／
│                            警告のしきい値／表示／セットアップの5カードへ整理。SettingRowが
│                            ラベル＋説明＋入力の組を作る。金額の表示トグルはaria-pressedで
│                            状態を示す（ラベルがアクセシブルネームを担うため文言だけでは
│                            状態が読み取れない）。初期設定ウィザードはopenSetupWizard()後に
│                            /dashboardへ遷移する（本体はDashboardPageがマウントするため））,
│                            DataManagementPage（/admin/data。DataExport・SnapshotHistoryを載せる）,
│                            UserManagementPage（ユーザー一覧・追加・ロール変更・有効/無効化）,
│                            AuditLogsPage（/admin/audit-logs。変更履歴の閲覧＋
│                            保持管理（総件数・最古日時の表示、期間を選んで一括パージ。
│                            確認ダイアログ必須）。
│                            対象データ・操作種別・レコードIDで絞り込み。update=フィールドの
│                            before→after、delete=削除直前の値の要約、create=差分なし。
│                            操作者はactorName→actorEmail→「（不明）」の順にフォールバック）,
│                            ExternalToolsPage（/admin/external-tools。接続一覧・
│                            追加/編集/削除・接続テスト・起票先設定。トークンは設定済みフラグのみ表示）,
│                            NotificationSettingsPage（/admin/notifications。チャンネル
│                            一覧・追加/編集/削除確認・テスト送信・送信ログ直近20件）,
│                            ApiKeysPage（/admin/api-keys。キー発行=平文一度だけ表示・
│                            コピー・無効化/有効化・削除確認・OAS仕様書リンク）
│
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

### API サーバー（`server/`、postgresモード用）

Fastify + Drizzle ORM + PostgreSQL による独立したAPIサーバー。クライアント側の `PostgresApiAdapter` が呼び出す。

```
server/
├── src/
│   ├── index.ts           # エントリーポイント
│   ├── app.ts             # buildApp() ファクトリ（Fastifyインスタンス構築）
│   │
│   ├── db/
│   │   ├── schema.ts      # Drizzle pgTable定義（29業務エンティティ + 認証系 + appSettings）
│   │   ├── client.ts      # Drizzle DB クライアント初期化
│   │   ├── export-database.ts  # `GET /api/database/export`（admin限定）
│   │   ├── import-database.ts  # `POST /api/database/import`（admin限定）
│   │   └── migrate.ts     # DB マイグレーション実行スクリプト
│   │
│   ├── routes/
│   │   ├── resolve-author-name.ts # 投稿者名のサーバースタンプ（req.user→usersの表示名、無ければemail）と
│   │   │                         timestamp列向けのISO文字列→Date変換（体制メモ・見積の共通化）
│   │   ├── crud-factory.ts     # 汎用CRUD ルートファクトリ（registerCrudRoutes()。
│   │   │                         で**楽観ロック**（X-Expected-Updated-Atヘッダーを
│   │   │                         UPDATEのWHEREへ畳み込み、食い違えば412。未送出は従来動作・
│   │   │                         不正値は400）を追加。POST/PATCH/DELETE/batchをトランザクション化し、
│   │   │                         業務操作と同一トランザクションで監査証跡（auditLogs）へ追記する。
│   │   │                         PATCHは差分抽出のため更新前rowを常にSELECTする（従来は
│   │   │                         afterUpdateフック設定時のみ）。P1-bで
│   │   │                         beforeCreateへ第2引数req.user（actorスタンプ用・後方互換）と
│   │   │                         beforeDeleteフック（CrudValidationErrorで400拒否）、
│   │   │                         afterUpdateへ第2引数context（更新前row・patch。status遷移の
│   │   │                         検知＝CR承認通知用）を追加）
│   │   ├── auth.ts             # 認証ルート（/api/auth/login, /api/auth/refresh, /api/auth/logout）
│   │   ├── users.ts            # ユーザー管理ルート（admin限定）
│   │   ├── app-settings.ts     # appSettings専用ルート（P0-b。GET=金額系はpartnerへ非返却/PATCH=settings:manage・フィールド単位パッチ）
│   │   ├── health.ts           # ヘルスチェック
│   │   ├── webhooks.ts         # 外部完了同期のWebhook受信（Phase 2）。
│   │   │                         POST /api/webhooks/tasks/:source。URLシークレット認証・
│   │   │                         source別アダプタ（generic/backlog/jira/asana/github）・
│   │   │                         CSV経路と同一セマンティクスの3段突合・冪等・
│   │   │                         突合不能202＋skipログ。Asanaはハンドシェイク＋APIフェッチ。
│   │   │                         GitHubはX-GitHub-Eventヘッダでissues判定＋closed/reopened、
│   │   │                         外部ID=owner/repo#番号、pingは202受理
│   │   ├── audit-logs.ts       # 監査証跡の参照・保持管理（users:manage限定）。
│   │   │                         GET /api/auditLogs（entity/entityId/action絞り込み・
│   │   │                         既定100件/最大500件・新しい順・usersとLEFT JOINして
│   │   │                         actorNameを解決）／GET /api/auditLogs/entities／
│   │   │                         GET /api/auditLogs/stats（総件数・最古の記録日時）／
│   │   │                         DELETE /api/auditLogs?before=（保持期間パージ）。
│   │   │                         **追記・更新の経路を持たず、削除も期間指定のみ**
│   │   │                         （id指定の個別削除は提供しない＝恣意的な抹消の防止。
│   │   │                         未来日は400、パージ自体も監査ログへ記録）
│   │   ├── api-keys.ts         # APIキー管理（公開API v1、users:manage限定）。発行時のみ
│   │   │                         平文を返しSHA-256ハッシュのみ保存・有効/無効・削除
│   │   ├── external-tools.ts   # 外部ツール接続管理（API起票基盤 Phase 2）。
│   │   │                         **一覧GETのみ`data:write`**（起票実行と同権限。で
│   │   │                         `users:manage`から緩和＝editorが起票先を選べず起票できなかった
│   │   │                         実バグの修正。トークンは元々返さないので秘密は増えない）。
│   │   │                         作成/更新/削除/接続テスト/metadataは`users:manage`限定のまま。
│   │   │                         CRUD＋接続テスト（/test）＋起票先の選択肢取得（/metadata）。
│   │   │                         APIトークンはAES-256-GCM暗号化保存の書き込み専用・3値PATCH。
│   │   │                         baseUrlはhttps必須＋ホスト許可リストで検証（SSRF面の限定）
│   │   ├── task-creation.ts    # WBSタスクのAPI起票実行（Phase 3、data:write）。
│   │   │                         POST /api/taskCreation/execute。サーバー側で対象を再検証
│   │   │                         （buildTaskCreationPlan＝クライアントのドライランと同一関数）・
│   │   │                         逐次POST＋約1件/秒スロットル・50件上限・1件成功ごとに外部ID即時UPDATE・
│   │   │                         taskSyncLogs（channel='api'）へ追記
│   │   ├── v1.ts               # 公開API v1（read-only）。APIキー認証（X-Api-Key）で
│   │   │                         billing/project-finance/statements(partner-payment・client)/alerts/
│   │   │                         projects一覧・詳細（タスク・スケジュール・進捗率、金額なし）/
│   │   │                         projects/{id}/evm（PV/EV/AC週次系列、EvmPanelと同一算出）の
│   │   │                         集計8本＋OAS配信（GET /api/v1/openapi.yaml、認証不要）。集計は
│   │   │                         shared純関数を再利用（画面・CSVと数値の単一実装）
│   │   ├── notifications.ts    # 通知チャンネル管理API（Phase 3、users:manage限定）。
│   │   │                         チャンネルCRUD（シークレットはAES-256-GCM暗号化保存・GETは
│   │   │                         設定済みフラグのみ・3値PATCH）・テスト送信・ダイジェスト手動送信・
│   │   │                         送信ログ取得
│   │   ├── sso-providers.ts    # SSOプロバイダ設定ルート（admin限定）
│   │   ├── database.ts         # database export/import（admin限定）
│   │   └── entities/           # 業務エンティティ別ルート
│   │       ├── projects.ts     # projects（コード一意性のbeforeCreate/beforeUpdate検証=新たな重複のみ400）, efforts, taskSyncLogs（追記専用=readOnly）
│   │       ├── members.ts      # members
│   │       ├── organization.ts # divisions, sections, companies
│   │       ├── actuals.ts      # monthlyActualsConfirmations（month unique・再確定PATCH）,
│   │       │                     actualsImportLogs（追記専用=readOnly、P1-a）,
│   │       │                     monthlyCloseEvents（追記専用＋governance:approve、actorNameを
│   │       │                     req.userからサーバー側スタンプ、P1-b）
│   │       ├── assignments.ts  # assignments（1.0人月上限バリデーション。対象は計画monthlyValuesのみ、
│   │       │                     実績actualMonthlyValuesは検証対象外＝事実の記録。P1-b: 締め済み月の
│   │       │                     値が変わる書込みをbeforeCreate/beforeUpdateの差分判定で400、
│   │       │                     締め月に値を持つ行の削除をbeforeDeleteで400）
│   │       ├── schedule.ts     # scheduleEntries, dependencies
│   │       ├── tech-tags.ts    # techTags, categories, subCategories
│   │       ├── budget.ts       # divisionBudgets, budgetBreakdowns, budgetAdjustments,
│   │       │                     aiUsageEntries, aiUsageMemberAllocations, aiUsageProviders,
│   │       │                     saasContracts（+ monthlyActuals/actualRecords専用サブルート）
│   │       ├── personnel-plan.ts  # personnelPlans
│   │       ├── skills.ts       # skillEvaluations, skillRoadmapGoals（追記専用）
│   │       ├── project-progress.ts # projectProgressEntries（EVM用週次進捗率）
│       ├── project-baselines.ts # projectBaselines（EVMのPVの基準線、追記専用）
│       ├── estimate-snapshots.ts # estimateSnapshots（見積スナップショット）。financials:read必須・
│       │                     投稿者名スタンプ・createdAtのDate変換・**beforeDeleteで最新版以外の削除を400で拒否**
│       │                     （クライアントのrevokeLatestEstimateと同じ制約の多層防御）。readOnlyにしない（DELETEを塞ぐため）
│       ├── commerce.ts     # changeRequests, billingMilestones（商流系。承認時のProject反映・
│       │                     ステータス遷移制約はクライアント側ストアが担う）
│   │       ├── wbs-templates.ts    # wbsTemplates
│   │       └── document-templates.ts # documentTemplates
│   │
│   ├── external-tools/    # 外部ツールAPI起票（API起票基盤）
│   │   ├── config.ts      # 接続設定のコア（純関数）: validateConnectionInput（https必須＋
│   │   │                    ホスト許可リスト＋Jiraのメール必須）・parseTargetConfig
│   │   │                    （ツール別discriminated union）・buildAuthHeaders（Backlogは
│   │   │                    ヘッダ方式＝URLへトークンを載せない）・buildApiUrl
│   │   ├── client.ts      # 外部APIへのfetch（10秒timeout・例外を投げず結果へ畳む）。
│   │   │                    encodeBodyで送信形式を出し分ける（**Backlogのみform-urlencoded**、
│   │   │                    配列は同一キー反復）。testConnection（軽量GET）・fetchToolMetadata
│   │   │                    （起票先の選択肢。Backlogはprojectid既知なら課題種別も、Jiraは
│   │   │                    サブタスク種別を除いた課題タイプも返す）
│   │   ├── payload.ts     # 起票リクエスト構築（純関数）: buildCreatePayload（ツール別・
│   │   │                    件名は[コード] タスク名でCSV経路と同形式・Jiraラベルの空白正規化・
│   │   │                    encodingを返す）・グループ解決系（buildGroupListRequest／
│   │   │                    buildGroupCreateRequest／extractGroupId／extractCreatedGroupId／
│   │   │                    buildAddToSectionRequest＝Asanaのみ起票後にセクションへ移す）・
│   │   │                    extractExternalId（**Webhookアダプタと同一形式**の外部IDを抽出、
│   │   │                    読めなければnull=誤学習しない）。対象抽出は
│   │   │                    shared/utils/task-creation-core.tsをリエクスポート
│   │   └── __tests__/     # config.test.ts, payload.test.ts
│   │
│   ├── audit/             # 汎用監査証跡
│   │   ├── diff.ts        # 差分抽出（純関数）: diffChangedFields=更新前rowとpatchから
│   │   │                    「実際に値が変わったフィールド」だけを{before,after}で返す。
│   │   │                    updatedAtは常に変わるため除外し、変更0件はnull（＝ログを作らない）。
│   │   │                    null/undefinedとDate/ISO文字列を同一視して偽の差分を作らない
│   │   ├── record.ts      # recordAudit=auditLogsへの追記（**業務操作と同一トランザクション**で
│   │   │                    呼ぶ。fire-and-forgetにすると記録漏れで証跡にならない）＋
│   │   │                    entityNameFromPath（ルートpath→エンティティ名）
│   │   └── __tests__/     # diff.test.ts
│   ├── notifications/     # チャットツール通知（Phase 3）
│   │   ├── message.ts     # 6プロバイダのペイロード純関数（Slack/Teams AdaptiveCard/Google Chat/
│   │   │                    Discord 2000字切り詰め/Chatwork form-encoded/generic）＋プロバイダ別
│   │   │                    成功ステータス（200/202/204混在）の明示
│   │   ├── sender.ts      # 送信コア（復号→10秒タイムアウト→429/5xxのみ1回リトライ・
│   │   │                    Retry-After尊重60秒cap。例外を投げない）
│   │   ├── dispatch.ts    # 複数チャンネル独立配信＋notificationLogs記録（全体をtry-catchで握り
│   │   │                    業務フックを守る）
│   │   ├── events.ts      # 即時イベント（月次締め/解除・CR承認/却下）の文面構築と
│   │   │                    fire-and-forget送出。金額は文面に含めない（決定事項7）
│   │   ├── digest.ts      # 日次ダイジェスト（alert-utilsのサーバー再利用で5種を集約・
│   │   │                    minSeverity絞り込み・同日再送防止・20行丸め）
│   │   └── __tests__/     # message.test.ts, sender.test.ts, events.test.ts, digest.test.ts
│   │
│   ├── auth/
│   │   ├── plugin.ts      # fastify.authenticateデコレータ
│   │   ├── jwt.ts         # JWT 発行・検証
│   │   ├── password.ts    # Argon2 ハッシュ・検証
│   │   ├── rbac.ts        # ロール階層（admin ⊇ editor ⊇ viewer）・ロール検査ミドルウェア
│   │   ├── api-key.ts     # 公開API v1のAPIキー認証。rpk_形式生成・SHA-256ハッシュ・
│   │   │                    requireApiKey preHandler（lastUsedAtはfire-and-forget更新）
│   │   ├── crypto.ts      # SSO clientSecret 暗号化（AES-256-GCM）
│   │   └── __tests__/     # jwt.test.ts, password.test.ts, rbac.test.ts, crypto.test.ts
│   │
│   ├── scripts/
│   │   ├── verify-external-tool.ts # 外部ツール接続の実アカウント検証CLI。
│   │   │                             DB・サーバー起動なしで本番と同じclient/payloadを通し、
│   │   │                             接続テスト→起票先の選択肢取得→実起票（EXT_CREATE=1時のみ）。
│   │   │                             env.tsのzod検証を通すためダミー値を埋めてから動的import。
│   │   │                             トークンは伏字表示。手順はdocs/guide/external-tools-setup.md
│   │   ├── create-admin.ts         # admin ユーザー作成
│   │   └── migrate-to-postgres.ts  # localStorage→PostgreSQL 移行CLI
│   │
│   └── __tests__/
│       └── integration/
│           └── full-stack.integration.test.ts  # Testcontainers（postgres:16）での統合テスト
│
├── openapi/
│   └── v1.yaml            # 公開API v1のOpenAPI 3.0.3仕様書（正本。GET /api/v1/openapi.yamlで配信）
│
├── tsconfig.json
├── package.json           # npm scripts: dev, build, start, test, db:generate, db:migrate等
└── drizzle.config.ts      # Drizzle Kit 設定
```

## テスト構成

テストはコロケーション方式で各モジュールの `__tests__/` ディレクトリに配置。

### ストアテスト（`src/stores/__tests__/`）

| テストファイル              | 対象                                           |
| --------------------------- | ---------------------------------------------- |
| `app-store.test.ts`         | app-storeのテーマ適用（html classの付け外し・systemはクラスを付けない）・フォントサイズ（CSS変数への反映・上限/下限で止まる）・金額表示トグル・初期設定ウィザードの開閉・`initialize`（保存済み年度の取り込みとDOM適用）。**反証**: 年度変更は永続化層へ伝えるが年度開始月は伝えない（表示だけ変わって保存が追従しない事故の防止）。全画面に効く基盤でありながら分岐カバレッジ29%だったため |
| `assignment-note-store.test.ts` | 体制メモ・アサインスナップショットのCRUD。楽観的更新とidの安定性・サーバー確定値（authorName/updatedAt）の反映・失敗時のロールバック。**反証**: 2回続けて更新でき2回目の期待値がサーバー確定値になる（楽観ロックの回帰）／配分が全て0のアサインは記録しない／他案件を混ぜない／更新アクションを持たない（記録は追記専用）／読み取りの403は通知せず500は通知する |
| `assignment-store.test.ts`  | assignment-storeのCRUD（`DataAdapter`経由・楽観的更新、`upsertAssignment`のprojectId×taskId×memberId複合キーでのupsert・idの安定性、`deleteByTask`の一括削除ロールバック含む）・月次集計・実績の例外入力`updateActualMonthlyValue`（**反証**: null=キー削除（計画どおりへ戻す）・計画と同値の入力もキー削除・実績は1.0人月超も記録できる（上限でブロックしない））・計画外実績`addActualEntry`（既存レコードがあれば新規作成せず例外入力へ委譲・作成失敗ロールバック、P1-a）・**月次締めガード**（P1-b。**反証**: 締め済み月は実績・計画とも変更拒否／upsertの差分判定=締め月キーが不変なら他月編集は通る／締め月に値を持つ新規作成・削除の拒否／解除後は再び編集できる=永続ロックでない） |
| `actuals-store.test.ts`     | actuals-storeの確定マーク`confirmMonth`（新規create/再確定update分岐・idの安定性・**反証**: 再確定でも1レコードのまま重複作成しない・作成/更新失敗時のロールバック+トースト・締め済み月への確定拒否）・取込履歴`addImportLog`（追記・失敗ロールバック）・月次締め`closeMonth`/`reopenMonth`（P1-b。**反証**: 既に締め済みの再closeは無効・空白理由では解除不可・close→reopen→closeの履歴から現況導出・作成失敗時は締め状態ごとロールバック・履歴は追記専用で解除しても消えない）・`loadActualsData`・`getConfirmation`（P1-a） |
| `budget-store.test.ts`      | budget-storeのCRUD（`DataAdapter`経由・楽観的更新、7エンティティ全て。17ストアのDataAdapter配線・第14弾＝最終ストア。`persistChangedDivisionBudgets`による連動`DivisionBudget.initialAmount`再計算の差分永続化、`deleteAiUsageProvider`の404耐性含む。`estimatedUnitPrice`/`defaultCoefficient`/`projectCoefficients`/`exchangeRateHistory`は引き続き`jsonStorage`経由＝EntityMap対象外の既知の制約）・予算調整（その他予算変更、adjustmentType増額/減額でgetDivisionBudgetTotalへの加減算）/内訳の更新削除・月次実績アクション・initialAmount自動再計算・概算単価・部門予算俯瞰セレクタ（担当部門一致案件のWBS概算予算額projectWbsEstimateTotal、BudgetBreakdown.projectId紐付け済み案件の二重計上除外含む）・AiUsageMemberAllocation.actualAmount/bufferActualAmount変更時の部門全体・プロバイダ未分類AiUsageEntry.actualAmountへの自動同期（メンバー配分自身のproviderIdに関わらず同期先はプロバイダ非依存を維持し、プロバイダ別に手動入力した実績額との二重計上を防ぐことの反証含む）・providerId軸付きgetOrCreateAiUsageMemberAllocations/bulkSetAiUsageMemberMonthlyBudget・BufferAmount（メンバー・プロバイダ単位の絞り込み）・為替レート履歴（setExchangeRateの月起点追記/上書き、getApplicableExchangeRate、AI利用費＄→万円換算、為替レート変更時の全部門initialAmount再計算）・AiUsageProvider CRUD（sortOrder部門内連番、削除時の紐づくAiUsageEntryカスケード削除・initialAmount再計算）・providerId込みのsetAiUsageBudget/setAiUsageActual（新規作成/上書き分岐、複数プロバイダ横断の合算）・getAiUsageBudgetAmountForMonthの複数プロバイダ合算・後方互換（プロバイダ未登録時の単一エントリ運用が不変であること） |
| `companies-store.test.ts`   | 楽観ロック（画面が見ていた版のupdatedAtを第4引数で送る。**反証**: 競合（412）はロールバックしたうえで「他のユーザーが先に更新しました」と通知／競合以外は従来どおりの文言で原因を表示）。companies-storeのCRUD（`DataAdapter`経由・楽観的更新。仮id→確定idの差し替え、追加/更新/削除失敗時のロールバック+トースト表示、`loadCompanies`の非同期読み込み）・削除時のメンバーcompanyIdカスケード。の17ストアDataAdapter配線の第1弾（`docs/project.md`の「データ永続化のデュアルバックエンド化」参照） |
| `csv-mapping-store.test.ts` | csv-mapping-storeのCRUD（`DataAdapter`経由・楽観的更新・idの安定性・失敗ロールバック）・`getProfilesForSource`（sourceKey×direction絞り込み・名前順）。 |
| `document-template-store.test.ts` | document-template-storeのCRUD（`DataAdapter`経由・楽観的更新・idの安定性・失敗時ロールバック）・`seedStandardDocumentTemplates`（マスタ33件を固定UUIDのままシード。**反証**: DataAdapter上に既存データがあればシードしない／同一tick内2回呼び出しでも重複しない／シード中1件失敗時はその1件のみロールバック／**load→seed→loadの順で呼ばれても2周目のloadの空配列set()がシード結果を消さない**＝StrictMode二重マウント競合の回帰テスト、実ブラウザE2Eで発見しupsert反映で修正）・`getDocumentTemplateById`。 |
| `estimate-store.test.ts`    | estimate-storeの`recordEstimate`（版の自動採番・案件ごとに独立・クライアント生成idの安定性・FP法の根拠と人時/FPの凍結・takenAt省略時は現在時刻）・`revokeLatestEstimate`（最新版のみ削除・他案件非干渉・削除失敗ロールバック）・セレクタ。**反証**: 整合しない入力（完了以外の実績）は何も書かずnullを返して通知する（楽観的に追加して静かに戻る、を避ける）／作成失敗時のロールバック／サーバー確定値（authorNameのスタンプ）をローカルへ反映する |
| `efforts-store.test.ts`     | efforts-storeの`upsertEffort`（`DataAdapter`経由の楽観的更新、upsert: 新規作成/既存更新の分岐・idの安定性・追加/更新失敗時のロールバック）・`deleteEffort`/`deleteByProject`（対象なし時はDataAdapter非呼び出しの反証含む）・`getByProject`/`getByProjectAndColumn`セレクタ。ストアDataAdapter配線の第3弾（本ストアは元々専用テストファイルが存在しなかったため新規作成） |
| `members-store.test.ts`     | members-storeのCRUD（`DataAdapter`経由・楽観的更新、idの安定性、失敗時のロールバック含む）・役割マスタ・セレクタ |
| `personnel-plan-store.test.ts` | personnel-plan-storeの4固定区分管理（`DataAdapter`経由・楽観的更新、getOrCreateAllCategoriesの同期契約維持・idの安定性・失敗時ロールバック含む）・月別予定人数・実績人数の更新、実績人数自動算出セレクタ |
| `billing-milestone-store.test.ts` | billing-milestone-storeのCRUD（`DataAdapter`経由・楽観的更新・idの安定性・追加/更新失敗時のロールバック）、ステータス遷移（予定→検収済→請求済→入金済）、`getByProject`（検収予定日昇順・他案件除外） |
| `change-request-store.test.ts` | change-request-storeのCRUD・承認/却下。**反証**: 承認時に受注額差分・新納期がProjectへ自動反映される（減額は0未満にならない）／工数差分だけのCRを承認してもProjectは不変（自動反映しない設計）／pending以外は再承認できない（二重反映防止）／承認済みCRは削除できない（追跡性の保持） |
| `project-baseline-store.test.ts` | project-baseline-storeの`freezeBaseline`・`revokeLatestBaseline`（最新版のみ削除・v1まで取り消すと未凍結へ・他案件非干渉・削除失敗時ロールバック）（版の自動採番＝案件ごとに独立、`DataAdapter`経由の楽観的更新・クライアント生成idの安定性、スナップショット保持、approvedAt省略時の当日補完、作成失敗時のロールバック）・`loadProjectBaselines`・`getActiveBaseline`/`getBaselineHistory`セレクタ。**反証**: 他案件のベースラインを有効版として返さない（PVが別案件の計画で引かれる事故の回帰テスト） |
| `project-progress-store.test.ts` | project-progress-storeの`setWeeklyProgress`（upsert: 新規作成・既存週上書き・他週非干渉。`DataAdapter`経由の楽観的更新・確定idの安定性・追加/更新失敗時のロールバック含む）・`getProjectProgressEntry`セレクタ |
| `projects-store.test.ts`    | projects-storeのCRUD（`DataAdapter`経由・楽観的更新、`addProject`戻り値idの同期的な連鎖利用（`applyWbsTemplate`のparentId連鎖を支える契約）・`updateProjectsBatch`の`bulkUpdate()`初採用・deleteProjectの再帰カスケード削除、失敗時ロールバック含む）・ツリー管理。**反証**: 子孫のremove()が404で失敗してもロールバックしない（親の`ON DELETE CASCADE`で既に削除済み扱い、実Postgresで発見したバグの回帰テスト） |
| `risk-store.test.ts`        | risk-storeのCRUD（`DataAdapter`経由・楽観的更新、クライアント生成idの安定性・追加/更新/削除失敗時のロールバック・楽観ロック期待値=2回目の更新がサーバー確定値を送る回帰反証・存在しないidの更新は何もしない・他案件のリスクを混ぜないセレクタ。非公開の設計文書） |
| `schedule-settings-store.test.ts` | schedule-settings-storeの`loadScheduleSettings`（`DataAdapter`経由の読み込み、旧Zustand persistキー`schedule-settings-storage`からのレガシー移行: DataAdapter側0件かつレガシーキーにデータがある場合のみ移行・複数案件分の一括移行・DataAdapter側に既存データがある場合は移行しない反証・不正JSON形式の防御的処理・同一tick内2回呼び出しでも移行は1回のみ実行される反証（single-flightガード）・移行失敗時のロールバック）・`getSettings`（未登録案件はデフォルト設定にフォールバック）・`updatePhaseName`/`togglePhaseEnabled`/`reorderPhase`（楽観的更新、既存レコードなら該当工程のみ更新・他工程非干渉、別案件非干渉、失敗時ロールバック、reorderPhaseの不正な工程キー指定は無変更の反証）。17ストアDataAdapter配線の第11弾 |
| `skill-store.test.ts`       | skill-storeの`skillEvaluations`/`skillRoadmapGoals`追記専用CRUD（`DataAdapter`経由・楽観的更新、idの安定性、追加失敗時のロールバック含む）・現在レベル/現在目標導出セレクタ |
| `task-sync-store.test.ts`   | task-sync-storeの`addTaskSyncLog`（追記・idの安定性・失敗ロールバック+トースト）・`loadTaskSyncLogs` |
| `team-store.test.ts`        | team-storeのCRUD（`DataAdapter`経由・楽観的更新、addDivision→addSection連鎖のidの安定性、削除失敗時のロールバック含む）・カスケード削除。**反証**: 子課のremove()が404で失敗してもロールバックしない（部門の`ON DELETE CASCADE`で既に削除済み扱い、でprojects-store.tsと同型のバグを発見し既存コードも合わせて修正） |
| `wbs-settings-store.test.ts` | wbs-settings-storeの`loadWbsSettings`（`DataAdapter`経由の読み込み、旧Zustand persistキー`wbs-settings-storage`からのレガシー移行、schedule-settings-store.test.tsと同型のケース一式）・`getSettings`・`updateColumnName`（楽観的更新・既存レコードなら該当列のみ更新）・`toggleColumnEnabled`・`moveColumn`（先頭列のup等、範囲外操作は無変更でレコードも新規作成しない反証）・`updateLevelColor`（範囲外レベル6は無変更の反証）。17ストアDataAdapter配線の第11弾 |
| `wbs-template-store.test.ts` | wbs-template-storeのCRUD（`DataAdapter`経由・楽観的更新、idの安定性、追加/更新/削除失敗時のロールバック含む）・seedStandardTemplate（DataAdapter上0件時のみシード、既存データがある場合・ローカルstateが未ロードの場合いずれもシードしない反証、`resetWbsTemplateSeedGuardForTesting()`でモジュールスコープの重複防止ガードをテスト間リセット、**load→seed→loadのStrictMode二重マウント競合でもシード結果が消えない反証**＝document-template-storeで発見した同型バグの水平展開）。ストアDataAdapter配線の第4弾 |

### フィーチャーテスト（各 `features/*/utils/__tests__/`, `features/*/components/__tests__/`）

| テストファイル                    | 配置先                                    | 対象                                           |
| --------------------------------- | ----------------------------------------- | ---------------------------------------------- |
| `assignment-utils.test.ts`        | `features/assignment/utils/__tests__/`    | assignment-utilsのユーティリティ関数 |
| `csv-import-utils.test.ts`        | `features/actuals/utils/__tests__/`       | CSV取込コア。列推定（**反証**: 同じ列を複数役割へ割り当てない）・期間解決（範囲外の月/日null）・単位換算（設定値反映・0.01丸め）・buildImportPlan（email大小無視・氏名フォールバック・**反証**: 同名複数skip＝誤帰属防止／タスク列空で複数タスクはskip／0値は「実働ゼロの明示」としてskipしない／1.0人月超もブロックしない／日次行の合算は換算・丸めを合算後に行う（行ごと丸めとの差の反証）・per-row skipの行番号・上書き/計画外の判別・乖離集計）・締め済み月の行skip（**反証**: 他月の行は適用／日次行も月へ丸めた後に判定／closedMonths未指定は後方互換でskipしない、P1-b）（P1-a Phase 2） |
| `csv-import-profile-utils.test.ts` | `features/actuals/utils/__tests__/`   | 取込プロファイル変換。**反証**: 役割→列名保存により列の並びが変わったファイルへ正しく再割当／列名が無い役割はmissing報告／未割当taskはenabled:false／定義外役割は無視／不正unitは人月フォールバック |
| `monthly-actuals-utils.test.ts`   | `features/actuals/utils/__tests__/`       | 月次実績の行モデル構築（buildMonthlyActualsRows）。**反証**: 実績0の明示入力はeffectiveActual=0でzeroActual（計画値へフォールバックしない）／計画0×実績なしの行は出力しない／丸め誤差では稼働超過と誤検知しない／削除済みメンバーのアサインは行に含めない。担当者グループ行の集計・capacityRatio考慮の超過判定・計画外実績（計画0×実績あり）の行化・タスク親遡りのプロジェクトラベル・shiftMonthKey（年またぎ境界）・getDefaultTargetMonth（前月）・summarizeMonthlyActuals（P1-a） |
| `assignment-tree-logic.test.ts`   | `features/assignment/utils/__tests__/`    | ツリー構造のロジック                           |
| `assignment-components.test.tsx`  | `features/assignment/components/__tests__/`| MemberSummaryGrid（デフォルト折りたたみ・担当者名の役割表示・保有スキルタグのホバーアイコン表示条件）を中心としたコンポーネントテスト |
| `TeamMemberDialog.test.tsx`       | `features/team/components/__tests__/`      | 担当者登録・編集ダイアログ（単価履歴NumericInput対応・編集時のみ「スキル・成長記録」タブ表示） |
| `MemberSkillPanel.test.tsx`       | `features/team/components/__tests__/`      | スキルレベル一覧・成長タイムライン・成長ロードマップ（評価記録・目標設定・進捗算出・保有タグ0件時の案内メッセージ） |
| `MemberRow.test.tsx`             | `features/team/components/__tests__/`      | メンバー1行表示（保有スキルタグ全件バッジ表示の非省略反証・タグ0件時の非表示・所属会社名表示とフォールバック・契約形態の表示/非表示） |
| `CompanyBreakdownHoverCard.test.tsx` | `features/team/components/__tests__/`   | トリガーアイコンの存在、内訳データの算出・提示ロジック（defaultOpen propで内容検証、実際のホバー操作による表示切替はE2Eに委ねる） |
| `TeamMemberFilterBar.test.tsx`   | `features/team/components/__tests__/`      | 所属会社複数選択・内部/外部リソース単一選択の操作でコールバックが正しい値で呼ばれること |
| `company-breakdown-utils.test.ts` | `features/team/utils/__tests__/`          | calcCompanyBreakdown（会社ごとの人数集計、companyId=nullの「未設定」独立集計、内訳合計とメンバー数の一致、削除済みcompanyId境界値） |
| `code-generator.test.ts`         | `features/projects/utils/__tests__/`      | プロジェクトコード自動採番                     |
| `navigation-utils.test.ts`       | `features/projects/utils/__tests__/`      | URLクエリパラメータと location.state 優先順位判定 |
| `current-phase-utils.test.ts`    | `features/projects/utils/__tests__/`      | 現在の工程判定（複数該当時はsortOrder最小採用） |
| `wbs-progress-utils.test.ts`     | `features/projects/utils/__tests__/`      | WBS完了フラグからの進捗率ボットムアップ集計・「未完了のみ表示」フィルタ対象ID算出（getIncompleteVisibleIds、配下が全て完了済みのブランチは祖先ごと除外される反証含む）・**ツリー内絞り込み**（getMatchingVisibleIds。一致ノード＋祖先を残す。**反証**: 一致しない兄弟を含めない／空クエリ・空白は空集合／どこにも一致しなければ空集合（全件表示へフォールバックしない）／「未完了のみ」と積集合で併用できる） |
| `external-task-url.test.ts`      | `features/projects/utils/__tests__/`      | 外部タスクURLの解決。4ツールのURL形式・末尾スラッシュ正規化。**反証**: 未起票（externalTaskId=null/空）をリンクにしない／backlog・jiraはbaseUrl不在ならnull（ホストを推測しない）／`javascript:`・`http:`・URL不正のbaseUrlを拒否（XSS防止）／githubの外部IDが`owner/repo#番号`形式でなければnull（CSV経路が`number`だけを誤学習した場合の誤リンク防止）／パストラバーサル・クエリ混入を含む外部IDを拒否／未知ツール（redmine・generic）はnull／**同一ツールでbaseUrlが食い違う複数接続はnull**（別スペースの同名課題へ飛ばさない）・同一値の重複は解決できる |
| `task-sync-utils.test.ts`        | `features/projects/utils/__tests__/`      | 完了同期コア。コード抽出・日付正規化・リーフ判定・列推定（Backlog/Asana/Jira/GitHub）・buildTaskSyncPlan（**反証**: 外部ID優先が件名改変に勝つ／別sourceの外部IDは一致扱いしない／コード重複はskipしてどちらにも書き込まない／非リーフskip／同名複数skip／変化なし行は適用も学習もしない／完了日なしはtoday／Asana型=Completed At非空判定／同一タスク複数行は最終行優先／per-row skip）・buildWbsExportRows（形式別ヘッダ・直近親グループ列・配下限定・completionCriteria転記）。GitHubプリセット（**反証**: `number`列をexternalKeyに推定しない＝経路間のID分裂防止／`CLOSED`大文字が完了扱い／エクスポート形式`TASK_SYNC_EXPORT_FORMATS`にgithubを含めない） |
| `wbs-template.test.ts`           | `features/projects/utils/__tests__/`      | WBSテンプレート適用（applyWbsTemplate）。全ノード数分addProjectが呼ばれること・トップレベル工程がlevel+1で作成されること・UT/ITa/ITb/負荷試験の孫ノード（方針/計画/実施/報告、level+2）・リーフは完了条件を持ち親ノードは持たないこと・カスタムテンプレート指定・2回適用時のコード重複なし反証 |
| `wbs-template-editor-utils.test.ts` | `features/projects/utils/__tests__/`   | WbsTemplateTreeGrid/WbsTemplatesPageのツリー編集用純粋関数（EditorNode型）。toEditorNodes/fromEditorNodesの往復変換・id一意性・childrenキー省略・countTemplateNodes・updateEditorNode（孫ノード更新・存在しないid指定時に例外を投げず元のツリーを維持する反証）・addRootEditorNode/addChildEditorNode・removeEditorNode（子ごと削除）・isDescendantEditorNode/moveEditorNode（末尾の子として移動・自分自身/自分の子孫へのドロップは何も変更しない反証）・WBS画面と同一のキーボードショートカット体系: addSiblingAfterEditorNode（Alt+Enter同階層追加）・promoteEditorNode（Alt+←階層上げ、既にルート階層の場合は変更しない反証）・demoteEditorNode（Alt+→階層下げ、直前の兄弟が無い場合は変更しない反証・ルート直下と孫階層の両方で確認） |
| `EstimatesPage.test.tsx`         | `features/estimates/pages/__tests__/`     | 見積ページ（実ストア＋実LocalJsonAdapter）。`?projectId=`自動選択と版一覧（幅の導出表示）・簡易FPで記録すると換算結果（70FP→87.5人日→438万円）が実localStorageへ永続化される・振り返りタブの誤差比と判定。**反証**: ラベル空では記録できない／取り消しの確認をキャンセルすれば消えない・確定すれば消える／未選択は案内カード |
| `ProjectDialog.test.tsx`         | `features/projects/components/__tests__/` | 案件ダイアログ（担当部門選択欄の表示条件・送信値含む） |
| `ProjectEvmDialog.test.tsx`      | `features/projects/components/__tests__/` | 単一プロジェクト用EVM読み取り専用ダイアログ。**反証**: `ProjectProgressEntry`が無くてもWBSに完了チェックがあればチャートを描画する（工数加重EV導入に伴う表示条件の緩和） |
| `portfolio-utils.test.ts`        | `features/projects/utils/__tests__/`      | ポートフォリオの行モデル構築。悪い順ソート（納期超過criticalが先頭）・**反証**: 完了済み案件は行にしない／判定材料の無い案件はunknownで末尾／金額非表示で金額系判定が除外されoverallも非金額のみから導出される／同overall内は指摘件数→コード昇順の決定論ソート（入力順非依存）／削除済みdivisionIdの部門名はnull |
| `risk-utils.test.ts`             | `features/projects/utils/__tests__/`      | リスクの重大度導出（3×3全組み合わせの決定論マップ）・表示順ソート（open→realized→closed／重大度／期限昇順null末尾）。**反証**: 入力順に依存しない／元配列を破壊しない（非公開の設計文書） |
| `project-summary-utils.test.ts`  | `features/projects/utils/__tests__/`      | プロジェクトサマリーの判定ルール。**反証**: R4境界値=gap15.0ptちょうどは警告しない（0.45−0.30の浮動小数点誤差をepsilonで吸収、実装中にテストで発見）／R5境界値=SPI0.90ちょうどは警告しない／受注額もBACも無い案件でR4が誤発火しない／進捗未記録・完了済み案件のスキップ／マイルストン配分0件はR7を出さない（運用未開始のノイズ回避）／未来週のEVMポイントをSPI/CPIに使わない／削除済みメンバー・他案件・全ゼロ配分を体制行に含めない／金額非表示でfinancial判定が除外される。閾値の引数上書き（設定値反映）・重大度順ソート含む |
| `ProjectSummaryPage.test.tsx`    | `features/projects/pages/__tests__/`      | プロジェクトサマリーページ（実ストア＋実LocalJsonAdapter、シードは`DatabaseSchema.parse`で自己検証=静かな読み込み失敗の予防）。クエリパラメータ自動選択・納期超過での総合判定「危険」。**反証**: 金額非表示時に金・商流セクションが一切描画されない（非金額の判定・体制は残る）／プロジェクト未選択時は案内カードのみ |
| `ProjectCommerceDialog.test.tsx` | `features/projects/components/__tests__/` | 商流管理ダイアログ（実ストア＋モックDataAdapter）。受注情報サマリー・受注残の表示、配分不一致警告。**反証**: 受注額未設定の案件では配分警告を出さない（誤報防止）／承認済みCRに操作ボタンを表示しない（二重反映の入口を作らない）。承認ボタン→受注額反映の配線確認 |
| `billing-milestone-utils.test.ts` | `features/projects/utils/__tests__/`   | 請求マイルストン集計。売上計上は検収基準（**反証**: planned=未検収を売上に含めない）・配分ギャップ（**反証**: 受注額未設定はnull=判定不能）・受注残 |
| `commerce.test.ts`               | `shared/types/__tests__/`                | ChangeRequest/BillingMilestoneのZodスキーマ（差分額の負値拒否・定義外status拒否・title空文字拒否・DatabaseSchemaの後方互換） |
| `statement-utils.test.ts`        | `features/statements/utils/__tests__/`   | 月次明細の行構築＋CSVマッピング用レコードビルダー（**反証**: 合計行を含まない=外部取込の混入エラー防止）＋準委任精算（**反証**: 按分合計=精算額（丸め差調整）／計画モード・発注元向け・幅なしメンバーには適用しない／換算設定反映）。**核心の反証**: 協力会社向けは契約単価であって見積単価ではない（両者が異なるメンバーで検証）／契約単価未入力は0のまま出力し見積単価へフォールバックしない（過大支払・入力漏れ検知）／内部リソース・所属未設定は支払対象外。複数タスク合算・月別単価改定の解決・実績モード（例外入力優先）・CSV行と合計 |
| `report-csv.test.ts`             | `features/reports/utils/__tests__/`      | CSV帳票の行データ構築。案件別収支（既存ロジックと同一数値・**反証**: 受注額未設定の案件は粗利/利益率を空欄にする）・要員別稼働（実績は例外入力優先/未入力は計画値・**反証**: アサイン無しメンバー非出力・期間外月の除外）・部門予算予実（整形のみ） |
| `AlertCenter.test.tsx`           | `features/dashboard/components/__tests__/` | アラートセンターの表示（重大度順ソート・件数バッジ・分類ラベル・0件時の案内） |
| `BaselineFreezeDialog.test.tsx`  | `features/projects/components/__tests__/` | 計画の凍結ダイアログ。版番号のタイトル表示・BAC/アサイン計画総額/月数の提示・v1のみ理由の初期値が「当初計画」・onConfirm呼び出し・アサイン計画0件時の警告表示。**反証**: 凍結理由が空/空白のみでは凍結できない（履歴で「なぜ再凍結したか」を追えなくなるため） |
| `WhatIfSimulationDialog.test.tsx` | `features/projects/components/__tests__/` | What-ifシミュレーション（人・モノ・金の三位一体強化）。タスク除外チェックボックスで概算予算が減ること・中間ノード除外時の配下チェックボックス無効化・project=nullでのクラッシュ非発生の反証含む |
| `WbsTemplateDialog.test.tsx`     | `features/projects/components/__tests__/` | ストックしたWBSテンプレートの選択・適用のみを行う軽量ピッカー。一覧表示（タスク数バッジ・0件時の案内）・適用ボタンの選択有無による活性制御・onApply呼び出し・「テンプレートを管理」で/wbs-templatesへ遷移・再オープン時に前回選択がリセットされる反証。ツリー編集UI自体はWbsTemplatesPage/WbsTemplateTreeGridへ移設したため本コンポーネントには無く、E2Eでのみ確認予定（AG Grid系コンポーネントはjsdomでの描画信頼性が低いためProjectTreeGridと同様に単体テスト対象外） |
| `DocumentTemplatesPage.test.tsx` | `features/document-templates/pages/__tests__/` | ドキュメントテンプレート管理画面（実ストア＋モックDataAdapter）。マウント時の標準シード・先頭テンプレートの編集表示・新規作成（OKF準拠の初期本文）・本文blur保存・削除確認ダイアログ。**反証**: 空のテンプレート名はblurしても保存されない |
| `DocumentTemplateLinkDialog.test.tsx` | `features/projects/components/__tests__/` | WBSテンプレートノードへのドキュメントテンプレート紐づけダイアログ。選択済み表示・onSave呼び出し・テンプレート0件時の案内・node=null時の非描画。**反証**: 存在しないテンプレートid（削除済みへの参照）は保存時に自動除去される |
| `keyboard-navigation-utils.test.ts` | `features/assignment/utils/__tests__/`    | 編集中の上下キー行移動判定 |
| `expense-budget-utils.test.ts`   | `features/budget/utils/__tests__/`        | 契約更新警告しきい値・消化率・年度末着地予測・月次推移・概算予算算出・その他費用実績合計・BudgetBreakdown[]の予算額合計/実績明細合計(calcBudgetBreakdownAmountTotal/calcBudgetBreakdownActualRecordsTotal)・SaaS残り予算・AI利用費メンバー配分合計・案件タブ合計行(calcProjectRowsTotal)・AI利用費メンバー配分月次集計(calcAiUsageAllocationSummaryForMonth)・案件別損益(calcProjectProfitability、受注額vs実コスト＝実人件費＋実付帯費用、境界値: contractAmount未設定時のnull利益率・他案件混在除外含む)・予算超過アラート(isProjectBudgetOverrun、しきい値カスタマイズ・contractAmount未設定時の判定不能falseの反証含む、人・モノ・金の三位一体強化） |
| `BudgetAdjustmentDialog.test.tsx`（「その他予算変更」改称・増額/減額区分選択・履歴の符号付き表示含む） / `BudgetBreakdownDialog.test.tsx`（`allowedCategories`対応・実績明細ボタン・担当部門ヒント表示含む） / `DivisionBudgetPanel.test.tsx`（5列3行セル構成・案件予算列のWBS概算予算額合算・「その他のPJ予算」「その他予算変更」ボタン含む） / `OtherExpensePanel.test.tsx`（合計行含む） / `PersonnelCostSummary.test.tsx`（4エリア統合パネル・案件工数との比較・現在の内部/外部リソース人数表示・年間総合予算額の実数入り計算式表示含む） / `PersonnelPlanPanel.test.tsx`（統合表対応・末尾の合計行（月別合計人数）含む） / `ProjectBudgetView.test.tsx`（合計行の視覚統一・divisionId prop対応・割当/未割当工数列・受注金額/粗利列(案件別損益、contractAmount・アサイン・BudgetBreakdown揃った状態でのクラッシュ非発生の反証含む)含む） / `SaasContractDialog.test.tsx`（plan（グレード・プラン）入力・送信検証含む） / `SaasContractTable.test.tsx`（divisionId prop対応・全部門集計） / `AllDivisionsBudgetSummary.test.tsx`（「全部門」選択時の読み取り専用集計カード） / `AiUsageGrid.test.tsx`（＄単位、プロバイダ0/1/複数件の表示切替・プロバイダセレクタの初期値未選択時のonProviderChange通知/切替時のonProviderChange呼び出し/削除時フォールバック通知・課セレクタの常時表示（「部門全体」廃止の反証含む）・未分類行非表示（データは合計に算入継続）・課切替/プロバイダ切替の両方で個人予算合計等4行が連動して変わること・予算合計行の合算・削除確認ダイアログ含む） / `AiUsageProviderDialog.test.tsx`（プロバイダ追加・編集・バリデーションエラー） / `AiUsageMemberAllocationPanel.test.tsx`（4列構成・＄単位・残額計算式・課セレクタ非表示の反証・課絞り込み済みフッター合計・プロバイダ絞り込み済みフッター合計・絞り込み済みmemberIds＋選択中providerId付き一律設定） | `features/budget/components/__tests__/` | 予算管理タブ配下コンポーネントの単体テスト |
| `dashboard-utils.test.ts`        | `features/dashboard/utils/__tests__/`     | ダッシュボードユーティリティ（カテゴリ×レベル別スキル分布getSkillLevelDistribution・四半期レビュー未実施件数getStaleSkillReviewCount含む） |
| `tech-tag-category.test.ts`      | `features/tech-tags/utils/__tests__/`     | TechTagCategory/SubCategoryスキーマ・ストアCRUD（実`LocalJsonAdapter`経由・idの安定性・カスケード削除含む） |
| `tech-tags-store.test.ts`        | `stores/__tests__/`                       | tech-tags-storeのDataAdapter失敗時ロールバック（追加/更新/カテゴリ削除/サブカテゴリ削除/読み込み、`tech-tag-category.test.ts`を補完）・**楽観ロックの期待値**。本ストアは3つの更新アクションが同名`previous`で**別々の配列**を指すため取り違えが型で検出できない。**反証**: タグ/カテゴリ/サブカテゴリがそれぞれ自分自身のupdatedAtを送る（3種へ意図的に別日付を仕込み、取り違えれば必ず落ちるようにした。実際に別配列参照へ改変して落ちることを確認済み）／対象が見つからない場合に他レコードの版を掴まない（undefinedで送る） |
| `demo-data.test.ts`              | `features/reports/data/__tests__/`        | デモデータ生成（EVM用: ルートプロジェクトへのdivisionId決定論的ローテーション割り当て・ProjectProgressEntry週次進捗率サンプル生成、所属会社（Company・Member.companyId/contractUnitPriceHistory）、システム設定（estimatedUnitPrice/defaultCoefficient/projectCoefficients/exchangeRateHistory）、部門予算一式（DivisionBudget・BudgetBreakdown・実績明細・BudgetAdjustment増減両区分）、AI利用費（AiUsageEntry・AiUsageMemberAllocation）、SaaS契約、人員計画4区分、スキル評価・成長ロードマップ目標の生成・整合性検証を含む） |
| `schedule-schemas.test.ts`       | `features/schedule/utils/__tests__/`      | スケジュール関連Zodスキーマ                    |
| `schedule-store.test.ts`         | `features/schedule/utils/__tests__/`      | schedule-storeのCRUD（`DataAdapter`経由・楽観的更新、idの安定性、deleteByProjectのentries/dependencies双方ロールバック含む）・依存関係 |
| `svar-gantt-utils.test.ts`       | `features/schedule/utils/__tests__/`      | ガントチャートデータ変換ユーティリティ。進捗の描画: 0.0〜1.0→0〜100への変換・四捨五入。**反証**: 紐づくタスクが無い工程（null）は`progress`キー自体を持たない／進捗0%はキーを持つ（未紐づけと区別される） |
| `tour-route-map.test.ts`         | `features/guide-tour/utils/__tests__/`    | ツアールートマッピング                         |
| `RequireAuth.test.tsx`           | `features/auth/components/__tests__/`     | ルートガード。**localモードではrequiredRole指定含めrestoreSessionを一切呼ばずchildrenをそのまま描画する反証**（既存機能を変えない制約の担保）・postgresモードでの未認証時リダイレクト・ロール不足時のリダイレクト |
| `LoginPage.test.tsx`             | `features/auth/pages/__tests__/`          | ログインフォームのバリデーション・login()呼び出し・エラーメッセージ表示 |
| `users-api.test.ts`              | `features/admin/api/__tests__/`           | ユーザー管理APIクライアント（listUsers/createUser/updateUser、Authorizationヘッダー付与、ApiErrorへの変換） |
| `UserManagementPage.test.tsx`    | `features/admin/pages/__tests__/`         | ユーザー一覧表示・自分自身の操作無効化・追加ダイアログ・ロール変更・一覧取得失敗時のエラー表示。担当者の紐づけ（**反証**: 自分自身でも担当者の紐づけは変更できる＝ロール変更・自己無効化の制限とは別の話）。行内に複数のcomboboxが並ぶため`aria-label`（「〜さんのロール」「〜さんの担当者」）で特定する＝列追加で壊れないクエリ |
| `notifications-api.test.ts`      | `features/admin/api/__tests__/`           | 通知チャンネル管理APIクライアント。Authorizationヘッダー付与・テスト送信・**反証**: PATCHでwebhookUrl未指定（undefined）はボディにキー自体を含めない（=変更なしの3値セマンティクス） |
| `NotificationSettingsPage.test.tsx` | `features/admin/pages/__tests__/`      | 通知設定画面。チャンネル一覧・送信ログ・追加ダイアログ→create・テスト送信失敗時のdestructiveトースト・削除確認・取得失敗表示。**反証**: 接続先未設定/無効バッジは該当チャンネルのみ／編集でURL空のまま保存はundefined（変更なし） |
| `MyTasksPage.test.tsx`           | `features/my-tasks/pages/__tests__/`      | 自分の担当。配分のあるタスクを期日つきで表示・完了/進行中の区別・未完了件数。**反証**: 担当者未紐づけなら空表ではなく案内を出す／他人のアサインを表示しない／**金額に類する語（万円・単価・金額・予算・原価）を一切表示しない**（partnerが開く画面の要件をテストで固定） |
| `AuditLogsPage.test.tsx`         | `features/admin/pages/__tests__/`         | 監査証跡の閲覧画面＋保持管理。保持状況の表示・確認ダイアログを経たパージ・基準日時がISO 8601で渡ること。**反証**: ボタン押下だけでは削除しない（取り消せない操作の誤爆防止）／キャンセルすれば削除しない／保持状況の取得に失敗しても一覧は表示される。update=before→after表示・create=差分なし・delete=削除直前の値の要約・0件案内・取得失敗表示。**反証**: 削除されたユーザーの操作もメールで辿れる（actorIdにFKを張っていない設計の帰結）／操作者不明でも行が消えない／null への変更を空欄でなく「（未設定）」と示す／絞り込みの選択肢取得に失敗しても一覧は表示される |
| `ApiKeysPage.test.tsx`           | `features/admin/pages/__tests__/`         | APIキー管理画面。一覧・OASリンク・発行で平文が一度だけ表示・無効化・削除確認。**反証**: 名前空で発行するとAPIを呼ばない |
| `MasterCsvImportCard.test.tsx`   | `features/admin/components/__tests__/` | マスタCSV一括登録の画面（実ストア＋実LocalJsonAdapter）。列一覧の表示・CSVを選んで適用すると実データになる（メンバー＋マスタ／プロジェクト階層／アサインの月次配分）・テンプレートDL・**2段階のプレビュー**（選択直後の生CSV／確認画面の「登録される内容」）。**反証**: 自動作成のチェックを外すと未登録マスタの行が取り込めず適用ボタンも無効／既存と一致する行は取り込まない／確認画面を見ただけではデータが変わらない／取り込まない行はプレビューに出ない |
| `SystemSettingsPage.test.tsx`    | `features/admin/pages/__tests__/`         | 全社設定。旧Layoutのポップオーバーから移設した項目の初期表示と保存アクション。マウント時の`loadBudgetData()`（未ロードのまま保存すると他フィールドを空で上書きする既知の事故への対策）。**反証**: 為替レートは履歴の最新ではなく対象月に適用される値を出す／しきい値は%表示だがストアへは比率で渡す／金額の表示トグルはaria-pressedで状態を示す（ラベルがアクセシブルネームを担うため文言では読めない）／初期設定ウィザードは開く指示のあとダッシュボードへ遷移する（本体はDashboardPageがマウントするため） |
| `ExternalToolsPage.test.tsx`     | `features/admin/pages/__tests__/`         | 外部ツール接続画面。一覧・起票先サマリ・新規追加の送信値・接続テスト失敗のdestructiveトースト・削除確認。**反証**: 接続0件は空状態のみ／APIトークン未入力では追加ボタンが無効（認証情報なしの接続を作らない）／編集でトークン空欄のままならボディに`apiToken`キー自体を含めない（=変更なしの3値セマンティクス） |

### 共有レイヤーテスト

| テストファイル              | 配置先                                  | 対象                                           |
| --------------------------- | --------------------------------------- | ---------------------------------------------- |
| `auth.test.ts`              | `shared/types/__tests__/`               | 5ロール＋権限マトリクス。UserRoleSchemaの5値受理・定義外拒否、全ロール×全権限のマトリクス網羅、roleSatisfiesの線形階層網羅。**反証**: partnerはfinancials:readを持たない／editorはgovernance:approveを持たない（職務分掌）／managerはusers:manageを持たない（管理者権限の分離）／階層上位ロールは下位ロールの全権限を包含する（roleSatisfiesとhasPermissionの判定矛盾防止） |
| `risk.test.ts`              | `shared/types/__tests__/`               | RiskEntryスキーマ（非公開の設計文書）。3段階enumの定義外拒否・title空拒否・dueDateの暦検証・statusの既定値open・**response/noteのnull受理**（サーバーtext列の未設定がexport/import往復で400になる実バグを統合テストで検出し修正した回帰反証）・UpdateがprojectIdを受け付けない・DatabaseSchema後方互換 |
| `document-template.test.ts` | `shared/types/__tests__/`               | DocumentTemplateスキーマ（phase/description null許容・content空文字許容・100000文字上限・sourceRefs省略可・Create/Update派生型）・DatabaseSchema統合（後方互換: documentTemplatesなしの既存データもparse成功）。**反証**: phaseフィールド欠落は拒否（nullableだがoptionalではない）／配列内の不正レコード検出 |
| `document-template-master.test.ts` | `shared/data/__tests__/`         | プリセットの整合性。全33エントリのCreateDocumentTemplateSchema適合・IPA出典保持・OKF準拠（frontmatterにtype/title/status/sources、本文h2開始）・`createEmptyOkfContent`。**反証**: 固定UUIDが16進数のみの正しい形式（E2Eシードの静かな失敗予防）／id重複なし／STANDARD_WBS_TEMPLATEの全documentTemplateIdsがマスタに実在（参照切れなし）／要件定義・基本設計の全ドキュメントノードに紐づけあり（デフォルトで使える状態）／運用設計工程の補完 |
| `use-financial-visibility.test.tsx` | `shared/hooks/__tests__/`       | 金額表示可否フック。localモード=表示トグル・postgresモード=ロール権限。**反証**: partnerはfalse／未ログインはフェイルクローズでfalse／postgresモードでは表示トグルの抜け道が効かない／localモードではロールに影響されない |
| `FinancialAccessGuard.test.tsx` | `shared/components/__tests__/`      | 金額専用ページのガード。可視ならchildren描画。**反証**: 不可視時はchildrenを一切描画せず案内カード表示（localトグルOFF・postgresのpartner両方） |
| `CsvMappingExportDialog.test.tsx` | `shared/components/__tests__/`      | マッピングエディタ。**反証**: 無効列がプレビューから消える／空名は保存不可／全列無効でダウンロード不可／並び替え・改名の反映／保存内容（enabled/改名）のstore永続化 |
| `csv-mapping-utils.test.ts`   | `shared/utils/__tests__/`             | 変換コア＋請求データソース。**反証**: 存在しないfieldは空欄=弱参照／0を欠損扱いしない／BOM非含有契約／参照切れマイルストン除外／カタログkeyと行キーの整合 |
| `payment-terms-utils.test.ts` | `shared/utils/__tests__/`             | 支払サイト。`calcPaymentDueDate`（**反証**: 31指定は月末扱い＝うるう年2月末へクランプ・年またぎオフセット）・`formatPaymentTermsLabel`（「月末締め 翌月末払い」形式） |
| `cost-breakdown-utils.test.ts` | `shared/utils/__tests__/`            | 原価4区分。**反証**: 労務費＋外注費は既存の実人件費と丸めに関わらず一致（恒等式。独立丸めなら±1万円ずれる境界値で検証）／削除済みメンバーのアサインは労務費・外注費・配賦基準のどれにも入らない／divisionId未設定案件は配賦対象外（分母にも入らない）／配賦基準合計0はゼロ除算回避／案件紐づき実績明細は間接費原資に入らない／他部門・他年度の費用は原資に混入しない／為替未設定のAI利用費は0円換算。間接費の直接工数比例配賦（実績優先の基準）・年度外の月の除外 |
| `task-creation-core.test.ts`  | `shared/utils/__tests__/`             | API起票の対象抽出。リーフのコード昇順抽出・直近親グループ付与。**反証**: 起票済み（外部ID学習済み）はskip＝再実行で二重起票しない／別ツールで学習済みもskip（1タスク1外部ツール）／非リーフ・ルート外・存在しないIDは対象外（クライアント申告を信頼しない）／ルート直下のリーフは空グループを作らない。**期日の導出**: 所属工程のスケジュール終了日が`dueDate`になる。**反証**: 工程未設定は期日なし（案件の納期で代用しない）／工程はあるがスケジュール未登録なら期日なし／スケジュール引数を渡さない既存呼び出しでも壊れない（後方互換）／別案件のスケジュールを使わない |
| `assignment-snapshot-utils.test.ts` | `shared/utils/__tests__/`       | アサインスナップショットの記録と差分。**反証**: 他案件のアサインを含めない／配分が全て0の行は記録も差分もしない／元オブジェクトを共有しない（後の編集が記録へ波及しない）／変化が無い行は返さない／浮動小数点の丸め誤差を変化と誤検知しない／同じメンバーでもタスクが違えば別行／0へ落としたアサインはremoved扱い／並びは入力順に依存しない |
| `master-import-core.test.ts`  | `shared/utils/__tests__/`             | マスタCSV取込の列定義とヘッダ解決。**反証**: テンプレートのヘッダは正規化すると列定義と完全に一致する（配ったものが通る）／必須マーク`*`を落とす／全角英数・前後空白の吸収／月として成立しない列は拾わない／同じ月が2列あっても畳む（二重計上の防止）／記入例の行を入れない |
| `master-import-members.test.ts` | `shared/utils/__tests__/`           | チームメンバーCSVの突合。**反証**: メール一致・同名（メールなし）は取り込まない＝現行データを上書きしない／CSV内の重複は2件目をskip／自動作成OFFなら未登録マスタの行はskip／同名の課でも部門が違えば別扱い／契約単価は所属会社なしでは取り込まない／単価0は「0円」として扱う（未入力と区別）。値の検証8種・境界値（稼働率1.0ちょうど） |
| `master-import-projects.test.ts` | `shared/utils/__tests__/`          | プロジェクト・タスクCSVの突合。**反証**: 子が先に書かれていても解決し親→子の順で返す／親が無い行はskip（勝手に最上位へぶら下げない）／循環はskip（無限ループしない）／5階層超はskip／既存コード・CSV内重複はskip（突合キーで新たな重複を作らない）／タスク行に書かれた受注金額・担当部門は取り込まない |
| `master-import-assignments.test.ts` | `shared/utils/__tests__/`       | アサインCSV（横持ち）の突合。**反証**: 同名の担当者はskip（メールで指定させる）／プロジェクトコード列が実際のルートと食い違えばskip／既存アサインは上書きしない／0・空欄はキーを作らない／計画は1.0上限（実績と違う）／締め済み月のセルだけ落とし、全月が締めなら行ごとskip |
| `master-import-preview.test.ts` | `shared/utils/__tests__/`           | 登録される内容のプレビュー。既存マスタは名前で・新規は「（新規）」つきで出す／単価は適用開始月つき／プロジェクトは階層をインデント表示／アサインは月ごとの配分と合計。**反証**: 取り込まない行はプレビューに出ない（自動作成OFFで落ちた行も同様）／配分の無い月は空欄（「入力した0」と区別）／どの行も使っていない月は列に出ない／未設定は—で埋める |
| `master-import-apply.test.ts` | `shared/utils/__tests__/`             | 取込の適用（注入したスパイで検証）。マスタを作ってから紐づける／**反証**: 同じ部門・課を参照する行が複数あってもマスタは1つずつ／部門は既存・課だけ新規なら既存部門の下に作る／単価が空欄なら0円の履歴を作らない／親→子の順にidを渡す／候補0件なら何も書き込まない |
| `color-contrast.test.ts`      | `shared/utils/__tests__/`             | コントラスト計算。相対輝度・コントラスト比・文字色の選択。**反証**: 全色空間を粗く走査してもAA（4.5:1）を下回らない（白/黒の二択で足りるという設計前提の検証）／明るい色に白を選ばない（従来の#fff固定で違反していた実際のタグ色で確認）／不正な色は白へフォールバックし表示を壊さない |
| `task-assignee-utils.test.ts` | `shared/utils/__tests__/`             | WBSの担当者表示。配分最大のメンバーを主担当とし複数月を合算、実績の例外入力を優先。**反証**: 対象期間に配分が無いアサインは担当にしない（過去に外れた担当を残さない）／配分が全て0も同様／削除済みメンバーへの参照は担当にせず、残ったメンバーが主担当になる／同率でも入力順に依存せず一意に決まる／別タスクのアサインを混ぜない。`formatTaskAssignee`の「他N名」表記 |
| `my-task-utils.test.ts`       | `shared/utils/__tests__/`             | 自分の担当タスクの行モデル。配分合計・期日の導出・同一タスクへの複数アサインの合算。**反証**: 他人のアサインを含めない／対象月の配分が全て0・対象月外のみの配分は行にしない（過去に外れた担当を残さない）／削除済みタスクへの参照は行にしない／memberId未紐づけなら何も返さない／工程未設定は期日null（案件の納期で代用しない）／期日昇順で期日なしは末尾／完了済みも表示するが区別する |
| `global-search.test.ts`       | `shared/utils/__tests__/`             | 横断検索。コード・名前の部分一致、level0=project/level>0=task の分類、遷移先の解決。**反証**: 空クエリ・空白のみは何も返さない（全件でパレットを埋めない）／退職済みメンバーは対象外／結果は20件で打ち切る／コード完全一致＞前方一致＞部分一致の順／同点はプロジェクト→タスク→担当者の順／親が辿れない壊れたタスクはWBSのクエリを付けない（存在しないIDへ飛ばさない） |
| `task-phase-utils.test.ts`    | `shared/utils/__tests__/`             | WBSタスクと工程の紐づけ。`findRootProjectId`・`resolveTaskPhaseKey`（自身→祖先の継承）・`resolveTaskDueDate`・`calcPhaseProgress`。**反証**: parentIdの循環・自己参照・孤児でも無限ループせずnull／自身のphaseKeyが祖先より優先／空文字は未設定として祖先へ遡る／工程未設定は期日null／別案件の同じ工程キーを拾わない／**紐づくタスク0件の工程はnull（進捗0%と区別）**／工数0はタスク数ベースへフォールバック／非リーフを母数に含めない（二重計上防止）／別工程・別案件・無効列の工数を混ぜない |
| `function-point-utils.test.ts` | `shared/utils/__tests__/`            | 簡易FPの重み表と換算。**反証**: 概算法でEI/EO/EQの行があっても数えない／時間/日・人日/人月が0以下でも0（NaN/Infinityを出さない）／2桁丸め・整数万円の境界／同じ入力なら常に同じ結果（設定値を凍結すれば履歴が動かない根拠） |
| `uncertainty-cone.test.ts`    | `shared/utils/__tests__/`             | 不確実性コーン。6段階の幅が出典どおり・段階が進むほど狭まる・完了は1x。**反証**: 境界（下限・上限ちょうど）は内側／計算で作った境界値を丸め誤差で外側と誤判定しない／見積0は判定不能（null） |
| `estimate-snapshot-utils.test.ts` | `shared/utils/__tests__/`         | 版の選択と差分。**反証**: 他案件の版を混ぜない／どちらかがFP版でなければFP項目の差分は出さない／変化の無い項目は返さない／同名複数行は先勝ちで重複扱いしない |
| `estimate-retrospective-utils.test.ts` | `shared/utils/__tests__/`    | 振り返り。**反証**: 未来月の配分を実績に含めない／他案件・削除済みメンバーの配分は除外／計画外稼働（実績だけの月）も拾う／見積0はnull／FP版が無い・totalFp=0はnull／最新のFP版を使う／実績の記録が無い案件は校正の標本に入れない／実績の時間/日は記録時の値を使う |
| `settlement-utils.test.ts`    | `shared/utils/__tests__/`             | 準委任精算コア。**反証**: 境界値（下限/上限ちょうど）は幅内／実績0は控除0円／幅未設定・片側のみ・上下逆転は固定扱い／換算設定の反映／控除・超過の計算値 |
| `estimate-snapshot.test.ts`   | `shared/types/__tests__/`             | EstimateSnapshotのZodスキーマ。**反証**: 概算法でEI/EO/EQの行があると拒否／実績（actual）は完了段階以外で拒否／FP法なのにFP項目が無い・FP法以外にFP項目がある／WBS法の要約の有無／FP法で人時/FPが凍結されていなければ拒否／件数0・名前空・空ラベル・版0・負の工数。Create派生型も同じ整合検証を行う |
| `csv-mapping.test.ts`         | `shared/types/__tests__/`             | CsvMappingProfileスキーマ（direction定義外拒否・header空/order負数拒否・DatabaseSchema後方互換） |
| `GettingStartedCard.test.tsx` | `shared/components/__tests__/`        | 「はじめに」カード。空データで表示・開始ボタンでウィザードが開く・デモ試用中の切替ラベル。**反証**: 業務データが1件でもあれば表示しない／閉じると永続化され再レンダーでも出ない／デモ試用中でも閉じた後は表示しない |
| `SetupWizardDialog.test.tsx`  | `shared/components/__tests__/`        | 初期設定ウィザード（実ストア＋実LocalJsonAdapter）。完走で部門・課・担当者・プロジェクト＋標準テンプレートが作成され担当部門が自動設定される。**反証**: 実データありでデモボタン非表示（誤爆上書き防止）／全スキップで何も作らない／プロジェクト名空白のみは作成しない／本番切り替えはキャンセルでデータ不変・確定で全削除＋demoDataActive解除＋基本設定へ／単価未入力の担当者は0円履歴を作らない |
| `wbs-template-apply.test.ts`  | `shared/utils/__tests__/`             | WBSテンプレート一括適用（元features/projects/utils/__tests__/wbs-template.test.tsから移設。テスト内容は不変） |
| `project-code-generator.test.ts` | `shared/utils/__tests__/`          | プロジェクトコード自動採番（元features/projects/utils/__tests__/code-generator.test.tsから移設。テスト内容は不変） |
| `demo-data.test.ts`           | `shared/data/__tests__/`              | デモデータ生成（元features/reports/data/__tests__/から移設。テスト内容は不変） |
| `budget-utils.test.ts`      | `shared/utils/__tests__/`               | 売上予算・見込売上・適用単価・プロパー人件費・超概算額・SaaS年間コスト計算・案件概算予算額(calcProjectEstimateBudget(s))・為替レート適用値取得(getApplicableExchangeRate)・＄→万円換算(convertUsdToManYen)・全部門横断集計(sumAcrossDivisions、)・契約単価対象範囲判定(isMonthWithinContractRange、境界値・undefined/空配列の反証含む)・メンバー編集時の新規範囲外アサイン検出(getNewlyOutOfRangeAssignmentMonths、既存不整合除外の反証含む、) |
| `allocation-input-utils.test.ts` | `shared/utils/__tests__/`          | 月次配分値入力のパースコア（parseAllocationInput）。全角変換・空文字=0・負値/非数値=null・0.01丸め。**反証**: maxを指定しない場合は1超も受け付ける（実績は上限でブロックしない）／max=1指定時は1.01でnull（計画の既存挙動）・丸めでmax以下に収まる境界値（P1-a） |
| `task-sync.test.ts`         | `shared/types/__tests__/`               | TaskSyncLogスキーマ（channel/source空文字拒否・skippedReasons100件上限・DatabaseSchema統合）・Projectの外部参照フィールド受理と後方互換 |
| `actuals.test.ts`           | `shared/types/__tests__/`               | MonthlyActualsConfirmation/ActualsImportLog/MonthlyCloseEventのZodスキーマ（monthのYYYY-MM形式・confirmedAtのISO datetime・skippedReasons100件上限・fileName境界値・close/reopenアクションenum・空文字理由の拒否・DatabaseSchemaへの統合と後方互換・hoursPerDayの0以下拒否） |
| `effort-utils.test.ts`      | `shared/utils/__tests__/`               | WBS工数計算ユーティリティ。What-ifシミュレーション用の除外集計（calcWhatIfTotalEffort、葉タスク単体除外・中間ノード除外時の配下一括除外・全除外時の0返却・efforts配列非破壊の反証含む、人・モノ・金の三位一体強化）      |
| `navigation-utils.test.ts`  | `shared/utils/__tests__/`               | URLクエリパラメータと location.state 優先順位判定 |
| `date-only.test.ts`         | `shared/types/__tests__/`               | 日付のみスキーマの暦検証。**反証**: 月ごとの日数を超える日（2026-02-30・4/31・6/31・9/31・11/31）／平年の2/29（100年ルールの1900年含む）／`2026-99-99`のような範囲外を拒否し、閏年（2024・2000）は受理する |
| `iso-week-utils.test.ts`    | `shared/utils/__tests__/`               | ISO 8601週番号（getIsoWeekKey・getIsoWeekMonday/Sunday・getIsoWeeksInRange）。境界値: 53週年、年またぎ週、逆転範囲。`isValidDateOnly`の暦検証 |
| `csv-utils.test.ts`         | `shared/utils/__tests__/`               | CSV生成。RFC 4180エスケープ（カンマ・ダブルクォート2連・改行）・null/undefinedの空文字化・CRLF・**反証**: 生成結果にBOMを含めない（ダウンロード時に1回だけ付与する契約）。パース（parseCsv）: BOM除去・クォート内カンマ/改行/2連クォート・LF/CR/改行なし末尾行・**反証**: 完全な空行は行として数えないが空フィールドを含む行は消さない・toCsvContentとの往復保存（P1-a Phase 2） |
| `alert-utils.test.ts`       | `shared/utils/__tests__/`               | アラート判定。納期超過（境界値: 納期当日は超過でない）・線形予測による遅延予測・**反証**: 進捗率0は予測しない（誤報防止・ゼロ除算回避）／完了済み案件は納期超過でも対象外／丸め誤差で稼働超過と誤検知しない／受注額未設定は予算超過判定不能／未凍結案件はベースライン乖離の対象外 |
| `wbs-progress-utils.test.ts` | `shared/utils/__tests__/`             | 進捗率算出コア。`calcWbsProgress`（タスク数ベース）・`calcWbsProgressWeighted`（工数加重、複数列横断・無効列の除外・工数0のフォールバック）・`calcWbsProgressAtDate`（基準日以前に完了したタスクのみ集計、境界値＝完了日と基準日が同一なら完了扱い）。**反証**: 工数0のタスクを完了させても進捗率が動かない／`completedAt`がnullの完了タスクは基準日に関わらず完了扱い（マイグレーション漏れでの過小評価を防ぐ）／`completed=false`なら`completedAt`が残っていても未完了 |
| `resource-histogram-utils.test.ts` | `shared/utils/__tests__/`        | 山積みグラフの集計。`isMemberActiveInMonth`・`calcResourceHistogram`（需要＝アサイン合計／供給＝capacityRatio合計）・`calcProjectMemberHistogram`（月×メンバーの積み上げ行データ）。**反証**: 時短メンバーの供給がcapacityRatio分だけ計上される（1人=1.0で数えない）／対象外メンバーのアサインを需要に含めない／終了日を過ぎた月は供給から外れる／表示対象月に配分が無いメンバーを凡例に含めない |
| `evm-utils.test.ts`         | `shared/utils/__tests__/`               | EVM（PV/EV/AC）算出関数。**ベースライン系**: `calcPvFromBaseline`（月次配分でBACを按分、**全期間経過後のPVは計画コスト総額に関わらず必ずBACに一致する**という核心の反証を含む）・`getActiveBaseline`・`buildBaselineSnapshot`（他案件除外・同一メンバー複数タスクの合算・配分率0の月を含めない・削除済みメンバーの無視）・`resolvePlannedCost`/`rebuildPlannedCostWithLatestPrices`（単価モードfrozen/latest、配分率スナップショットが空・参照先メンバー不在時の凍結金額へのフォールバック）・`isBaselineStale`（±10%乖離、bacAmount=0でのゼロ除算回避）。**進捗率の解決**: `resolveProgressRateAtWeek`（手入力優先→WBS工数加重へフォールバック、手入力の0%を未記録と区別する反証）。**実績の例外入力**: `calcAcAtWeek`（実績がある月はその値、未入力の月は計画値＝0扱いにしない反証、計画に無い月の実績も算入）。以下は従来からのケース: getFiscalYearWeekKeys・calcPvAtWeek（直線按分、境界値: ScheduleEntry0件・単日スケジュール）・getProgressRateAtWeek/calcEvAtWeek（直近値保持）・calcAcAtWeek（AssignmentEntry×Memberの人件費単価を月内日数按分で週次集計、契約単価優先・通常単価フォールバック・他案件混在除外・メンバー未存在時の防御的0扱い）・isEvmInputEligible/isEvmChartEligible・calcEvmSeries統合 |
| `tag-filter.test.ts`        | `shared/utils/__tests__/`               | タグ検索フィルタ                               |
| `numeric-input-utils.test.ts` | `shared/utils/__tests__/`               | 数値入力ユーティリティ（全角→半角、先頭ゼロ除去） |
| `member-filter.test.ts`     | `shared/utils/__tests__/`               | 所属会社複数選択フィルタ(filterMembersByCompanyIds)・内部/外部リソースフィルタ(filterMembersByInternal、isProperMemberと同一セマンティクス、削除済みcompanyId境界値含む) |
| `combobox.test.tsx`         | `shared/components/ui/__tests__/`       | Comboboxコンポーネント                         |
| `multi-select-combobox.test.tsx` | `shared/components/ui/__tests__/`  | MultiSelectComboboxコンポーネント（選択・解除・チップ表示・全選択/0件境界値） |
| `numeric-input.test.tsx`    | `shared/components/ui/__tests__/`       | NumericInputコンポーネント                     |
| `schemas.test.ts`           | `shared/types/__tests__/`               | Zodバリデーションスキーマ                      |
| `personnel-plan.test.ts`    | `shared/types/__tests__/`               | PersonnelPlanEntry新スキーマ（4固定区分、monthlyHeadcount/monthlyRealizedHeadcount） |
| `team-schemas.test.ts`      | `shared/types/__tests__/`               | Division/Section/Company/DatabaseSchema（estimatedUnitPrice含む） |
| `wbs-template.test.ts`      | `shared/types/__tests__/`               | WbsTemplateNodeSchema（z.lazyによる再帰スキーマ。孫階層の検証・name空文字の再帰的な検出反証含む）・WbsTemplateSchema（nodes空配列許容）・Create/UpdateWbsTemplateSchema |
| `skill.test.ts`             | `shared/types/__tests__/`               | SkillEvaluation/SkillRoadmapGoalスキーマ（追記専用、DatabaseSchema統合） |
| `skill-utils.test.ts`       | `shared/utils/__tests__/`               | 現在レベル導出(getCurrentSkillLevel)・ロードマップ進捗算出(calcSkillRoadmapProgress)・レベルアップ判定(isSkillLevelUp)・定期評価要否判定(isSkillEvaluationStale) |
| `local-json-adapter.test.ts` | `infrastructure/adapters/__tests__/`   | DataAdapter契約テスト（`adapter-contract.ts`、実装非依存の共通スイート。`create()`の`options.id`でクライアント生成idを確定id同様に固定できることの検証、**appSettingsのload/update往復・部分更新（未指定キーを変更しない反証）・未設定フィールドのundefined返却**（P0-b）含む）+ LocalJsonAdapter固有の挙動（jsonStorageへの実永続化、loadDatabase/importDatabase往復、複雑スキーマ(projects)での動作確認） |
| `postgres-api-adapter.test.ts` | `infrastructure/adapters/__tests__/` | 同上の契約テストをフェイクHTTPサーバーで実行 + Authorizationヘッダー付与・401検出時の1回だけの自動リトライ・ApiErrorへの変換・**楽観ロック**（expectedUpdatedAt指定時のみX-Expected-Updated-Atヘッダーを送る。**反証**: 未指定ならヘッダー自体を送らない＝後方互換） |
| `persistence-error.test.ts` | `stores/__tests__/`                     | 読み取り403の判定と**localStorage容量上限の判定**（`isStorageQuotaError`＝QuotaExceededError/NS_ERROR_DOM_QUOTA_REACHEDのみtrue。**反証**: 他のエラーを容量問題と誤診しない）と**楽観ロックの競合判定**（`isConflictError`＝412のみtrue・**409（unique制約違反）と混同しない**／`describeSaveFailure`＝競合時だけ再読込を促す文言へ差し替え、**それ以外はfallbackをそのまま返す**＝本物の障害の原因表示を独自の定型文で覆い隠さない）。**反証**: 400/401/404/409/500等は通知対象として残す（本物の障害を隠さない）／ApiError以外（ネットワーク断・statusプロパティだけ持つ別物）をtrueにしない |
| `auth-store.test.ts`        | `stores/__tests__/`                     | login/logout/restoreSession。アクセストークンがメモリ上のみに保持されること、ログアウトAPI失敗時もローカル状態は必ずクリアされる反証、**restoreSessionのsingle-flight**（同一tick内2回呼び出しでfetch1回のみ・敗者の401がauthenticatedを上書きしない・完了後の再呼び出しは新規リフレッシュを実行する＝永続抑止でない反証。リフレッシュトークンローテーション競合によるセッション喪失バグの回帰テスト、で発見）含む |

### インフラテスト

| テストファイル              | 配置先                                  | 対象                                           |
| --------------------------- | --------------------------------------- | ---------------------------------------------- |
| `snapshot-storage.test.ts`  | `infrastructure/storage/__tests__/`     | スナップショット保存・復元・クォータ管理       |
| `database-utils.test.ts`    | `infrastructure/storage/__tests__/`     | 年度月⇄暦月の変換、DatabaseSchemaの既定値付与（status/confidence/completed）、jsonStorageのimport往復 |
| `validation-schemas.test.ts`| `infrastructure/validation/__tests__/`  | フォームバリデーションスキーマ                 |
| `budget-form-schemas.test.ts`| `infrastructure/validation/__tests__/` | budgetBreakdownFormSchema（概算額×係数・案件選択・一般経費、更新削除対応）・saasContractFormSchema（人数×単価・金額変更履歴・plan任意フィールドの境界値含む）・otherExpenseActualFormSchema・aiUsageMemberAllocationFormSchema・aiUsageProviderFormSchema（name必須・plan任意の境界値） |
| `member-form-schema.test.ts`| `infrastructure/validation/__tests__/`  | memberFormSchema（startDate/endDate/所属会社・契約単価・契約形態4値+null境界値） |
| `skill-form-schemas.test.ts`| `infrastructure/validation/__tests__/`  | skillEvaluationFormSchema・skillRoadmapGoalFormSchema |
| `project-progress-form-schema.test.ts`| `infrastructure/validation/__tests__/` | projectProgressFormSchema（projectId必須・weekKeyのISO週番号形式・progressRate 0〜100の境界値） |

### サーバーテスト（`server/src/__tests__/`）

| テストファイル              | 配置先                                  | 対象                                           |
| --------------------------- | --------------------------------------- | ---------------------------------------------- |
| `jwt.test.ts`               | `server/src/auth/__tests__/`             | JWT 発行・検証・有効期限・署名検証             |
| `password.test.ts`          | `server/src/auth/__tests__/`             | Argon2 ハッシュ・検証（安全な比較含む）       |
| `rbac.test.ts`              | `server/src/auth/__tests__/`             | 5ロール＋権限マトリクス。requireRole/requireEditorOrAbove/requireAdmin・requirePermission（401/403/通過）・全ロール×全権限のマトリクス網羅。**反証**: managerはrequireAdmin不可（管理者権限の分離）／partnerはfinancials:readで403（金額遮断）だがdata:readは通過／未知ロールはフェイルクローズ |
| `crypto.test.ts`            | `server/src/auth/__tests__/`             | AES-256-GCM clientSecret 暗号化・復号化       |
| `diff.test.ts`              | `server/src/audit/__tests__/`            | 監査証跡の差分抽出。変更フィールドのbefore/after・オブジェクトの構造比較。**反証**: patchに含まれても値が同じなら落とす／updatedAtは常に除外／変更0件はnull（空オブジェクトを残さない）／null と undefined を同一視（未設定→未設定を偽の差分にしない）／Dateと同時刻のISO文字列を同一視（型の違いだけで差分にしない） |
| `api-key.test.ts`           | `server/src/auth/__tests__/`             | APIキー生成・ハッシュ。rpk_形式・毎回異なる・ハッシュ決定論。**反証**: ハッシュに平文が含まれない・1文字違いで別ハッシュ |
| `config.test.ts`            | `server/src/external-tools/__tests__/`   | 外部ツール接続設定のコア。ツール別の許可ホスト・認証ヘッダ・URL組み立て。**反証**: httpのURLを拒否／許可ホスト以外とパスに許可ドメインを含む偽装URLを拒否（SSRF対策）／Jiraはメール必須／Asana・GitHubはURLを受け付けない／必須項目が欠けた起票先設定・他ツール形の設定を拒否／BacklogのAPIキーをURLではなくヘッダで送る |
| `payload.test.ts`           | `server/src/external-tools/__tests__/`   | 起票リクエスト構築。件名`[コード] タスク名`・説明=完了条件・ツール別ボディ。**反証**: **Backlogはform-urlencoded・他3ツールはJSON**（公式の必須要件。実アカウント検証の準備中に発見したバグの回帰）／Jiraラベルの空白正規化／完了条件なしは空文字（undefinedを送らない）／グループなしはラベルを付けない／グループ未解決ならcategoryId[]を送らない／期待した形でないレスポンスから外部IDを学習しない（Webhookと同一形式の抽出）。グループ解決（Backlog=カテゴリー／Asana=セクションの一覧・作成・識別子抽出・Asanaの起票後addTask、**反証**: Jira・GitHubは解決不要／名前不一致はnull＝別グループへ誤割当しない） |
| `full-stack.integration.test.ts` | `server/src/__tests__/integration/` | Testcontainers（postgres:16-alpine）での統合テスト。CRUD一巡・自己参照FKカスケード削除・1.0人月上限バリデーション・NULLS NOT DISTINCT複合ユニーク制約・RBAC境界・database export/importラウンドトリップ・POST時のクライアント指定id。: **監査証跡**（create/update/deleteの記録・操作者のid/メール。**反証**: 対象レコードを削除しても残る／操作したユーザーを削除しても残る＝FK非設定の帰結／値が変わらない更新はログを増やさない／差分にupdatedAtを含めない／**FK違反で失敗した更新は証跡にも業務データにも残らない**＝業務操作と同一トランザクション／batchは1件ずつ記録し変化の無い要素は記録しない）／**参照API**（entity・entityId・actionの絞り込み、limit上限超過は400、**書き込み経路が存在しない**（POST/PATCH/DELETEが404）、managerでも403）／**楽観ロック**（他者が先に更新した保存を412で拒否・拒否時はDBが変わらない・最新値なら通る・ヘッダー未送出は従来動作・不正値は400・存在しないレコードは412でなく404・**作成直後（DB既定値now()由来）の行にも効く**＝ミリ秒丸めの回帰テスト・**updatedAt列を持たないefforts等では検証を無視して更新できる**）／**CORSプリフライト**（`access-control-allow-methods`にPATCH/DELETEが含まれる＝@fastify/corsの既定`GET,HEAD,POST`のままだと別オリジン構成で更新・削除が全滅する回帰の防止・`access-control-allow-headers`に`x-expected-updated-at`が含まれる）／**ユーザー管理の監査**（作成・ロール変更が記録される・**反証**: パスワードハッシュが証跡に現れない／値が変わらないPATCHでは記録を増やさない）／**監査ログのパージ**（保持日数の許可リスト外（0/1/-365/任意の基準日時）を400で拒否・基準日時はサーバー時計・削除とメタ監査が同一トランザクション・manager 403）。Phase 2で追加: Webhook受信3本（シークレット認証401・未知source 404・generic適用＋外部ID学習・**冪等の反証**=同一イベント再送で変化なしに収束しログも増えない・学習済み外部IDによる件名改変後の追跡・突合不能202＋skipログ／Backlogアダプタ=changes配列一次・content.statusフォールバック・コメントイベントtype3と状態変更なし更新の202無視／Jiraアダプタ=statusCategory.key判定・resolutiondate・別アダプタ間の学習上書き／Asana=X-Hook-Secretハンドシェイクエコー・fetchスタブでのAPIフェッチ・同一タスク重複イベントのフェッチ集約）。: GitHubアダプタ（closed→completed/completedAt＋外部ID`owner/repo#123`学習・reopened→false・**冪等の反証**=再送で変化なしログも増えない・**学習済み外部IDが件名改変に勝つ**・`ping`は202でタスク不変・`push`/`labeled`は202 ignored・シークレット不一致401・closed_at無しは受信日補完）／外部ツール接続API（**平文トークンがDBに残らない=暗号化at-rest**・GET/レスポンスにトークンが現れない・名前だけのPATCHでトークンが消えない3値セマンティクス・null=クリア・許可外ホストのbaseUrl 400・不正な起票先設定400・editorは全操作403）／API起票（fetchスタブ。外部ID即時学習・**再実行しても起票済みはskipで二重起票しない**・per-row失敗（422）が他行を巻き込まない・非リーフ指定は外部APIを呼ばずskip・50件超は400・viewerは403・件名`[コード] タスク名`とラベルの送信内容・`channel='api'`ログのcreatedCount）。: コード一意性（重複POST/コード変更PATCHが400・**DB直接投入で再現した既存重複があってもコード不変の編集は200**=新たな重複のみ拒否の反証）／taskSyncLogsの追記専用（PATCH/DELETE不在）／外部参照フィールドのGET往復／export往復でtaskSyncLogsが失われない。P1-bで追加: 月次締めイベントのgovernance:approve境界（editorの締めPOSTは403）・actorNameのサーバー側スタンプ（クライアント申告値は無視）・追記専用（PATCH/DELETEルート不在）／締め済み月のアサイン書込み・削除のサーバー側拒否（新規POST 400・締め月キーの差分PATCH 400・他月のみの変更は200・実績PATCH 400・削除400・reopen後は204）。: documentTemplatesのCRUD一巡（sourceRefsのnull→undefined正規化含む）／**partnerロールの権限境界**（金額系エンティティのGETが403・membersの単価履歴とprojectsの受注額がフィールドマスク・adminには非マスク＝redact誤爆防止・書き込み全拒否・非金額データは閲覧可）／managerロールの職務分掌（業務データ書き込み可・ユーザー管理403）／export往復でdocumentTemplatesが失われない反証（**商流3エンティティ（projectBaselines/changeRequests/billingMilestones）がexport/import対象から漏れていた既存のデータ消失バグと、projects.evmUnitPriceModeのNULLがimport往復のZod検証に弾かれる既存バグをこの拡充で発見・修正**）。Phase 3で追加: 通知配信（暗号化at-rest=平文URLがDBに残らない・kind=event/digestフィルタ・1チャンネル送信失敗の非波及・チャンネル削除でログのFKカスケード削除）／通知チャンネル管理API（シークレット非返却・名前変更のみのPATCHでシークレットが消えない3値セマンティクス・null=クリア・テスト送信のログ記録・editor 403）／即時イベント（締めPOSTでactorName入り通知・CR承認PATCHで金額を含まない通知・**承認済みCRへの再PATCHでは再通知しない反証**）／日次ダイジェスト（納期超過+ベースライン乖離の集約・**同日再送防止の反証**=force無しはスキップ/force付きは再送・文面に金額が漏れない反証。**この拡充でCreateProjectBaselineSchemaがcreatedAt（ISO文字列）を含むままtimestamp列へINSERTされ500になるpostgresモードの実バグ=freezeBaseline不能を発見・beforeCreateのDate変換で修正**） |

## ドキュメント責務

| ファイル | 責務 |
|---------|------|
| `docs/project.md` | ルート定義、ストア一覧、コマンド、技術スタック |
| `docs/architecture.md` | ディレクトリ構成、テスト一覧、ドキュメント責務 |
| `docs/data-model.md` | Zodスキーマ定義、フィールド仕様、バリデーションルール |
| `docs/development-patterns.md` | コード規約、落とし穴、アンチパターン、E2Eテストパターン |

### E2Eテスト（`e2e/`）

| テストファイル               | 対象                                 |
| ---------------------------- | ------------------------------------ |
| `assignment.spec.ts`         | アサイン管理の主要ユーザーフロー     |
| `companies.spec.ts`          | 所属会社管理（`/companies`）のCRUDが実localStorage（`DataAdapter`経由）へ正しく永続化され、リロード後も残る/消えることの反証（companies-storeのDataAdapter配線・楽観的更新の実ブラウザ検証） |
| `dashboard.spec.ts`          | ダッシュボード・チャート・セレクタ   |
| `project-progress.spec.ts`   | `/wbs`画面の「進捗率をEVMに反映」ボタン（project-progress-storeのsetWeeklyProgress）が実localStorage（DataAdapter経由）へ正しく永続化されること。新規作成→リロード後の残存確認、同一案件への2回目記録がupsert更新（idは変わらない）されることの確認（ストアのDataAdapter配線・第2弾） |
| `portfolio.spec.ts`          | `/portfolio`（ポートフォリオ）。納期超過（過去日付固定シード）の案件が「危険」バッジで先頭に並び理由が出る・良好案件との並び順・**反証**: 完了済みプロジェクトは行にならない。「開く」で`/project-summary?projectId=`へ遷移し同一プロジェクトが自動選択される（クエリパラメータ連携） |
| `project-summary.spec.ts`    | `/project-summary`（プロジェクトサマリー統合ビュー）。`?projectId=`直アクセスでの自動選択・納期超過（過去日付固定シード=実行日非依存）で総合判定バッジ「危険」と理由表示・相互リンク「WBSを開く」で遷移先のComboboxに同一プロジェクトが選択されること（クエリパラメータ連携）。**反証**: 金額の表示トグルOFFで金・商流セクションが消え、非金額の判定・体制テーブルは残る。メンバー名は山積みグラフ凡例にも出るため`getByRole('cell')`で特定（strict mode違反を実行時に検出して対応） |
| `efforts.spec.ts`            | `/wbs`画面のAG Grid工数列インライン編集（efforts-storeのupsertEffort）が実localStorage（DataAdapter経由）へ正しく永続化されること。新規入力→リロード後の残存確認、既存値の上書きがupdate（idは変わらない）されることの確認（ストアのDataAdapter配線・第3弾） |
| `wbs-templates.spec.ts`      | `/wbs-templates`画面（WbsTemplatesPage）のCRUDが実localStorage（DataAdapter経由）へ正しく永続化されること。マウント時の`seedStandardTemplate`が二重発火（React StrictMode）してもテンプレートが重複作成されないことの反証を含む（実装中に実バグとして発見・修正、ストアのDataAdapter配線・第4弾） |
| `document-templates.spec.ts` | `/document-templates`画面（DocumentTemplatesPage）。標準テンプレートがマスタ件数（33件）ちょうどシードされ**リロードしても重複しない反証**（tech-tags 398件重複と同型の回帰テスト）、本文（マークダウン）のblur保存が実localStorageへ永続化されリロード後も残ること、`/wbs-templates`で標準WBSテンプレートの紐づけ（documentTemplateIds）が全て解決される（参照切れなし）ことと紐づけダイアログの起動。**実装中に「StrictMode二重マウントでload#2の空配列set()がシードの楽観的stateを上書きしUIだけ空になる」実バグを発見**（localStorageには正しく永続化されるためユニットテストでは未検出だった）。create確定時のupsert反映で修正し、同型の潜在バグをwbs-template-storeにも水平展開して修正 |
| `task-sync.spec.ts`          | 外部完了同期（/wbs）。連携用CSVエクスポート（件名[コード]・直近親グループ列・completionCriteria転記・**BOM付き実バイト検証**・リーフのみ）／完了CSV取込の一気通貫（BOM付きBacklog風CSVをsetInputFiles→自動推定→ドライラン（完了1/変化なし1/skip1）→適用→completed/completedAt/外部ID学習の実localStorage永続化・**反証**: skip行と変化なし行は書き込まれない・同期ログとリロード後残存）。**外部タスクリンク**: GitHub起票済み行が`https://github.com/{owner}/{repo}/issues/{n}`のリンク（target=_blank・rel=noopener noreferrer）になる。**反証**: baseUrlの分からないBacklogはバッジ止まりでリンクにしない（localモードは接続を持たないためこの状況を常時再現できる）／未起票は「—」／`owner/repo#番号`形式でない外部IDはリンクにしない。テスト自体の有効性は製品コードの縮退ロジックを一時無効化して失敗することを確認済み |
| `global-search.spec.ts`      | 横断検索。Cmd+Kでパレットを開きタスク名で検索→孫タスクでもルート案件の`/wbs?projectId=`へ遷移する／サイドバーの検索ボタンからも開ける／WBSグリッドのツリー内絞り込み（一致ノードと祖先が残り階層が壊れない・コードでも絞れる）。**反証**: 空クエリでは候補を出さない／退職済みメンバーは出ない／一致しない兄弟は消える／絞り込みを空に戻すと元の行が戻る。**キーボードショートカットのE2Eはページ本体へ明示的にフォーカスしてからキーを送る**（goto直後はdocumentへkeydownが届かず、パレットが開かない） |
| `assignment-notes-snapshots.spec.ts` | 体制メモ・アサインスナップショット。メモ追加が実localStorageへ永続化されリロード後も残る／スナップショットを記録し配分を変えると差分（変更・変わった月・増減）が出る。**反証**: 空白のみのメモは追加できない／名前を入れないと記録できない／記録直後は「体制は変わっていません」。リロードでプロジェクト選択は復元されない（既存仕様）ため選び直す |
| `risk-register.spec.ts`      | リスク登録簿（非公開の設計文書）。ダイアログでの登録が実localStorageへ永続化されリロード後も残る／重大リスク（高×高）がプロジェクトサマリーのR9判定「要注意」とリスク区画に現れる一気通貫。**反証**: 内容が空では追加できない／状態をclosedへ変えるとR9が消え「良好」へ戻る（解消済みは警戒対象でない） |
| `theme-resolution.spec.ts`   | テーマ解決の回帰テスト。「OS設定（prefers-color-scheme）× 明示選択（`:root.light`/`.dark`）」の4通りで`body`の背景が正しく切り替わることを固定する。**反証**: OSがダークでも明示ライトを選べばライト（`:not(.light)`が無いとOS設定が利用者の選択を上書きする）／主要トークン（background・foreground・card）が実際に切り替わる（背景だけの偶然でない）。`@theme`をメディアクエリ内に置いてダーク値が無条件適用され、**OSライトでも常にダーク表示**になっていた実バグの回帰防止 |
| `master-csv-import.spec.ts`  | マスタCSV一括登録。BOM付きCSVをsetInputFilesで渡し、メンバー＋部門/課/会社・プロジェクト階層（子が先の行順）・アサインの月次配分が実localStorageへ保存されリロード後も残る。テンプレートは**実ファイルのBOM**と必須マーク`*`、アサインは12ヶ月ぶんの月列を検証する。**反証**: 取り込めない行は理由が出て取り込める行だけ登録される（per-row skip）／確認画面を閉じただけではデータが作られない／同じ部門・課を参照する2行からマスタは1つずつしか作られない。取り込む前に解釈前CSVと登録内容の両方を確認できること・**反証**: プレビューを見ただけでは登録されない／取り込まない行はプレビューに出ない。**テストの有効性は`normalizeHeader`の`*`除去とプレビュー表の描画をそれぞれ戻して落ちることを確認済み** |
| `admin-console.spec.ts`      | 管理画面。設定ボタンから入り左ペインのメニューでマスタへ移動し「システムに戻る」で業務画面へ戻る／旧URL（/companies・/tech-tags・/wbs-templates・/document-templates）が/admin配下へ転送される／全社設定の変更が実localStorageへ永続化されリロード後も残る。**反証**: 設定ボタンはポップオーバーではなく画面遷移する（旧実装ならURLが/dashboardのままなので区別できる。「入力欄が無いこと」の確認は旧実装でも通ってしまうため採らない） |
| `a11y.spec.ts`               | アクセシビリティの回帰テスト。axe-coreで**全16画面（管理画面の全社設定・データ管理・ポートフォリオを含む）＋主要5ダイアログ（リスク登録簿含む）**をWCAG 2.1 A/AA検査し違反0件を固定する。代表5画面はダークモードでも検査する。導入時の実測は194件（button-name 25／select-name 4／color-contrast 166）で、アイコンのみボタン・選択値が空になり得るCombobox・ラベル未紐づけのnative select・ユーザー指定色への白文字固定が原因だった。**テストの有効性は製品修正を戻して166件を検出することで確認済み**。axeは自動検出可能な範囲のみ（キーボード操作順序・読み上げの自然さ・フォーカス管理は対象外） |
| `wbs-assignee-column.spec.ts` | WBSの担当者列。実localStorageのアサインから主担当が表示され、複数担当は「他N名」が付く。**反証**: 配分が最大のメンバーが主担当になる（配分の少ない側ではない）／アサインが無いタスクは氏名を出さない／**横スクロールなしで初期表示から見える**（左固定にしている理由。AG Gridの列仮想化で非固定の末尾列はDOMに現れないため） |
| `task-phase-link.spec.ts`    | WBSタスクと工程の紐づけ。`/wbs`のProjectDialogで所属工程を選ぶと`Project.phaseKey`が実localStorageへ永続化されリロード後も残る／紐づけた工程のガントバーへWBS完了状況が進捗として描かれる（`.wx-progress-percent`）。**反証**: 工程を選ばずに保存してもphaseKeyを書き込まない（「未設定＝上位から継承」の意味を保つ）／**工程にタスクを紐づけていなければ進捗要素自体を描かない**（0%と未紐づけの描き分け。紐づけありの同一シナリオと対比することでテストの有効性も担保） |
| `estimates.spec.ts`          | 見積。簡易FPの記録が実localStorageへ永続化されリロード後も残る／WBS段階の記録が**WBS画面の概算予算と同じ金額**（40人日=200万円）／実績を記録すると振り返りに誤差比と幅の判定が出る／Infoポップオーバーに段階×幅の表／`/projects`の行アイコンから遷移先のセレクタに同一案件。**反証**: ラベル空では記録できない／金額表示OFFで`/estimates`が案内カードに置き換わりサイドバー「見積」が消える（フェイルクローズ） |
| `debug-gantt-dom.spec.ts`    | ガントチャートDOM構造のデバッグ       |
| `schedule-entries.spec.ts`   | `/schedule`画面のバー日付編集ダイアログ（schedule-storeのupsertEntry）が実localStorage（DataAdapter経由）へ正しく永続化されること。既存エントリの更新でidが変わらず、リロード後も残ることの確認（ストアのDataAdapter配線・第8弾） |
| `department-budget.spec.ts`  | 部門予算タブの5列3行セル表示（予算合計/実績合計or人件費予算合計/残予算合計）、「その他のPJ予算」登録・「その他予算変更」（増額・減額）→予実ダッシュボード反映、案件予算列へのWBS概算予算額反映、SaaS契約更新警告表示、ダークモード視認性、その他費用の予算枠+実績明細登録（備考欄含む）・合計行、AI利用費メンバー配分（一律設定・超過警告・課ごとに独立した予算の残表示（「部門全体」廃止後の課切替シナリオ）、個人予算/バッファ/割当/バッファ割当の4列構成・＄単位・残額計算式）、SaaS費用の予算額/実績額/残り予算列・合計行・年間契約ガイダンス、人員計画統合表編集・人件費予算パネル（年間総合予算/実績額見込み/残予算/残契約概算工数の4エリア統合、案件工数との比較含む）、案件タブの係数編集（AG Grid・システム設定連携・合計行の視覚統一・総工数の人月表示）、予算管理ページのタブ順・デフォルトタブ、システム設定の為替レート設定とAI利用費（＄）の万円建て集計への反映、AI利用費の複数プロバイダ登録・プロバイダセレクタでの切替表示（選択中プロバイダの実績値が切替後も保持されることの反証含む）・プロバイダ別予算実績個別入力・予算合計比較・削除、SaaS費用のグレード・プラン登録とname→plan順ソート近接表示 |
| `budget-planning-scenario.spec.ts` | 予算計画シナリオの一気通貫フロー（案件概算×係数→一般経費→人員計画、SaaS/AI利用費予算→メンバー配分実績→予実ダッシュボード反映、ダークモード視認性） |
| `monthly-actuals.spec.ts`    | `/monthly-actuals`（月次実績メンテナンス、P1-a）。**核心の反証**: 実績セルの明示入力が`actualMonthlyValues`へ永続化され未入力行はキー自体が書き込まれない（確定操作でもマークのみで一括書込みしない）／「計画どおりに戻す」でキーが削除される（0上書きではない）／実績1.2人月がブロックされず保存され担当者行に⚠超過警告。`page.clock.setFixedTime`で対象月を固定（既定=前月）。CSV取込ウィザードの一気通貫（BOM付きCSVをsetInputFiles→自動推定→ドライラン件数・スキップ理由表示→適用→実績・取込ログの永続化とリロード後の残存。**反証**: スキップ行があっても適用可能な行は適用される＝per-row skip）。月次締め（P1-b）の一気通貫（締め→セルが編集モードに入らない・確定/計画外追加/Undo不可・実データ不変→アサイン画面の締め月ヘッダ🔒→解除は理由必須（空白では解除ボタン無効）→解除後は編集可→締め/解除履歴2イベントがリロード後も残存=追記専用）。cmdk Comboboxのdetach誤判定対策（dispatchEvent+リトライ）・初期4ストアロード静定待ちのflake対策を内蔵 |
| `statements.spec.ts`         | `/statements`（月次明細）。**同一アサイン（0.5人月）から協力会社タブ=契約単価80×0.5=40万円、発注元タブ=見積単価100×0.5=50万円と異なる金額が出る**こと（単価二重管理の使い分けの反証。協力会社タブに見積単価100が現れないことも確認） |
| `onboarding.spec.ts`         | 初期設定ウィザード。空localStorageからの完走で組織・担当者・プロジェクト＋標準WBSテンプレートが実localStorageへ永続化されP001採番・担当部門自動設定されること／デモ開始→リロード後も試用中表示（フラグ永続化）→二段階確認で全削除→基本設定から再開→中断で「はじめに」カードへ戻る一気通貫／**反証**: カードdismissはリロード後も維持され、システム設定ポップオーバーからウィザードを再開できる |
| `reports-csv.spec.ts`        | `/reports`画面のCSVレポート出力。実ブラウザでダウンロードが発火し、**UTF-8 BOM（U+FEFF）が実ファイルの先頭バイトに付与されること**（Excel文字化け防止、この検証はE2Eでしか行えない）、シードした案件・メンバーの行と数値が含まれることを確認。表示年度が実行時の現在日時から算出される既知の落とし穴に対応するため、期待ファイル名・アサイン月キーは動的に組む |
| `dashboard.spec.ts`（✅P0-cで刷新済み） | 旧known-fail 5件を刷新（2026-08-16、P0-c）。①リダイレクトテスト→LandingPage表示＋「アプリを開く」導線の検証へ書き換え。②チャート描画系4件→`page.clock.setFixedTime('2025-10-01')`でブラウザ時刻を2025年度内へ固定し、シードの固定月キーとアプリの年度算出を一致させた（タイマーは偽装しないsetFixedTimeを使用。実行時の今日を基準にシードを組むEVM系のseedAndNavigateToDashboardには適用しない） |
| `evm-baseline.spec.ts`       | `/wbs`画面の「計画を凍結」（project-baseline-storeの`freezeBaseline`）が実localStorage（DataAdapter経由）へ永続化され、リロード後も残ること。凍結時にアサイン計画が月次計画コスト・配分率スナップショットとして保存されることの確認を含む。再凍結でversionが増え当初版（v1）が履歴として残ること（追記専用）、理由が空では凍結ボタンが無効になることの反証も行う（非公開の設計文書・§8 S2/S4） |
| `evm-panel.spec.ts`          | EVMパネル（`EvmPanel`）がダッシュボード（`/dashboard`）にreadOnly（週次進捗率入力フォームなし）で表示されること、ダークモード切り替え後もPV/EV/ACの線（stroke色）が透明・未解決トークンにならず視認できること。予実ダッシュボード（`/budget`）からはEVMパネルを撤去済み |
| `skill-growth.spec.ts`       | スキル・成長ロードマップ機能（担当者編集ダイアログでのスキル評価記録・レベルアップ通知、成長タイムライン表示、ロードマップ目標設定・進捗表示、ダッシュボードのスキルレベル分布反映）。skill-storeのDataAdapter配線に伴い、評価記録・目標設定が実localStorageへ永続化されることの確認を追加 |
| `guide-tour.spec.ts`         | ガイドツアー機能（メニュー・ステップ遷移・終了操作） |
| `navigation.spec.ts`         | ナビゲーション・ルーティングの検証   |
| `project-navigation.spec.ts` | プロジェクト一覧の遷移導線・URLクエリパラメータ直接アクセス・EVM列ダイアログ |
| `team.spec.ts`               | チーム管理・組織階層のユーザーフロー。保有スキルタグバッジ全件表示・所属会社名表示、所属会社複数選択フィルタ（部門・課グルーピング横断適用）・内部/外部リソースフィルタ（AND条件）、部門/課の人数表記のホバー内訳ポップアップ、ダークモード視認性、メンバー編集で終了日変更が既存アサインを契約対象範囲外にする場合の確認ダイアログ表示・確定時のアサイン自動解除 |
| `uiux-adjustments.spec.ts`   | UI/UX調整（テーマ切り替え・カラートークン・レイアウト・ThemeColorPicker） |
| `assignment.spec.ts`（拡張） | 双方向連携（プロジェクト選択↔アサイン画面）・編集中の上下キー行移動。担当者別年間サマリーのデフォルト折りたたみ・担当者名の役割表示・タスク別アサイングリッドの役割表示。✅ 旧known-fail 13件（Scenario 15-17/21-24/26-30/33）はP0-c（2026-08-16）で解消: `seedAndNavigate`で`page.clock.setFixedTime('2025-10-01')`によりブラウザ時刻を2025年度へ固定し、固定月キーのシードと表示年度を一致させた。併せて`scrollToMonthColumn`をスクロールリトライ付きpollへ堅牢化（SPA再遷移直後のグリッド再構築とのレース対策）、Scenario 5の永続化検証を`expect.poll`化（DataAdapter楽観的更新の非同期永続化待ち） |
| `dashboard.spec.ts`（拡張）  | 横2分割レイアウト（ProjectAssignmentChart/BudgetComparisonChart横並び）・EVMパネル部門セレクタ |
| `department-budget.spec.ts`（拡張） | プロジェクト/SaaS費用タブの部門セレクタ・全部門集計表示。プロジェクトタブの列順序（コード/プロジェクト名/総工数/割当済工数/未割当工数/係数/概算予算額/割当済概算/未割当概算）・合計行スタイル統一（その他費用/SaaS費用タブと同様のborder-top/背景色/font-weight） |
| `wbs-progress.spec.ts`       | WBS完了チェック操作とツリーアコーディオン開閉状態の独立性（別ブランチの完了チェック操作で無関係な閉じたアコーディオンが誤って再展開されないことの反証、`docs/development-patterns.md`参照） |
| `personnel-plan.spec.ts`     | `/budget`画面「人員計画」タブのgetOrCreateAllCategoriesが実localStorage上で4区分ちょうど生成されること（React StrictMode二重発火・タブ切替再マウント・リロードいずれでも8件に重複しないことの反証、ストアのDataAdapter配線・第9弾） |
| `tech-tags.spec.ts`          | `/tech-tags`画面のseedFromMasterが実localStorage上で199タグ・17カテゴリちょうど生成されること。**リロード時に398件へ重複する実バグを発見・修正**（トリガーのuseEffectが実ユーザー操作を挟まず即座に発火するケースの回帰テスト、ストアのDataAdapter配線・第10弾） |
| `settings-legacy-migration.spec.ts` | schedule-settings-store/wbs-settings-storeの旧Zustand persistキー（`schedule-settings-storage`/`wbs-settings-storage`）からの1回限りレガシー移行が実localStorage上で正しく行われること。レガシーキーのみ存在する状態で`/schedule-settings/:id`・`/wbs-settings/:id`を開くと内容が`resource-manager-data.scheduleSettingsEntries`/`wbsColumnSettingsEntries`へ永続化されリロード後も残ること、移行後の編集が実localStorageへ反映されること、DataAdapter側に既にデータがある場合はレガシーキーが残っていても再移行・重複作成しないことの反証。実装中に「idが16進数以外の文字を含むと`DatabaseSchema.parse()`が静かに失敗しシードが反映されない」既知の落とし穴（development-patterns.md）を自ら踏んで発見・修正した経緯あり。17ストアのDataAdapter配線・第11弾 |
| `project-dialog-task.spec.ts`（✅P0-cで刷新済み） | ProjectDialogのタイトル・ラベル出し分け（プロジェクト/タスク）。旧known-fail 3件をAG Grid化後のUIへ全面刷新（2026-08-16）: 「新規プロジェクト」ボタン→ダイアログ見出し/ラベル/確度フィールド、タスク追加はWBS画面（ProjectTreeGridの操作列`[title="レベル1を追加"]`）経由＝プロジェクト一覧に子タスク追加導線は無い現行仕様を反映、編集は操作列`[title="編集"]` |
| `persona-journeys.spec.ts`（`e2e-postgres/`） | ペルソナ別ユーザーストーリーテスト（計画は非公開の設計文書）。5ロール（admin/manager/editor/viewer/partner）それぞれの一連の業務を実ブラウザで通し、**できるべきことができ／できてはいけないことができない／開いただけで壊れない**ことを確認する。ヘルパーは`personas.ts`（ペルソナ定義・`loginAs`・`installToastRecorder`＝MutationObserverでのトースト記録・`collectForbiddenResponses`）。**反証**: managerはユーザー管理に入れない（管理者権限の分離）／editorは全社設定値を編集できない／viewerの書き込みはサーバーが拒否／partnerは金額系メニューが出ず予算画面はフェイルクローズ・プロジェクトサマリーは金/商流区画のみ消えて進捗・体制は残る／**partnerが画面を開いてもエラートーストが出ない**（読み取り403の握り潰し。この検証で「1画面あたり403が60回・トーストが出る」実バグを発見・修正した） |
| `logout.spec.ts`（`e2e-postgres/`） | ログアウト。アカウントメニューから抜けると`/login`へ戻り、**反証**: ログアウト後に保護ページへ直接アクセスしても入れない／別アカウントで入り直せる（ロールを変えて動作確認する、という本来の目的が達成できる） |
| `smoke.spec.ts`（`e2e-postgres/`） | postgresモードのブラウザE2E（`npm run e2e:postgres`・Docker必須）。localモードのE2E（`playwright.config.ts`）とは独立した`playwright.postgres.config.ts`で、globalSetupが使い捨てDB（`docker-compose.e2e.yml`、postgres:16-alpine・ポート55432・tmpfs）を起動→マイグレーション→admin作成し、webServer配列が実APIサーバー（ポート3101）と`VITE_STORAGE_MODE=postgres`のVite（ポート5373）を起動する。検証内容: 未認証アクセスの/loginリダイレクト／ログイン→部門・プロジェクト作成の実DB永続化（リロード残存）／フルリロードでのセッション維持（restoreSessionのsingle-flight回帰）。Testcontainers統合テスト（API層）では届かない「ブラウザ→認証→DataAdapter→実APIサーバー→PostgreSQL」の一気通貫を担う。**実装中にProjectDialogのmax-h漏れ（縦長ダイアログのフッターボタンがビューポート外＝クリック不能）を実バグとして発見・修正**。で「同じレコードを続けて2回編集できる」（楽観ロックの期待値がサーバー確定値に追従する）を追加。**反証**: 書き込みがネットワークレベルで失敗していない（`requestfailed`収集）／PATCHが412で拒否されていない／「他のユーザーが先に更新しました」トーストが出ていない（自動で消えるためMutationObserver記録で判定）／リロード後も2回目の変更が実DBに残る。**この1本で、@fastify/corsの既定`methods`が`GET,HEAD,POST`のため別オリジン構成ではPATCH/DELETEがプリフライトで全滅する（＝postgresモードで更新・削除が一切できない）という重大な既存バグを発見・修正した**（statusCodeではなく`net::ERR_FAILED`になるため、150件超の統合テストは全てパスしたままだった） |
| `wbs-settings-default.spec.ts`（✅P0-cで刷新済み） | WBS工数列のデフォルト表示名「区分」。旧known-fail 1件を刷新（2026-08-16）: プロジェクト選択は`getByRole('button')`ではなくCombobox（`getByRole('combobox')`、efforts.spec.tsと同一パターン）、WBS設定はダイアログではなく専用ページ（`/wbs-settings/:projectId`）へ遷移する現行UIを反映 |
