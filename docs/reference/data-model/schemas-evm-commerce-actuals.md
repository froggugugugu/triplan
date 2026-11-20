# スキーマ詳細: EVM・商流・月次実績・完了同期・CSVマッピング・見積

> [`docs/data-model.md`](../../data-model.md) から分割した詳細リファレンス。常時ロードされないため、必要なときにこのファイルを直接Readする。

### ProjectProgressEntry（`project-progress.ts`）

案件（トップレベルProject）×週単位の進捗率スナップショット。EVM（PV/EV/AC）機能のEV（出来高）算出に使用する。`AssignmentEntry.monthlyValues`と同じ「1エンティティに時系列データを内包する」パターンで、1案件につき1レコード。

| フィールド        | 型                                                    | 備考                                                |
| ------------------ | ------------------------------------------------------ | --------------------------------------------------- |
| `id`               | `uuid`                                                  |                                                      |
| `projectId`        | `uuid`                                                  | トップレベル案件（`level===0`）のみ対象             |
| `weeklyProgress`   | `Record<string, number>`                                | キー: `"YYYY-Www"`（ISO週番号、月曜始まり）、値: 0.0〜1.0の進捗率 |
| `createdAt`        | `datetime`                                              |                                                      |
| `updatedAt`        | `datetime`                                              |                                                      |

一意性: `projectId`（1案件1レコード）。
派生型: `CreateProjectProgressEntry`（id/createdAt/updatedAtを除外）。更新は専用アクション`setWeeklyProgress(projectId, weekKey, progressRate)`経由（`weeklyProgress`の特定週のみをupsertする。既存レコードが無ければ新規作成する）。新設フィールドのため`DatabaseSchema`では`optional`、`json-storage.ts`側のマイグレーション関数は不要（`projectProgressEntries ?? []`のデフォルト値付与のみ）。

### ProjectBaseline（`project-baseline.ts`）

計画のスナップショット（EVMのPV＝計画値の基準線）。案件×版で1レコードの**追記専用**エンティティ
（`BudgetAdjustment`・`SkillEvaluation`と同じパターン。更新・削除APIは設けない）。
設計背景は 非公開の設計文書・§3.1 を参照。

| フィールド | 型 | 備考 |
| ---------- | -- | ---- |
| `id` | `uuid` | |
| `projectId` | `uuid` | トップレベル案件（`level===0`）のみ対象 |
| `version` | `number`（1以上の整数） | 案件内の連番（1 = 当初計画）。凍結のたびに最大値+1で自動採番 |
| `approvedAt` | `string`（`YYYY-MM-DD`） | 凍結日（業務上の承認日） |
| `reason` | `string`（1〜200文字） | 凍結理由（`"当初計画"` / `"CR#1 追加開発分"` 等の自由記述） |
| `bacAmount` | `number`（0以上） | 凍結時点のBAC（完成時総予算、万円）。**EV = 進捗率 × この値** |
| `monthlyPlannedCost` | `Record<string, number>` | キー: `"YYYY-MM"`、値: その月の計画コスト（万円）。PV曲線の源（frozenモード） |
| `plannedAllocations` | `{ memberId, monthlyValues }[]` | 凍結時点のアサイン配分率。PV曲線の源（latestモード） |
| `createdAt` | `datetime` | |

一意性: `projectId` × `version`。派生型: `CreateProjectBaseline`（idを除外）。
「有効なベースライン」は案件内で最大の`version`を持つレコード（`getActiveBaseline`、
`getCurrentSkillLevel`と同じ「履歴から現況を導出する」パターン）。

**金額と配分率の両方を保存する理由**: 単価モード（`Project.evmUnitPriceMode`）の切替に後から
対応できるようにするため。金額だけでは最新単価で再計算できず、配分率だけでは凍結時の単価が失われる。

#### EVM（PV/EV/AC）コアアルゴリズム

「モノ」領域（案件の進捗）の予実欠落を解消するため、案件×週単位でPV（計画値）/EV（出来高）/AC（実コスト）の3指標を算出する（`shared/utils/iso-week-utils.ts` + `features/budget/utils/evm-utils.ts`）。ユーザーが入力するのは週次の進捗率のみで、PV/ACは既存データから自動算出する。

