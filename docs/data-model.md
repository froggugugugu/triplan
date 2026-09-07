# データモデル

Zodスキーマ定義は `src/shared/types/` に配置。
フォームバリデーションは `src/infrastructure/validation/schemas.ts` に配置。

## スキーマ詳細

### Project（`project.ts`）

案件の階層ツリー構造。最大5レベルまで対応。

| フィールド    | 型                                       | 備考                                 |
| ------------- | ---------------------------------------- | ------------------------------------ |
| `id`          | `uuid`                                   |                                      |
| `code`        | `string`（1〜50文字）                    | 自動採番（P001, P001-01, P001-01-001） |
| `name`        | `string`（1〜200文字）                   |                                      |
| `description` | `string`（最大2000文字、任意）           |                                      |
| `background`  | `string`（最大2000文字、任意）           | 案件背景                             |
| `purpose`     | `string`（最大2000文字、任意）           | 案件目的                             |
| `completionCriteria` | `string`（最大2000文字、任意）    | 完了条件。WBSグリッドで「説明」列の右隣に表示・編集する |
| `parentId`    | `uuid \| null`                           | 親案件ID                             |
| `level`       | `number`（0〜5）                         | 0=プロジェクト、1〜5=階層レベル      |
| `status`      | `not_started \| active \| completed`     | デフォルト: `not_started`            |
| `confidence`  | `S \| A \| B \| C \| null`              | 案件確度（S=確定、A=高、B=中、C=低） |
| `completed`   | `boolean`（任意、デフォルト`false`）     | WBS完了フラグ。最下層タスク（子を持たないノード）にのみユーザーが直接操作。既存のstatus（案件単位の3値enum）とは別軸 |
| `completedAt` | `string`（`YYYY-MM-DD`）`\| null`（任意） | 完了チェックを入れた日。`completed`を`true`にした時点で記録し、`false`へ戻すと`null`に戻る。**任意の過去週時点の進捗率をこの日付から再現できるため、EVの週次スナップショット記録が不要になる**（非公開の設計文書） |
| `evmUnitPriceMode` | `'frozen' \| 'latest'`（任意、既定`'frozen'`扱い） | EVMのPV算出における単価の扱い。`level===0`のみ設定対象。`'frozen'`＝凍結時点の単価で固定、`'latest'`＝最新の単価履歴で再計算（非公開の設計文書） |
| `contractType` | `'請負' \| '準委任' \| '派遣' \| '混在' \| null`（任意） | 案件レベルの契約形態（PROPOSAL §2.1）。`Member.contractType`（個人単位）とは別軸。`level===0`のみ設定対象 |
| `masterDueDate` | `string`（`YYYY-MM-DD`）`\| null`（任意） | 契約上のマスター納期（動かせない最終期日）。`ScheduleEntry`（工程別予定日の集合）とは別概念の制約点で、アラートセンターの納期超過（critical）・遅延予測（線形予測、warning）の起点。`ChangeRequest`承認時の`newDueDate`で自動更新される。`level===0`のみ設定対象 |
| `phaseKey` | `string`（最大50文字）`\| null`（任意） | 所属工程（`PhaseSettings.phases`の`phaseKey`）。**WBSツリー（工数・進捗を持つが日付を持たない）とスケジュール（日付を持つが進捗を持たない）を繋ぐ唯一の接続点**。`level>0`のタスクが対象で、未設定のタスクは最も近い祖先の設定を継承する（`resolveTaskPhaseKey`）。これにより①タスクの期日を工程の終了日から導出でき（API起票の`dueDate`）、②ガントバーへWBSの完了チェックをロールアップできる（`calcPhaseProgress`）。`ProjectDialog`の「所属工程」欄で選択（有効な工程が0件なら欄ごと非表示） |
| `divisionId`  | `uuid \| null`（任意）                   | 担当部門ID。トップレベル案件（`level===0`）のみ設定対象。既存データとの後方互換のためoptional/nullable |
| `clientName`  | `string \| null`（最大200文字、任意）    | 発注元（対外クライアント）名。トップレベル案件（`level===0`）のみ設定対象。既存の`Company`は協力会社（コスト側の外注先）専用マスタのため別概念。専用マスタ化は過剰設計のため見送り自由記述とした（非公開の設計文書、【仮定】） |
| `contractAmount` | `number`（0以上）`\| null`（任意）    | 受注金額（万円）。トップレベル案件（`level===0`）のみ設定対象。案件別損益（受注額 vs 実コスト）算出の入力値として新設 |
| `priority`    | `high \| medium \| low \| null`（任意）  | 優先度。トップレベル案件（`level===0`）のみ設定対象。`confidence`と同型のnullable enumパターン |
| `externalSource` | `string \| null`（最大50文字、任意） | 外部実行管理ツール連携。連携元スラッグ（'backlog'等）。完了同期の受信時に学習保存（手動編集UIなし）。リーフタスク対象 |
| `externalTaskId` | `string \| null`（最大200文字、任意） | 外部ツール側のタスクID/キー。初回はコード突合→以降はこの外部IDが一次突合キー |
| `externalConnectionId` | `uuid \| null`（任意） | 起票先の既定接続（`externalToolConnections.id`）。案件ごとに委譲先が違う運用（A案件=Asana／B案件=GitHub等）で、起票のたびに接続を選び間違える事故を防ぐ。**FK制約を張らない弱参照**（業務テーブルからサーバー専用エンティティへFKを張るとimportの`TRUNCATE CASCADE`の影響範囲が読めなくなるため。存在しないidは未設定として扱う）。併せて`externalSource`がツール名しか持たないために解決できなかった「同一ツールで複数接続（別スペース）」の外部リンクもこの参照で確定する。`level===0`のみ設定対象、localモードでは常にnull |
| `createdAt`   | `datetime`                               |                                      |
| `updatedAt`   | `datetime`                               |                                      |

