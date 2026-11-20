# スキーマ詳細: 予算（部門予算・AI利用費・SaaS・人員計画）

> [`docs/data-model.md`](../../data-model.md) から分割した詳細リファレンス。常時ロードされないため、必要なときにこのファイルを直接Readする。

### DivisionBudget（`budget.ts`）

部門予算。部門（Division）×年度で1レコード。課（Section）は本機能では予算の単位とせず、メンバーの所属管理単位として扱う。

| フィールド      | 型                | 備考                         |
| --------------- | ----------------- | ---------------------------- |
| `id`            | `uuid`             |                              |
| `divisionId`    | `uuid`             | 対象部門ID                   |
| `fiscalYear`    | `number`（2000〜2100） |                          |
| `initialAmount` | `number`（0以上）  | 初期予算額（万円）。**案件予算内訳（`BudgetBreakdown`）＋AI利用費予算合計＋SaaS年間コスト合計から自動計算される**（ストアが内訳・AI利用費・SaaS契約の変更時に再計算して書き込む） |
| `createdAt`     | `datetime`         |                              |
| `updatedAt`     | `datetime`         |                              |

一意性: `divisionId` × `fiscalYear`（同一部門・同一年度は1レコードに上書き登録）。
派生型: `CreateDivisionBudget`（id/日時を除外）、`UpdateDivisionBudget`（idのみ必須、他は任意）。
`setInitialBudget`（直接上書き）は後方互換のため残すが、UIからは使用しない。UIでは`getOrCreateDivisionBudget`でレコードの存在を保証したうえで内訳・AI利用費・SaaS契約を登録し、`initialAmount`は自動算出に委ねる。

### BudgetBreakdown（`budget.ts`）

部門予算の内訳（案件予算の明細）。SaaS費用・AI利用費は`AiUsageEntry`/`SaasContract`から自動集計するため対象外。

| フィールド    | 型                                          | 備考                              |
| ------------- | -------------------------------------------- | --------------------------------- |
| `id`          | `uuid`                                       |                                   |
| `budgetId`    | `uuid`                                       | 対象の`DivisionBudget.id`         |
| `category`    | `project_personnel \| project_expense \| general_expense` | 案件（人件費）/ 案件（付帯費用）/ 一般経費 |
| `label`       | `string`（1〜200文字）                       | 案件名等の自由記述ラベル          |
| `amount`      | `number`（0以上）                            | 金額（万円）                      |
| `recordedAt`  | `string`（`YYYY-MM-DD`）                     | 計上日（先頭が初期予算相当、以降は追加分の目安として日付で識別） |
| `createdAt`   | `datetime`                                   | レコード作成日時                  |
| `estimateAmount` | `number`（0以上、任意）                   | 概算額（万円）。係数との組み合わせで見積額の根拠を記録 |
| `coefficient` | `number`（0より大きい、任意）                | 係数。概算額×係数で実額を算出     |
| `projectId`   | `uuid \| null`（任意）                       | 案件へのリンク。`project_personnel`/`project_expense`で使用可、`general_expense`では使用不可 |
| `monthlyActuals` | `Record<string, number>`（任意、"YYYY-MM"キー） | 月次実績（万円）。専用アクション（`setBudgetBreakdownActual`）経由でのみ更新 |
| `actualRecords` | `BudgetBreakdownActualRecord[]`（任意） | 実績明細（購入日・購入品目・金額）。予算1:実績Nの構造で、1つの予算枠に複数件の実績を紐付けられる。専用アクション（`addBudgetBreakdownActualRecord`等）経由でのみ更新。カテゴリ非依存（`project_personnel`/`project_expense`/`general_expense`いずれでも利用可）で、`BudgetBreakdownDialog`の履歴項目にある「実績明細」ボタンから全カテゴリ共通で登録できる（以前は`OtherExpensePanel`＝`general_expense`区分のみの導線だった） |

