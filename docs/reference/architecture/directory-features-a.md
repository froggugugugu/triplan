# ディレクトリ構成: `src/features/`（projects〜budget）

> [`docs/architecture.md`](../../architecture.md) から分割した詳細リファレンス。常時ロードされないため、必要なときにこのファイルを直接Readする。

続きは [directory-features-b.md](directory-features-b.md)、`shared/`以下は [directory-shared.md](directory-shared.md)。

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
```
