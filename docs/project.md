# プロジェクト情報

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
| バリデーション | Zod 3.24, React Hook Form 7                   |
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
| バリデーション | Zod 3.24                              |
| テスト       | Vitest 4, Testcontainers PostgreSQL    |
| 開発ツール   | tsx 4.23, drizzle-kit 0.31             |
| 圧縮         | @fastify/compress 9.2（全レスポンス、閾値1KB、br/gzip/deflate） |
| コード品質   | Biome 2.5, dependency-cruiser 17       |

## ルーティング

| パス                           | ページ           | 機能                         |
| ------------------------------ | ---------------- | ---------------------------- |
| `/`                            | LandingPage      | ランディングページ（アプリ本体へは`/dashboard`等から入る。旧記載「→ /dashboardリダイレクト」は実装と乖離していたため訂正） |
| `/dashboard`                   | DashboardPage    | ダッシュボード               |
| `/team`                        | TeamPage         | チーム管理（組織階層・売上予算） |
| `/members`                     | → `/team`        | リダイレクト（後方互換）     |
| `/projects`                    | ProjectsPage     | 案件管理ツリー（EVM列にプロジェクトサマリーへの遷移アイコンを併設。**リスク列**のShieldAlertアイコンから`RiskRegisterDialog`＝案件単位のリスク登録簿を起動、非公開の設計文書） |
| `/project-summary`             | ProjectSummaryPage | プロジェクトサマリー統合ビュー（非公開の設計文書）。PMが週次に1案件の健全性を1分で確認する読み取り専用ページ。決定論的な9ルール（納期超過・遅延予測・予算超過・予算先行・SPI低下・ベースライン乖離・配分ギャップ・稼働超過・重大リスク=リスク登録簿の確率高×影響高がopen）による総合判定バッジ＋理由リストと、金（損益・原価4区分）／モノ（進捗・EVMチャート・現工程）／人（体制・山積み）／リスク（登録簿の重大度順上位5件、非公開の設計文書）／商流（売上計上・受注残・CR）の5区画を集約。`?projectId=xxx`クエリパラメータで初期選択、WBS/スケジュール/アサインへの相互リンク。金額は**セクション単位マスク**（`useCanViewFinancials`。金・商流と金額系判定のみ非表示＝partnerでも進捗・体制は見える） |
| `/portfolio`                  | PortfolioPage    | ポートフォリオ。進行中・未着手の全ルートプロジェクトを、プロジェクトサマリーと同一の決定論9ルール判定（`buildPortfolioRows`が`evaluateSummaryJudgments`を全案件へ適用＝判定エンジンの単一実装）で**健全性の悪い順**（危険→要注意→良好→判定不能。同順位は指摘件数→コード昇順）に一覧する読み取り専用ページ。「どのプロジェクトから見るべきか」の週次の入口。完了済み（status='completed'）は表示しない。金額系判定は`useCanViewFinancials`で除外（サマリーと同じ判定単位マスク）。行の「開く」で`/project-summary?projectId=`へ遷移 |
| `/estimates`                   | EstimatesPage    | **見積**（非公開の設計文書）。1案件フォーカス（`?projectId=xxx`で初期選択、`/project-summary`と同型）で、記録／コーン／振り返りの3タブ。簡易FP（NESMA概算法・推定法）／WBS積み上げ／手入力／実績の4方法で見積を**版として追記**し（`EstimateSnapshot`、当時の設定値とtotalFpを凍結、取り消しは最新版のみ）、不確実性コーン（McConnell 6段階の幅）を帯で描き、実績÷見積と幅の判定・実績 人時/FP・完了案件からの校正ヒントを出す。承認済みCRとの紐づけで要件追加の増分を残す。金額を持つため`FinancialAccessGuard`でページ単位ブロック（サイドバー項目も`financial`）。入口はサイドバー「計画」（プロジェクトサマリーとWBSの間）・`/projects`行アイコン「見積」・サマリー「金」区画の1行 |
| `/wbs`                         | WbsPage          | WBS工数管理（`?projectId=xxx`クエリパラメータで初期選択） |
| `/wbs-settings/:projectId`     | WbsSettingsPage  | WBS列設定（案件別）          |
| `/admin/wbs-templates`         | WbsTemplatesPage | WBSテンプレート管理（新規作成・名称編集・工程/タスクのツリー編集・**ドキュメントテンプレート紐づけ**（「ドキュメント」列→DocumentTemplateLinkDialog）） |
| `/admin/document-templates`    | DocumentTemplatesPage | ドキュメントテンプレート管理。IPA公開情報ベースの標準テンプレート33件を初回シード（OKF v0.2準拠マークダウン・固定UUID）。一覧・新規作成・編集・削除・.mdダウンロード |
| `/schedule`                    | SchedulePage     | ガントチャート（`?projectId=xxx`クエリパラメータで初期選択） |
| `/schedule-settings/:projectId`| PhaseSettingsPage| 工程定義管理（案件別）       |
| `/assignment`                  | AssignmentPage   | アサイン管理（`?projectId=xxx`クエリパラメータで初期選択、双方向連携対応）。**体制メモ**（案件単位の申し送り。アサインは外部ツールに無い本ツール固有のデータのため「なぜこの配分か」をここに残す）と**アサインスナップショット**（任意のタイミングで体制をタスク粒度で記録し現在との差分を見る。復元は行わない）を持つ |
| `/monthly-actuals`             | MonthlyActualsPage | 月次実績メンテナンス（P1-a）。単月フォーカスで実績（人月）の確認・修正・確定を行う。未入力の行は計画どおり（ゴースト表示、キー欠落=計画値）。実績は1.0人月超も記録可（上限でブロックしない）。確定はマークのみ（ソフトロック、実績キーの一括書込みはしない）。金額は一切表示しない（協力会社メンバーも触れる想定）。汎用CSV取込ウィザード（3ステップ: ファイル選択→列マッピング＋単位→突合ドライラン→適用。人日/時間はworkdaysPerMonth・hoursPerDayで人月換算、日次行は月へ合算、per-row skip）＋取込履歴（直近5件）表示。**月次締め**（P1-b）: `governance:approve`（localモードは常時可）で「この月を締める」→締め済み月は実績・計画とも編集拒否（ハードロック）。解除は理由必須で、締め/解除は追記専用イベントとして監査記録に残る |
| `/budget`                      | BudgetPage       | 予算管理（7タブ、初期表示は予実ダッシュボード: 予実ダッシュボード／部門予算／プロジェクト／その他費用／AI利用費／SaaS費用／人員計画。EVMパネルはダッシュボード画面へ移設済み） |
| `/statements`                  | StatementsPage   | 月次明細（対象月・計画/実績トグル・CSV出力）。タブ1=協力会社への支払（会社→人→案件PJコード、**契約単価**ベース＝協力会社とのやり取り用）、タブ2=発注元向け（案件→会社→人、**見積単価**ベース＝発注元とのやり取り用）。単価の二重管理を2方向の帳票に写す画面。両タブに「カスタムCSV」（列マッピングエクスポート）。協力会社タブは実績モードで**準委任精算**（精算幅による幅内/控除/超過の自動判定・精算列表示） |
| `/admin/tech-tags`             | TechTagsPage     | 技術タグ管理                 |
| `/admin/companies`             | CompaniesPage    | 所属会社マスタ管理           |
| `/reports`                     | ReportsPage      | レポート出力（CSV3帳票: 案件別収支表・要員別稼働表・部門予算予実表、UTF-8 BOM付き）＋外部システム向けカスタムCSV（請求データ・案件別収支のマッピングエクスポート）。**データ管理（JSONエクスポート/インポート・スナップショット）は`/admin/data`へ移設**（案内リンクのみ残す） |
| `/login`                       | LoginPage        | ログイン画面（postgresモードのみ意味を持つ。localモードでは未使用） |
| `/admin`                       | → 権限に応じて       | `settings:manage`があれば`/admin/settings`、無ければ`/admin/companies`へ（AdminIndexRedirect） |
| `/admin/settings`              | SystemSettingsPage | **全社設定**（`settings:manage`）。旧サイドバーのポップオーバーで直接編集していた11項目を、基本／見積・単価／警告のしきい値／表示／セットアップのカードへ整理。金額の表示トグル（localモード）と初期設定ウィザードの再開もここ |
| `/admin/data`                  | DataManagementPage | **データ管理**（`users:manage`＝サーバー側のexport/importと同じadmin限定）。**CSV一括登録**（メンバー／プロジェクト・タスク／アサインの移行取込＋テンプレートDL）・JSONエクスポート/インポート・スナップショット履歴 |
| `/admin/users`                 | UserManagementPage | ユーザー管理（admin限定、postgresモードのみ） |
| `/admin/notifications`         | NotificationSettingsPage | 通知設定（admin限定、postgresモードのみ）。チャットツール通知チャンネルの管理・テスト送信・送信ログ。システム設定メニューから遷移 |
| `/admin/api-keys`              | ApiKeysPage      | APIキー管理（admin限定、postgresモードのみ）。公開API v1のキー発行（平文は一度だけ表示）・無効化・削除、OAS仕様書への案内。システム設定メニューから遷移 |
| `/my-tasks`                    | MyTasksPage      | 自分の担当（postgresモードのみ）。ログインユーザーに紐づく担当者（`User.memberId`）のアサインから、今年度に配分のあるタスクを**期日の近い順**（期日なしは末尾）で一覧する読み取り専用ページ。期日は所属工程のスケジュール終了日から導出。**金額を一切表示しない**ため協力会社（partner）の担当者にも開ける。未紐づけのユーザーには案内を表示 |
| `/admin/audit-logs`            | AuditLogsPage    | 監査証跡（admin限定、postgresモードのみ）。業務データの変更履歴（誰がいつ何を変えたか）を対象データ・操作種別・レコードIDで絞り込んで閲覧する読み取り専用画面。システム設定メニューから遷移 |
| `/admin/external-tools`        | ExternalToolsPage | 外部ツール接続（admin限定、postgresモードのみ）。API起票先（Backlog/Asana/Jira/GitHub）の接続追加・編集・削除・接続テスト・起票先設定。APIトークンは暗号化保存の書き込み専用。システム設定メニューから遷移 |

