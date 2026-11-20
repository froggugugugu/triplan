# データ永続化（デュアルバックエンド・DataAdapter配線・規模の制約）

> [`docs/project.md`](../../project.md) から分割した詳細リファレンス。常時ロードされないため、必要なときにこのファイルを直接Readする。

## データ永続化のデュアルバックエンド化（進行中）

`VITE_STORAGE_MODE`環境変数（デプロイ時固定、`local`｜`postgres`、既定は`local`）で永続化方式を切り替える設計を
進めている。詳細設計は非公開の設計文書、実装記録は
を参照。の全6フェーズ（サーバー基盤・認証・
クライアント認証UI・ロール権限管理画面・SSO設定・全26業務エンティティのCRUD API）・17ストア全ての
DataAdapter配線（下記「17ストアのDataAdapter配線」参照）は完了済み。

- `src/infrastructure/adapters/`: `DataAdapter`抽象化（`LocalJsonAdapter`・`PostgresApiAdapter`）
- `src/features/auth/`: ログイン画面・ルートガード（`RequireAuth`、localモードでは常にパススルー）
- `src/features/admin/`: 管理画面（`/admin/*`。AdminLayout＋全社設定・データ管理・マスタ・admin限定機能）
- `server/`: 独立したpackage.json/tsconfig.jsonを持つAPIサーバー（Fastify + Drizzle ORM + PostgreSQL）。
  npm workspaces化はしない。認証（ID/PASS、JWT）・RBAC（5ロール＋権限マトリクス、[features-auth-governance.md](features-auth-governance.md)「ロール・権限設計」参照）・全業務エンティティの
  CRUDルート・移行CLI・Testcontainers統合テストを実装済み
- localStorageモードは常にサーバー不要・認証なしの単一ユーザー動作を維持する（既存の基本機能を変えない、
  という明示的な制約）

### 17ストアのDataAdapter配線（完了）

サーバーAPI・`PostgresApiAdapter`は完成しているが、17個のZustandストアは`jsonStorage.load()/.save()`
直呼び出しから`getDataAdapter()`経由へ順次書き換えている（postgresモードで実際にAPIサーバーへ到達させるため）。
方式は**楽観的更新**（非公開の設計文書/§7.2）: アクション呼び出し時点で
クライアント生成idでローカルstateへ即時反映し、裏で`DataAdapter.create()/update()/remove()`を発火する
（`create()`の`options.id`にこのidを渡すため、確定後もidは変わらない＝安定id、2026-08-14解決）。
失敗時は直前スナップショットへロールバックして`toast`（`shared/hooks/use-toast`、variant: 'destructive'）で通知する。

