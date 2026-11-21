# API サーバー（`server/`）のディレクトリ構成

> [`docs/architecture.md`](../../architecture.md) から分割した詳細リファレンス。常時ロードされないため、必要なときにこのファイルを直接Readする。

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
│   │   │                         filterRows(rows, user)で一覧の行レベル閲覧制御（ユーザー不明は空配列＝フェイルクローズ）。
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
│   │       ├── org-design.ts   # orgDesignDrafts（data:read/write）, memberPreferences（書き込み=people:sensitive-read＋data:write、
│   │       │                     一覧はfilterRowsで権限保持者=全件・他=本人分のみ。filterPreferencesForViewerを単体テスト）
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