`divisionId`は未割当を許容するためoptionalで、フィールド自体が無ければ`undefined`のままになる（`status`/`confidence`のような`.default()`は持たない）。利用側は`?? null`で扱う。`ProjectDialog`は`clientName`/`contractAmount`/`priority`も含め`level===0`のときのみ表示し、`level>0`（タスク）は常に`null`で送信する。
`ProjectDialog`の担当部門選択欄は`level===0`のときのみ表示し、`level>0`（タスク）は常に`divisionId: null`で送信する。
`BudgetBreakdownDialog`で案件を選択した際、`divisionId`が設定されていれば計上先の部門と一致するかをヒント表示する（一致時は担当部門名を通知、不一致時は警告文言。計上先の`DivisionBudget`自体を自動切り替えることはしない）。
人員計画タブの「人件費の残予算」パネル（`PersonnelCostSummary.tsx`）は、`divisionId`が当該部門に一致するトップレベル案件のWBS総工数（人日、1人月=20人日換算）を「案件の合計工数」として、部門所属メンバー（`sectionId`が当該部門の課に属するメンバー）の対象年度全12ヶ月分の月次アサイン合計（`assignment-store`の`getMemberMonthlyTotal`）を「割り当て済み工数」として表示する（依存方向ルール遵守のため`stores/projects-store`・`stores/efforts-store`・`stores/wbs-settings-store`・`stores/assignment-store`・`stores/team-store`・`stores/members-store`経由でのみ取得）。

派生型: `CreateProject`（id/日時を除外）、`UpdateProject`（idのみ必須、他は任意）、`ProjectTreeNode`（children/depth付きUI表示用）

### Division（`division.ts`）

組織階層の部門。

| フィールド   | 型                           | 備考                       |
| ------------ | ---------------------------- | -------------------------- |
| `id`         | `uuid`                       |                            |
| `name`       | `string`（1〜100文字）       |                            |
| `sortOrder`  | `number`（0以上の整数）      | 並び順                     |
| `createdAt`  | `datetime`                   |                            |
| `updatedAt`  | `datetime`                   |                            |

派生型: `CreateDivision`（id/日時を除外）、`UpdateDivision`（idのみ必須、他は任意）

### Section（`section.ts`）

組織階層の課。部門に所属。

| フィールド   | 型                           | 備考                       |
| ------------ | ---------------------------- | -------------------------- |
| `id`         | `uuid`                       |                            |
| `divisionId` | `uuid`                       | 所属部門ID                 |
| `name`       | `string`（1〜100文字）       |                            |
| `sortOrder`  | `number`（0以上の整数）      | 並び順                     |
| `createdAt`  | `datetime`                   |                            |
| `updatedAt`  | `datetime`                   |                            |

派生型: `CreateSection`（id/日時を除外）、`UpdateSection`（idのみ必須、他は任意）

### Company（`company.ts`）

所属会社。全社共通マスタで、部門（Division）には紐づかない。協力会社等の管理単位。

| フィールド   | 型                           | 備考                       |
| ------------ | ---------------------------- | -------------------------- |
| `id`         | `uuid`                       |                            |
| `name`       | `string`（1〜100文字）       |                            |
| `sortOrder`  | `number`（0以上の整数）      | 並び順                     |
| `isInternal` | `boolean`（任意、デフォルト`false`） | 内部リソース（自社）として人件費計上する会社か（旧`isProper`。UI表示は「内部リソース」、算出ロジック側の関数名・変数名は後方互換のため`isProperMember`等の名称を維持） |
| `invoiceRegistrationNumber` | `string`（`T`+13桁）`\| null`（任意） | 適格請求書発行事業者の登録番号。協力会社への支払明細（`/statements`）に表示する取引先属性 |
| `paymentTerms` | `PaymentTerms \| null`（任意） | 支払サイト: `{closingDay: 1〜31, paymentMonthOffset: 0〜6, paymentDay: 1〜31}`。31=月末扱いで、月の実日数を超える日はその月の末日へクランプ（`calcPaymentDueDate`、`shared/utils/payment-terms-utils.ts`）。【仮定】月次明細は暦月集計のため締め日は属性保持のみで、支払期日は対象月+オフセット月のpaymentDayから算出する（20日締め期間ずらし集計はスコープ外） |
| `createdAt`  | `datetime`                   |                            |
| `updatedAt`  | `datetime`                   |                            |

派生型: `CreateCompany`（id/日時を除外）、`UpdateCompany`（idのみ必須、他は任意）
プロパー人件費算出: `companyId`が未設定（`null`）、または`isInternal=true`の会社に所属するメンバーをプロパー社員とみなして人件費（見込売上）を集計する（`isProperMember`、`calcDivisionProperExpectedRevenue`、`shared/utils/budget-utils.ts`。関数名・引数名は汎用化対象外として現状維持）。
チーム画面のメンバー一覧における内部/外部リソースフィルタ（`filterMembersByInternal`、`shared/utils/member-filter.ts`）も、この`isProperMember`と同一セマンティクス（`companyId`未設定を内部リソース扱い）を再利用する。
`isInternal`は旧フィールド名`isProper`からのリネーム（ローンチ前のため旧データの変換処理は持たない）。

### UnitPriceEntry / ContractUnitPriceEntry（`member.ts`内で定義）

単価履歴エントリ。`ContractUnitPriceEntrySchema`は`UnitPriceEntrySchema`を拡張したスキーマで、
準委任の精算幅`settlementLowerHours`/`settlementUpperHours`（時間/月、いずれもoptional・0より大）を追加で持つ。
両方設定されて初めて精算計算の対象（片側のみは防御的に固定扱い）。未設定=従来どおり固定（後方互換）。

| フィールド      | 型                           | 備考                              |
| --------------- | ---------------------------- | --------------------------------- |
| `effectiveFrom` | `string`（YYYY-MM形式）      | 適用開始年月                      |
| `amount`        | `number`（0以上）            | 月額単価（万円）                  |

### Member（`member.ts`）

担当者情報。課への所属、開始/終了日、単価履歴を持つ。

| フィールド                  | 型                           | 備考                                     |
| --------------------------- | ---------------------------- | ---------------------------------------- |
| `id`                        | `uuid`                       |                                          |
| `name`                      | `string`（1〜100文字）       |                                          |
| `email`                     | `string \| null`（任意）     | メールアドレス（null/未設定 = 未設定）。通知・外部ツール連携（Backlog/Asana等）のキーとして新設（非公開の設計文書、現時点では通知・外部連携機能自体は未実装、フィールドのみ先行導入） |
| `sectionId`                 | `uuid \| null`               | 課ID（null = 未所属）                    |
| `companyId`                 | `uuid \| null`（任意）       | 所属会社ID（null/未設定 = 未設定）       |
| `contractType`               | `ContractType \| null`（任意）| 契約形態（`'請負' \| '準委任' \| '派遣' \| '正社員'`、null/未設定 = 未設定）。単価履歴のような時系列ではなく単一値（現況のみ管理、変更履歴は持たない） |
| `role`                      | `string`（最大100文字）      | 役割                                     |
| `capacityRatio`             | `number`（0 < x ≤ 1、任意）  | 月間稼働率の上限（未設定＝1.0）。時短勤務・兼務・部分参画のメンバーは1.0未満を設定する。アサイン入力時の超過判定（`isOverCapacity`）と、部門の供給キャパシティ算出（`calcResourceHistogram`）に使う。`.default()`を付けると型が必須になり既存の`Member`リテラルが全て壊れるため、optionalのみで定義し利用箇所で`?? 1`する |
| `isActive`                  | `boolean`                    | アクティブ状態                           |
| `techTagIds`                | `uuid[]`（任意）             | 紐付けた技術タグIDリスト                 |
| `startDate`                 | `string \| null`             | 開始日 YYYY-MM-DD（null = 未設定）       |
| `endDate`                   | `string \| null`             | 終了日 YYYY-MM-DD（null = 在籍中）      |
| `unitPriceHistory`          | `UnitPriceEntry[]`           | 単価履歴（予算見積もり用、空配列可）     |
| `contractUnitPriceHistory`  | `ContractUnitPriceEntry[]`（任意） | 契約単価履歴（所属会社への支払用、空配列可） |
| `createdAt`                 | `datetime`                   |                                          |
| `updatedAt`                 | `datetime`                   |                                          |

