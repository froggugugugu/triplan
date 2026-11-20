# 重要なバリデーションルール

> [`docs/data-model.md`](../../data-model.md) から分割した詳細リファレンス。常時ロードされないため、必要なときにこのファイルを直接Readする。

- 担当者ごとの月次アサイン合計が、そのメンバーの稼働率上限（`Member.capacityRatio`、未設定＝1.0）を超えないこと（`isOverCapacity`、`features/assignment/utils/assignment-utils.ts`）。時短勤務・兼務・部分参画のメンバーは1.0未満の上限を持つため、固定値1.0では判定しない。浮動小数点の丸め誤差で誤検知しないようepsilonを許容する。クライアント側（`AssignmentTreeGrid.tsx`の入力時警告・`MemberSummaryGrid`/`MemberProjectAssignmentGrid`の色分け）とサーバー側（`server/src/routes/entities/assignments.ts`が`members.capacity_ratio`を引いて検証）の二重防御
- `ProjectBaseline`は追記専用（更新・削除APIなし）。「有効なベースライン」は保存された現況フィールドを持たず、案件内で最大の`version`を持つレコードから都度導出する（`getActiveBaseline`）。誤って切った版の取り消しは未実装で、正しい内容で切り直して最新版を有効にする運用とする
- EVMのPVは、ベースラインの月次計画コストを**配分の形としてのみ**用い、総額はBACへスケールする。PVの終点は必ずBACに一致する（`calcPvFromBaseline`）
- 現行BACと有効ベースラインの`bacAmount`の乖離が **±10%**（`BASELINE_STALE_THRESHOLD`）を超えたら、再ベースラインを促す警告をWBS画面に表示する（`isBaselineStale`、非ブロッキング）
- アサイン配分値（計画、`monthlyValues`）は0.0〜1.0の範囲。実績（`actualMonthlyValues`）は0以上・上限なし（事実の記録として1.0人月超もブロックしない。稼働率上限超過は月次実績画面の担当者行で警告表示のみ）
- API起票の対象は「指定ルート配下 ∧ リーフ ∧ 未起票（`externalTaskId`がnull）」のみ。判定は`buildTaskCreationPlan`（`shared/utils/task-creation-core.ts`、純関数）で行い、**クライアントのドライランとサーバーの再検証が同じ関数を使う**（画面の件数と実際の起票件数が食い違わない）。別ツールで学習済みのタスクも対象外（1タスク1外部ツールの原則。上書きすると完了同期の受け皿が黙って切り替わる）。起票順序はタスクコード昇順、1リクエスト50件上限、約1件/秒のスロットル（GitHubの二次制限80件/分が4ツール中の最小公表値）。学習する外部IDは**Webhookアダプタと同一形式**（backlog=`PROJ-123`／jira=`PROJ-123`／asana=gid／github=`owner/repo#番号`）で、レスポンスから読めない場合は学習せず失敗として記録する（誤った外部IDを覚えない）
- 外部ツール接続（`externalToolConnections`）の`baseUrl`はhttps必須かつツール別のホスト許可リスト（Backlog=`*.backlog.jp`/`*.backlog.com`/`*.backlogtool.com`、Jira=`*.atlassian.net`）で検証する。判定は必ず`URL.hostname`で行う（パス・クエリに許可ドメインを含む偽装URLを弾く）。Asana・GitHubは固定ホストのため`baseUrl`自体を受け付けない（クラウド版専用・Server/DC非対応の明示）
- タスクコードは外部連携の突合キーのため一意。子コードは親コードのプレフィックス継承＝構成的一意で、**新たな重複を作る保存**をProjectDialog＋サーバー`beforeCreate`/`beforeUpdate`で拒否する（既存重複データの無関係な編集はブロックしない。DB unique制約は既存データ互換のため見送り）。突合側も複数一致は必ずskip（誤帰属しない二重防御）
- 締め済み月（`MonthlyCloseEvent`から導出、P1-b）は計画・実績とも変更不可（ハードロック）。締め月キーが不変な他月の編集・CSV取込の他月行は通す（差分判定・per-row skip）。締め月に値（計画>0または実績の明示キー）を持つアサインレコードの削除も拒否。締め月に値を持つアサインが対象ツリーに存在するプロジェクト/タスクの削除も拒否する（クライアント`projects-store`＋サーバー`projects.ts`のbeforeDeleteの二重防御。旧「段階1では対象外」の既知の制限はの負債解消で撤廃）。解除は理由必須で、締め/解除の履歴は追記専用（改ざん・抹消不可）
- アサインの月次値（`AssignmentEntry.monthlyValues`）は、対象メンバーの契約単価対象範囲（`isMonthWithinContractRange`、`shared/utils/budget-utils.ts`。`features/assignment`・`features/team`の両方から参照するためshared化）内の月にのみ入力できる。範囲は契約単価履歴（`Member.contractUnitPriceHistory`）の最も古い`effectiveFrom`を下限、`Member.endDate`の月（在籍中=nullなら上限なし）を上限とする。契約単価履歴が空/未設定（内部リソース等）の場合は制約なし。ブロック型バリデーション（`AssignmentTreeGrid.tsx`の`handleCellValueChanged`、既存の0.0〜1.0範囲チェックと同じ方式）で保存前に拒否し、トースト表示する。0へのクリア（アサイン解除）は範囲外でも常に許可する。AC（実コスト）算出が契約単価を前提とするため、入力時点で契約対象範囲外の配分を作らせない設計判断
- メンバー編集（`TeamMemberDialog.tsx`）で契約単価履歴・`endDate`を変更し、その結果既存アサインの一部が新たに契約対象範囲外になる場合、保存前に確認ダイアログを表示する（`getNewlyOutOfRangeAssignmentMonths`、`shared/utils/budget-utils.ts`）。判定対象は「編集前は範囲内だったが編集後に範囲外になった月」のみで、編集前から既に範囲外だった月（今回の編集と無関係な既存データ不整合）は対象外。確認ダイアログで確定すると、対象の`AssignmentEntry.monthlyValues`該当月を0に解除した上でメンバー情報を保存する。キャンセルするとメンバー情報の保存ごと中断する
- 日付のみ（`YYYY-MM-DD`）のフィールドは`DateOnlySchema`（`shared/types/date-only.ts`）で**暦の実在まで検証**する。形式の正規表現だけでは`2026-02-31`や`2026-99-99`が通ってしまい、実際に受理していた。判定は`isValidDateOnly`（`shared/utils/iso-week-utils.ts`）で、`Date`の繰り上がり正規化を利用してうるう年（4年・100年・400年ルール）まで見る。画面の`<input type="date">`はブラウザが弾くが、**CSV取込・Webhook受信・公開API**は外部から任意の文字列が届くため必要。完了同期の`resolveDateOnly`も同じ判定を通す
- 楽観ロック（postgresモード専用）: `updatedAt`を持つエンティティの単一レコード
  更新（PATCH）は、クライアントが`X-Expected-Updated-At`で「読んだ時点のupdatedAt」を
  申告した場合のみ、DBの現在値と一致するときだけ更新する（`crud-factory`がUPDATEの
  WHERE句へ畳み込む）。食い違えば**412 Precondition Failed**でunique制約違反（409）と
  区別する。比較は`date_trunc('milliseconds', ...)`でミリ秒へ丸める（timestamptzは
  マイクロ秒精度だがクライアントが受け取るISO文字列はミリ秒精度のため、丸めないと
  DB既定値`now()`で作られた行が常に不一致になる）。ヘッダー未送出は従来どおり後勝ち更新