- **ISO週番号**: `getIsoWeekKey(date)`がISO 8601準拠の週番号（月曜始まり、木曜日が属する年を採用）を算出する。既存の月次キー（`"YYYY-MM"`、`fiscalMonthToCalendarMonth`）とは独立した並存的な時間軸。
- **BAC（完成時総予算）の供給源**: ①WBS工数が0の段階は案件に紐づく`BudgetBreakdown`の予算枠合計（L0）、②WBS工数が1件以上あればWBS積み上げ（L1 = `総工数(人月) × 概算単価 × 係数`）へ自動で切り替わる。**受注額（`Project.contractAmount`）はBACにしない**（粗利を含むため、原価計画であるPVと直接比較すると常に下振れする）。判明していればチャートに上限の水平線として重ねるのみで、未設定でもEVMは完全に機能する（非公開の設計文書）。有効なベースラインがある場合はその`bacAmount`が優先される（PVとEVの基準を一致させないとSPIが意味を失うため）。
- **PV（計画値）**: 有効なベースライン（`ProjectBaseline`）があれば、その月次計画コストを**配分の形として**用い、総額はBACへスケールして算出する（`calcPvFromBaseline`）。すなわち `PV(w) = BAC × (経過分の計画コスト / 計画コスト総額)`。アサイン計画は時期に応じて配分が変わるため、この累積は自然に曲線（立ち上がり・ピーク・収束）を描く。総額をBACへ揃えるのは、PVの終点がBACと食い違うと「計画どおり完了してもPVがBACに届かない」状態になりEVMが破綻するため。ベースラインが無い案件、またはアサイン計画が空の場合は、従来の`ScheduleEntry`期間の直線按分（`calcPvAtWeek`）へフォールバックする。単価の扱いは`Project.evmUnitPriceMode`で切替（`'frozen'`＝凍結時の金額、`'latest'`＝凍結時の配分率×最新単価で再構築）。
- ~~**PV（旧: 直線按分モデル）**~~: 案件の全`ScheduleEntry`から`overallStartDate = min(startDate)`・`overallEndDate = max(endDate)`を算出し、案件予算総額を週の日曜日基準で日数按分する。ベースライン未凍結の案件でのフォールバックとして残存（`calcPvAtWeek`）。`ScheduleEntry`が1件も無い案件はPV算出不可のためEVM対象外（消極的オプトアウト）。
- **EV（出来高）**: `EV(w) = round(BAC × progressRateAt(w))`。`progressRateAt(w)`は**週次の手入力を優先し、無ければWBSの完了チェックから工数加重で導出する**（`resolveProgressRateAtWeek`）。手入力は「明示的に上書きした」ことを意味するため優先する（無操作なら自動算出が効く、という入力負担の設計原則）。工数加重の進捗率は`calcWbsProgressAtDate`（`shared/utils/wbs-progress-utils.ts`）が`Project.completedAt <= 対象週の日曜日`のタスクのみを完了として集計する。全タスクの工数が0の案件はタスク数ベースへ自動フォールバックする。EVM表示の対象条件は「`ProjectProgressEntry`が1件以上 **または** 完了チェック済みタスクが1件以上」（`isEvmChartEligible`の第5引数`wbsProgressAvailable`）。
- **AC（実コスト、人件費のみ）**: 対象案件の`AssignmentEntry`×担当メンバーの人件費単価を、月内日数按分で週次の累積値に変換して合算する（`calcAcAtWeek`）。**配分率は`actualMonthlyValues?.[m] ?? monthlyValues[m]`で解決する**（実績の例外入力がある月だけその値、無ければ計画値＝無操作なら計画どおり）。計画に無い月へ実績だけが入力されたケース（計画外の稼働）も拾うため、両者のキーの和集合を走査する。単価は`Member.contractUnitPriceHistory`（契約単価、所属会社への実際の支払い用）を優先し、空配列（内部リソース等、契約単価を持たないメンバー）の場合は`Member.unitPriceHistory`（通常単価）にフォールバックする。月内日数按分は、週の基準日（日曜日、`getIsoWeekSunday`）が属する月を基準に、①基準月より前の月は100%（全額計上済み）、②基準月より後の月は0%（未到来）、③基準月と同一の月は「基準日の日/その月の日数」で按分する。以前は`BudgetBreakdown.actualRecords`（購入実績明細、非人件費含む）ベースで算出していたが、PV（計画値）の算出基盤である案件概算予算額が人月工数のみを対象としていることに合わせ、EVM三指標の算出基盤を人件費で統一するため完全に置き換えた（購入実績明細ベースの算出は廃止）。
- **EVM対象案件の抽出条件**: 進捗率入力の対象＝①トップレベル案件（`level===0`）、②`divisionId`が選択中部門と一致、③`ScheduleEntry`が1件以上存在。チャート表示対象＝上記に加え④`ProjectProgressEntry`が1件以上存在（進捗率が1回以上入力済み）。オプトアウトはこの消極的な条件判定のみで、案件単位のON/OFFフラグや外部ツール（Asana/Backlog等）連携インポート機能は持たない。