**単価と契約単価の役割分担**: 「単価」（`unitPriceHistory`）は予算の見積もり・確保に使う（工数×単価で予算枠を確保）。「契約単価」（`contractUnitPriceHistory`）は所属会社との契約に基づく実際の支払い・予算消化に使う。単価で獲得した予算を契約単価で消化していく、という予実の流れをデータモデルで区別する。

`email`/`companyId`/`contractType`/`contractUnitPriceHistory`は未設定を許容するため`optional`。所属会社削除時（`companies-store`の`deleteCompany`）は該当メンバーの`companyId`をnullに更新するが、`contractUnitPriceHistory`は記録として保持する。`contractType`は日本のシステム開発における一般的な契約区分（請負/準委任/派遣/正社員）を`TeamMemberDialog`の基本情報タブでCombobox選択する。`MemberRow`は値が設定されている場合のみ役割・所属会社名と並べてテキスト表示する（未設定時は非表示、バッジ化はしない）。

ユーティリティ: `extractRoles()`（ユニーク値のソート済みリスト）

`techTagIds`は「現在保有しているタグ」の単純な保有/非保有情報のみを表す。習熟度（レベル）・評価履歴・成長ロードマップは`SkillEvaluation`/`SkillRoadmapGoal`（後述）が別エンティティとして担う。

### SkillLevel / SkillEvaluatorType（`skill.ts`）

`SkillLevel`はスキル習熟度レベル（5段階、行動基準で定義・全タグ共通）: `'none' | 'beginner' | 'intermediate' | 'advanced' | 'expert'`（未経験／初級／中級／上級／エキスパート）。`SkillEvaluatorType`は評価者区分: `'self' | 'manager'`（本人／上長）。本アプリにはログイン・認証機構が存在しないため、評価者区分は記録の都度ユーザーが手動選択する（自動判定はしない）。

### SkillEvaluation（`skill.ts`）

スキル評価履歴（成長記録の実体）。member×techTagId×evaluatorTypeでレベルが変化するたびに1レコード追記する。追記専用（`BudgetAdjustment`と同じパターン。更新・削除APIは設けない）。

| フィールド      | 型                        | 備考                              |
| --------------- | -------------------------- | --------------------------------- |
| `id`            | `uuid`                      |                                   |
| `memberId`      | `uuid`                      | 対象メンバー                      |
| `techTagId`     | `uuid`                      | 対象の技術タグ                    |
| `evaluatorType` | `SkillEvaluatorType`        | `self`（本人）/ `manager`（上長） |
| `beforeLevel`   | `SkillLevel`                | 変更前レベル                      |
| `afterLevel`    | `SkillLevel`                | 変更後レベル                      |
| `evaluatedAt`   | `string`（`YYYY-MM-DD`）    | 評価日                            |
| `note`          | `string`（最大500文字、任意）| 備考（自由記述）                  |
| `createdAt`     | `datetime`                  | レコード作成日時                  |

一意性制約なし（履歴データのため、同一`memberId`×`techTagId`×`evaluatorType`で複数件・同日複数件も許容）。
派生型: `CreateSkillEvaluation`（id/createdAtを除外）。更新・削除用スキーマは存在しない。
「現在のレベル」（member×techTagId×evaluatorType）は、この履歴のうち`evaluatedAt`が最新のレコードの`afterLevel`から導出する（`getCurrentSkillLevel`、`shared/utils/skill-utils.ts`。同日複数件は`createdAt`でtie-break）。該当履歴が1件もない場合は`null`（＝未評価。`'none'`レベルとは意味的に区別する）。

### SkillRoadmapGoal（`skill.ts`）

成長ロードマップ目標。本人と上長が協働で、member×techTagIdごとに目標レベル・達成予定時期を設定するたびに1レコード追記する（追記専用。更新・削除APIは設けない）。

| フィールド    | 型                        | 備考                              |
| ------------- | -------------------------- | --------------------------------- |
| `id`          | `uuid`                      |                                   |
| `memberId`    | `uuid`                      | 対象メンバー                      |
| `techTagId`   | `uuid`                      | 対象の技術タグ                    |
| `targetLevel` | `SkillLevel`                | 目標レベル                        |
| `targetDate`  | `string`（`YYYY-MM`）       | 達成予定時期                      |
| `note`        | `string`（最大500文字、任意）| 備考（自由記述）                  |
| `createdAt`   | `datetime`                  | レコード作成日時                  |

一意性制約なし。派生型: `CreateSkillRoadmapGoal`（id/createdAtを除外）。更新・削除用スキーマは存在しない。
「現在の目標」は、同一`memberId`×`techTagId`で最も新しい`createdAt`を持つレコードとして導出する（`getSkillRoadmapGoalHistory`の降順ソート先頭＝`getCurrentRoadmapGoal`）。目標を変更した場合も過去の目標は上書きされず履歴（アーカイブ）として残る。
ロードマップ進捗（%）は`calcSkillRoadmapProgress(currentLevel, targetLevel)`で算出する。`targetLevel`が`'none'`の場合は常に100（達成不要）。`currentLevel`が未評価（`null`）の場合は`'none'`相当（進捗0からの計算）として扱う。

### AssignmentEntry（`assignment.ts`）

タスク×担当者ごとの月次アサイン。プロジェクト・タスク・メンバーの組み合わせで1レコード。

