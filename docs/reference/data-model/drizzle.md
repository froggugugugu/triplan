# Drizzle ORM スキーマ（`server/src/db/schema.ts`）

> [`docs/data-model.md`](../../data-model.md) から分割した詳細リファレンス。常時ロードされないため、必要なときにこのファイルを直接Readする。

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