- 監査証跡（postgresモード専用）: `crud-factory`のPOST/PATCH/DELETE/batchは
  業務操作と**同一トランザクション**で`auditLogs`へ追記する。updateは実際に値が変わった
  フィールドのみを記録し（`updatedAt`は除外、変更0件ならログを作らない）、deleteは削除
  直前の行全体をスナップショットとして残す。412で拒否された更新は記録しない
  （起きなかった変更を証跡に残さない）
- 見積スナップショットは追記専用で、取り消せるのは案件内の最新版だけ（クライアント`revokeLatestEstimate`＋サーバー`beforeDelete`の二重防御。途中の版を消すと連番と差分が壊れる）。方法と根拠の整合（FP法にはFP項目と人時/FP、WBS法には要約、実績は完了段階のみ、概算法はILF/EIFのみ）はZodのrefineでクライアント・サーバー共通に検証する。幅（コーン）と差分は保存せず段階・前版から都度導出する
- 工程定義は最大15件。WBS工数列は最大10列
- スナップショットは最大20件（超過時は古いものから削除）
- スナップショットタグは一意（重複保存不可）
- 年度月は1〜12（1=4月、12=3月）
- その他予算変更（`BudgetAdjustment`、旧「予算追加履歴」）は追記専用。既存レコードの上書き・削除は行わない。`adjustmentType`（`'increase' | 'decrease'`）で増額・減額を区別し、`amount`は常に0以上の絶対値（符号は`adjustmentType`が表す）
- 部門予算内訳（`BudgetBreakdown`）は追加・更新・削除が可能（追記専用原則撤廃）。月次実績（`monthlyActuals`）は専用アクション経由での更新に限定する
- SaaS契約の次回更新日は契約開始日以降でなければならない
- SaaS契約の月次実績（`monthlyActuals`）は契約金額改定履歴（`amountHistory`）とは別物。専用アクション経由での更新に限定する（追記専用原則の限定的な例外）
- 契約単価履歴（`contractUnitPriceHistory`）は所属会社（`companyId`）が設定されている場合のみ保持する。未設定時は空配列
- 準委任精算: 実績モードの協力会社支払明細のみに適用。判定はメンバー×月の合計実績時間（実績人月×workdaysPerMonth×hoursPerDay）で、幅内（境界含む）=固定額／下回り=基準額÷下限×実績h／超過=基準額＋基準額÷上限×超過h（万円小数2桁丸め）。明細行への配賦は実績比按分で丸め差は最終行調整（Σ行金額=精算額を保証）。フォームは片側のみ・上下逆転を拒否（`contractUnitPriceEntryFormSchema`のrefine）
- 部門予算の初期予算額（`DivisionBudget.initialAmount`）は手入力せず、案件予算内訳・AI利用費予算・SaaS年間コストの合計として自動計算される（`calcAutoInitialAmount`）。人員計画の人件費予算・案件タブのWBS概算予算額はこの自動計算には含まれない
- 部門予算タブの俯瞰集計（`getBudgetOverview`）は`initialAmount`とは別軸の表示専用セレクタで、案件予算内訳・その他費用・AI利用費・SaaS費用に加えて人件費予算（人員計画の予定人数×概算単価）・案件タブのWBS概算予算額（`projectWbsEstimateTotal`、後述）も合算して表示する。`DivisionBudget.initialAmount`自体のロジックは変更しない
- 人員計画（`PersonnelPlanEntry`）は4固定区分（部門×年度×区分で1レコード固定）で管理。月別予定人数はユーザー入力、personnel_*の実績人数は在籍メンバーから自動算出
- `BudgetBreakdown`の実績明細（`actualRecords`）は予算1:実績Nの構造（1つの予算枠に複数件の実績明細を紐付け可能）。専用アクション経由での更新に限定する。ストア・スキーマはカテゴリ非依存で、`general_expense`（その他費用タブ）に加え`project_personnel`/`project_expense`（`BudgetBreakdownDialog`の実績明細ボタン）からも登録できる
- 部門予算タブ（`DivisionBudgetPanel`）の主要5列（案件予算／その他費用／AI利用費／SaaS費用／総合計）は各セル内が3行構成（予算合計／実績合計または人件費予算合計／残予算合計）で表示される。案件予算列のみ2行目が「実績」ではなく人員計画側の人件費予算合計（`personnelPlanBudgetTotal`）である点に注意。「総合計」列は上記4列の合計のみで、その他予算変更（`BudgetAdjustment`）は含まない。これは`getDivisionBudgetTotal`（`initialAmount`＋その他予算変更の合計）とは別軸の表示専用集計であり、両者は一致しない
- `BudgetBreakdownDialog`は`allowedCategories?: BudgetBreakdownCategory[]`propで種別選択・一覧表示を絞り込む（1件のみなら種別セレクタを固定表示に切り替える）。部門予算タブの「その他のPJ予算」ボタン（旧「内訳」）は`['project_personnel', 'project_expense']`固定で起動し、一般経費（`general_expense`）は選択肢に含まれない（その他費用タブが唯一の登録経路）
- AI利用費のメンバー別配分（`AiUsageMemberAllocation`）は`AiUsageEntry`とは独立したエンティティ。（割当＋バッファ割当）の合計が（個人予算＋バッファ）の合計を超える場合はソフトバリデーション（警告表示のみ、保存は拒否しない）
- AI利用費は部門単位に加えて課単位（`AiUsageEntry.sectionId`）でも予算設定できる。課別エントリは部門合計に自動的にロールアップされる（`getAiUsageEntries`等が`divisionId`のみでフィルタするため）
- 案件タブの概算予算額 = 総工数（人月）× 概算単価 × 係数（`calcProjectEstimateBudget`、実体は`shared/utils/budget-utils.ts`。`features/budget/utils/expense-budget-utils.ts`からは後方互換のためリエクスポート）。総工数は`computeProjectTotalEffort`が返す人日値を`WORKDAYS_PER_MONTH`（=20、`shared/utils/budget-utils.ts`）で除算して人月換算した値を渡す（以前は人日のまま概算単価（月額単価）を乗じており、概算予算額が実態の20倍相当になっていた次元不一致バグがあった）。係数は案件別（`projectCoefficients`）に設定でき、未設定の案件はシステム設定の`defaultCoefficient`にフォールバックする（`getProjectCoefficient`）
- 案件タブ（`ProjectBudgetView`）の「総工数」列は人月表示（`WORKDAYS_PER_MONTH`換算後）。AG Gridには合計行（`pinnedBottomRowData`）があり、総工数・概算予算額の列合計を表示する（`calcProjectRowsTotal`）。コード・案件名・係数は合計対象外（係数列は空欄表示）
- 案件別損益（人・モノ・金の三位一体強化、非公開の設計文書）: `calcProjectProfitability`（`features/budget/utils/expense-budget-utils.ts`）が`Project.contractAmount`（受注金額）と実コスト（実人件費＋実付帯費用）を突き合わせ、粗利・利益率を算出する。実人件費は`shared/utils/evm-utils.ts`の`calcAcAtWeek`（EVMのAC算出と同一ロジック、当日が属するISO週を基準に算出）を再利用し、実付帯費用は対象案件に紐づく`BudgetBreakdown`の実績明細合計（`calcBudgetBreakdownActualRecordsTotal`）を用いる。`contractAmount`が未設定（0以下）の場合、利益率は算出不能として`null`を返す（ゼロ除算回避）。`isProjectBudgetOverrun`（同ファイル）は消化率（実コスト÷受注金額×100）がしきい値（デフォルト80%、`isContractRenewalWarning`と同型の非ブロッキング警告判定）以上かを判定する。`ProjectBudgetView`のAG Gridに「受注金額（万円）」「粗利（万円）」列として表示し、予算超過時は粗利セルに警告色（`text-destructive`）を付与する。合計行（`pinnedBottomRowData`）はこの2列を対象外とする（受注金額未設定の案件が多数を占めうるため、単純合算が誤解を招くと判断）
- 原価4区分（非公開の設計文書）: 案件別損益の実コストを労務費（内部リソースのアサイン実コスト）／外注費（外部リソースの同、**実人件費−労務費の引き算で導出**＝丸めに関わらず労務費＋外注費＝実人件費の恒等式を保証）／直接経費（案件紐づき実績明細合計＝実付帯費用と同値の再掲）／間接費配賦（部門の間接費実績＝一般経費実績明細＋SaaS実績＋AI利用費実績の為替換算を、部門内トップレベル案件へ**年度12ヶ月のアサイン配分合計（実績優先）比例**で配賦、`Math.round`整数万円）へ内訳展開する（`shared/utils/cost-breakdown-utils.ts`、純関数）。既存の粗利・利益率の数値は変えない。配賦後利益＝粗利−間接費配賦（受注金額未設定はnull）。divisionId未設定案件は配賦対象外、部門内の配賦基準合計0は配賦しない（ゼロ除算回避）、削除済みメンバーのアサインは基準に含めない。【仮定】準委任精算は原価側では適用しない（契約単価×配分のまま。精算を含めると既存の案件別損益と数値が食い違うため。精算差額は月次明細で確認）。表示は`/budget`プロジェクトタブの5列・案件別収支CSV（`PROJECT_FINANCE_SOURCE`末尾5フィールド）・公開API `/api/v1/project-finance`
- What-ifシミュレーション（人・モノ・金の三位一体強化、非公開の設計文書）: `calcWhatIfTotalEffort`（`shared/utils/effort-utils.ts`）が、指定タスク（とその配下）を除外した場合のWBS総工数（人日）を試算する。`computeProjectTotalEffort`をそのまま再利用し、除外対象タスクIDに紐づく`EffortEntry`を集計前にフィルタするのみ（ロールアップロジックの重複実装なし）。`WhatIfSimulationDialog`（`features/projects/components/`、`ProjectsPage`から起動）がチェックボックスツリーUIを提供し、現在の概算予算・シミュレーション後・削減額を即時表示する。実データ（`EffortEntry`）は一切変更しない読み取り専用の試算機能で、保存・永続化のアクションを持たない
- `Project.divisionId`（担当部門）はトップレベル案件（`level===0`）のみ設定対象。以下2箇所でこのdivisionIdを使ってWBS概算予算額を部門別に集計する:
  - 人員計画タブの残予算パネルにおける「案件の合計工数」: `divisionId`が当該部門に一致する案件のみを合計対象とする（未設定の案件は含めない）。「割り当て済み工数」は担当部門の案件divisionIdとは独立に、部門所属メンバー（`sectionId`経由）の全アサインを対象年度12ヶ月分合計する
  - 部門予算タブの「案件予算」列（`getBudgetOverview`の`projectWbsEstimateTotal`）: `divisionId`が当該部門に一致するトップレベル案件のWBS概算予算額（人月換算×概算単価×係数）を合算する。ただし`BudgetBreakdown.projectId`で既に手動計上済みの案件はWBS概算側から除外し、二重計上を避ける。上部の「案件タブの概算予算（全社・WBS工数ベースの見立て）」参考値は、この除外ロジックを持たない全案件横断の別軸集計