| フィールド      | 型                              | 備考                           |
| --------------- | ------------------------------- | ------------------------------ |
| `id`            | `uuid`                          |                                |
| `projectId`     | `uuid`                          | 対象プロジェクト               |
| `taskId`        | `uuid`                          | 対象タスク（プロジェクトの子） |
| `memberId`      | `uuid`                          | 担当者                         |
| `monthlyValues` | `Record<string, number>`        | キー: `"YYYY-MM"`、値: 0.0〜1.0（計画） |
| `actualMonthlyValues` | `Record<string, number>`（任意） | 実績の例外入力。**入力された月のキーだけが存在する**（未入力月はキー自体を持たない）。AC算出時は`actualMonthlyValues?.[m] ?? monthlyValues[m]`で解決するため、無操作＝計画どおり（未入力は欠測ではなく「変更なし」）として扱われる（非公開の設計文書・§5）。**値は0以上・上限なし**（計画の0.0〜1.0と異なり、残業等の1.0人月超も事実として記録する。P1-a・で`.max(1)`を撤廃） |
| `createdAt`     | `datetime`                      |                                |
| `updatedAt`     | `datetime`                      |                                |

### AssignmentNote（`assignment-note.ts`）

体制メモ（アサイン表の申し送り）。アサインは**外部の実行管理ツールに存在しない
本ツール固有のデータ**で、「なぜこの配分にしたか」を残す場所が無かった。タスクのコメントを
作らない（実行管理は餅は餅屋）という判断とは別で、委譲先が無いデータの申し送りをここに置く。

| フィールド | 型 | 備考 |
| ---------- | -- | ---- |
| `id` | `uuid` | |
| `projectId` | `uuid` | 対象のトップレベル案件（`level===0`）。案件削除でカスケード削除 |
| `body` | `string`（1〜2000文字） | |
| `authorName` | `string`（最大100文字）`\| null` | postgresモードはサーバーが`req.user`からスタンプ（クライアント申告は採用しない＝なりすまし防止）。localモードはnull |
| `createdAt` / `updatedAt` | `datetime` | |

**追記専用にしない**（申し送りは書き直しが要る）。変更履歴はpostgresモードの監査証跡が拾う。
派生型: `CreateAssignmentNote`（idを除外）、`UpdateAssignmentNote`。

### AssignmentSnapshot（`assignment-snapshot.ts`）

アサイン表のスナップショット。任意のタイミングで体制を記録し、現在との差分を見る。

**既存2機能との棲み分け**:

| | 粒度 | 金額 | 復元 | 用途 |
| --- | ---- | ---- | ---- | ---- |
| 全データスナップショット（`snapshot-storage.ts`） | DB全体 | 含む | 全体のみ | バックアップ |
| `ProjectBaseline` | **メンバー合算** | 含む | 不可 | EVMのPV基準線 |
| `AssignmentSnapshot` | **タスク×メンバー** | 含まない | **しない** | 体制の記録と差分比較 |

| フィールド | 型 | 備考 |
| ---------- | -- | ---- |
| `id` | `uuid` | |
| `projectId` | `uuid` | 対象のトップレベル案件。案件削除でカスケード削除 |
| `label` | `string`（1〜100文字） | 利用者が付ける名前（「10月キックオフ時点」等） |
| `takenAt` | `datetime` | サーバー側はtext列（ISO文字列を無変換往復） |
| `entries` | `{taskId, memberId, monthlyValues}[]` | 計画（`monthlyValues`）のみ記録。実績は対象外（体制＝計画の変遷を追う目的のため） |
| `authorName` | `string \| null` | サーバースタンプ（AssignmentNoteと同じ） |
| `createdAt` | `datetime` | |

**復元を提供しない**のは、誤操作で現在の計画を壊すリスクと、締め済み月のガード・監査証跡との
整合コストが利便性に見合わないため。差分を見て手で直す運用とする。クライアント側のストアは
**追記専用**（更新アクションを持たない）だが、取り違えた記録を消せるよう削除は許す。
差分算出は`shared/utils/assignment-snapshot-utils.ts`の純関数。

### RiskEntry（`risk.ts`）

リスク登録簿（非公開の設計文書）。アラートセンター（事後検知）の
対概念となる「事前管理」で、まだ数字に出ていない懸念を案件単位で識別・評価・監視する。

| フィールド | 型 | 備考 |
| ---------- | -- | ---- |
| `id` | `uuid` | |
| `projectId` | `uuid` | 対象のトップレベル案件。案件削除でカスケード削除（サーバーFK） |
| `title` | `string`（1〜200文字） | リスクの内容 |
| `probability` / `impact` | `'high' \| 'medium' \| 'low'` | 発生確率・影響度の3段階定性評価（数値%は偽精度になるため固定） |
| `status` | `'open' \| 'realized' \| 'closed'`（デフォルト`open`） | 監視中／顕在化した／解消した |
| `response` | `string`（最大2000文字）`\| null`（任意） | 対応方針（回避・軽減・転嫁・受容）。サーバーtext列の未設定はnullで返るためnull許容（export/import往復の担保） |
| `ownerMemberId` | `uuid \| null`（任意） | オーナー（**弱参照**。退職・削除後もリスクの記録を残すためFKを張らない） |
| `dueDate` | `YYYY-MM-DD \| null`（任意） | 対応期限（`DateOnlySchema`=暦検証）。アラートセンターの期限超過warning・接近infoの起点 |
| `note` | `string`（最大1000文字）`\| null`（任意） | |
| `createdAt` / `updatedAt` | `datetime` | Create派生型は日時を除外（DB既定値now()へ委譲） |

**重大度は保存せず都度導出**（`deriveRiskSeverity`、保存すると評価変更との不整合が生じる）:

| | 影響:高 | 影響:中 | 影響:低 |
|---|---|---|---|
| **確率:高** | critical | high | medium |
| **確率:中** | high | medium | low |
| **確率:低** | medium | low | low |

追記専用にはしない（評価の見直し・状態遷移が本質。変更履歴はpostgresモードの監査証跡が拾う）。
金額を持たないため`financials:read`のガード対象外＝partnerも閲覧可。R9判定（確率高×影響高の
openリスクでwarning）としてプロジェクトサマリー・ポートフォリオへ、対応期限アラートとして
アラートセンター・日次ダイジェスト・公開API `/v1/alerts` へ接続する。
派生型: `CreateRiskEntry`（id/日時を除外）、`UpdateRiskEntry`（idのみ必須、projectIdは受け付けない=案件の付け替え禁止）。

### EffortEntry（`effort.ts`）

WBS工数エントリ。プロジェクト×列ごとに1レコード。