派生型: `CreateBudgetBreakdown`（id/createdAtを除外）、`UpdateBudgetBreakdown`（idのみ必須、他は任意。monthlyActuals/actualRecordsは除外）。
追加・更新・削除時に、紐づく`DivisionBudget.initialAmount`が自動再計算される（`actualRecords`の変更は対象外。実績は予算枠の変動要因ではない）。

#### BudgetBreakdownActualRecord（`budget.ts`）

`BudgetBreakdown`の実績明細。「いつ・何を購入したか」を記録する（予算1:実績Nの構造）。ストア側のアクション・スキーマはカテゴリ非依存だが、UI上は`OtherExpensePanel`（`general_expense`区分専用）と`BudgetBreakdownDialog`（全カテゴリ共通）の2箇所から登録できる。いずれも`OtherExpenseActualDialog`を再利用する。

| フィールド     | 型                        | 備考             |
| -------------- | ------------------------- | ---------------- |
| `id`           | `uuid`                     |                  |
| `purchasedAt`  | `string`（`YYYY-MM-DD`）  | 購入日           |
| `itemLabel`    | `string`（1〜500文字）    | 購入品目（`Textarea`入力） |
| `amount`       | `number`（0以上）         | 金額（万円）     |
| `note`         | `string`（最大1000文字、任意） | 備考（詳細情報の自由記述、`Textarea`入力） |

追加・更新・削除は`budget-store`の`addBudgetBreakdownActualRecord` / `updateBudgetBreakdownActualRecord` / `deleteBudgetBreakdownActualRecord`アクション経由で行う。

### BudgetAdjustment（`budget.ts`）

その他予算変更履歴（旧「予算追加履歴」）。期中に発生した予算調整（増額・減額）を追記専用で記録する（更新・削除APIは設けない）。`BudgetBreakdown`（案件予算の内訳）とは別軸で、`DivisionBudget.initialAmount`の自動計算には含まれない。

| フィールド        | 型                       | 備考                              |
| ----------------- | ------------------------ | --------------------------------- |
| `id`               | `uuid`                    |                                   |
| `budgetId`         | `uuid`                    | 対象の`DivisionBudget.id`         |
| `amount`           | `number`（0以上）         | 調整額（万円）の絶対値。符号は`adjustmentType`で表す |
| `adjustmentType`   | `'increase' \| 'decrease'`（任意・デフォルト`'increase'`） | 増額/減額の区分。既存データとの後方互換のためoptional + zodのdefault('increase')で自動付与（`bufferActualAmount`と同じパターン）。`amount`は符号付きにしない（`NumericInput`が負値入力を受け付けないため） |
| `reason`           | `string`（1〜500文字）    | 調整理由（自由記述）              |
| `adjustedAt`       | `string`（`YYYY-MM-DD`）  | 調整日（業務上の日付）            |
| `createdAt`        | `datetime`                | レコード作成日時                  |

派生型: `CreateBudgetAdjustment`（id/createdAtを除外）。更新・削除用スキーマは存在しない。
「現在の予算総額」= `DivisionBudget.initialAmount`（内訳等の自動計算値） + 紐づく全`BudgetAdjustment`の合計（`adjustmentType==='decrease'`のレコードは減算、それ以外は加算。ストアのセレクタ`getDivisionBudgetTotal`で算出）。
この「現在の予算総額」は部門予算タブの俯瞰表（`DivisionBudgetPanel`）には表示されない別軸の値である点に注意。俯瞰表の「総合計」列は案件予算・その他費用・AI利用費・SaaS費用の4列合計のみで、その他予算変更（`BudgetAdjustment`）は含まない（後述の「部門予算タブの俯瞰集計」参照）。

### AiUsageProvider（`budget.ts`）

AI利用費プロバイダマスタ。部門ごとに、契約しているAIプロバイダ（Anthropic・OpenAI・Microsoft等）とグレード・プランを登録する。金額は持たず、名称・プランのみの軽量マスタ（`SaasContract`と異なり金額フィールドを自身に持たない）。