- AI利用費上部グリッド（`AiUsageGrid`）は月を列に配置した横方向テーブル。プロバイダ0件時は固定5行（予算額・個人予算合計・バッファ合計・割当合計・バッファ割当合計）、1件以上登録時は選択中プロバイダの予算額/実績額2行＋プロバイダ横断の予算合計/実績合計2行＋上記4行の計8行。「予算額」「実績額」のみ編集可能、個人予算合計等4行はメンバー別配分（`AiUsageMemberAllocation`）の当該月集計値（`calcAiUsageMemberAllocationTotal`、選択中の課・選択中のプロバイダで絞り込み済み）を表示する編集不可行
- 課セレクタ・プロバイダセレクタはいずれも`AiUsageGrid`（上部エリア）に一本化されている。「部門全体」は選択肢として廃止されており、`sectionId`は必ず特定の課を指す（課が0件の部門は`BudgetPage`が案内メッセージへ切り替え、AI利用費タブのグリッド自体を表示しない）
- メンバー別配分テーブルの列順は「個人予算／バッファ／割当／バッファ割当」。「AI利用費予算との残」は（部門/課の月次予算額）－（割当合計＋バッファ割当合計）で算出する
- 予算管理ページのタブ順は「予実ダッシュボード／部門予算／プロジェクト／その他費用／AI利用費／SaaS費用／人員計画」で、初期表示タブは「予実ダッシュボード」（タブの内部`key`は`'project'`のまま、表示ラベルのみ「案件」→「プロジェクト」に汎用化済み）
- 為替レート（`ExchangeRateEntry`、システム設定から更新）は、AI利用費（＄建て）を万円建ての集計（部門予算俯瞰の「AI利用費」列・`DivisionBudget.initialAmount`・予実ダッシュボードの年度末着地予測/月次推移）へ合算する箇所すべてで、各エントリの対象月に有効なレートを使って換算する（`getApplicableExchangeRate` + `convertUsdToManYen`）。為替レート未設定（履歴が空、またはエントリの`effectiveFrom`が対象月より未来）の場合は換算レート0として扱われ、AI利用費は万円建て集計に反映されない（意図的な仕様。誤って未換算の＄がそのまま万円扱いで混入することを防ぐ）
- `SkillEvaluation`/`SkillRoadmapGoal`（いずれも`skill.ts`）は追記専用（更新・削除APIなし）。「現在のレベル」「現在の目標」は保存された現況フィールドを持たず、履歴のうち最新のレコードから都度導出する（`getCurrentSkillLevel`/`getCurrentRoadmapGoal`）
- スキルレベルの評価者区分（本人/上長）は認証機構がないため自動判定できず、記録の都度ユーザーが手動選択する
- ダッシュボードのカテゴリ×レベル別分布集計（`getSkillLevelDistribution`）における代表レベルは「上長評価を優先し、未記録の場合のみ自己評価を採用。両方未記録は分布から除外」というルールで決定論的に算出する（保有人数自体は既存の`getSkillDistribution`で引き続きカウントされ、除外の影響を受けない）。1メンバーがカテゴリ内に複数タグを保有する場合は、その中で最も高い代表レベルを採用し二重計上を避ける
- 定期評価の見直し要否（`isSkillEvaluationStale`）は固定3ヶ月（`SKILL_REVIEW_CYCLE_MONTHS`）をハードコード定数として判定する。設定UIは設けない。判定はタイムゾーン問題を避けるため年月日を分解した`new Date(y, m-1, d)`比較で行う（`new Date('YYYY-MM-DD')`は使わない）
- 成長ロードマップ進捗（`calcSkillRoadmapProgress`）は`targetLevel==='none'`の場合常に100%、`currentLevel`が未評価（`null`）の場合は`'none'`相当（進捗0）として算出する
- プロジェクトサマリーの判定（`features/projects/utils/project-summary-utils.ts`）は決定論的な9ルール（R9=重大リスク: リスク登録簿の確率高×影響高がopenでwarning・`risks`未指定は後方互換で判定しない）の純関数で、「現在日時」は引数注入。判定に必要な入力が無いルールは黙ってスキップする（誤報より取りこぼし=alert-utilsの流儀）。境界値は「閾値ちょうどは警告しない」で統一し、R4（予算先行）は浮動小数点誤差をepsilon（1e-9）で吸収する。R4の分母は受注額優先→BAC（概算予算）フォールバック、両方無ければ判定不能スキップ。総合判定は最悪値（critical>warning>良好）、判定材料（進捗・BAC・受注額）が全て無い案件は「判定不能」バッジ。金額を含む判定（R3/R4/R6/R7）は`financial`フラグを持ち、金額非表示時はUIから除外する
- EVM（`ProjectProgressEntry`、`shared/utils/evm-utils.ts`）のPV/EV/ACはすべて純粋関数として実装し、丸めは`Math.round`（整数・万円）で`calcProjectEstimateBudget`と統一する。週次配列生成・集計は既存の月次集計（`getFiscalYearMonthKeys`）と同等のO(n)処理で完結させ、S字カーブモデル等の重い計算は導入しない。部門文脈のEVM入力・編集は`EvmPanel`（`shared/components/EvmPanel.tsx`）、単一プロジェクト表示は`ProjectEvmDialog`（`features/projects/components/ProjectEvmDialog.tsx`、読み取り専用）で提供
- 汎用化（用語・概念の中立化）は`Company.isProper→isInternal`・人員計画4区分のenumリネーム、および「案件」→「プロジェクト」のUI表示文言置換の2軸で実施済み。後者は画面表示テキスト（JSX文字列リテラル）のみが対象で、型名`Project`・ルーティング`/projects`・ディレクトリ名`features/projects/`・変数名・関数名・コード内コメントは対象外（意図的に変更しない）。「プロパー/協力会社」概念を消費する売上予算ファミリー関数（`isProperMember`・`calcDivisionProperExpectedRevenue`・`getProperPersonnelCost`等）の関数名・引数名・ドキュメンテーションコメントも汎用化対象外として現状維持する
- AI利用費プロバイダ（`AiUsageProvider`）別の実績額（`AiUsageEntry.actualAmount`、`providerId`が非null）は、`AiUsageMemberAllocation`（メンバー別配分）由来の自動同期対象**外**で、`setAiUsageActual`経由の手動入力に限定する（`SaasContract.monthlyActuals`と同じ「契約単位の手動実績入力」パターンを踏襲した設計判断）。で`AiUsageMemberAllocation`に`providerId`軸を追加した後もこの独立性はあえて維持しており、同期先をプロバイダ単位に分けると同一プロバイダの実績が「手動入力値」と「メンバー配分由来の自動集計」の2レコードに分裂し、`divisionId`単位でロールアップする部門合計セレクタで二重計上されるため（コードレビューで指摘・是正）。プロバイダ未分類（`providerId=null`）のエントリのみ、従来どおりメンバー配分からの自動同期対象のまま
- `AiUsageProvider`が0件の部門ではAI利用費タブのUIは完全に後方互換（プロバイダ導入前と同一の単一「予算額」行のみ）。1件以上登録されて初めてプロバイダ別行・合計行が表示される（消極的な機能有効化条件、EVM機能の対象条件抽出と同じ設計方針）
- WBS完了フラグ（`Project.completed`）は最下層（子を持たないノード）でのみユーザーが直接操作。親・最上位の完了率は配下の最下層タスクの完了数/総数から自動算出（ボトムアップ集計、`calcWbsProgress`）。既存のstatus（「未着手」「進行中」「完了」3値）とは別軸の独立したフラグ
- 「全部門」選択肢（内部センチネル値`__all_divisions__`、`shared/utils/member-filter.ts`の空文字センチネルとは別表現）は、予実ダッシュボード・その他費用・AI利用費・人員計画・プロジェクト・SaaS費用の6タブに追加。選択時は編集可能な単一部門ビューの代わりに新規`AllDivisionsBudgetSummary`（読み取り専用集計カード）を表示。「部門予算一覧」タブは元々部門非依存のため対象外
- `WbsTemplate`は部門・年度に依存しない全社共通のストックで、初回シード後は他のテンプレートと同様に編集・削除できる（読み取り専用フラグ等は持たない）。テンプレート適用（`applyWbsTemplate`）は既存タスクを変更・削除せず、選択中プロジェクト配下に新規タスクを追加するのみ