| フィールド  | 型                        | 備考                      |
| ----------- | ------------------------- | ------------------------- |
| `id`        | `uuid`                    |                           |
| `projectId` | `uuid`                    |                           |
| `columnId`  | `string`                  | `effort-1` 〜 `effort-10` |
| `value`     | `number`（0以上）         | 上限なし                  |

### Schedule関連（`schedule.ts`）

#### PhaseDefinition（工程定義）

| フィールド  | 型                         | 備考                          |
| ----------- | -------------------------- | ----------------------------- |
| `phaseKey`  | `string`                   | `phase-1` 〜 `phase-15`（不変） |
| `name`      | `string`（1〜50文字）      | 表示名                        |
| `color`     | `string`                   | ガントバーの色（HEX）        |
| `enabled`   | `boolean`                  | 有効/無効                     |
| `sortOrder` | `number`（0以上の整数）    | D&D並び順                     |

#### PhaseSettings（工程設定コンテナー）

| フィールド     | 型                               | 備考                   |
| -------------- | -------------------------------- | ---------------------- |
| `phases`       | `PhaseDefinition[]`（最大15件）  |                        |
| `lastModified` | `datetime`                       |                        |

デフォルト: 15件生成、最初の5件（要件定義/基本設計/詳細設計/実装・単体テスト/結合テスト）が有効。色プリセット: 既存10色（DADS Blue〜Red）＋新規5色（Sky/Violet/Rose/Teal/Slate）

#### ScheduleEntry（スケジュールエントリ）

| フィールド  | 型       | 備考                              |
| ----------- | -------- | --------------------------------- |
| `id`        | `string` |                                   |
| `projectId` | `string` |                                   |
| `phaseKey`  | `string` |                                   |
| `startDate` | `string` | `YYYY-MM-DD`形式                  |
| `endDate`   | `string` | `YYYY-MM-DD`形式                  |

一意性制約: projectId × phaseKey

#### PhaseDependency（工程依存関係）

| フィールド       | 型                          | 備考                         |
| ---------------- | --------------------------- | ---------------------------- |
| `id`             | `string`                    |                              |
| `projectId`      | `string`                    |                              |
| `fromPhaseKey`   | `string`                    | 依存元の工程キー             |
| `toPhaseKey`     | `string`                    | 依存先の工程キー             |
| `dependencyType` | `FS \| SS \| FF \| SF`     |                              |

一意性制約: projectId × fromPhaseKey × toPhaseKey

#### PhaseSettingsEntry（案件×1レコード、17ストアのDataAdapter配線・第11弾）

`schedule-settings-store`が旧Zustand persist（独立localStorageキー`schedule-settings-storage`、
`settingsMap: Record<projectId, PhaseSettings>`形式）からDataAdapter経由の永続化へ移行した際に
新設したレコード型。`Database.scheduleSettingsEntries`（任意配列）に格納する。

| フィールド      | 型                               | 備考                   |
| --------------- | --------------------------------- | ---------------------- |
| `id`            | `uuid`                            |                        |
| `projectId`     | `uuid`                            | 対象案件               |
| `phases`        | `PhaseDefinition[]`（最大15件）   |                        |
| `lastModified`  | `datetime`                        |                        |

一意性: `projectId`（1案件1レコード）。派生型: `CreatePhaseSettingsEntry`（idを除外）。
`getSettings(projectId)`は該当レコードが無い場合`createDefaultPhaseSettings()`にフォールバックする
（読み取り時にレコードを新規作成しない、`ProjectProgressEntry`と同じ設計）。

### WbsSettings（`wbs-settings.ts`）

#### EffortColumn（工数列定義）

| フィールド        | 型                     | 備考                         |
| ----------------- | ---------------------- | ---------------------------- |
| `id`              | `string`               | `effort-1` 〜 `effort-10`    |
| `displayName`     | `string`（1〜50文字）  | 列表示名                     |
| `enabled`         | `boolean`              | 有効/無効                    |
| `order`           | `number`（0以上）      | 並び順                       |
| `backgroundColor` | `string`（任意）       | HEXカラー                    |
| `techTagIds`      | `uuid[]`（任意）       | 紐付けた技術タグIDリスト     |

#### WbsSettings（設定コンテナー）

| フィールド      | 型                                | 備考                              |
| --------------- | --------------------------------- | --------------------------------- |
| `effortColumns` | `EffortColumn[]`（最大10列）      |                                   |
| `levelColors`   | `Record<string, string>`（任意）  | レベル別背景色（0〜5）            |
| `lastModified`  | `datetime`                        |                                   |

デフォルト: 10列生成、最初の3列が有効。レベル別背景色6色プリセット。

#### WbsSettingsEntry（案件×1レコード、17ストアのDataAdapter配線・第11弾）

`wbs-settings-store`が旧Zustand persist（独立localStorageキー`wbs-settings-storage`、
`settingsMap: Record<projectId, WbsSettings>`形式）からDataAdapter経由の永続化へ移行した際に
新設したレコード型。`Database.wbsColumnSettingsEntries`（任意配列）に格納する。
`Database.wbsSettings`（全社単一設定、`WbsSettingsSchema.optional()`）とは別物で、実際には
`wbs-settings-store`から参照されていない既存の未使用フィールド（後方互換のため残置）。

| フィールド      | 型                                | 備考                              |
| --------------- | --------------------------------- | --------------------------------- |
| `id`            | `uuid`                            |                                   |
| `projectId`     | `uuid`                            | 対象案件                          |
| `effortColumns` | `EffortColumn[]`（最大10列）      |                                   |
| `levelColors`   | `Record<string, ThemeColor>`（任意）| レベル別背景色（0〜5）          |
| `lastModified`  | `datetime`                        |                                   |

一意性: `projectId`（1案件1レコード）。派生型: `CreateWbsSettingsEntry`（idを除外）。
`getSettings(projectId)`は該当レコードが無い場合`createDefaultWbsSettings()`にフォールバックする。

### WbsTemplate（`wbs-template.ts`）

WBS画面の「テンプレートを適用」機能でストック・選択・編集できるWBSテンプレート。`nodes`は`applyWbsTemplate`（`features/projects/utils/wbs-template.ts`）でそのままプロジェクト配下のタスクツリー（`Project`）へ変換される。

| フィールド  | 型                     | 備考                                        |
| ----------- | ---------------------- | ------------------------------------------- |
| `id`        | `uuid`                 |                                             |
| `name`      | `string`（1〜100文字） | テンプレート名                              |
| `nodes`     | `WbsTemplateNode[]`    | 工程・タスクの木構造（下記）。空配列可（新規作成直後） |
| `createdAt` | `datetime`             |                                             |
| `updatedAt` | `datetime`             |                                             |

