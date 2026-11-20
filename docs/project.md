# プロジェクト情報

> **このファイルは毎セッション常時ロードされる。** 索引と要約だけを置き、非空行300行以内を保つ。
> 機能の経緯・設計判断・フィールド仕様などの詳細は `docs/reference/` 配下へ書き、ここからは1行で参照する。

## 概要

年度単位（4月〜翌年3月）で案件別・担当者別に月次リソース配分を管理するWebアプリケーション。
localStorageでJSON永続化し、将来的なRDB移行を考慮した設計。

主要機能: 案件管理（階層ツリー）/ 担当者管理 / アサイン管理 / WBS工数 / スケジュール（ガント）/ 技術タグ / 所属会社管理（契約単価） / スナップショット / レポート / 部門予算管理（人件費・AI利用費・SaaS契約の予実管理）

### コンセプト: 「人・モノ・金」三位一体の可視化

本ツールは単なるリソース配分表ではなく、システム開発案件を**人（体制）・モノ（機能・タスク・スケジュール）・金（予算）**
の3軸で常に一体として可視化・調整するための意思決定支援ツールという位置づけを持つ。日本のシステム開発商習慣では
予算が先に確定し、その制約の中で機能をシュリンクしたりスケジュールを調整したりして着地させる進行が一般的だが、
予算が見えていないとこの調整判断ができず、後工程で急に予算制約が発覚して開発側にしわ寄せが来る。3軸を分断せず
同一ツール上で俯瞰できることが、この問題への対処になる。

タスクの実行管理自体（Asana・Backlog等）は専門ツールに委ね、本ツールはAPI/Webhook経由の疎結合連携を前提とする
（「餅は餅屋」）。詳細な思想の経緯・将来のAI連携像は非公開の設計文書、この観点に
基づく機能拡張ロードマップは非公開の設計文書を参照。

## コマンド

### クライアント（`src/`）

```bash
npm run dev              # 開発サーバー（HMR）
npm run build            # 型チェック（tsc -b）+ 本番ビルド（vite build）
npm run lint             # Biome Lint
npm run format           # Biome Format
npm run check            # Biome Check（Lint + Format、自動修正あり）
npm run test             # Vitest（watchモード）
npm run test:run         # テスト一回実行
npm run test:coverage    # カバレッジ付きテスト（v8）
npm run e2e              # Playwright E2E
npm run e2e:ui           # Playwright E2E（UIモード）
npm run e2e:postgres     # postgresモードのブラウザE2E（Docker必須）
npm run dev:postgres     # postgresモードをワンコマンド起動（Docker起動→migrate→admin作成→API+クライアント）
npm run depcruise        # 依存方向チェック（dependency-cruiser）
node scripts/public-release/export.mjs --out ~/Development/triplan   # 公開リポジトリ（triplan）向けエクスポート（非公開資料の除外・ブランド置換・運用ファイルの重ね合わせ・残留チェック）
npm run depcruise:report # 依存グラフSVG出力
npm run preview          # 本番ビルドのローカルプレビュー
```

### サーバー（`server/`、postgresモード用）

```bash
npm --prefix server run dev              # 開発サーバー（tsx watch）
npm --prefix server run build            # 型チェック（tsc -b）
npm --prefix server run start            # 本番サーバー実行
npm --prefix server run test             # Vitest（watchモード）
npm --prefix server run test:run         # テスト一回実行（統合テストはTestcontainers使用、Docker必須）
npm --prefix server run depcruise        # 依存方向チェック
npm --prefix server run db:generate      # Drizzleマイグレーション生成
npm --prefix server run db:migrate       # DB マイグレーション実行
npm --prefix server run db:studio        # Drizzle Studio（UIブラウザ）
npm --prefix server run db:seed-admin    # admin ユーザー作成
npm --prefix server run db:migrate-from-json  # localStorage→PostgreSQL 移行
```