### 管理画面（`/admin/*`）

全社設定・マスタ・管理者機能を、業務画面（`Layout`）とは**別レイアウト**の管理画面へ集約した。
それまでは全社設定がサイドバーのポップオーバー内での直接編集（11項目）、マスタ系が別画面への
遷移（10画面）と操作の種類が混在しており、項目が増えるほど使いにくくなっていた。

- **構成**: 左ペイン＝メニュー（設定／マスタ／管理者の3グループ）、右ペイン＝内容。
  左ペイン上部の「システムに戻る」で業務画面（`/dashboard`）へ戻る。
  業務画面のサイドバー下部の歯車ボタン（`aria-label="管理画面を開く"`）から入る
- **ルート配置**: `/admin/*`は`Layout`の**外側**に置き、`AdminLayout`が内部で`<Routes>`を持つ
  （2つのレイアウトが入れ子にならないようにするため）
- **旧URLは転送**: `/companies`・`/tech-tags`・`/wbs-templates`・`/document-templates`は
  `<Navigate replace>`で`/admin/...`へ（ブックマーク・既存リンクを壊さない）
- **権限は二重に判定**: メニュー項目は`AdminNavItem.permission`で隠し、ページ側も
  `AdminAccessGuard`（`shared/hooks/use-admin-permissions.ts`の`useAdminPermission`）で
  同じ権限を確認する。**メニューを隠すだけではURL直打ちで素通りする**ため。
  localモードは認証が無いので常に許可（`useCanViewFinancials`と同じ整理）

### マスタCSV一括登録