派生型: `CreateWbsTemplate`（id/日時を除外）、`UpdateWbsTemplate`（idのみ必須、他は任意）

#### WbsTemplateNode（再帰構造）

| フィールド            | 型                     | 備考                                    |
| --------------------- | ---------------------- | --------------------------------------- |
| `name`                | `string`（1〜200文字） | 工程・タスク名                          |
| `completionCriteria`  | `string`（最大2000文字、任意） | 完了条件。`applyWbsTemplate`が`Project.completionCriteria`へそのまま転記する |
| `documentTemplateIds` | `uuid[]`（任意）       | このノードで作成するドキュメントのテンプレート（`DocumentTemplate`）への紐づけ。弱参照（削除済みidはUIが除外し、紐づけ保存時に自動掃除）。`applyWbsTemplate`でのProject変換では転記しない（Projectはドキュメント概念を持たない） |
| `children`            | `WbsTemplateNode[]`（任意） | 子タスク（再帰、`z.lazy`で定義）        |

`stores/wbs-template-store.ts`が初回ロード時（ストックが0件の場合のみ）、`shared/data/wbs-template-master.ts`の`STANDARD_WBS_TEMPLATE`（要求整理〜リリース判定の14工程・完了条件を軸にした標準WBSテンプレート）を1件シードする（`tech-tags-store`の`seedFromMaster`と同じパターン）。シード後は他のストックと同様に編集・削除できる（読み取り専用フラグ等は持たない）。`seedStandardTemplate`は「ストックが0件のときのみ」実行するため、`STANDARD_WBS_TEMPLATE`の定義を更新しても、既にシード済みの環境（localStorageに1件以上ストックがある状態）には自動反映されない（新規テンプレートとして再作成するか、手動で工程を追加する必要がある）。

編集画面（`WbsTemplatesPage` + `WbsTemplateTreeGrid`）はAG Gridでの行識別・展開状態管理・ドラッグ&ドロップの移動先判定に安定したノードIDが必要だが、`WbsTemplateNode`自体は永続化形式としてIDを持たない。そのため`features/projects/utils/wbs-template-editor-utils.ts`の`EditorNode`（編集専用の型、`id`とchildren常時配列を付与）へ`toEditorNodes`で変換してから編集し、保存時は`fromEditorNodes`でIDを除去して`WbsTemplateNode[]`へ戻す。`EditorNode`はDBスキーマ・`WbsTemplate.nodes`には一切登場しない、UI状態限定の型である。

`toEditorNodes`は呼び出すたびに全ノードへ新規`crypto.randomUUID()`を採番し直すため、`WbsTemplatesPage`では**テンプレート切替時（`selectedTemplate?.id`の変化）のみ**を`useEffect`のトリガーにして`editorNodes`（ローカルstate）を再構築する。ストアの`selectedTemplate`（オブジェクト参照。`updateWbsTemplate`のたびに新しい参照になる）を直接依存に使うと、グリッド操作のたびに全ノードのIDが再採番され、`WbsTemplateTreeGrid`内部の展開状態（`expanded`、IDで紐付けるSet）が毎回無効化されてアコーディオンが強制的に全て閉じる不具合になる（実際に発生した不具合、2026-08-13）。グリッドの`onChange`（追加・削除・編集・移動）はローカルstateを直接更新し、ストアへの反映はそれとは別に`updateWbsTemplate`で行う。

### DocumentTemplate（`document-template.ts`）

ドキュメントテンプレート。各工程で作成するドキュメント（要件定義書・基本設計書等）の
マークダウン雛形を全社共通のストックとして管理する。`WbsTemplateNode.documentTemplateIds`から
参照される。

| フィールド    | 型                              | 備考                              |
| ------------- | -------------------------------- | --------------------------------- |
| `id`          | `uuid`                           | プリセットは固定UUID（`d0c00000-0000-4000-8000-0000000000NN`連番。標準WBSテンプレートからの紐づけが切れないよう、シード時も`DataAdapter.create(..., { id })`でこのidを維持する） |
| `name`        | `string`（1〜200文字）           | 例: "要件定義書（業務要件）"      |
| `phase`       | `string \| null`（最大100文字）  | 対象工程の表示名（自由記述、グルーピング用）。null=工程横断 |
| `description` | `string \| null`（最大2000文字） |                                   |
| `content`     | `string`（最大100000文字）       | マークダウン本文（OKF v0.2準拠: YAML frontmatterで`type`必須＋`title`/`description`/`tags`推奨＋`status`/`sources`、本文はh2から開始）。空文字許容（新規作成直後）。スキーマ自体はマークダウン構文を検証しない（規約はプリセットと`createEmptyOkfContent`で担保） |
| `sourceRefs`  | `string[]`（任意、各最大500文字）| 出典（IPA資料名・URL等）          |
| `createdAt` / `updatedAt` | `datetime`           |                                   |

派生型: `CreateDocumentTemplate`（id/日時を除外）、`UpdateDocumentTemplate`（idのみ必須、他は任意）。
プリセット（33件）は`shared/data/document-template-master.ts`に定義し、IPA公開情報
（共通フレーム2013・非機能要求グレード2018・機能要件の合意形成ガイド・ユーザのための要件定義
ガイド第2版）を出典とする（調査: 非公開の設計文書）。
初回シードは`document-template-store`の`seedStandardDocumentTemplates`（`DataAdapter.list()`実確認＋
single-flightガード＋**create確定時のupsert反映**。upsertはStrictMode二重マウントの
「load#2の空配列set()がシードの楽観的stateを上書きする」競合への対策、
`docs/development-patterns.md` §10参照）。

### TechTagCategory（`tech-tag-category.ts`）

技術タグカテゴリ（大分類）。技術タグをグループ化する。

| フィールド  | 型                           | 備考                         |
| ----------- | ---------------------------- | ---------------------------- |
| `id`        | `uuid`                       |                              |
| `name`      | `string`（1〜100文字）       |                              |
| `sortOrder` | `number`（0以上の整数）      | 並び順                       |
| `createdAt` | `datetime`                   |                              |
| `updatedAt` | `datetime`                   |                              |

派生型: `CreateTechTagCategory`（id/日時を除外）、`UpdateTechTagCategory`（idのみ必須、他は任意）

### TechTagSubCategory（`tech-tag-category.ts`）

技術タグサブカテゴリ（中分類）。カテゴリに所属。

