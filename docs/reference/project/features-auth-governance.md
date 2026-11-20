# 機能リファレンス: 認証・権限・監査・全社設定

> [`docs/project.md`](../../project.md) から分割した詳細リファレンス。常時ロードされないため、必要なときにこのファイルを直接Readする。

### ロール・権限設計

postgresモードのロールを5段階の線形階層 `admin ⊇ manager ⊇ editor ⊇ viewer ⊇ partner` へ
拡張し、判定は権限マトリクス（`hasPermission`）で行う。定義はクライアント
`src/shared/types/auth.ts`とサーバー`server/src/auth/rbac.ts`で同一（値を一致させる運用）。

| 権限 | admin | manager | editor | viewer | partner |
| ---- | ----- | ------- | ------ | ------ | ------- |
| `users:manage`（ユーザー管理・SSO設定） | ✓ | - | - | - | - |
| `settings:manage`（全社設定） | ✓ | ✓ | - | - | - |
| `governance:approve`（CR承認・凍結・月次締め） | ✓ | ✓ | - | - | - |
| `data:write`（業務データ編集） | ✓ | ✓ | ✓ | - | - |
| `financials:read`（金額情報の閲覧） | ✓ | ✓ | ✓ | ✓ | - |
| `data:read`（業務データ閲覧） | ✓ | ✓ | ✓ | ✓ | ✓ |

- `partner`=協力会社等の外部関係者（閲覧のみ・金額マスク）、`manager`=PM/部門長
- ガバナンス原則: 最小権限・職務分掌（editorは承認不可）・管理者権限の分離（users:manageはadminのみ）
- DB enum（`user_role`）へは`manager`/`partner`を末尾追加（`ALTER TYPE ... ADD VALUE`、
  マイグレーション0009。既存3ロール値は不変＝後方互換）

### 金額情報の表示制御（要求#2）

`financials:read`権限に基づき金額情報（予算・単価・受注額・EVM金額等）の表示を制御する。

- **判定**: `useCanViewFinancials()`（`shared/hooks/use-financial-visibility.ts`）。
  postgresモード=ロールの`financials:read`（未ログインはフェイルクローズ）、
  localモード=`app-store.showFinancials`トグル（システム設定の「金額の表示」。認証が無いため
  画面共有・協力会社同席時の利便機能【仮定】）
- **適用面**: ①`/budget`・`/statements`は`FinancialAccessGuard`でページ単位ブロック
  ②サイドバーの金額系メニュー非表示 ③`/reports`のCSV金額帳票セクション非表示
  ④ダッシュボードのEVMパネル・売上予算比較チャート非表示＋予算超過アラート除外
  ⑤チーム画面の単価履歴・契約単価履歴セクション非表示
- **サーバー側（多層防御、認可の実体）**: 金額専用エンティティ（divisionBudgets・
  budgetBreakdowns・budgetAdjustments・aiUsage系・saasContracts・personnelPlans・
  projectBaselines・changeRequests・billingMilestones）のGETは`financials:read`必須（403）。
  混在エンティティはフィールド単位でマスク（members→単価履歴/契約単価履歴を空配列、
  projects→contractAmountをnull。`crud-factory.ts`の`readGuard`/`redactRow`）
- **既知の残ギャップ**: プロジェクト一覧から開くEVM/商流/What-ifダイアログ内の金額表示は
  クライアント側マスク未適用（postgresモードではサーバー側マスクにより実データは取得不能。
  localモードのトグルはページ単位ガードが主）。段階適用の方針は設計文書§4.3参照

### 業務定数の設定化とappSettings API（P0）

のP0として、ハードコードだった業務定数を全社設定へ昇格した（既定値=従来の固定値、
決定論は「設定値の明示」で維持）。編集はシステム設定ポップオーバー（`Layout.tsx`。
postgresモードでは`settings:manage`権限=admin/managerのみ表示、localモードは常時）。