| フィールド   | 型                           | 備考                       |
| ------------ | ---------------------------- | -------------------------- |
| `id`         | `uuid`                       |                            |
| `divisionId` | `uuid`                       | 対象部門ID                 |
| `name`       | `string`（1〜100文字）       | プロバイダ名               |
| `plan`       | `string \| null`（任意、最大100文字） | グレード・プラン（例: "Team", "Enterprise"） |
| `sortOrder`  | `number`（0以上の整数）      | 部門内での並び順（部門ごとに0起点） |
| `createdAt`  | `datetime`                   |                            |
| `updatedAt`  | `datetime`                   |                            |

派生型: `CreateAiUsageProvider`（id/日時を除外）、`UpdateAiUsageProvider`（idのみ必須、他は任意）。
`deleteAiUsageProvider`は紐づく`AiUsageEntry`（`providerId`一致）も併せて削除し、削除対象部門の`DivisionBudget.initialAmount`を再計算する（UI側で削除確認ダイアログを表示し、月次データが失われる旨を警告する）。

### AiUsageEntry（`budget.ts`）

AI利用費。部門（Division）×年度×月×課（Section、任意）×プロバイダ（`AiUsageProvider`、任意）で1レコード。`actualAmount`が`null`の月は「未記録」として扱い、`0`円と区別する。

| フィールド      | 型                        | 備考                              |
| --------------- | ------------------------- | --------------------------------- |
| `id`            | `uuid`                     |                                   |
| `divisionId`    | `uuid`                     | 対象部門ID                        |
| `sectionId`     | `uuid \| null`（任意）     | 課単位の予算設定。`null`/未設定＝部門全体レベル |
| `providerId`    | `uuid \| null`（任意）     | プロバイダ単位の予算設定。`null`/未設定＝プロバイダ未分類（既存データとの後方互換） |
| `fiscalYear`    | `number`（2000〜2100）     |                                   |
| `month`         | `string`（`YYYY-MM`）      |                                   |
| `budgetAmount`  | `number`（0以上）          | 月次予算額（万円）                |
| `actualAmount`  | `number \| null`（0以上）  | 月次実績額（万円）。`null`=未記録 |

一意性: `divisionId` × `fiscalYear` × `month` × `sectionId` × `providerId`（`sectionId`/`providerId`は`null`をそれぞれ「部門全体」「プロバイダ未分類」として区別する）。
派生型: `CreateAiUsageEntry`（idを除外）、`UpdateAiUsageEntry`（idのみ必須、他は任意）
部門合計セレクタ（`getAiUsageEntries`/`getAiUsageBudgetTotal`/`getAiUsageTotal`）は`divisionId`のみでフィルタするため、課別・プロバイダ別エントリも自動的に部門合計へロールアップされる（`providerId`導入前から存在する合算ロジックを無改修で流用）。課単位の参照は`getAiUsageEntriesBySection`/`getAiUsageBudgetAmountForMonth`を使用する（`getAiUsageBudgetAmountForMonth`は同一部門・課・月に複数プロバイダのエントリが存在しうるため、全プロバイダ分を合算して返す）。

`AiUsageGrid.tsx`（月別入力グリッド）は月を列（横軸）に配置した横方向テーブルで、`予算額`のみ直接編集可能（`setAiUsageBudget`）。`actualAmount`の直接編集UIは廃止されており、「実績額」列は`AiUsageMemberAllocation`の当該月合計（メンバー配分実績の合計）を表示専用で参照する。`AiUsageMemberAllocation.actualAmount`が変更されると、`budget-store`の`setAiUsageMemberAllocation`が部門全体・プロバイダ未分類（`sectionId=null`かつ`providerId=null`）の`AiUsageEntry.actualAmount`へ自動同期する（`syncAiUsageActualForDivisionMonth`）。これにより年度末着地予測（`calcYearEndForecast`）等、既存の`AiUsageEntry.actualAmount`参照機能との整合性を保つ。課別（`sectionId`が非null）の`actualAmount`はこの同期の対象外で、従来通り値が変化しない。