### ChangeRequest（`change-request.ts`）

変更管理（PROPOSAL §2.4・§4.4）。期中の契約変更・追加発注を記録し、「なぜ着地が動いたか」を
追跡可能にする。`BudgetAdjustment`（コスト側の予算調整）の売上・スコープ側の対概念。

| フィールド | 型 | 備考 |
| ---------- | -- | ---- |
| `id` | `uuid` | |
| `projectId` | `uuid` | トップレベル案件のみ対象 |
| `title` | `string`（1〜200文字） | 変更内容の表題 |
| `requestedAt` | `YYYY-MM-DD` | 発生日 |
| `status` | `'pending' \| 'approved' \| 'rejected'` | 申請中／承認済／却下 |
| `contractAmountDelta` | `number`（0以上の絶対値） | 受注額差分。符号は`contractAmountDeltaType`（`'increase' \| 'decrease'`）で表す（`NumericInput`が負値を受け付けないため、`BudgetAdjustment.adjustmentType`と同じパターン） |
| `effortDeltaDays` | `number`（0以上の絶対値・人日） | 工数差分。符号は`effortDeltaType`。**承認時の自動反映はしない**（WBSのどのタスクへ積むか自動で決められないため、WBS手動更新→ベースライン再凍結を促す） |
| `newDueDate` | `YYYY-MM-DD \| null` | 変更後のマスター納期。`null`＝納期の変更なし |
| `note` | `string`（最大1000文字、任意） | |
| `decidedAt` | `YYYY-MM-DD \| null` | 承認/却下した日。pendingの間は`null` |
| `createdAt` / `updatedAt` | `datetime` | |

**承認時の自動反映**: `approveChangeRequest`が受注額差分を`Project.contractAmount`へ（0未満には
ならない）、`newDueDate`を`Project.masterDueDate`へ反映する。**削除はpendingのみ可**
（承認/却下済みは記録として保持。二重承認も`status !== 'pending'`ガードで防止）。

### BillingMilestone（`billing-milestone.ts`）

請求マイルストン（PROPOSAL §2.4・§4.3）。受注額を検収時期に分割割付し、
検収→請求→入金という日本のSI商流のステータスを案件単位で追跡する。

| フィールド | 型 | 備考 |
| ---------- | -- | ---- |
| `id` | `uuid` | |
| `projectId` | `uuid` | トップレベル案件のみ対象 |
| `label` | `string`（1〜200文字） | マイルストン名（"中間金" / "検収時" 等） |
| `amount` | `number`（0以上） | 請求額（万円） |
| `plannedAcceptanceDate` | `YYYY-MM-DD` | 検収予定日 |
| `status` | `'planned' \| 'accepted' \| 'invoiced' \| 'paid'` | 予定／検収済／請求済／入金済 |
| `note` | `string`（最大500文字、任意） | |
| `createdAt` / `updatedAt` | `datetime` | |