Node.js 22以上・npm 11以上が必要（2026-08-22にNode 20から引き上げ。依存パッケージが`node>=22`を要求し、`package-lock.json`はnpm 11で生成されているためNode 22同梱のnpm 10では`npm ci`が失敗する）

## 技術スタック

### クライアント（`src/`）

| カテゴリ       | 技術                                          |
| -------------- | --------------------------------------------- |
| フレームワーク | React 19, TypeScript 5.9（Strict）, Vite 7    |
| スタイリング   | Tailwind CSS 4, shadcn/ui（Radix UI）, cmdk 1  |
| 状態管理       | Zustand 5（localStorage永続化）               |
| グリッド       | AG Grid 33                                    |
| ガントチャート | @svar-ui/react-gantt 2.7（2.7以降はDOMのid属性値に「:」が前置される。`normalizeGanttId`で剥がす） |
| チャート       | Recharts 2.15                                 |
| バリデーション | Zod 4.6（id検証は`z.guid()`＝v3の`.uuid()`と同じ緩い判定。v4の`.uuid()`はRFC準拠のみ受理）, React Hook Form 7, @hookform/resolvers 5 |
| ルーティング   | React Router DOM 7                            |
| ガイドツアー   | React Joyride 3.2（RC版3.0.0-7から移行）  |
| D&D            | react-dnd 16                                  |
| アイコン       | lucide-react                                  |
| フォント       | Inter Variable, Noto Sans JP（@fontsourceでセルフホスト、CDN非依存） |
| コード品質     | Biome 2.5（リンター / フォーマッター）        |
| 依存方向チェック | dependency-cruiser 17                        |
| Git Hooks      | husky 9, lint-staged 16                       |
| テスト         | Vitest 4, Testing Library, Playwright 1.52    |
| アクセシビリティ | @axe-core/playwright 4.13（E2Eで全画面・主要ダイアログをWCAG 2.1 AA検査） |
| モック         | MSW 2                                         |

### サーバー（`server/`、postgresモード用）

| カテゴリ     | 技術                                    |
| ------------ | --------------------------------------- |
| フレームワーク | Fastify 5, Node.js 22+, TypeScript 5.9 |
| データベース | PostgreSQL 16+, Drizzle ORM 0.45      |
| 認証         | Argon2（パスワードハッシュ）, Jose JWT 6.2 |
| バリデーション | Zod 4.6                               |
| テスト       | Vitest 4, Testcontainers PostgreSQL    |
| 開発ツール   | tsx 4.23, drizzle-kit 0.31             |
| 圧縮         | @fastify/compress 9.2（全レスポンス、閾値1KB、br/gzip/deflate） |
| コード品質   | Biome 2.5, dependency-cruiser 17       |

## ルーティング

各画面の仕様・クエリパラメータ・権限の詳細は
[reference/project/routing.md](reference/project/routing.md) を参照。