**プロバイダ登録時のUI（→で選択式に変更）**: `AiUsageProvider`が1件も登録されていない部門では、従来どおり単一の「予算額」行のみを表示する（完全な後方互換）。1件以上登録されると、上部にプロバイダ選択セレクタ（単一選択、デフォルトは`sortOrder`最小のプロバイダ、選択中プロバイダが削除された場合は自動的に別のプロバイダへフォールバック）が表示され、選択中の1プロバイダの「予算額」「実績額」の2行（いずれも手動入力、`setAiUsageBudget`/`setAiUsageActual`に`providerId`を渡す）のみをグリッドに表示する。プロバイダ未分類（`providerId=null`）の「予算額」行はプロバイダ登録済みの部門ではUI上非表示になるが、書き込みAPI（`setAiUsageBudget`）自体は変更しておらず、既存データは削除されない。全プロバイダ横断の「予算合計」「実績合計」表示行は選択中プロバイダに関わらず常時表示され、`予算合計`には未分類分の`budgetAmount`も引き続き合算される（既存の非対称な合算ロジックは変更していない。`実績合計`は未分類分を含まない）。プロバイダ別の`actualAmount`はメンバー配分からの自動同期対象外で、`AiUsageMemberAllocation`とは独立した手動入力経路である点に注意（メンバー配分にはプロバイダ軸が無いため、自動按分は行わない設計判断。でも維持）。

### AiUsageMemberAllocation（`budget.ts`）

AI利用費のメンバー別予算配分・実績。部門×年度×月×メンバー×プロバイダで1レコード。`AiUsageEntry`（部門×年度×月の月別予算）とは直交する別軸で、月次予算をメンバー単位に配分・微調整するために使用する。

| フィールド             | 型                | 備考                              |
| ---------------------- | ----------------- | --------------------------------- |
| `id`                   | `uuid`             |                                   |
| `divisionId`           | `uuid`             | 対象部門ID                        |
| `fiscalYear`           | `number`（2000〜2100） |                              |
| `month`                | `string`（`YYYY-MM`） |                                |
| `memberId`             | `uuid`             | 対象メンバー                      |
| `providerId`           | `uuid \| null`（任意）| プロバイダ単位の配分。null/未設定＝プロバイダ未分類（既存データとの後方互換） |
| `monthlyBudget`        | `number`（0以上）  | 個人予算（UI表示は＄。実体は万円のまま保存） |
| `bufferAmount`         | `number`（0以上）  | バッファ（予算枠）                |
| `actualAmount`         | `number`（0以上）  | 割当（個人予算分の実績）          |
| `bufferActualAmount`   | `number`（0以上、任意・デフォルト0） | バッファ割当（バッファ分の実績）。既存データとの後方互換のためoptional + zodのdefault(0)で自動付与 |