集計（`features/projects/utils/billing-milestone-utils.ts`）:
**売上計上額**＝検収済以降（accepted/invoiced/paid）の合計（検収基準）。
**受注残**＝受注額−売上計上額。**配分ギャップ**＝配分合計−受注額（不一致はUI警告のみで
ブロックしない。受注額が後から降りてくる商習慣を踏まえ、受注額未設定時は判定不能=nullとして
警告を出さない）。

### MonthlyActualsConfirmation（`actuals.ts`）

月次実績の確定マーク（P1-a。非公開の設計文書）。
全社×月で1レコードの**ソフトロック**: 確定済み月の実績編集は警告表示のみで拒否しない
（ハードロック＝編集拒否は月次締め（P1-b）の将来責務）。確定はマークのみで、実績キー
（`AssignmentEntry.actualMonthlyValues`）の一括書込みは行わない（キー欠落=計画どおりの
セマンティクスを保つ）。部門別の確定が必要になった場合はdivisionIdカラム追加で拡張する。

| フィールド | 型 | 備考 |
| ---------- | -- | ---- |
| `id` | `uuid` | |
| `month` | `string`（`YYYY-MM`） | 全社×月で1レコード（サーバー側unique制約） |
| `confirmedAt` | `datetime` | 確定日時。再確定はこのフィールドのみ更新する（レコードは増えない） |

派生型: `CreateMonthlyActualsConfirmation`（idを除外）。
サーバー側（`monthly_actuals_confirmations`）の`confirmed_at`はtext列（ISO文字列を無変換往復。
`timestamp`の`mode:'string'`はPostgres書式（'T'なし）で返りクライアントZodの`.datetime()`に弾かれるため）。

### ActualsImportLog（`actuals.ts`）

CSV取込履歴（P1-a）。**追記専用**（`BudgetAdjustment`と同じパターン、更新・削除APIなし。
サーバー側ルートも`readOnly: true`でPATCH/DELETEを登録しない）。「いつ・どのファイルから・
何件適用し・何件なぜスキップしたか」の追跡性を担保する。

| フィールド | 型 | 備考 |
| ---------- | -- | ---- |
| `id` | `uuid` | |
| `importedAt` | `datetime` | 取込日時 |
| `fileName` | `string`（1〜255文字） | 取込元ファイル名 |
| `targetMonths` | `string[]`（各`YYYY-MM`） | 取込対象になった月の一覧 |
| `appliedCount` | `number`（0以上の整数） | 適用行数 |
| `skippedCount` | `number`（0以上の整数） | スキップ行数 |
| `skippedReasons` | `{ row, reason }[]`（最大100件） | スキップ理由の明細（行番号つき。全行分は保持せず100件で打ち切り） |
| `note` | `string`（最大500文字）`\| null` | 備考 |

派生型: `CreateActualsImportLog`（idを除外）。

### MonthlyCloseEvent（`actuals.ts`）

月次締めイベント（P1-b。非公開の設計文書）。**追記専用**で、
締め状態は保存フィールドで持たず月ごとの最新イベント（occurredAt昇順の末尾）から導出する
（`getActiveBaseline`と同じパターン）。イベント自体が「いつ・誰が・なぜ締めた/解除したか」の
監査記録を兼ねる。締め済み月は工数実績（`actualMonthlyValues`）に加えて**計画（`monthlyValues`の
該当月キー）も編集拒否**になる（AC解決が`actual ?? planned`のため、計画を動かすと明示実績の無い
行の事実が動いてしまう。締め時に実績キーを一括書込みするmaterialize案は「キー欠落=計画どおり」の
セマンティクスを壊すため不採用）。

| フィールド | 型 | 備考 |
| ---------- | -- | ---- |
| `id` | `uuid` | |
| `month` | `string`（`YYYY-MM`） | **uniqueにしない**（同月にclose→reopen→closeが積まれる） |
| `action` | `'close' \| 'reopen'` | |
| `reason` | `string`（1〜500文字）`\| null` | reopen時はUI/ストアで必須を強制（監査に「なぜ戻したか」を必ず残す）。close時は任意 |
| `occurredAt` | `datetime` | text列でISO文字列を無変換往復（確定マークと同じ） |
| `actorName` | `string \| null` | postgresモードはサーバー側が`req.user`からスタンプ（クライアント申告は無視=偽装防止。usersテーブルの表示名優先・emailフォールバック）。localモードはnull |