| 設定 | 既定値 | 影響範囲 |
| ---- | ------ | -------- |
| 人月換算（人日/人月）`workdaysPerMonth` | 20 | WBS概算予算（案件タブ・部門予算俯瞰・EVMのBAC・CSV帳票・What-if・人員計画比較） |
| スキルレビュー周期（月）`skillReviewCycleMonths` | 3 | ダッシュボードの未実施件数・スキルパネルの要見直し判定・アラートセンター |
| ベースライン乖離閾値 `baselineStaleThreshold` | 0.1（±10%） | WBS画面の再凍結警告・アラートセンターのベースライン乖離 |
| 予算先行の警告閾値 `summaryBudgetProgressGapThreshold` | 0.15（15pt） | プロジェクトサマリーのR4判定（予算消化率−進捗率） |
| SPI警告閾値 `summarySpiWarningThreshold` | 0.9 | プロジェクトサマリーのR5判定（これ未満で警告） |
| 人時/FP `hoursPerFunctionPoint` | 10【仮定】 | 見積画面の簡易FP換算（FP×人時/FP÷時間/日=人日）。完了案件の実績 人時/FP の中央値（校正ヒント）で自社値へ寄せる前提 |

永続化は`DataAdapter.loadAppSettings()/updateAppSettings()`（フィールド単位パッチ）経由で、
postgresモードは`/api/appSettings`（PATCH=settings:manage、GET=金額系フィールドはpartnerへ
キーごと非返却）に到達する。これにより概算単価・係数・為替レートの「postgresモード未反映」
という既知ギャップも解消（`docs/data-model.md`「既知の制限事項」参照）。
通貨単位ラベルは「万円」表記のまま**仕様として確定**（2026-08-18、:
**i18nはスコープ外をユーザーが正式決定**。本ツールは日本語・日本のSI商習慣特化であり、
多言語化・多通貨化は行わない。旧方針「i18n基盤導入（P2-a）と同時に辞書化」は廃止）。

### アカウントメニューとログアウト（postgresモード専用）

サイドバー下部にログイン中のユーザー（表示名・メール・ロール）を出し、そこから
ログアウトできるようにした。**それまでログアウトの導線が一切無く**、別ロールで
入り直す・共有端末で離席するといった当たり前の操作ができなかった。
`logout()`（リフレッシュトークンの失効＋メモリ上のアクセストークン破棄）のあと
`/login`へ`replace`遷移する。localモードは認証が無いためメニュー自体を出さない。

### 個人向け導線（postgresモード専用）

全画面が組織・案件の視点で作られており、担当者個人が「自分は何をいつまでにやるのか」を
見る場所が無かった（partner・viewerには特に使い道が無い状態だった）。

- **紐づけ**: `users.memberId`（`/admin/users`のセレクタで設定。undefined=変更なし／
  null=解除／uuid=紐づけ の3値PATCH）。ログインレスポンスにも含めるため認証直後から引ける
- **⚠️ FK制約を張らない（弱参照）**: 当初`ON DELETE SET NULL`で張ったところ、
  `database/import`の`TRUNCATE members CASCADE`が**参照元のusersごと巻き込んで全削除**した
  （PostgreSQLのTRUNCATE CASCADEは参照している側のテーブルもTRUNCATEする）。
  「JSONインポートで全ユーザーが消えてログインできない」は担当者紐づけの自動解除より
  遥かに危険なため、参照整合性はアプリ側で担保する（存在しないmemberIdは未紐づけ扱い）。
  回帰テストを`full-stack.integration.test.ts`のexport/import往復へ追加済み
- **画面**: `/my-tasks`。集計は`shared/utils/my-task-utils.ts`の純関数（金額を扱わない）

### 汎用監査証跡（postgresモード専用）

2026-08-22、「誰がいつ何を変えたか分からない」状態を解消するため、業務データの
変更履歴を全エンティティで自動記録するようにした（月次締めで数字を確定させる製品が
変更を追跡できないのは整合しない、というの指摘への対応）。

- **記録**: `crud-factory`のPOST/PATCH/DELETE/batchが**業務操作と同一トランザクションで**
  `auditLogs`へ追記する。通知（fire-and-forget）と違い、監査は記録漏れを許容すると
  証跡として使えないため、業務INSERTだけ成功して監査が落ちる状態を作らない。
  batchは対象行を`inArray`で1回にまとめて読む（完了同期は数百件を1リクエストで送るため、
  1件ずつSELECTすると往復がN倍になる）
