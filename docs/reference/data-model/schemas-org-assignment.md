# スキーマ詳細: 案件・組織・担当者・スキル・アサイン・リスク・工数

> [`docs/data-model.md`](../../data-model.md) から分割した詳細リファレンス。常時ロードされないため、必要なときにこのファイルを直接Readする。

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

### OrgDesignDraft / OrgDesignTeam（`org-design.ts`）

組織設計の試算（/org-design）の案。作成時点の課構成を複製したスナップショットで、**本番の課・担当者の所属は書き換えない**。
兼務・稼働率・コスト・希望の充足は保存せず`shared/utils/org-design-utils.ts`で都度導出する。設計は`output/design/org-design-simulator.md`。

| フィールド | 型 | 備考 |
| ---------- | -- | ---- |
| `id` / `name`（1〜100、trim） / `fiscalYear` | | 案名・指標の集計年度 |
| `teams[]` | `OrgDesignTeam` | `id`（案内で採番）・`sourceSectionId`（複製元の課、新設はnull）・`divisionId`・`name`・`sortOrder`・`productIds`（受け持ちルート案件）・`techTagIds`（扱う技術） |
| `placements` | `Record<memberId, teamId \| null>` | null・キーなし・存在しないチームIDはいずれも「未配置」 |
| `createdAt` / `updatedAt` | `datetime` | |

本番で削除された担当者が`placements`に残っても指標から除き`missingMemberIds`として返す。

### MemberPreference（`member-preference.ts`）

担当者の希望（1on1で本人の了解を得たものだけ）。1担当者1レコード、更新・削除可（了解の取り下げで削除）。

| フィールド | 型 | 備考 |
| ---------- | -- | ---- |
| `memberId` | `uuid` | 更新で付け替え不可 |
| `desiredProductIds` / `desiredTechTagIds` | `uuid[]`（各最大10） | やりたいプロダクト（ルート案件）・伸ばしたいスキル（技術タグ） |
| `consentedAt` | `DateOnly`（必須） | 本人の了解を取った日 |

**自由記述欄は持たない**（`z.strictObject`で未知キーを拒否）。1on1の会話内容を入れないための仕様。閲覧は`people:sensitive-read`保持者と本人のみ。

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