一意性: `divisionId` × `fiscalYear` × `month` × `memberId` × `providerId`（`providerId`は`null`を「プロバイダ未分類」として区別する）。
派生型: `CreateAiUsageMemberAllocation`（idを除外）、`UpdateAiUsageMemberAllocation`（idのみ必須、他は任意）。
`getOrCreateAiUsageMemberAllocations`（部門×年度×月×対象メンバーID配列×プロバイダID）でレコード存在を保証する（既存レコードは上書きしない、`personnel-plan-store`の`getOrCreateAllCategories`と同様のパターン）。一律設定（`bulkSetAiUsageMemberMonthlyBudget` / `bulkSetAiUsageMemberBufferAmount`）は対象月・対象プロバイダのメンバーの個人予算/バッファをボタン押下のたびに一括上書きする（割当・バッファ割当には一律設定ボタンを設けない）。第5引数`memberIds?: string[]`を省略すると従来どおり部門内全メンバーが対象（後方互換）、指定すると当該メンバーのみに絞り込む。第6引数`providerId?: string | null`を省略するとプロバイダ未分類のみが対象。`AiUsageMemberAllocationPanel`は課で絞り込み済みの`memberIds`と選択中の`providerId`を常に渡すため、実質的に「選択されている部門・課・プロバイダに対しての一律設定」として動作する。
【仮定】対象メンバーの抽出条件は「部門所属かつ`isActive=true`」とする（人員計画のような年度在籍判定は行わない）。
（割当＋バッファ割当）の合計が（個人予算＋バッファ）の合計を超える場合、UI上で警告表示する（`calcAiUsageMemberAllocationTotal`、非ブロッキングのソフトバリデーション）。
`actualAmount`/`bufferActualAmount`が変更されると、`budget-store.ts`の`setAiUsageMemberAllocation`が部門全体・プロバイダ未分類（`sectionId=null`、`providerId=null`）の`AiUsageEntry.actualAmount`へ両者の合計を自動同期する（`syncAiUsageActualForDivisionMonth`）。年度末着地予測等、`AiUsageEntry.actualAmount`を参照する既存機能との整合性を保つための同期であり、課別（`sectionId`が非null）のエントリは対象外。で`AiUsageMemberAllocation`に`providerId`軸を追加したが、この同期先はあえてプロバイダ非依存のまま維持する（メンバー配分自身の`providerId`に関わらず、常に`providerId=null`の集計バケツへ書き込む）。プロバイダ別の「実績額」（`AiUsageGrid`の手動入力欄、`setAiUsageActual`経由）は、メンバー配分由来の自動同期対象外で独立した手動入力に限定するという既存の設計判断（後述の「プロバイダ登録時のUI」参照）を維持するための措置で、同期先をプロバイダ単位に分けると同一プロバイダの実績が「手動入力値」と「メンバー配分由来の自動集計」の2レコードに分裂し、`sectionId`/`providerId`を問わず`divisionId`単位でロールアップする部門合計セレクタ（`getAiUsageTotal`等）で二重計上されてしまう。
AI利用費タブ（`AiUsageGrid.tsx`・`AiUsageMemberAllocationPanel.tsx`）のUI表示単位は「万円」ではなく「＄」。`AiUsageEntry`/`AiUsageMemberAllocation`の数値自体は＄建てのまま保存される。他の万円建て集計（部門予算俯瞰の「AI利用費」列・`DivisionBudget.initialAmount`・予実ダッシュボードの年度末着地予測/月次推移）へ合算する際は、`ExchangeRateEntry`履歴（後述）から各エントリの対象月に有効な為替レートを引いて万円換算する（requirements10、`convertUsdToManYen`）。AI利用費タブ自身の表示・入力（予算額・個人予算・バッファ・割当・バッファ割当）は換算前の＄のまま扱う。

課セレクタは`AiUsageGrid`（上部エリア）に一本化されており、`AiUsageMemberAllocationPanel`（下部エリア）は独自の課セレクタを持たない（選択状態は呼び出し元`BudgetPage`が保持し両エリアで共有）。**「部門全体」は選択肢として廃止**しており、`sectionId`は必ず特定の課のIDを指す（課が0件の部門は`BudgetPage`が案内メッセージに切り替え、`AiUsageGrid`/`AiUsageMemberAllocationPanel`自体をレンダリングしない）。プロバイダセレクタも同様に`AiUsageGrid`（上部エリア）にのみ存在し、選択状態を`AiUsageMemberAllocationPanel`と共有する。`AiUsageGrid`の個人予算合計・バッファ合計・割当合計・バッファ割当合計の4行、および`AiUsageMemberAllocationPanel`のテーブル本体・フッター合計行は、いずれも選択中の課に属するメンバー（`filterMembersByOrganization`＋`isActive`）かつ選択中のプロバイダ（`providers.length===0`の部門は常にプロバイダ未分類）の配分のみを集計対象にする。

### ExchangeRateEntry（`budget.ts`）