- **対象範囲**: `crud-factory`配下の全業務エンティティに加え、**ユーザー管理
  （`POST/PATCH /api/users`）**を記録する（ロール変更＝権限昇格は監査上もっとも重要な操作。
  パスワードは平文もハッシュも証跡に載せない）。`appSettings`・`apiKeys`・
  `notificationChannels`・`externalToolConnections`は**現時点では対象外**
  （いずれも`users:manage`または`settings:manage`が必要な管理者専用操作で、
  業務数値そのものを動かさないため。必要になれば同じ`recordAudit`を足す）
- **記録内容**: create=差分なし（作成値は現レコードで分かる）／update=実際に値が
  変わったフィールドの`{before, after}`（`updatedAt`のような毎回変わる値は除外し、
  値が変わらない更新はログ自体を作らない）／delete=削除直前の行全体
- **FK制約を張らない**のが要点: 対象レコードも操作者（users）も、削除・退職後に
  証跡が消えては監査にならない。参照整合性より「消えないこと」を優先する。
  操作者は`actorId`と`actorEmail`の両方を残し、usersが消えても誰の操作か辿れる
- **参照**: `GET /api/auditLogs`（`users:manage`＝admin限定。差分に金額が入りうるため
  managerにも開かない）。エンティティ・レコードID・操作種別で絞り込み、既定100件・
  最大500件。**書き込み経路を持たない**（改ざん・抹消をAPIとして提供しない）
- **保持管理（パージ）**: 監査ログは単調増加するため、`/admin/audit-logs`の「保持管理」から
  古いものを一括削除できる（`DELETE /api/auditLogs?days=365|180|90`、`users:manage`）。
  **保持日数の許可リストでしか消せない**（任意の基準日時もid指定の個別削除も受け付けない）
  ＝「都合の悪い記録だけを抜く」「直近以外を全部消す」経路を作らないための制約。
  基準日時は**サーバー時計**で算出する（端末の時計ずれ・細工で想定外の範囲を消さない）。
  削除と**パージ自体の記録は同一トランザクション**（消したのに記録が残らない状態を作らない）。
  保持状況（総件数・最古の記録日時）は`GET /api/auditLogs/stats`で取得し、実行前に提示する
- **localモード**: 対象外（認証が無くactorを特定できない単一ユーザー前提のため）

### 楽観ロック（postgresモード専用）

複数人が同じレコードを編集したとき、後から保存した側が黙って上書きする
（last-write-wins）状態を解消した。月次締めで数字を確定させる製品として、
「いつの間にか他人の変更が消えている」ことが起きない前提を作る。

- **仕組み**: クライアントが「画面で見ていたレコードのupdatedAt」を
  `X-Expected-Updated-At`ヘッダーで申告し、サーバーは**UPDATEのWHERE句へ畳み込む**
  （`date_trunc('milliseconds', updated_at) = ?`）。SELECTしてから比較するのではなく
  1文で判定するため「読んで比較する間に他者が更新する」レースが構造的に無い
- **競合時は412 Precondition Failed**。unique制約違反（409）と区別できるようにし、
  クライアントは楽観的更新をロールバックして「他のユーザーが先に更新しました。
  画面を再読み込みして…」と案内する（`describeSaveFailure`、`stores/persistence-error.ts`）
- **ヘッダー未送出なら従来どおり**（後方互換）。解釈できない値は400で弾く
  （黙って無視すると「ロックしたつもりで素通り」する事故になる）
- **サーバー確定行の反映が必須**: サーバーは`updatedAt`を**サーバー時計**で更新するため、
  各ストアの`.update()`は`.then((saved) => set(...))`で応答をローカルへ書き戻す
  （`create`側と同じ形）。反映しないと次回の期待値がクライアント時計のまま残り、
  **単独ユーザーでも2回目の更新が必ず412になる**（21箇所すべてに適用）
- **適用範囲**: `updatedAt`を持つ14ストア・22箇所（ユーザーが画面で編集するレコード）。
  **カスケード的な副作用更新は対象外**（`DivisionBudget.initialAmount`の自動再計算、
  サブカテゴリ削除時の`techTags.subCategoryId`クリア等。本体の操作は成功したのに
  連動更新だけ競合で止まると不整合になるため）。`updatedAt`を持たないエンティティ
  （efforts・scheduleEntries・budgetBreakdowns・追記専用系）も対象外
- **localモード**: `LocalJsonAdapter`は期待値を受け取るが検証しない（単一ユーザー前提）