- **完了**（15/15、全ストア移行完了）: `companies-store`（第1弾）・`project-progress-store`（第2弾、upsert）・
  `efforts-store`（第3弾、upsert＋一括削除）・`wbs-template-store`（第4弾）・`skill-store`（第5弾）・
  `members-store`（第6弾）・`team-store`（第7弾）・`schedule-store`（第8弾）・`personnel-plan-store`
  （第9弾）・`tech-tags-store`（第10弾、3エンティティ・`seedFromMaster`の199タグ一括登録）・
  `schedule-settings-store`/`wbs-settings-store`（第11弾、`EntityMap`に`scheduleSettingsEntries`/
  `wbsColumnSettingsEntries`（案件×1レコード＝`PhaseSettingsEntry`/`WbsSettingsEntry`）を新規追加し
  従来の「単一設定オブジェクト・EntityMap非登録」という制約自体を解消。旧Zustand persistの独立
  localStorageキー（`schedule-settings-storage`/`wbs-settings-storage`）からの1回限りレガシー移行を
  `loadScheduleSettings()`/`loadWbsSettings()`に内蔵し、既存ユーザーの設定データを失わず移行する）。
  第4・9・10・11弾でシード/移行系アクション（マウント時に0件なら生成・移行）のStrictMode/リロード時の
  重複バグを発見・修正した。判断基準・対策は`docs/development-patterns.md`§10「マウント時に0件なら
  シードするパターン」のエントリに集約済み（要旨: シードのトリガーが実ユーザー操作を挟まず即座に
  発火する場合は`DataAdapter.list()`での実データ確認を`create()`の前段に必ず置く。第11弾ではさらに
  「load自体とmigrateが同一アクションに同居する場合、migrateフラグのみのガードでは不十分で、
  load呼び出し全体をsingle-flight化する必要がある」という新知見を追加）。
  第12弾（`assignment-store`）は既存の複合キー（projectId×taskId×memberId）でのupsertパターンを
  そのままDataAdapter経由へ移行するのみで新規バグは無かった。1.0人月上限バリデーションは引き続き
  クライアント側（`AssignmentTreeGrid.tsx`の入力時ブロック）＋サーバー側（`assignments.ts`の
  `beforeCreate`/`beforeUpdate`）の二重防御のまま変更なし。
  第13弾（`projects-store`）は`addProject()`が戻り値`Project`を同期的に返す契約（`applyWbsTemplate`の
  parentId連鎖・コード自動採番が依存）を維持しつつDataAdapter化。**⚠️実Postgresで新規バグを発見・修正**:
  自己参照FK（`projects.parent_id`、`ON DELETE CASCADE`）を持つエンティティを`deleteProject`のように
  「親+子孫をPromise.allで一括remove()」する実装だと、親の削除がサーバー側で先に処理された場合、
  DBのカスケードで既に消えている子孫への個別remove()リクエストが404を返し、`Promise.all`全体が
  reject→削除全体がロールバックされる（実際には成功しているのにUI上は失敗して見える）。対策として
  `remove()`呼び出しを個別に`.catch()`し、`ApiError`のstatusが404の場合はエラー扱いしない（「対象が
  既に存在しない」は削除の目的を満たしている）よう修正。**同型のバグが`team-store`の`deleteDivision`
  （`sections.division_id`も`ON DELETE CASCADE`）にも既に存在していたため、既存コードも合わせて修正**。
  `bulkUpdate()`（DataAdapter標準インターフェース、これまで未使用だった）を`updateProjectsBatch`で初採用。
  第14弾（`budget-store`、最大・1455行・7エンティティ: divisionBudgets/budgetAdjustments/
  budgetBreakdowns/aiUsageEntries/aiUsageMemberAllocations/aiUsageProviders/saasContracts）で
  17ストア全ての配線が完了した。`estimatedUnitPrice`/`defaultCoefficient`/`projectCoefficients`/
  `exchangeRateHistory`の4フィールドは`entity-registry.ts`の設計判断どおりEntityMap対象外
  （単一設定値、`wbsSettings`と同じ整理）のため、引き続き`jsonStorage`経由（postgresモード未対応の
  既知の制約として明示的に残置）。多くのアクションが「エンティティ本体のCRUD」＋「連動する
  `DivisionBudget.initialAmount`の自動再計算」という二段構成のため、`persistChangedDivisionBudgets`
  （変更されたレコードのみを参照同一性で差分抽出し`bulkUpdate()`する共通ヘルパー）を新設。
  `deleteAiUsageProvider`（`aiUsageEntries.providerId`が`ON DELETE CASCADE`）にも第13弾で発見した
  404競合パターンが存在したため同じ`tolerate404`ヘルパーで対応。既存の`budget-store.test.ts`
  （3201行・147件）は元々`jsonStorage`を静的モック（`load()`が常に固定値を返す）していたが、
  `LocalJsonAdapter`のupdate/removeは「都度`load()`し直してid検索する」実装のため、同一テスト内の
  create→update連鎖で「対象が見つからない」まま常に失敗する問題を発見。モックを
  `jsonStorage.save()`の内容を次の`load()`が返すステートフルな実装へ変更し解消（`vi.hoisted()`で
  保持）。実Postgresで`bulkUpdate`（`PATCH /divisionBudgets/batch`）・
  `deleteAiUsageProvider`の404耐性を個別に反証済み。
  各ストアの実装詳細は〜`32.md`を参照