| パス | ページ | 概要 |
| ---- | ------ | ---- |
| `/` | LandingPage | ランディングページ（アプリ本体へは`/dashboard`等から入る） |
| `/dashboard` | DashboardPage | アラートセンター・EVMパネル（readOnly）・山積みグラフ |
| `/team` | TeamPage | チーム管理（組織階層・売上予算・スキル）。`/members`はここへ転送 |
| `/projects` | ProjectsPage | 案件管理ツリー。EVM・商流・リスク登録簿・見積・What-ifの入口 |
| `/project-summary` | ProjectSummaryPage | 1案件の健全性（決定論9ルール＋金/モノ/人/リスク/商流）。読み取り専用 |
| `/portfolio` | PortfolioPage | 全ルート案件を健全性の悪い順に一覧（判定はサマリーと同一実装） |
| `/estimates` | EstimatesPage | 見積（記録／コーン／振り返り）。金額ガードあり |
| `/wbs` | WbsPage | WBS工数・完了チェック・計画の凍結・連携CSV・API起票 |
| `/wbs-settings/:projectId` | WbsSettingsPage | WBS列設定（案件別） |
| `/schedule` | SchedulePage | ガントチャート |
| `/schedule-settings/:projectId` | PhaseSettingsPage | 工程定義（案件別） |
| `/assignment` | AssignmentPage | アサイン管理・体制メモ・アサインスナップショット |
| `/monthly-actuals` | MonthlyActualsPage | 月次実績の確認・CSV取込・確定・月次締め（金額非表示） |
| `/budget` | BudgetPage | 予算管理7タブ。金額ガードあり |
| `/statements` | StatementsPage | 月次明細（協力会社支払／発注元向け）・準委任精算。金額ガードあり |
| `/reports` | ReportsPage | CSVレポート3帳票＋カスタムCSV |
| `/my-tasks` | MyTasksPage | 自分の担当（postgresモードのみ・金額非表示） |
| `/login` | LoginPage | ログイン（postgresモードのみ意味を持つ） |
| `/admin` | → 権限に応じて転送 | `/admin/settings`または`/admin/companies` |
| `/admin/settings` | SystemSettingsPage | 全社設定（`settings:manage`） |
| `/admin/data` | DataManagementPage | マスタCSV一括登録・JSONエクスポート/インポート・スナップショット（`users:manage`） |
| `/admin/companies` | CompaniesPage | 所属会社マスタ |
| `/admin/tech-tags` | TechTagsPage | 技術タグ管理 |
| `/admin/wbs-templates` | WbsTemplatesPage | WBSテンプレート管理 |
| `/admin/document-templates` | DocumentTemplatesPage | ドキュメントテンプレート管理（IPA準拠33件を初回シード） |
| `/admin/users` | UserManagementPage | ユーザー管理（admin限定・postgresモードのみ） |
| `/admin/notifications` | NotificationSettingsPage | 通知チャンネル設定（admin限定・postgresモードのみ） |
| `/admin/api-keys` | ApiKeysPage | 公開API v1のキー管理（admin限定・postgresモードのみ） |
| `/admin/audit-logs` | AuditLogsPage | 監査証跡の閲覧・保持管理（admin限定・postgresモードのみ） |
| `/admin/external-tools` | ExternalToolsPage | 外部ツール接続（admin限定・postgresモードのみ） |

- `?projectId=xxx`で初期選択できる画面: `/project-summary`・`/estimates`・`/wbs`・`/schedule`・`/assignment`
- `/admin/*`は業務画面（`Layout`）の**外側**に置く別レイアウト（`AdminLayout`）。メニューの出し分けと
  ページ側ガード（`AdminAccessGuard`）を必ずセットで置く
- 旧URL（`/companies`・`/tech-tags`・`/wbs-templates`・`/document-templates`）は`/admin/...`へ転送

## Zustandストア一覧

各ストアのアクション・ガード・設計判断の詳細は
[reference/project/stores.md](reference/project/stores.md) を参照。

| ストア | 責務 |
| ------ | ---- |
| `app-store` | 年度・テーマ・フォントサイズ・金額表示トグル・初期設定ウィザード状態（persist） |
| `projects-store` | 案件CRUD・ツリー構造・コード自動採番 |
| `members-store` | 担当者CRUD・役割マスタ抽出・各種セレクタ |
| `team-store` | 部門・課CRUD |
| `companies-store` | 所属会社CRUD（取引先属性・内部リソースフラグ） |
| `assignment-store` | アサインCRUD・月次配分・実績の例外入力・月次締めガード |
| `assignment-note-store` | 体制メモ・アサインスナップショット |
| `efforts-store` | WBS工数 |
| `schedule-store` | スケジュールエントリ・工程依存関係 |
| `schedule-settings-store` / `wbs-settings-store` | 案件別の工程定義／WBS工数列設定 |
| `wbs-template-store` / `document-template-store` | テンプレートのストック管理（初回のみ標準をシード） |
| `budget-store` | 部門予算・内訳・予算変更・AI利用費・SaaS費用・全社設定値（概算単価・係数・為替等） |
| `personnel-plan-store` | 人員計画（4固定区分） |
| `project-progress-store` | 案件×週次進捗率（EVMのEVの手入力上書き） |
| `project-baseline-store` | 計画のスナップショット（EVMのPV基準線・追記専用） |
| `estimate-store` | 見積スナップショット（追記専用・最新版のみ取り消し可） |
| `risk-store` | リスク登録簿 |
| `change-request-store` / `billing-milestone-store` | 変更管理／請求マイルストン |
| `actuals-store` | 月次実績の確定マーク・CSV取込履歴・月次締めイベント |
| `task-sync-store` | 外部完了同期ログ（追記専用） |
| `csv-mapping-store` | 汎用CSVマッピングプロファイル |
| `tech-tags-store` | 技術タグ・カテゴリ・サブカテゴリ（マスタをシード） |
| `skill-store` | スキル評価履歴・成長ロードマップ目標（追記専用） |
| `tour-store` | ガイドツアー状態（永続化なし） |
| `auth-store` | postgresモードの認証状態（トークンはメモリのみ・永続化なし） |

