# コントリビューションガイド

triplan への関心をありがとうございます。個人プロジェクトのため対応の速さは保証できませんが、Issue・Pull Requestは歓迎します。

## 相談・報告の窓口

| 内容 | 窓口 |
| --- | --- |
| バグ報告・機能要望 | [Issue](https://github.com/froggugugugu/triplan/issues/new/choose)（テンプレートあり） |
| 使い方の質問・アイデアの相談 | [Discussions](https://github.com/froggugugugu/triplan/discussions) |
| 脆弱性の報告 | [SECURITY.md](SECURITY.md)（公開Issueには書かないでください） |

大きな変更（新機能・データモデルの変更・依存の追加）は、実装の前にIssueかDiscussionで方向性を合わせてください。手戻りを減らすためです。

## 開発環境

Node.js 22以上・npm 11以上（`.nvmrc`／`package.json` の `engines` 参照）。postgresモードのE2Eとサーバー統合テストにはDockerが必要です。

```bash
npm ci                        # lockfileと完全一致でインストール（改ざん検知を兼ねる）
npm --prefix server ci        # サーバー側
npm run dev                   # localモード（DB不要）で起動 → http://localhost:5173
npm run dev:postgres          # postgresモードをワンコマンドで起動（Docker必須）
```

詳しい起動手順は [README](README.md)、画面の使い方は [利用ガイド](docs/guide/index.md)、コード規約と落とし穴は [docs/development-patterns.md](docs/development-patterns.md) にあります。

## 品質ゲート

ローカルのGit hooks（husky）とCIで同じ検査を行います。フックが失敗したら原因を直してください。`--no-verify` でフックを迂回した変更は取り込みません。

| タイミング | 検査 |
| --- | --- |
| コミット時（pre-commit） | Biome（lint + format、対象は変更ファイルのみ） |
| プッシュ時（pre-push） | Biome check・型チェック（`tsc -b`）・ユニットテスト・依存方向チェック |
| CI（`ci.yml`） | 上記に加えて本番ビルドとサーバーの統合テスト（Testcontainers） |
| CI（`e2e.yml`） | Playwright E2E（Chromium） |
| CI（`security-audit.yml`） | `npm audit --audit-level=high`（PR・push・週次） |
| CI（`codeql.yml`） | CodeQL静的解析 |

手元で一通り回すとき:

```bash
npm run check && npm run build && npm run test:run && npm run depcruise
npm --prefix server run build && npm --prefix server run test:run   # 統合テストはDocker必須
E2E_PORT=5273 npm run e2e                                             # 5173が使用中のとき
```

- テストはテストファーストで書き、正常系だけでなく境界値・異常系・「意図的に壊す」ケースを併せて置いてください
- レイヤーの依存方向（`features` → `shared` → `infrastructure`、`features` 間の直接依存は禁止）は `npm run depcruise` で検査します
- 実装を変えたら `docs/` の該当ページ（ルーティング・ストア・スキーマ・パターン）も同じPRで更新してください

## コミット規約

[Conventional Commits](https://www.conventionalcommits.org/ja/) を必須にしています。release-please がこの形式からバージョンとCHANGELOGを生成するためです。

| プレフィックス | 用途 | バージョン |
| --- | --- | --- |
| `feat:` | 新機能 | minor |
| `fix:` | バグ修正 | patch |
| `docs:` `test:` `refactor:` `perf:` `chore:` `ci:` `build:` | 機能に影響しない変更 | なし |
| `feat!:` または本文に `BREAKING CHANGE:` | 後方互換のない変更 | major |

例: `feat: 見積の段階記録と簡易FPを追加する`、`fix: 締め済み月のアサイン削除を拒否する`

## Pull Request

- `main` へ直接pushはできません。ブランチを切ってPRを作ってください
- PRテンプレートの項目（目的・変更内容・検証方法）を埋めてください。スクリーンショットはUI変更のときだけで構いません
- CIがすべて通っていることが取り込みの条件です
- 1つのPRに複数の種類の変更（機能追加とリファクタなど）を混ぜないでください

## 依存パッケージの追加

- 直接依存は完全一致バージョンで固定します（`.npmrc` の `save-exact=true`）
- 追加の理由と代替案の検討をPRに書いてください
- 更新は Dependabot のPR（週次、パッチ・マイナーはグループ化）に一本化しています。メジャー更新はCIが緑になったものだけを取り込みます

## リリース

`main` へのマージのたびに release-please が「リリースPR」（バージョン更新とCHANGELOG）を作成・更新します。メンテナがそのPRをマージするとタグとGitHub Releaseが作られ、Dockerイメージが GitHub Container Registry へ公開されます。リリースPRはバージョンとCHANGELOGだけを変更するため、通常のCIは走りません（`GITHUB_TOKEN` で作成されたPRはワークフローを起動しない仕様のためです）。