現行CSVで管理しているデータを移行するための取込。`/admin/data` に3種
（チームメンバー／プロジェクト・タスク／アサイン）を並べる。

- **列定義の正本は1箇所**（`shared/utils/master-import-core.ts`の`COLUMN_SPECS`）。
  ①テンプレートCSVの生成 ②取込時の列解決 ③画面の列一覧表示 がこれを読むため、
  「配ったテンプレートが通らない」状態が構造的に起きない
- **テンプレート**: ヘッダのみ（BOM付き）。必須列は`氏名*`のように`*`付きで示し、
  `normalizeHeader`が`*`・前後空白・全角英数を吸収するので付けたまま取り込める。
  **記入例の行は入れない**（消し忘れるとサンプルがそのまま登録されるため）
- **既存と一致した行はskipして報告**（移行は新規登録が主。誤って現行データを
  上書きする事故を防ぐ）。突合はメンバー=メール→氏名／プロジェクト=コード／
  アサイン=タスク×担当者。判別できない同名はskipする
- **未登録の部門・課・所属会社は取込時に作成**（既定ON。ドライラン画面で
  作成対象を一覧表示し、チェックを外せば従来どおりskipになる）
- **プロジェクトの階層は「親コード」列**。行の順序に依存せず解決し（子が先でもよい）、
  循環・親不明・5階層超はskip。コードから親子を推測する方式は採らない
  （命名規約から外れたコードを黙って別の親にぶら下げる事故を避ける）
- **アサインは横持ち**（1行＝1人×1タスク、月が列）。Excelのアサイン表に近い形で、
  年度12ヶ月を1行で書ける。取り込むのは**計画**（実績は`/monthly-actuals`のCSV取込）。
  締め済み月（P1-b）のセルは取り込まず、ドライランで一覧表示する
- **プレビューは2段階**: ①ファイル選択直後に**解釈前のCSV**（先頭5行）を出し、
  列のずれ・文字化けに気づけるようにする ②確認画面に**実際に登録される内容**を出す
  （既存マスタのidは名前へ引き直し、これから作るものは「（新規）」と示す）。
  件数とスキップ理由だけでは「部門と課を逆に書いた」「単価と契約単価が入れ替わっている」
  といった**通ってしまう間違い**に気づけないため。取り込まない行はプレビューに出さない
- 突合は純関数（`master-import-{members,projects,assignments}.ts`）、
  プレビュー行の整形は`master-import-preview.ts`、
  書き込みはストアのアクションを注入する`master-import-apply.ts`が担う

## Zustandストア一覧