業務データのストアはすべて`getDataAdapter()`経由の**楽観的更新**（クライアント生成idで即時反映→
失敗時はロールバックして`toast`）。`.update()`は応答（サーバー確定行）をローカルへ書き戻す。

## 機能別リファレンス

機能の仕様・経緯・設計判断は以下に分割している。該当機能を触るときに読む。

| ファイル | 内容 |
| -------- | ---- |
| [reference/project/routing.md](reference/project/routing.md) | ルーティング全表・管理画面（`/admin/*`）・マスタCSV一括登録 |
| [reference/project/stores.md](reference/project/stores.md) | ストア一覧（アクション・ガードの詳細） |
| [reference/project/features-evm-commerce.md](reference/project/features-evm-commerce.md) | EVM運用（「入力させないEVM」）・商流管理とアラートセンター・汎用CSVマッピング基盤・準委任の月次精算・初期設定ウィザード・ドキュメントテンプレート |
| [reference/project/features-integration.md](reference/project/features-integration.md) | 外部実行管理ツールとの完了同期（CSV・Webhook）・API起票基盤・公開API v1・チャットツール通知 |
| [reference/project/features-auth-governance.md](reference/project/features-auth-governance.md) | ロール・権限設計・金額情報の表示制御・業務定数の設定化とappSettings API・アカウントメニュー・個人向け導線・汎用監査証跡・楽観ロック |
| [reference/project/persistence.md](reference/project/persistence.md) | データ永続化のデュアルバックエンド化・17ストアのDataAdapter配線・ID安定性・規模の制約 |

### 横断して効く要点

- **永続化は2モード**: `VITE_STORAGE_MODE`（`local`｜`postgres`、既定`local`）。localモードはサーバー不要・
  認証なしの単一ユーザー動作を維持する（既存の基本機能を変えない制約）。postgresモードは`server/`のAPIへ到達する
- **ロールは5段階の線形階層**: `admin ⊇ manager ⊇ editor ⊇ viewer ⊇ partner`。判定はロール名ではなく
  権限（`hasPermission`）で行う。`partner`は`financials:read`を持たない
- **金額の表示制御**: `useCanViewFinancials()`で判定し、金額専用ページは`FinancialAccessGuard`でブロック。
  認可の実体はサーバー側（金額系エンティティのGETは`financials:read`必須）
- **localモードの実用限界**: 概ね20〜30案件（3,000〜5,000タスク）。localStorageの容量上限（約5MB）による
- **通貨は「万円」表記で確定**（i18n・多通貨はスコープ外）

## 制約事項

- localStorageモード（既定）はDBを使わない（localStorageでJSON永続化）。postgresモードは上記参照
- ダークモード対応必須
- パスエイリアス: `@/` → `src/`
- E2Eテストはブラウザー: Chromium、ベースURL: `http://localhost:5173`
- Git Hooks: pre-commitでlint-staged（Biome check）、pre-pushでlint + 型チェック + テスト + 依存方向チェック