為替レート設定の履歴。全社共通・単一設定で、システム設定（`Layout.tsx`）から更新する。AI利用費（＄建て）を万円建ての集計へ合算する際、対象月に有効なレートで換算するために使用する（requirements10）。

| フィールド      | 型                        | 備考                       |
| --------------- | -------------------------- | -------------------------- |
| `effectiveFrom` | `string`（`YYYY-MM`）      | 適用開始年月               |
| `rate`          | `number`（0より大きい）    | 1ドルあたりの円            |

`Database.exchangeRateHistory: ExchangeRateEntry[]`（任意、後方互換のためoptional）に格納する。
`budget-store`の`setExchangeRate(rate)`は「現在の暦月」を起点に履歴へ追記/更新する（同月内の再設定は当該月のエントリを上書き、月をまたぐと新しいエントリが追加され過去分は保持されたまま残る）。
`getApplicableExchangeRate(targetMonth)`（`shared/utils/budget-utils.ts`）は`getApplicableUnitPrice`と同じ探索ロジックで、`targetMonth`以下で最新のエントリのレートを返す（該当なしの場合は0＝未設定を表す）。
為替レート変更時は、AI利用費を保有する**全部門**の`DivisionBudget.initialAmount`を再計算する（`recalcAllDivisionBudgets`。他の更新アクションが対象部門を1件に絞って再計算するのとは異なり、為替レートは部門をまたいで影響するため）。ただし「そのタイミングでのレート」で計算するため、過去月に設定済みのAI利用費エントリは、未来の月を起点に追記されたレート変更の影響を受けない。

### SaasContract（`budget.ts`）

SaaS契約。サービスごとの契約情報一式を管理する。

| フィールド           | 型                              | 備考                              |
| -------------------- | -------------------------------- | --------------------------------- |
| `id`                  | `uuid`                            |                                   |
| `name`                | `string`（1〜100文字）            | サービス名                        |
| `plan`                | `string \| null`（任意、最大100文字） | グレード・プラン（例: "Business", "Enterprise"）。同一サービス（`name`）で複数プランを契約している場合の区別に使う |
| `divisionId`          | `uuid`                            | 対象部門ID                        |
| `contractType`        | `annual \| monthly`               | 契約形態                          |
| `amount`              | `number`（0以上）                 | 金額（万円）。現在の契約金額      |
| `headcount`           | `number \| null`（任意、1以上の整数） | 利用人数（人数×単価の算出補助。`amount`とは独立して保持） |
| `unitPrice`           | `number \| null`（任意、0以上）   | 1人あたり単価（万円、算出補助）   |
| `amountHistory`       | `SaasAmountHistoryEntry[]`（任意）| 金額変更履歴（空配列可、年途中の契約変更の記録用） |
| `monthlyActuals`      | `Record<string, number>`（任意、"YYYY-MM"キー） | 月次実績（万円）。`amountHistory`（契約金額改定履歴）とは別物。追記専用原則の限定的な例外。`setSaasContractActual`専用アクション経由でのみ更新 |
| `paymentCycle`        | `monthly \| annual`               | 支払いサイクル                    |
| `contractStartDate`   | `string`（`YYYY-MM-DD`）          | 契約開始日                        |
| `nextRenewalDate`     | `string`（`YYYY-MM-DD`）          | 次回更新日                        |
| `note`                | `string \| null`（最大500文字）   | 備考                              |
| `createdAt`           | `datetime`                        |                                   |
| `updatedAt`           | `datetime`                        |                                   |