| ストア                   | 責務                                                         |
| ------------------------ | ------------------------------------------------------------ |
| `app-store`              | 年度管理、テーマ、フォントサイズ、ローディング、初期設定ウィザード状態（`setupCardDismissed`/`demoDataActive`は永続化、`isSetupWizardOpen`/`setupWizardInitialStep`は非永続） |
| `projects-store`         | 案件CRUD、ツリー構造、コード自動採番                         |
| `members-store`          | 担当者CRUD、役割マスタ抽出、課別・未所属・年度内在籍セレクタ |
| `team-store`             | 部門・課CRUD（組織階層管理）                                 |
| `companies-store`        | 所属会社CRUD（全社共通マスタ、内部リソースフラグ=isInternal、旧isProper。取引先属性=インボイス登録番号・支払サイトは`CompanyExtras`引数で追加/更新、undefined=変更なし/null=クリアの3値）、削除時のメンバーcompanyId解除 |
| `assignment-note-store`  | 体制メモ（`assignmentNotes`）のCRUDと、アサイン表スナップショット（`assignmentSnapshots`、追記専用＝更新アクションなし・削除は可）のCRUD。どちらも`/assignment`が参照する「アサイン表の周辺情報」のため1ストアにまとめる |
| `assignment-store`       | アサイン管理CRUD、月次配分値の更新（計画は1.0上限）、実績の例外入力`updateActualMonthlyValue`（null=クリア、計画と同値はキー削除の正規化）・計画外実績の追加`addActualEntry`（該当レコードが無ければmonthlyValues空で新規作成）、担当者別月次集計。**月次締めガード**（P1-b）: 締め済み月は計画・実績の変更、締め月に値を持つレコードの削除を6アクション全ての前段で拒否（actuals-storeの締め状態をgetState()参照） |
| `budget-store`           | 部門予算（内訳から自動計算）・その他予算変更（増額/減額、旧「予算追加履歴」）・部門予算内訳（月次実績・実績明細・更新・削除アクション含む）・AI利用費（部門/課単位・メンバー別配分含む）・SaaS費用（月次実績アクション含む）のCRUD、人件費/プロパー人件費算出セレクタ、概算単価・係数（全社共通デフォルト＋案件別）の管理、部門予算俯瞰セレクタ、全部門横断集計セレクタ（`getBudgetOverviewForDivisions`・`getAiUsageTotalForDivisions`・`getAiUsageBudgetTotalForDivisions`・`getSaasAnnualCostTotalForDivisions`） |
| `personnel-plan-store`   | 人員計画の4固定区分（人件費内部リソース/外部リソース・追加予定内部リソース/外部リソース、旧プロパー/プロパー以外）のCRUD、月別予定人数・実績人数の管理、実績人数自動算出セレクタ |
| `project-progress-store` | 案件×週次進捗率スナップショット（`projectProgressEntries`）のCRUD、`setWeeklyProgress`（upsert）アクション。EVM（PV/EV/AC）機能のEV算出に使用（現在はWBS完了チェックからの工数加重導出が主軸で、本ストアは明示的な手入力の上書きとして優先される） |
| `estimate-store`         | 見積スナップショット（`estimateSnapshots`）の追記専用CRUD。`recordEstimate`（版を案件内で自動採番。方法と根拠の整合をZodで検証し、通らなければ何も書かずnull）・`revokeLatestEstimate`（最新版のみ削除）・`getEstimateHistory`/`getLatestEstimate`。投稿者名はサーバーがスタンプ |
| `project-baseline-store` | 計画のスナップショット（`projectBaselines`）のCRUD、`freezeBaseline`（版を自動採番して凍結）・`revokeLatestBaseline`（最新版のみ取り消し可）アクション、`getActiveBaseline`/`getBaselineHistory`セレクタ。EVMのPV（計画値）の基準線。非公開の設計文書参照 |
| `risk-store`             | リスク登録簿（`riskEntries`）のCRUD（非公開の設計文書）。確率×影響の3段階評価・対応方針・オーナー（弱参照）・対応期限。追記専用にしない（評価の見直しが本質、変更履歴は監査証跡が拾う）。重大度は保存せず`deriveRiskSeverity`で都度導出 |
| `change-request-store`   | 変更管理（`changeRequests`）のCRUD。`approveChangeRequest`は受注額差分・新納期を対象Projectの`contractAmount`/`masterDueDate`へ自動反映（工数差分はWBSへの手動反映＋再凍結を促す）。承認/却下済みは削除不可（追跡性の保持）。PROPOSAL §4.4 |
| `billing-milestone-store` | 請求マイルストン（`billingMilestones`）のCRUD・ステータス遷移（予定→検収済→請求済→入金済）。売上計上・受注残の算出は`features/projects/utils/billing-milestone-utils.ts`。PROPOSAL §4.3 |
| `efforts-store`          | WBS工数データ管理                                            |
| `schedule-store`         | スケジュールエントリ、工程依存関係                           |
| `schedule-settings-store`| 工程定義（案件×1レコード=`PhaseSettingsEntry`、最大15件、色・有効/無効・並び順）。DataAdapter経由（第11弾）、旧Zustand persist（独立localStorageキー`schedule-settings-storage`）からの1回限りレガシー移行を内蔵 |
| `wbs-settings-store`     | WBS工数列設定（案件×1レコード=`WbsSettingsEntry`、最大10列）。DataAdapter経由（第11弾）、旧Zustand persist（独立localStorageキー`wbs-settings-storage`）からの1回限りレガシー移行を内蔵 |
| `wbs-template-store`     | WBSテンプレートのストック管理（CRUD）、初回のみ標準テンプレートを1件シード（seedStandardTemplate） |
| `document-template-store` | ドキュメントテンプレート（`documentTemplates`）のCRUD、初回のみIPA準拠の標準テンプレート一式をシード（seedStandardDocumentTemplates、`shared/data/document-template-master.ts`の固定UUIDを維持＝WBSテンプレートからの紐づけ前提） |
| `csv-mapping-store`      | 汎用CSVマッピングプロファイル（`csvMappingProfiles`）のCRUD、`getProfilesForSource`セレクタ（sourceKey×direction絞り込み・名前順）。 |
| `task-sync-store`        | 外部完了同期ログ（`taskSyncLogs`、P1-c改）の追記専用CRUD（`addTaskSyncLog`）。完了状態そのものはprojects-storeが受け皿 |
| `tech-tags-store`        | 技術タグCRUD、カテゴリ/サブカテゴリCRUD、マスタデータシード   |
| `skill-store`            | スキル評価履歴（`skillEvaluations`）・成長ロードマップ目標（`skillRoadmapGoals`）の追記専用CRUD、現在レベル・現在目標導出セレクタ |
| `tour-store`             | ガイドツアー状態管理（永続化なし）。保持するのは開始/終了と対象ツアーのみで、**現在のステップ位置は持たない**（react-joyride 3.2はステップ遷移中に非同期段階が入り、外部から`stepIndex`を制御すると更新が漏れてツアーが止まるため）        |
| `actuals-store`          | 月次実績の周辺エンティティ（P1-a）: 確定マーク`monthlyActualsConfirmations`（全社×月1レコード、`confirmMonth`は既存があればconfirmedAt更新=再確定。締め済み月は拒否）・CSV取込履歴`actualsImportLogs`（追記専用`addImportLog`）・**月次締めイベント`monthlyCloseEvents`**（P1-b。追記専用`closeMonth`/`reopenMonth`（解除は理由必須）、締め状態は月ごとの最新イベントから導出=`isMonthClosed`/`getLatestCloseEvent`）のCRUD、`getConfirmation`セレクタ |
| `auth-store`             | postgresモード専用の認証状態（アクセストークンはメモリ上のみ、localStorage/sessionStorageには保存しない）。login/logout/restoreSession（restoreSessionはsingle-flight＝並行リフレッシュによるトークンローテーション競合でセッションが失われるのを防ぐ） |

全ストアはZustand 5 + localStorage永続化（jsonStorage経由）。tour-store・auth-storeのみ永続化なし。

### EVM運用（「入力させないEVM」）

2026-08-15、非公開の設計文書 の設計に沿ってEVMの運用モデルを刷新した。
**EVMのための新しい入力作業を発生させない**という方針で、PMが普段行う作業（アサイン表のメンテナンス、
WBSの完了チェック）から3指標を自動導出し、EVM固有の操作は「計画の凍結」だけに限定する。

| 指標 | 算出元 | PMの操作 |
| ---- | ------ | -------- |
| PV | 凍結した`ProjectBaseline`の月次計画コスト（配分の形）× BAC | 計画確定時とCR承認時の凍結のみ |
| EV | WBS完了チェックの工数加重ロールアップ（`Project.completedAt`基準）。週次手入力があればそれを優先 | 完了チェック（EVMが無くても行う作業） |
| AC | 現在のアサイン表（過去分）× 単価。`actualMonthlyValues`があればその月だけ上書き | なし（任意で実績の例外入力） |

- 凍結・再凍結・最新版の取り消しは `/wbs` 画面（`BaselineFreezeDialog`・取り消し確認ダイアログ）。現行BACと凍結時BACが±10%乖離すると再凍結を促す警告が出る（同じ判定がダッシュボードのアラートセンターにも集約される）
- ベースライン履歴・版切替線・参照水平線（受注額/承認予算枠）は `/dashboard` のEVMパネル
- 実績の例外入力は `/assignment` 画面の「計画/実績」トグル（未入力の月は計画どおりとして扱う）
- 山積みグラフ: 部門の需要vs供給は `/dashboard`、案件内の要員山はEVMダイアログ（`/projects`・`/wbs`）