派生型: `CreateMonthlyCloseEvent`（idを除外）。更新・削除APIなし（サーバーも`readOnly: true`）。
書込みは`governance:approve`（admin/manager）。締め済み月の書込み拒否はUI（グリッドreadOnly・
🔒ヘッダ）／ストア（assignment-store 6アクションの前段ガード）／サーバー（assignmentsルートの
beforeCreate/beforeUpdate差分判定・beforeDelete）の3層で強制する。

### TaskSyncLog（`task-sync.ts`）

外部完了同期ログ（P1-c改。非公開の設計文書)。
**追記専用**（更新・削除APIなし、サーバーも`readOnly: true`）。CSV経路（Phase 1）と
Webhook経路（Phase 2）で共用する。

| フィールド | 型 | 備考 |
| ---------- | -- | ---- |
| `id` | `uuid` | |
| `syncedAt` | `datetime` | text列でISO文字列を無変換往復 |
| `channel` | `string` | 'csv'（Phase 2でWebhookのsourceスラッグ、で'api'＝API起票が加わる） |
| `source` | `string` | 取込元プリセット（'generic'/'backlog'/'asana'/'jira'/'github'） |
| `fileName` | `string \| null` | CSV経路のみ。Webhook・API起票はnull |
| `completedCount`/`reopenedCount`/`unchangedCount`/`skippedCount` | `number`（0以上の整数） | 完了へ/戻し/変化なし/スキップの件数 |
| `createdCount` | `number`（0以上の整数、任意） | API起票（`channel='api'`）で作成した件数。既存ログとの後方互換のためoptional（Drizzle側は`default(0)`） |
| `skippedReasons` | `{ row, reason }[]`（最大100件） | スキップ理由の明細 |
| `note` | `string \| null` | |

派生型: `CreateTaskSyncLog`（idを除外）。
API起票は完了状態を動かさないため`completedCount`/`reopenedCount`/`unchangedCount`は0で、
`createdCount`と`skippedCount`（起票済みskip＋失敗）だけが動く。

### CsvMappingProfile（`csv-mapping.ts`）

汎用CSVマッピングプロファイル（非公開の設計文書）。
外部システム向けCSVの列レイアウト（選択・並び・改名）のユーザー定義。

| フィールド | 型 | 備考 |
| ---------- | -- | ---- |
| `id` | `uuid` | |
| `name` | `string`（1〜100文字） | 例: "○○会計ソフト向け仕訳" |
| `sourceKey` | `string`（1〜50文字） | データソース識別子（'billing'／'projectFinance'／'partnerPayment'／'clientStatement'／'monthlyActualsImport'）。ソース追加を見込みenumにしない（未知キーはUIが除外=弱参照） |
| `direction` | `'export' \| 'import'` | |
| `columns` | `CsvMappingColumn[]` | `{field, header(1〜100), enabled, order(int≥0)}`。export=出力列の選択・並び・ヘッダ名／import=役割→CSV列名（列順が変わるファイルにも列名で適用） |
| `includeHeader` | `boolean` | ヘッダ無し取込を要求する外部システム向けにOFF可 |
| `options` | `Record<string, unknown>`（任意） | ソース固有設定の逃し場（実績取込の単位=`options.unit`等）。サーバーはjsonb nullable列でnull→undefined正規化 |
| `createdAt`/`updatedAt` | `datetime` | Create派生型はid・日時を除外（timestamp列のDB既定値に委譲=projectBaselinesの型不一致バグを踏まない） |

変換コアは`shared/utils/csv-mapping-utils.ts`（applyMappingProfile: enabled×order昇順・
存在しないfieldは空欄・0を欠損扱いしない・BOMはダウンロード時1回だけ付与）。

