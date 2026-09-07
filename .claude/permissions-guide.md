# Permissions Guide — auto / sandbox / allowlist の3階層運用

Claude Code は許可承認の煩わしさを下げる仕組みを 3 つ用意している。
本テンプレートではプロジェクトの成熟度に応じて段階的に採用することを推奨する。

| 階層 | 役割 | リスクモデル | 推奨フェーズ |
| ---- | ---- | ------------ | ------------ |
| **allowlist** | 既知の安全コマンド・MCP を明示許可 | ホワイトリスト方式。穴あきは確実に拒否 | 全フェーズ(基礎) |
| **auto mode** | 分類器モデルが各操作を評価し、ハイリスクのみ確認 | 黒リスト方式 + 動的判断。誤判定リスクあり | 中〜終盤、CI で安定運用 |
| **sandbox** | OS レベルのファイルシステム / ネットワーク隔離 | コンテナ・名前空間で物理的に遮断 | 信頼境界が低いタスク |

> 詳細仕様: [code.claude.com/docs/en/permissions](https://code.claude.com/docs/en/permissions) /
> [permission-modes](https://code.claude.com/docs/en/permission-modes) /
> [sandboxing](https://code.claude.com/docs/en/sandboxing)

## 1. allowlist(基礎)

`settings.local.json` の `permissions.allow` で運用する。本テンプレートには
`settings.local.json.template` として雛形を同梱済み。プロジェクト固有のコマンド
(ビルドツール / DB CLI 等)を追加するときは:

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run *)",
      "Bash(npx vitest *)",
      "Bash(gh pr *)",
      "mcp__context7__*"
    ]
  }
}
```

### ベストプラクティス

- **deny は `settings.json`(共有)**、**allow は `settings.local.json`(個人)** に分離
- `Bash(rm *)` のような広パターンは禁止。常に具体的サブコマンドで列挙
- MCP は `mcp__<server>__<tool>` の単位で許可。ワイルドカードは慎重に
- 1 行追加のたびに「これを通すと何が起きるか」を確認

## 2. auto mode

`claude --permission-mode auto` で起動。分類器モデルが各ツール呼び出しを評価し、
スコープ外昇格・未知のインフラ操作・敵対的入力起因の操作のみブロックする。

### 推奨用途

- **長時間の自律ワークフロー**: `/loop` や `claude -p` での非対話実行
- **大量ファイルへの一括処理**: fan-out で 1000 ファイル migrate するような場面
- **CI 上のバッチ処理**: 人間が承認できない GitHub Actions 等

### 注意点

- 非対話モード(`-p`)では、分類器が連続でブロックすると abort する
- 分類器は完全ではない。allowlist より「緩い」防御として位置付ける
- 本テンプレートのフック層(safety-check / protect-files)は auto mode でも有効

## 3. sandbox

`claude --sandbox` または `/sandbox` でセッション中に有効化。OS レベルでファイル
システムとネットワークを隔離する。

### 推奨用途

- **未知 / 不信頼コードの実行**: GitHub Issue から拾った PoC スクリプトの試行
- **依存関係の動的検証**: `npm install` 直後の不審パッケージの挙動確認
- **CI から取得した変更のレビュー実行**: 外部 PR の動作確認

### 制約

- ファイル書き込みはサンドボックス内に限定される(リポジトリ外への影響を防ぐ)
- ネットワークは allowlist 形式で許可。デフォルトは閉鎖
- パフォーマンスオーバーヘッドあり(数 % 〜)

## 推奨運用パターン

| シーン | 推奨設定 |
| ------ | -------- |
| 開発初期(セットアップ直後) | allowlist のみ。プロジェクト固有コマンドを追加しながら学習 |
| 安定運用フェーズ | allowlist + auto mode を `/loop` 等の長時間タスクで併用 |
| 高リスク調査(脆弱性検証等) | sandbox を有効化し、別ワークツリーで実行 |
| CI / GitHub Actions | allowlist + `--max-turns N` + `--timeout N` |

## 3 層防御モデルとの整合

本テンプレートのガードレール(`@.claude/guardrails.md`)は 3 層防御を採る:

```text
Layer 1: フック(常時有効、--dangerously-skip-permissions でも有効)
  ↓
Layer 2: deny ルール(settings.json、共有)
  ↓
Layer 3: allow ルール(settings.local.json、個人)
```

permissions-guide のスコープは **Layer 2 + Layer 3**。Layer 1 のフックはこの 3 階層
とは独立して常に動作するため、「auto mode で誤って通った」操作もフックでブロックされる。

## 関連ドキュメント

- `@.claude/guardrails.md` — フック・deny ルール・保護ファイル一覧
- `@.claude/pitfalls.md` — `.claude/settings.local.json` 誤共有等の落とし穴
- `settings.local.json.template` — 雛形(ビルドツール別の差し替えパターン込み)