### 商流管理（受注・請求・変更）とアラートセンター

2026-08-15、非公開の設計文書のP0/P1バックログを実装した。

- **商流属性**: `Project.contractType`（請負/準委任/派遣/混在、案件レベル）・`masterDueDate`
  （契約上のマスター納期）。`ProjectDialog`のlevel===0欄で編集
- **商流管理ダイアログ**（`/projects`の行アイコン「商流」→`ProjectCommerceDialog`）:
  - 請求マイルストン: 受注額を検収時期に分割割付し、予定→検収済→請求済→入金済を追跡。
    売上計上額（検収基準）・入金済・受注残を表示し、配分合計と受注額の不一致を警告
  - 変更管理: 受注額差分・工数差分・新納期を申請→承認/却下。承認で受注額・納期がProjectへ
    自動反映され、「なぜ着地が動いたか」が履歴として残る
- **アラートセンター**（`/dashboard`最上部）: 納期超過（critical）・遅延予測（線形予測）・
  予算超過（受注額比80%でwarning/100%でcritical）・稼働超過（capacityRatio）・
  ベースライン乖離・SaaS更新期限・スキルレビュー未実施に加え、**事前リマインド2種**
  （納期接近=マスター納期の14日前〜当日info／検収予定日=請求マイルストンの14日前〜当日info・
  経過してもplannedのままならwarning。`DUE_SOON_THRESHOLD_DAYS`固定14日）、
  **リスク対応期限**（登録簿のopen/realizedの期限超過warning・接近info）を
  重大度順に集約表示。検収予定日アラートは金額系エンティティ由来のため金額非表示時は除外
- **CSVレポート出力**（`/reports`）: 案件別収支表・要員別稼働表・部門予算予実表
  （UTF-8 BOM付き、Excelでそのまま開ける）

### 外部実行管理ツールとの完了同期（P1-c改）

2026-08-16、非公開の設計文書のPhase 1を実装した。「餅は餅屋」で実行管理を
委ねた外部ツール（Backlog・Asana・Jira）から**タスク完了の事実を受信**し、WBS完了チェックの
二重入力を解消する（受信主・送出従。これでEVMの3指標すべて＝PV凍結・EV完了同期・AC月次実績が
手入力ゼロの動線で回る）。

- **行き**: `/wbs`の「連携CSV出力」（`TaskSyncExportDialog`）。リーフタスクを件名`[コード] 名前`＋
  直近親のグループ列（Backlog=カテゴリー/Asana=Section/Jira=Epic Link）で出力。
  階層はツリー複製ではなくグルーピング写像（構造の正本は本ツール1箇所）
- **帰り**: `/wbs`の「完了CSV取込」（`TaskSyncImportDialog`、3ステップウィザード）。突合は
  ①学習済み外部ID→②件名の`[コード]`→③コード直値/タスク名（複数一致・非リーフはskip）。
  初回突合成功時に`Project.externalSource`/`externalTaskId`を学習保存し、以降は外部IDが
  一次キー（件名改変に強い）。書込みは`completed`/`completedAt`のみ・同期ログ追記
- **コード一意性**: タスクコードが突合キーになるため、新たな重複を作る保存を
  ProjectDialog（クライアント）＋サーバー`beforeCreate`/`beforeUpdate`で拒否
  （既存重複データの無関係な編集はブロックしない）。DB unique制約は既存データ互換のため見送り
- **Phase 2（Webhook受信・postgresモード専用）実装済み**: `POST /api/webhooks/tasks/:source`
  （source=generic/backlog/jira/asana/github）。認証はURLシークレット（`TASK_WEBHOOK_SECRET`環境変数、
  未設定時は全401=機能無効）。冪等（同一イベント再送は変化なしに収束しログも増えない）。
  突合不能・解釈不能は**202**で受理してskipログへ記録（4xxを返すと外部ツールのリトライ嵐を招くため）。
  アダプタ: Backlog=`content.changes[]`のstatus変更が一次情報（完了状態名は
  `TASK_WEBHOOK_BACKLOG_DONE_STATUSES`環境変数で設定可、既定「完了」。で仮定を解消）／Jira=`statusCategory.key==='done'`（言語非依存）／Asana=X-Hook-Secret
  ハンドシェイク＋APIフェッチ（`ASANA_ACCESS_TOKEN`環境変数、未設定時はasanaソース無効）／
  **GitHub=`X-GitHub-Event`ヘッダで`issues`判定＋action closed/reopened、外部ID`owner/repo#番号`、
  `ping`は202で受理（環境変数の追加なし）**。
  仕様は公式ドキュメント調査に基づく
- Phase 3（アラート送出）は未着手

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

### API起票基盤（行き・postgresモード専用）

2026-08-20、非公開の設計文書に沿ってWBSタスクを外部ツールへAPIで
一括起票する基盤を実装した。**起票時に外部IDを即時学習する**ため、CSV経路の既知の弱点
（初回同期前のコード変更で追跡が切れる）がAPI経路では構造的に消える。

- **接続管理**: `/admin/external-tools`（`users:manage`＝admin限定）。ツール（backlog/
  asana/jira/github）・接続名・URL（Backlog=スペース／Jira=サイト）・APIトークン・
  起票先（プロジェクト/リポジトリ）を登録。トークンはAES-256-GCM暗号化保存の書き込み専用
  （GETは設定済みフラグのみ、PATCHはundefined=変更なし/null=クリア/文字列=再設定の3値。
  notificationChannelsと同じ整理でEntityMap非登録＝localモードには存在しない）。
  **接続一覧のGETのみ`data:write`**（`users:manage`から緩和）。起票実行が
  `data:write`である以上、editorが起票先の接続を選べないと機能が成立しない
  （緩和前は「API起票ボタンは押せるが接続取得で403」という実バグだった）。
  作成・更新・削除・接続テスト・起票先の選択肢取得は`users:manage`のまま＝職務分掌を維持。
  baseUrlは**https必須＋ホスト許可リスト**（`*.backlog.jp/.com/backlogtool.com`・
  `*.atlassian.net`）でSSRF面を限定（クラウド版専用の割り切り）