`SaasAmountHistoryEntry`: `{ effectiveFrom: "YYYY-MM", amount: number(0以上) }`（`UnitPriceEntry`と同型）。記録用途のみで、年間コスト算出には使用しない（`amount`の最新値を使用）。
`headcount`と`unitPrice`が両方入力されている場合、UI側の「金額に反映」操作で`amount = headcount × unitPrice`（`calcSaasAmountFromHeadcount`）を算出しフォームへ反映できる。`amount`自体は独立して直接編集可能。
バリデーション: `nextRenewalDate` は `contractStartDate` 以降の日付であること（フォームスキーマ側で`refine`）。
年間コスト算出（日割りなし）: `paymentCycle === 'monthly'` の場合は月額×12、`'annual'` の場合は金額をそのまま計上（`calcSaasAnnualCost`、実体は`shared/utils/budget-utils.ts`。`features/budget/utils/expense-budget-utils.ts`からは後方互換のためリエクスポート）。
契約更新警告: 次回更新日が基準日から2ヶ月以内（境界含む、超過も含む）の場合に警告表示（`isContractRenewalWarning`、`features/budget/utils/expense-budget-utils.ts`）。
派生型: `CreateSaasContract`（id/日時を除外）、`UpdateSaasContract`（idのみ必須、他は任意。`monthlyActuals`は除外し専用アクション経由に限定）
SaaS契約の追加・更新・削除は、紐づく部門の全年度`DivisionBudget.initialAmount`を自動再計算する。
`SaasContractTable.tsx`の一覧は`name`→`plan`→`nextRenewalDate`の順でソートされる。これにより同一サービス（`name`）で複数プランを契約している行が近接して表示される（プラン単位のグループヘッダー化等は見送り、ソート順による軽量な近接表示に留める）。

### PersonnelPlanEntry（`personnel-plan.ts`）

人員計画（人員配置計画）。部門×年度×4固定区分で管理し、月別の予定人数と実績人数を記録する。

| フィールド       | 型                                 | 備考                                          |
| ---------------- | ---------------------------------- | --------------------------------------------- |
| `id`             | `uuid`                             |                                               |
| `divisionId`     | `uuid`                             | 所属部門ID                                    |
| `fiscalYear`     | `number`（2000〜2100）             | 対象年度                                      |
| `category`       | `'personnel_internal' \| 'personnel_external' \| 'planned_internal' \| 'planned_external'` | 人員計画の4固定区分（旧`personnel_proper`/`personnel_non_proper`/`planned_proper`/`planned_non_proper`。表示ラベルは「人件費（内部リソース/外部リソース）」「追加予定（内部リソース/外部リソース）」） |
| `monthlyHeadcount` | `Record<string, number>`（"YYYY-MM"キー） | 月別予定人数（小数可）。常にユーザーが手入力 |
| `monthlyRealizedHeadcount` | `Record<string, number>`（"YYYY-MM"キー、任意） | 月別実績人数。personnel_*は在籍Memberから自動算出（読取専用）、planned_*のみユーザー手入力 |
| `createdAt`      | `datetime`                         |                                               |
| `updatedAt`      | `datetime`                         |                                               |

一意性: `divisionId` × `fiscalYear` × `category`（部門×年度×区分で1レコード固定）。`getOrCreateAllCategories`が4区分のレコード存在を保証する（既存レコードは上書きしない）。
派生型: `CreatePersonnelPlanEntry`（idと日時を除外）。`UpdatePersonnelPlanEntry`（idのみ必須、createdAtを除外、monthlyHeadcount/monthlyRealizedHeadcountのみ更新可）。
`category`の4値は旧enum値（`personnel_proper`等）からのリネーム（ローンチ前のため旧データの変換処理は持たない）。

**実績人数の算出ルール**:
- `personnel_internal` / `personnel_external`: 対象月に在籍するメンバー（startDate ≤ 月末、endDate ≥ 月初 または null）から自動算出（ユーザー入力不可、UI上は読取専用）。isProperMemberフラグで区分
- `planned_internal` / `planned_external`: ユーザーが `monthlyRealizedHeadcount` に手入力する（追加予定人員数）

**予算額の算出ルール**:
- 予算額 = monthlyHeadcount合計（全月） × 概算単価（Database.estimatedUnitPrice、全社共通）
- 実績金額: personnel_*のみ在籍メンバーの単価履歴から算出、planned_*は概念なし（常に空）
