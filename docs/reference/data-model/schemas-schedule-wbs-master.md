# スキーマ詳細: スケジュール・WBS設定・テンプレート・技術タグ・認証・スナップショット

> [`docs/data-model.md`](../../data-model.md) から分割した詳細リファレンス。常時ロードされないため、必要なときにこのファイルを直接Readする。

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