- **起票実行**: `POST /api/taskCreation/execute`（`data:write`＝editor以上）。
  クライアント申告のtaskIdsをそのまま起票せず、**サーバー側で対象を再検証**する
  （指定ルート配下・リーフ・未起票のみ。判定はクライアントのドライランと同一の
  `buildTaskCreationPlan`＝`shared/utils/task-creation-core.ts`）。逐次POST＋約1件/秒の
  スロットル（GitHubの二次制限80件/分が4ツール最小のため全ツール共通）・1リクエスト50件上限・
  **1件成功ごとに外部IDを即時UPDATE**（クラッシュ窓の最小化）。学習済みは常にskipされるため
  再実行は冪等（未起票分だけが対象）
- **案件ごとの既定接続**: `Project.externalConnectionId`で案件に接続を紐づける。`ProjectDialog`の「起票先の接続」欄（level===0・postgresモードのみ）で設定し、`TaskCreationDialog`が自動選択する（未設定・無効・削除済みなら先頭へフォールバック）。**案件ごとに委譲先ツールが違う運用**（A案件=Asana／B案件=GitHub）で、起票のたびに選び間違えて別ツールへ起票する事故（外部IDを学習するため取り消しが面倒）を防ぐ。同時に、同一ツールに複数接続（別スペース）がある場合の外部リンクもこの参照で確定できる
- **UI**: `/wbs`の「API起票」ボタン（postgresモードのみ表示）→`TaskCreationDialog`
  （接続選択→ドライラン→実行）。起票結果は`taskSyncLogs`（`channel='api'`・`createdCount`）へ追記
- **起票状態の可視化と外部リンク**: WBSグリッド右端固定の「連携」列に、
  起票済み＝外部タスクへのリンク／URL解決不能＝外部IDバッジ／未起票＝「—」を表示する。
  URLは`features/projects/utils/external-task-url.ts`の純関数が組み立て、**形式に合致しない
  外部ID・baseUrl不明のツールはリンクを出さない**（別スペースの同名課題へ飛ばさない）。
  baseUrlはWbsPageが接続一覧から取得するが、**取得失敗（viewer/partnerの403等）は握り潰す**
  ＝リンクが出ないだけで画面は成立する。localモードは接続を持たないためbaseUrl不要の
  github・asanaのみリンクになる
- **期日の送信**: タスクの所属工程（`Project.phaseKey`、祖先から継承）に
  引かれたスケジュールの終了日を`dueDate`として送る（Backlog=`dueDate`／Jira=`duedate`／
  Asana=`due_on`）。**【判断】GitHubには送らない**（Issueに期日フィールドが無く、
  マイルストーンは番号指定が必要で工程名から解決できない）。工程未設定・スケジュール未登録の
  タスクはキー自体を送らない。**【判断】担当者・優先度は送らない**: 担当者はemail→ユーザーID
  解決が全ツールで追加API往復を要し（Backlog=projects/:id/users、Jira=user/search（GDPR設定で
  失敗しうる）、GitHub=login解決）、1件/秒のスロットルに往復が乗る。優先度はツール間で表現が
  非互換（Jiraは名称文字列で日本語環境と不一致→400リスク、Asanaはカスタムフィールド、
  GitHubのラベルはグループで使用済み）で、値の不一致で起票が落ちる方が有害
- **Jiraの`description`はADF**（Atlassian Document Format）オブジェクトで送る。
  API v3はプレーン文字列を受け付けず400になる。改行は段落ノードへ分割し、完了条件が空なら
  キー自体を省略する（他3ツールは文字列のまま）
- **外部IDの形式はWebhookアダプタと完全一致**（backlog=`PROJ-123`／jira=`PROJ-123`／
  asana=gid／github=`owner/repo#123`）。不一致だと経路ごとに別IDで学習され突合が分裂する
- **【判断】Jiraのバルク作成API（≤50件）は使わない**: per-rowエラー処理と1件ごとの外部ID学習を
  4ツール単一実装に保つため。スループットはスロットル律速で差が出ない
- 【判断】グループ（直近親の工程名）はBacklog=カテゴリー（`categoryId[]`）／Asana=セクション
  （起票後に`POST /sections/{gid}/addTask`）／Jira・GitHub=ラベル。Backlog・Asanaは
  **未存在なら外部側に作成する**（CSVインポート時に外部ツールが作るのと等価。副作用は利用ガイドに明記）。
  同一実行内は工程名→識別子をキャッシュし、解決失敗時はグループ無しで起票を続行する
- **⚠️ 送信形式はツールで異なる**: **Backlogは`application/x-www-form-urlencoded`必須**
  （公式のAdd Issue仕様。配列は`categoryId[]`表記）、他3ツールはJSON。`CreateRequest.encoding`で
  出し分ける。統合テストはfetchスタブのため実APIとの相性は検出できず、実アカウント検証CLI
  （`npm --prefix server run verify:external-tool`）で確認する
- **実アカウント検証CLI**（`server/src/scripts/verify-external-tool.ts`）:
  DB・サーバー起動なしで本番と同じ`client.ts`/`payload.ts`を通し、①接続テスト ②起票先の選択肢
  （プロジェクトID・課題種別ID・優先度ID）取得 ③実起票（`EXT_CREATE=1`のときのみ）を行う。
  トークンは伏字表示。手順は`docs/guide/external-tools-setup.md`