**✅ ID安定性の設計課題は解決済み（2026-08-14）**: `companies-store`実装時に発覚した
「`DataAdapter.create()`が呼び出し元のidを指定できず、常にアダプタ側が新規idを確定するため、戻り値idを
同期的に次のレコード作成へ連鎖利用する呼び出し元（`applyWbsTemplate`の`addProject()`→`parentId`連鎖、
`team-store`の`addDivision`→`addSection`連鎖等）では楽観的更新の仮id→確定id差し替えパターンが使えない」
という制約は、`DataAdapter.create(entity, data, options?: { id?: string })`にクライアント生成idを
受け渡せる第3引数を追加することで解消した。

- クライアント: `src/infrastructure/adapters/data-adapter.ts`（インターフェース定義）・
  `local-json-adapter.ts`（`options?.id ?? crypto.randomUUID()`）・`postgres-api-adapter.ts`
  （POSTボディへ`id`を含める）
- サーバー: `server/src/routes/crud-factory.ts`のPOSTハンドラが、リクエストボディの`id`を
  `createSchema`とは独立にプラック・UUID形式検証し（不正な形式は400）、`beforeCreate`フック適用後の
  `values`へ`id`として合流させてINSERTする（`createSchema`自体は各エンティティのCreate*Schemaのまま
  無改修＝id列を含まないため`.safeParse()`は`id`キーを自動的にstripする。24エンティティ全ルートに
  一括で波及するのはこの1ファイルの変更のみで済んだ）。重複id挿入は既存のunique制約違反ハンドリング
  （23505→409）でそのままカバーされる
- 呼び出し元は、楽観的更新用に生成した仮idを`create()`の第3引数へそのまま渡せば、確定後もidが
  変わらなくなる（`companies-store.ts`の`addCompany`が実装例）。戻り値idの連鎖利用も安全に行える
- 実Postgres（Testcontainers）で反証済み: `server/src/__tests__/integration/full-stack.integration.test.ts`
  に「クライアント指定idで作成される」「id省略時は従来どおり自動採番される（後方互換）」「不正形式は
  400」「重複idは409」の4ケースを追加、全パス
- `DataAdapter`契約テスト（`src/infrastructure/adapters/__tests__/adapter-contract.ts`）にも
  同等のケースを追加済み（`LocalJsonAdapter`・`PostgresApiAdapter`双方で自動検証される）

これにより、残り13ストア（`projects-store`・`team-store`・`tech-tags-store`等、親子関係を同一呼び出し内で
連鎖生成するストアを含む）は、この制約を気にせず着手できる。

## 規模の制約

localStorageモードは全業務データを単一キー（`resource-manager-data`）へJSONで持つため、
ブラウザの容量上限（一般に5MB前後）が実用規模の上限になる。実測値:

| 規模 | projects | assignments | JSONサイズ | 上限5MBに対して |
| ---- | -------: | ----------: | ---------: | --------------- |
| 5案件×50タスク | 280 | 250 | 0.25MB | 5% |
| 20案件×100タスク | 2,120 | 2,000 | 1.93MB | 39% |
| 50案件×200タスク | 10,300 | 10,000 | 9.60MB | **192%（保存不可）** |

**localモードの実用限界は概ね20〜30案件（3,000〜5,000タスク）**。超えると
`localStorage.setItem`がQuotaExceededErrorを投げ、楽観的更新はロールバックされる
（データは壊れないが保存されない）。この場合は専用の案内トーストを出す
（`isStorageQuotaError`、`stores/persistence-error.ts`）ので、
不要スナップショットの削除・JSONエクスポートでの退避・postgresモードへの移行を促す。

集計の計算量は同じ計測で線形性を確認済み（10,300件でガント1画面の工程進捗18.9ms、
自分の担当2.8ms、横断検索1打鍵1.8ms）。

**postgresモードには容量制約は無い**。`crud-factory`のGETは全件返す設計
（クライアントが全件をstateに保持して横断検索・ツリー構築を行うため）なので応答サイズは
件数に比例するが、`@fastify/compress`で圧縮している。UUIDと繰り返しキーの多いJSONは
圧縮がよく効き、実測で**50案件×200タスクのprojects一覧が6.28MB→0.32MB（5.1%）**。
ページネーションは全件保持を前提とした既存設計を壊すため採らない。