### EstimateSnapshot（`estimate-snapshot.ts`）

見積スナップショット（非公開の設計文書）。案件×版で
1レコードの**追記専用**エンティティ（更新APIはクライアントが持たない。削除は最新版のみ＝
クライアント`revokeLatestEstimate`とサーバー`beforeDelete`の二重防御）。`ProjectBaseline`（EVMのPV基準線。
アサイン計画が無いと凍結できない）とは別物で、**見積そのものの履歴**を段階・方法・根拠つきで自己完結で残す。

| フィールド | 型 | 備考 |
| ---------- | -- | ---- |
| `id` | `uuid` | |
| `projectId` | `uuid` | トップレベル案件。案件削除でカスケード削除 |
| `version` | `number`（1以上の整数） | 案件内の連番（サーバーは`projectId`×`version`にunique制約→409） |
| `stage` | `'initial_concept' \| 'product_definition' \| 'requirements_complete' \| 'ui_design_complete' \| 'detailed_design_complete' \| 'completed'` | 知識の段階（不確実性コーンの幅を決める。McConnell 2006の6段階）。**幅は保存せず**`UNCERTAINTY_CONE`から都度導出 |
| `method` | `'function_point' \| 'wbs' \| 'manual' \| 'actual'` | `actual`は`stage='completed'`のみ許可（refine） |
| `label` | `string`（1〜100文字） | 「引合時の超概算」「CR#2 追加画面分」等 |
| `takenAt` | `datetime` | サーバー側はtext列（ISO文字列を無変換往復） |
| `effortDays` | `number`（0以上） | 人日（小数2桁） |
| `amount` | `number`（0以上） | 万円（整数） |
| `basis` | `{ estimatedUnitPrice, coefficient, workdaysPerMonth, hoursPerDay, hoursPerFunctionPoint? }` | **記録時点の設定値を凍結**（後で設定を変えても履歴が動かない）。`hoursPerFunctionPoint`はFP法で必須（refine） |
| `fp` | `{ method: 'nesma_indicative' \| 'nesma_estimated', items: { name, type: 'EI'\|'EO'\|'EQ'\|'ILF'\|'EIF', count: int≥1, note? }[], totalFp: int }`（任意・null可） | `method='function_point'`のときだけ（有無をrefineで強制）。概算法にEI/EO/EQの行は拒否。`totalFp`は導出値だが重み表が将来変わっても当時の値を保つため保存 |
| `wbs` | `{ leafCount: int, totalEffortDays: number }`（任意・null可） | `method='wbs'`のときだけ（何タスクで積んだかの要約） |
| `changeRequestId` | `uuid \| null` | 変更起因の改定なら紐づけ。**FKを張らない弱参照**（CR削除後も版は残す） |
| `note` | `string`（最大1000文字、任意・null可） | |
| `authorName` | `string \| null` | サーバースタンプ（AssignmentNoteと同じ）。localモードはnull |
| `createdAt` | `datetime` | サーバー側はtimestamp列＝`beforeCreate`でDate変換（projectBaselinesと同じ） |

派生型: `CreateEstimateSnapshotSchema`（idを除外、同じ整合検証つき）。`.partial()`が要る場面
（サーバーの`updateSchema`）はrefine前の`EstimateSnapshotFieldsSchema`から作る（superRefine後の
ZodEffectsは`.partial()`を持たない）。差分（前版比・FP項目の追加/削除/件数変化）は保存せずUIで導出する
（`diffEstimateSnapshots`）。GETは`financials:read`必須（partnerは403）。

換算（`shared/utils/function-point-utils.ts`）: `totalFp = Σ count × weight`（概算法=ILF×35/EIF×15、
推定法=EI×4/EO×5/EQ×4/ILF×7/EIF×5）→ `effortDays = round2(totalFp × hoursPerFunctionPoint ÷ hoursPerDay)`
→ `amount = calcProjectEstimateBudget(effortDays ÷ workdaysPerMonth, estimatedUnitPrice, coefficient)`
（WBS概算予算と同じ丸め＝同じ数字になる）。