**GitHub連携の非対称性**: 取込（`TaskSyncTool`）には`github`があるが、
エクスポート形式（`TaskSyncExportFormat` = `Exclude<TaskSyncTool, 'github'>`・
`TASK_SYNC_EXPORT_FORMATS`）には**含めない**。GitHubにはIssueのCSVインポート標準機能が
無いため（行きはAPI起票が担う。非公開の設計文書）。
CSV取込のgithubプリセットは`externalKey`を推定しない（CSVの`number`列＝`123`を学習すると
Webhook/API起票側の`owner/repo#123`と別IDになり経路間で突合が分裂するため）。

### 公開API v1（read-only）

2026-08-19、外部システム（BI・会計・スクリプト）が「判断の結果」を機械的に取得するための
読み取り専用APIを実装した（postgresモード専用・最小構成）。

- **認証**: APIキー（`X-Api-Key: rpk_...`または`Authorization: Bearer rpk_...`）。
  キーは`/admin/api-keys`で発行し、SHA-256ハッシュのみ保存（平文は発行時に一度だけ表示）。
  無効化は即時反映（次のリクエストから401）
- **エンドポイント8本**（集計はすべて画面・CSVと同一のshared純関数を再利用=数値の単一実装）:
  `GET /api/v1/billing`（請求データ、projectId絞り込み可）／`/api/v1/project-finance`
  （案件別収支。原価4区分＋配賦後利益を含む）／`/api/v1/statements/partner-payment`・`/api/v1/statements/client`
  （月次明細、month=YYYY-MM・mode=actual|plan。準委任精算適用済み）／`/api/v1/alerts`
  （アラートセンターと同一判定）／`/api/v1/projects`・`/api/v1/projects/{id}`
  （プロジェクト一覧・詳細=タスクツリー・スケジュール・進捗率。外部からの進捗報告参照用、
  金額は含めない=project-financeとの責務分離）／`/api/v1/projects/{id}/evm`
  （EVMのPV/EV/AC週次系列。EvmPanelと同一のBAC解決=ベースライン優先→WBS積み上げ→予算枠。
  スケジュールもベースラインも無い案件はeligible=false）
- **OAS**: `GET /api/v1/openapi.yaml`（認証不要=利用者への提供物。OpenAPI 3.0.3、
  正本は`server/openapi/v1.yaml`）
- 集計ビルダーのサーバー再利用のため`statement-utils`・案件別収支レコードビルダー
  （`project-finance.ts`）をshared/utilsへ移設（旧位置はリエクスポート）
- 書き込みAPI（実績工数の投入等）はスコープ外（需要が現れたらscope列を追加して拡張）

### 汎用CSVマッピング基盤

2026-08-18、非公開の設計文書のPhase A〜Cを実装した。方針は「請求書PDFは
作らない（餅は餅屋）。外部システム（会計ソフト・請求書発行サービス）が食べられる形に
自在に変換して渡す」。

- **概念**: データソース（行の集合を作る純関数）× マッピングプロファイル（列の選択・並び・
  外部システム側の列名への改名・ヘッダ有無・options）→ CSV。`CsvMappingProfile`は
  sourceKey×directionで管理し、未知のsourceKeyはUIが除外する弱参照
- **エクスポート**: `CsvMappingExportDialog`（shared/components）でGUI編集（有効/無効・
  並び替え・改名・プレビュー・プロファイル保存）。配線済みソース: 請求データ（/reportsと
  商流ダイアログ=案件絞り込み）・案件別収支（/reports。既存固定CSVはレコードビルダーの
  ラッパー化で数値完全互換）・協力会社支払/発注元明細（/statementsの「カスタムCSV」。
  レコード出力は合計行を含めない=外部取込での混入エラー防止）
- **インポート**: 実績CSV取込ウィザードに「取込プロファイル」（適用・保存・更新）。
  保存は役割→**列名**（列の並びがファイルごとに変わっても適用可）、単位はoptions.unitへ。
  列名が見つからない役割はmissing通知し手動選択へ委ねる
- **対象外【判断】**: 要員別稼働は月列が年度で動的に変わるためマッピング対象外（既存の
  固定CSVのまま）。部門予算予実も現行のまま

### 準委任の月次精算

2026-08-18、非公開の設計文書を実装した。精算幅（例: 140h〜180h）の
商習慣を月次明細（支払面）へ自動反映する。ユーザーの新規入力は契約単価履歴への精算幅のみ。

- **データ**: `ContractUnitPriceEntry`へ`settlementLowerHours`/`settlementUpperHours`
  （時間/月、optional=完全後方互換）。履歴エントリ単位のため単価改定と同時に幅も切り替わる
- **判定**（`shared/utils/settlement-utils.ts`、純関数）: 実績時間=実績人月×workdaysPerMonth
  ×hoursPerDay（システム設定値）。幅内=固定額／下回り=基準額÷下限×実績h／超過=基準額＋
  基準額÷上限×超過h。境界（下限・上限ちょうど）は幅内。片側のみ・上下逆転は防御的に固定扱い
- **適用**: 実績モードの協力会社支払のみ（計画モード・発注元向けは従来どおり）。判定は
  メンバー×月の合計実績（案件横断）で行い、明細行へ実績比按分（丸め差は最終行調整=
  Σ行金額と精算額の一致を保証）。カスタムCSVに精算判定・実績時間・基準額フィールド追加
- **UI**: TeamMemberDialogの契約単価履歴に下限h/上限h入力（フォームで片側のみ・上下逆転を
  拒否、空欄=未設定）。/statements協力会社タブの実績モードに「精算」列（ツールチップに
  実績h・基準額）

### 初期設定ウィザード

2026-08-17、クローン直後の空環境で迷わないよう、GUIウィザードによる初期設定動線を実装した。

- **「はじめに」カード**: 業務データが空（projects/members/divisions全て0件）のときだけ
  ダッシュボード最上部に表示。自動でモーダルは開かない（空localStorageで起動する既存E2E・
  「閉じたのに毎回出る」問題の回避）。「閉じる」は永続化され、以降はシステム設定ポップオーバーの
  「初期設定ウィザード」から再開できる
