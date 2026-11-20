# アーキテクチャ

> **このファイルは毎セッション常時ロードされる。** 索引と要約だけを置き、非空行300行以内を保つ。
> 機能の経緯・設計判断・フィールド仕様などの詳細は `docs/reference/` 配下へ書き、ここからは1行で参照する。

## エントリーポイント

`src/main.tsx` → `src/App.tsx`

全ページコンポーネントはルート単位で遅延ロード（`React.lazy`＋`Suspense`）。
AG Grid・Recharts系は`vite.config.ts`の`manualChunks`で名前付きベンダーチャンクへ分離し、
初回表示はフレームワークコア＋対象ページのみを読む（旧: 単一チャンク2.9MB→初回約700KB）。
1000KB超のチャンク再出現はビルド警告＝退行として扱う。

プロバイダー構成（外側から）:

1. `StrictMode`（React）
2. `QueryClientProvider`（React Query、staleTime: 5分、retry: 1）
3. `BrowserRouter`（React Router）

## ディレクトリ構成（Feature-Sliced Design）

各ディレクトリ配下のコンポーネント・ユーティリティの役割は、下表の詳細リファレンスを参照。

```
src/
├── main.tsx / App.tsx     # エントリーポイント・ルーティング定義
├── features/              # 機能単位（components / pages / utils）。features間の直接依存は禁止
│   ├── projects/          # 案件管理・WBS・EVM・商流・リスク登録簿・サマリー・ポートフォリオ
│   ├── members/ team/ companies/   # 担当者・組織階層・所属会社
│   ├── assignment/ actuals/        # アサイン管理／月次実績・CSV取込・月次締め
│   ├── schedule/          # ガントチャート・工程定義
│   ├── budget/ statements/ reports/ estimates/   # 予算・月次明細・レポート・見積（金額系）
│   ├── dashboard/         # アラートセンター・チャート
│   ├── tech-tags/ document-templates/   # マスタ・テンプレート
│   ├── guide-tour/ my-tasks/
│   └── auth/ admin/       # 認証（postgresモード専用）・管理画面（/admin/*）
├── shared/                # features横断で使うもの。featuresへ依存しない
│   ├── components/        # Layout・EvmPanel・各種ガード・ダイアログ・ui/（shadcn/ui）
│   ├── api/ hooks/ data/  # 共有APIクライアント・フック・マスタデータ/デモデータ
│   ├── types/             # Zodスキーマ定義
│   └── utils/             # 純関数のコアロジック（サーバーからも再利用される）
├── infrastructure/        # storage（jsonStorage）・validation・adapters（DataAdapter）
├── stores/                # Zustandストア。featuresへ依存しない
├── test/                  # テストセットアップ
└── lib/                   # cn()ヘルパー

server/                    # postgresモード用APIサーバー（Fastify + Drizzle ORM）。独立したpackage.json
├── src/db/ routes/ auth/ audit/ notifications/ external-tools/ scripts/
└── openapi/v1.yaml        # 公開API v1の仕様書（正本）
```

- featuresから別featureの機能を使いたくなったら、コアを`shared/`へ移してfeatures側をリエクスポートにする
- `shared/utils`はサーバー（`server/`）の`tsc -b`でも型検査される（`noUncheckedIndexedAccess`が効く）

| ファイル | 内容 |
| -------- | ---- |
| [reference/architecture/directory-features-a.md](reference/architecture/directory-features-a.md) | `features/`: projects・members・actuals・assignment・schedule・team・companies・budget |
| [reference/architecture/directory-features-b.md](reference/architecture/directory-features-b.md) | `features/`: tech-tags・dashboard・guide-tour・my-tasks・estimates・document-templates・statements・reports・auth・admin |
| [reference/architecture/directory-shared.md](reference/architecture/directory-shared.md) | `shared/`（components・data・hooks・types・utils）・`infrastructure/`・`stores/`・`lib/` |
| [reference/architecture/server.md](reference/architecture/server.md) | `server/`（db・routes・external-tools・audit・notifications・auth・scripts） |

## テスト構成

テストはコロケーション方式で各モジュールの `__tests__/` ディレクトリに配置。E2Eは`e2e/`（localモード）と
`e2e-postgres/`（postgresモード・Docker必須）。各テストファイルの対象と**反証ケース**は以下の一覧に記録する。

| ファイル | 内容 |
| -------- | ---- |
| [reference/architecture/tests-stores.md](reference/architecture/tests-stores.md) | ストアテスト（`src/stores/__tests__/`） |
| [reference/architecture/tests-features.md](reference/architecture/tests-features.md) | フィーチャーテスト（`features/*/{utils,components,pages}/__tests__/`） |
| [reference/architecture/tests-shared.md](reference/architecture/tests-shared.md) | 共有レイヤーテスト（`shared/`・アダプタ契約テスト・一部ストア） |
| [reference/architecture/tests-infra-server.md](reference/architecture/tests-infra-server.md) | インフラテスト・サーバーテスト（Testcontainers統合テスト含む） |
| [reference/architecture/tests-e2e.md](reference/architecture/tests-e2e.md) | E2Eテスト（Playwright） |

テストを追加・変更したら、該当する一覧ファイルへ1行で追記する（本ファイルには書かない）。

## ドキュメント責務

| ファイル | 責務 |
|---------|------|
| `docs/project.md` | 概要、コマンド、技術スタック、ルート・ストアの索引 |
| `docs/architecture.md` | レイヤー構成の概観、テスト配置方針、ドキュメント責務 |
| `docs/data-model.md` | エンティティ索引、データモデル共通の原則 |
| `docs/development-patterns.md` | コード規約、E2Eテストパターン、落とし穴の索引 |
| `docs/reference/project/` | ルーティング全表、ストア詳細、機能別の仕様・設計判断、永続化 |
| `docs/reference/architecture/` | ディレクトリ構成の詳細、テスト一覧 |
| `docs/reference/data-model/` | Zodスキーマのフィールド仕様、バリデーションルール、Drizzleスキーマ |
| `docs/reference/patterns/` | UI規約・デザインシステム、過去の問題事例（分野別） |

### 分割ルール

- 上の4ファイル（`docs/*.md`）は`CLAUDE.md`から常時ロードされる。**索引と要約のみ**を置き、
  非空行300行以内に保つ（`session-start`フックが超過を警告する）
- 詳細は`docs/reference/<領域>/`へ書く。1ファイルは40KB程度までを目安とし、超えたら主題で分割する
- 既存の記述が「`docs/project.md`「○○」参照」「`development-patterns.md` §10」のように旧位置を
  指している場合は、各本体の索引表から該当するリファレンスへ辿る