| フィールド  | 型                           | 備考                         |
| ----------- | ---------------------------- | ---------------------------- |
| `id`        | `uuid`                       |                              |
| `categoryId`| `uuid`                       | 所属カテゴリID               |
| `name`      | `string`（1〜100文字）       |                              |
| `sortOrder` | `number`（0以上の整数）      | 並び順                       |
| `createdAt` | `datetime`                   |                              |
| `updatedAt` | `datetime`                   |                              |

派生型: `CreateTechTagSubCategory`（id/日時を除外）、`UpdateTechTagSubCategory`（idのみ必須、他は任意）

### TechTag（`tech-tag.ts`）

技術タグ。カテゴリ/サブカテゴリに所属し、案件や担当者に紐付け可能。

| フィールド      | 型                           | 備考                              |
| --------------- | ---------------------------- | --------------------------------- |
| `id`            | `uuid`                       |                                   |
| `name`          | `string`（1〜50文字）        |                                   |
| `color`         | `string`                     | HEX形式（`#RRGGBB`）             |
| `categoryId`    | `uuid`                       | 所属カテゴリID（必須）            |
| `subCategoryId` | `uuid \| null`               | 所属サブカテゴリID（null = 直下） |
| `note`          | `string \| null`（最大200文字）| 補足・備考                       |
| `createdAt`     | `datetime`                   |                                   |
| `updatedAt`     | `datetime`                   |                                   |

マスタデータ: `src/features/tech-tags/utils/tech-tag-master.ts` にExcelベースの全17カテゴリ・199タグをプリセット定義。ストア初回ロード時にシード。

### 認証関連（`auth.ts`、postgresモード専用）

localStorageモードには存在しない、postgresモードのAPIサーバーとの認証通信で使う型。サーバー側の
Drizzleスキーマ（`server/src/db/schema.ts`のusers/refresh_tokens、SQL定義）とは別物で、こちらは
クライアント⇄APIサーバー間のレスポンス形状を表すZodスキーマ。DBスキーマの詳細は
非公開の設計文書・§12.5を参照。

| スキーマ | フィールド | 備考 |
| -------- | ---------- | ---- |
| `UserRoleSchema` | `'admin' \| 'manager' \| 'editor' \| 'viewer' \| 'partner'` | サーバー側`user_role` enumと一致させる。で5ロールへ拡張（`manager`=PM/部門長: 承認・全社設定可、`partner`=協力会社等: 閲覧のみ・金額マスク） |
| `PERMISSIONS` / `Permission` | `'users:manage' \| 'settings:manage' \| 'governance:approve' \| 'data:write' \| 'financials:read' \| 'data:read'` | 権限。画面・APIのガードはロール名比較ではなく原則この権限単位で行う |
| `ROLE_PERMISSIONS` / `hasPermission(role, permission)` | ロール→権限のマトリクス | 具体的な対応表は`docs/project.md`「ロール・権限設計」参照。サーバー側`rbac.ts`と同一定義（値を一致させる運用）。未知ロールはフェイルクローズ |
| `AuthProviderSchema` | `'local' \| 'azure_ad' \| 'google_workspace'` | フェーズ5でSSO対応時に`azure_ad`/`google_workspace`を実際に使用 |
| `AuthUserSchema` | `id`(uuid) / `email` / `name` / `role` / `authProvider`(任意) / `isActive`(任意) / `memberId`(uuid\|null、任意) / `createdAt`(任意) / `updatedAt`(任意) | ログインレスポンスの`user`は`authProvider`以降を含まない簡略形、`/api/users`一覧は全フィールドを含むため、これらを任意（optional）にして両方の形状を1つの型で表現している |
| `LoginResponseSchema` | `accessToken`(string) / `user`(AuthUserSchema) | `/api/auth/login`・`/api/auth/refresh`の共通レスポンス形 |

`roleSatisfies(userRole, required)`（`shared/types/auth.ts`）: ロール階層判定
（admin ⊇ manager ⊇ editor ⊇ viewer ⊇ partner、線形）。`RequireAuth`コンポーネントの
`requiredRole`判定、サーバー側`server/src/auth/rbac.ts`の`ROLE_HIERARCHY`と同一のセマンティクス
（クライアント/サーバーで別々に定義、値は一致させる運用）。`RequireAuth`は`requiredPermission`
（権限単位のガード、新規コードはこちらを推奨）も受け付ける。金額情報の表示可否は
`useCanViewFinancials()`（`shared/hooks/use-financial-visibility.ts`）で判定する
（postgresモード=`financials:read`権限、localモード=`app-store.showFinancials`トグル）。

### Snapshot（`snapshot.ts`）

データのスナップショット履歴管理。

#### SnapshotTag

`string`（1〜50文字）。使用可能文字: 半角英数字、ドット、ハイフン、アンダースコアのみ。

#### SnapshotMeta（メタデータ）

| フィールド   | 型                  | 備考                          |
| ------------ | ------------------- | ----------------------------- |
| `id`         | `uuid`              |                               |
| `tag`        | `SnapshotTag`       | 一意（重複不可）              |
| `version`    | `string`            | 保存時のアプリバージョン      |
| `createdAt`  | `datetime`          |                               |
| `fiscalYear` | `number`            | 保存時の年度                  |
| `dataSize`   | `number`（0以上）   | データサイズ（バイト）        |

#### SnapshotEntry

`SnapshotMeta` + `Database`（データ本体）の組み合わせ。

#### SnapshotHistory

`SnapshotEntry[]` の配列。最大20件。超過時は古いものから削除。QuotaExceededError対応あり。

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

## 重要なバリデーションルール

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

## Drizzle ORM スキーマ（`server/src/db/schema.ts`）

### スキーマ設計原則

- **クライアント Zod との 1:1 対応**: `src/shared/types/` の Zodスキーマとサーバー側の Drizzle pgTable がエンティティごとに対応。
  `DataAdapter.loadDatabase()` / `PostgresApiAdapter.create()` / `.update()` など全ルートで Zod バリデーションを通し、クライアント側の契約を継承。