- **ウィザード**（`shared/components/SetupWizardDialog.tsx`。features間依存禁止のため
  EvmPanelと同じshared/components配置）: ようこそ（デモ分岐）→基本設定（年度開始月・概算単価・
  人月換算）→組織（部門・課）→担当者（氏名・所属課・単価）→最初のプロジェクト（コード自動採番＋
  標準WBSテンプレート適用チェック、作成した部門を担当部門に自動設定）→完了（WBS/アサインへの導線）。
  各ステップは「次へ」で即コミット（既存storeアクション経由）・スキップ可・中断再開可
- **デモデータ切り替え**: 空のときのみ「デモデータで試す」を表示（実データがある状態での誤爆
  上書き防止）。投入で`demoDataActive`フラグ（永続化）が立ち、カードが「試用中」表示に変わる。
  「本番データへ切り替える」は二段階確認（JSONエクスポートでの退避案内つき）→全削除→
  基本設定ステップから再開。並行切り替え（本番⇄デモの行き来）はスナップショット機能で代替
- **データ操作の共通化**: `stores/reload-all-stores.ts`に`reloadAllStores`（全21ストア）・
  `loadDemoData`・`clearAllBusinessData`を集約し、DataExport（/reports）と共用。
  移設時の反証で、旧`reloadAllStores`（DataExportローカル関数・14ストア）に後発7ストア
  （actuals/taskSync/wbsTemplate/documentTemplate/projectBaseline/changeRequest/
  billingMilestone）の再読込漏れがあり、クリア・デモ投入後もメモリ上に古いデータが残る
  潜在バグを発見・修正した

### チャットツール通知（Phase 3）

2026-08-17、非公開の設計文書に沿ってサーバー発の通知送出を実装した
（postgresモード専用。完了同期のWebhook「受信」と対をなす「送出」側）。

- **対応プロバイダ6種**: Slack／Microsoft Teams（Workflows、Adaptive Card形式）／Google Chat／
  Discord／Chatwork（APIトークン＋ルームID）／汎用Webhook（共通モデルをそのままJSON送出）
- **2系統の送出**:
  - 即時イベント: 月次締め/解除（`monthlyCloseEvents`のafterCreate）・変更要求の承認/却下
    （`changeRequests`のafterUpdate、pending→決定の遷移時のみ）。fire-and-forgetで業務処理を
    ブロックしない
  - 日次ダイジェスト: アラートセンターと同一の純関数（`shared/utils/alert-utils.ts`）をサーバー
    から再利用し、8種（納期超過・遅延予測・納期接近／検収予定日の接近・経過／リスク対応期限／
    SaaS更新期限／稼働超過／ベースライン乖離／予算超過。検収予定日・リスクの文面は金額を
    含めない=決定事項7維持）を
    重大度順に1通へ集約。envの`NOTIFY_DIGEST_TIME`（HH:MM）で内蔵スケジューラが毎日送信
    （未設定なら無効）。チャンネルごとの`minSeverity`で絞り込み、対象0件なら送らない。
    digestログによる同日再送防止（手動送信APIはバイパス）
- **通知文面に具体的な金額を含めない**（決定事項7。予算超過はダイジェスト専用文面で消化率%のみ）
- **管理**: `/admin/notifications`（`users:manage`権限）でチャンネルCRUD・テスト送信・送信ログ確認。
  Webhook URL・APIトークンはAES-256-GCM暗号化保存の書き込み専用（GETは設定済みフラグのみ、
  PATCHはundefined=変更なし/null=クリア/文字列=再設定の3値）
- **データ**: `notificationChannels`／`notificationLogs`（追記・FKカスケード）はサーバー専用
  エンティティ（EntityMap非登録、localモードには存在しない。usersと同じ整理）

### ドキュメントテンプレート（IPA準拠プリセット）

2026-08-16、各工程で作成するドキュメント（要件定義書・基本設計書等）のマークダウン雛形を
管理する`DocumentTemplate`機能を実装した。設計は非公開の設計文書、
IPA・OKF調査は非公開の設計文書を参照。

- **プリセット**: IPA公開情報（共通フレーム2013・非機能要求グレード2018・機能要件の合意形成
  ガイド・ユーザのための要件定義ガイド第2版）を基にした33テンプレートを
  `shared/data/document-template-master.ts`に固定UUID（`d0c00000-...`連番）で定義。
  初回シード後は通常のテンプレート同様に編集・削除できる
- **OKF準拠**: 本文はOpen Knowledge Format v0.2（Google Cloudが2026-06公開のマークダウン仕様）
  準拠。YAML frontmatter（`type`必須＋`title`/`description`/`tags`推奨＋`status`/`sources`）、
  本文はh2から開始
- **WBSテンプレート紐づけ**: `WbsTemplateNode.documentTemplateIds`で紐づけ。標準WBSテンプレートは
  全工程のドキュメントノードに標準ドキュメントテンプレートを紐づけ済み（デフォルトで使える状態）。
  紐づけ編集は`/wbs-templates`の「ドキュメント」列→`DocumentTemplateLinkDialog`。
  紐づけは弱参照（テンプレート削除時はUI側が存在しないidを除外し、紐づけ保存時に自動掃除）
- 標準WBSテンプレートにはIPA共通フレームの運用プロセスに対応する「運用設計」工程も補完した

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
  npm workspaces化はしない。認証（ID/PASS、JWT）・RBAC（5ロール＋権限マトリクス、下記「ロール・権限設計」参照）・全業務エンティティの
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

## 制約事項

- localStorageモード（既定）はDBを使わない（localStorageでJSON永続化）。postgresモードは上記参照
- ダークモード対応必須
- パスエイリアス: `@/` → `src/`
- E2Eテストはブラウザー: Chromium、ベースURL: `http://localhost:5173`
- Git Hooks: pre-commitでlint-staged（Biome check）、pre-pushでlint + 型チェック + テスト + 依存方向チェック