- **32業務エンティティ**: projects, members, divisions, sections, companies, assignments, efforts, scheduleEntries, phaseDependencies,
  techTags, techTagCategories, techTagSubCategories, divisionBudgets, budgetAdjustments, budgetBreakdowns,
  aiUsageEntries, aiUsageMemberAllocations, aiUsageProviders, saasContracts, personnelPlans, skillEvaluations,
  skillRoadmapGoals, projectProgressEntries, wbsTemplates, scheduleSettingsEntries, wbsColumnSettingsEntries,
  documentTemplates, monthlyActualsConfirmations, actualsImportLogs, monthlyCloseEvents, taskSyncLogs,
  csvMappingProfiles、estimateSnapshots（`project_id`×`version`にunique制約、
  `change_request_id`はFKを張らない弱参照、`stage`/`method`はpgEnum）
  （scheduleSettingsEntries/wbsColumnSettingsEntriesは17ストアのDataAdapter配線・第11弾で追加。案件×1レコード、`project_id`にunique制約＋cascade delete。
  documentTemplatesは、monthlyActualsConfirmations（`month`にunique制約、confirmedAt/importedAtはISO文字列を無変換往復するtext列）/actualsImportLogs（追記専用）はP1-a）
- **認証系**: users, refreshTokens, ssoProviderConfigs（SSO接続情報の保存先。実際のOIDC認可コードフローは未実装）
- **公開API系（サーバー専用）**: apiKeys（公開API v1のAPIキー。SHA-256ハッシュのみ保存・平文は発行時に一度だけ返す・enabledで即時失効）。usersと同じくクライアントEntityMap非登録
- **users.memberId**: 業務データ上の担当者との紐づけ（`/my-tasks`の接続点）。
  **FK制約を張らない弱参照**。`ON DELETE SET NULL`で張ると`database/import`の
  `TRUNCATE members CASCADE`がusersごと巻き込んで全削除するため（PostgreSQLの仕様）。
  存在しないmemberIdはUI側が未紐づけとして扱う
- **監査系（サーバー専用）**: auditLogs（業務データの変更履歴。追記専用で、
  `crud-factory`が業務操作と同一トランザクションで記録する）。
  entity/entityId/action(create|update|delete)/actorId/actorEmail/changes(jsonb)/occurredAt。
  **entityIdにもactorIdにもFK制約を張らない**（対象レコードやユーザーが削除された後も
  証跡として残す必要があり、`ON DELETE CASCADE`で消えては監査にならないため）。
  索引は occurred_at（一覧の新しい順）と entity+entity_id（レコード指定の絞り込み）。
  usersと同じくクライアントEntityMap非登録＝localモードには存在しない
- **通知系（サーバー専用）**: notificationChannels（チャットツール通知チャンネル。webhookUrl/apiTokenはAES-256-GCM暗号化列で保存し、APIレスポンスには設定済みフラグのみ返す）, notificationLogs（送信ログ、追記・チャンネルFKカスケード削除。日次ダイジェストの同日再送防止を兼ねる）。usersと同じくクライアントEntityMap非登録＝localモードには存在しない。管理は専用ルート`/api/notificationChannels`（users:manage限定）
- **外部ツール連携系（サーバー専用）**: externalToolConnections（API起票の接続。tool=backlog/asana/jira/github、baseUrl（Backlog=スペースURL／Jira=サイトURL、Asana・GitHubはnull）、authEmail（Jiraのみ）、apiTokenEncrypted（AES-256-GCM暗号化列。APIレスポンスには設定済みフラグのみ返す）、targetConfig（jsonb。ツール別の起票先をZod discriminated unionで検証）、enabled（起票先が決まって初めてtrue））。notificationChannelsと同じくクライアントEntityMap非登録＝localモードには存在しない。管理は専用ルート`/api/externalToolConnections`（users:manage限定）、起票実行は`/api/taskCreation/execute`（data:write）
- **グローバル設定**: appSettings（単一行テーブル、fiscalYear/estimatedUnitPrice/defaultCoefficient/projectCoefficients/exchangeRateHistory/wbsSettings/metadata 保持）

### 重要な設計判断

#### 1. `DivisionBudget.initialAmount` — クライアント算出値をそのまま永続化

`initialAmount` はサーバー側で再計算**しない**。クライアント側の `budget-store.ts` の `calcAutoInitialAmount()` が
`BudgetBreakdown` + `AiUsageEntry` + `SaasContract` から算出した値をそのまま `PATCH /api/divisionBudgets/:id` で送信し、
Drizzle に INSERT/UPDATE させる。計算ロジックを1箇所（クライアント）に保つため。

#### 2. `BudgetBreakdown.actualRecords` — jsonb 埋め込み（子テーブル正規化せず）

`actualRecords: BudgetBreakdownActualRecord[]` をクライアント側 Zod で配列フィールドとして定義しており、
サーバー Drizzle でも `actualRecords: jsonb('actual_records')` で埋め込むため、別テーブルに正規化しない。
Zod スキーマのエンティティマップ（`infrastructure/adapters/entity-registry.ts`）に独立エンティティとして登録していない。

#### 3. AI 利用費複合ユニーク制約 — `NULLS NOT DISTINCT`

```sql
ai_usage_entries: UNIQUE (division_id, fiscal_year, month, section_id, provider_id) NULLS NOT DISTINCT
ai_usage_member_allocations: UNIQUE (division_id, fiscal_year, month, member_id, provider_id) NULLS NOT DISTINCT
```

PostgreSQL 15+ の `NULLS NOT DISTINCT` で、`section_id=null` / `provider_id=null` を「部門全体」「プロバイダ未分類」として区別し、
同一組み合わせの重複を防ぐ。従来の `UNIQUE` では null 同士は常に異なるため使えない。

### 既知の制限事項

**17個のZustandストア全てが`DataAdapter`経由へ移行完了**（2026-08-14、`docs/project.md`「17ストアの
DataAdapter配線」参照）。全ストアが`getDataAdapter()`経由でPostgreSQLモード時も実際にAPIサーバーへ
到達する。

**✅ appSettingsの既知ギャップは解消済み（P0-b）**: 全社共通の単一設定値
（`estimatedUnitPrice`/`defaultCoefficient`/`projectCoefficients`/`exchangeRateHistory`＋
P0-aで追加した業務定数3種）は、`DataAdapter.loadAppSettings()/updateAppSettings()`（専用メソッド、
EntityMap非対象のまま）と`GET/PATCH /api/appSettings`（`server/src/routes/app-settings.ts`）で
postgresモードでも読み書きされる。PATCHは**指定キーのみ**のフィールド単位パッチ（全体上書きだと
「未ロードのまま保存すると他フィールドが消える」既知の事故パターンを再現するため）で、
`settings:manage`権限（admin/manager）が必要。GETは認証のみだが、金額系フィールド
（概算単価・係数・案件別係数・為替レート）は`financials:read`を持たないロール（partner）には
キー自体を返さない。旧`persistSettingsFields`（jsonStorage全体上書き）は廃止され、
「Layoutマウント時に`loadBudgetData()`必須」という事故前提そのものが解消された。
