# ガードレール — 安全機構の全体像

本ファイルは、プロジェクトに適用されるすべての安全機構をまとめた参照文書。
`CLAUDE.md` の各セクションに分散するルールを一元的に把握できるようにする。

---

## フック一覧

| フック | イベント | 対象 | 動作 | 説明 |
| ------ | -------- | ---- | ---- | ---- |
| `safety-check.sh` | PreToolUse | Bash | ブロック | 危険なシェルコマンドを検出・阻止 |
| `protect-files.sh` | PreToolUse | Edit\|Write | ブロック | 機密ファイル・設定ファイルへの書き込みを阻止 |
| `scan-harness.sh` | PreToolUse | Skill | 警告/ブロック | ハーネス自身の SAST(secret 混入・constitution 改変・local deny の弱体化検出) |
| `user-prompt-submit.sh` | UserPromptSubmit | — | 警告/ブロック | ユーザー入力に機密パターン(API key 等)を検出して警告 or 差し戻し |
| `session-start.sh` | SessionStart | — | 警告 | project-config.md / docs/ / settings.local.json の存在チェック |
| `session-end.sh` | SessionEnd | — | 観測 | セッション終了サマリを `output/reports/sessions/<date>.md` に追記 |
| `commit-quality.sh` | PostToolUse | Bash (git commit) | 警告 | Conventional Commits 形式チェック・シークレット検出 |
| `console-warn.sh` | PostToolUse | Edit\|Write | 警告 | デバッグステートメント（console.log 等）の残存検出 |
| `post-failure-log.sh` | PostToolUse | 全ツール | 観測 | ツール失敗時の構造化エラーログ（`testreport/failures/`） |
| `subagent-audit.sh` | SubagentStop | — | 観測 | サブエージェント完了の記録（`testreport/agents/`） |
| `pre-compact-backup.sh` | PreCompact | — | 観測 | コンパクト直前の会話履歴バックアップ（`testreport/transcripts/`） |
| `notify-claude.sh` | Stop / Notification | — | 通知 | タスク完了時の外部通知（ntfy） |

### Hook profile 切替(2026 拡張)

`BLUEPRINT_HOOK_PROFILE` 環境変数で挙動を切替可能(`user-prompt-submit.sh` / `session-end.sh` / `scan-harness.sh` 対応):

| profile | 用途 | 挙動 |
| ------- | ---- | ---- |
| `minimal` | CI / 自動化 | パススルー(検査スキップ)。最小オーバーヘッド |
| `standard`(既定) | 通常開発 | 検出時は警告のみ(non-blocking) |
| `strict` | 高リスク作業 | 検出時に skill / プロンプトをブロック |

`.envrc` や `direnv` で切り替えるのが推奨。

### フックの動作原則

- **ブロック系**: exit 2 で操作を中止。理由を stderr で通知
  - 例外: `UserPromptSubmit` フックは公式仕様により `exit 0 + stdout JSON {"decision":"block","reason":"..."}` でプロンプトを差し戻す（exit 2 ではない）
- **警告系**: exit 0 で操作は許可。フィードバックを stderr で通知
- **通知系**: exit 0。外部サービスに通知を送信
- **fail-open ポリシー**: JSON パース失敗時は操作を許可（安全側に倒さず、作業を止めない）
- フックは `--dangerously-skip-permissions` モードでも有効（多層防御）

### フックタイプの使い分け

| タイプ | 用途 | 例 |
| ------ | ---- | -- |
| `command` | シェルスクリプトを実行。パターンマッチ・ファイル検査等の決定論的チェック | safety-check.sh, protect-files.sh |
| `prompt` | AIに判断を委ねるプロンプトを実行。文脈依存の柔軟な判定が必要な場合 | 「このBashコマンドは本番環境で安全か評価せよ」 |

- デフォルトは `command` タイプを推奨（決定論的で高速）
- `prompt` タイプはコンテキスト依存の判断が必要な場合のみ使用（トークンを消費する）
- 両タイプを同一イベントに併用可能（command → prompt の順で評価）

### 拡張可能なフックイベント

本テンプレートで実装済み以外の、プロジェクト固有に追加可能なフックイベント:

| イベント | タイミング | 用途例 |
| -------- | ---------- | ------ |
| `PreToolUse` (matcher: `"Task"`) | サブエージェント起動時 | 開始イベント捕捉、環境変数注入 |
| `PreToolUse` (matcher: `"Agent"`) | エージェント spawn 直前 | spawn 前審査 |

> 2026-04 時点で `UserPromptSubmit` / `SessionEnd` / `SubagentStop` / `PreCompact` / `PostToolUse (失敗ハンドリング)` / `PreToolUse (Skill)` は実装済み(本ファイル冒頭のフック一覧参照)。
> 公式の hook イベントは `PreToolUse` / `PostToolUse` / `UserPromptSubmit` / `Notification` / `Stop` / `SubagentStop` / `PreCompact` / `SessionStart` / `SessionEnd` の 9 種類。

`settings.json` に追加する形式:

```json
{
  "UserPromptSubmit": [
    {
      "matcher": "",
      "hooks": [
        { "type": "command", "command": "./scripts/prompt-audit.sh", "timeout": 10 }
      ]
    }
  ]
}
```

---

## Deny ルール（settings.json）

| パターン | 目的 |
| -------- | ---- |
| `Bash(rm -rf *)` | 再帰削除の防止 |
| `Bash(rm -rf /*)` | ルートディレクトリ削除の防止 |
| `Bash(rm -fr *)` | 再帰削除（フラグ順違い）の防止 |
| `Bash(git push --force *)` | 強制プッシュの防止 |
| `Bash(git push -f *)` | 強制プッシュ（短縮形）の防止 |
| `Bash(git reset --hard *)` | ハードリセットの防止 |
| `Bash(git clean -f *)` | 追跡外ファイル一括削除の防止 |
| `Bash(sudo *)` | 特権昇格の防止 |

---

## 保護ファイル一覧

### シークレット・認証情報（protect-files.sh）

| ファイル / パターン | 理由 |
| -------------------- | ---- |
| `.env`, `.env.local`, `.env.production` 等 | 環境変数（シークレット含有の可能性） |
| `id_rsa`, `id_ed25519`, `id_ecdsa`, `id_dsa` | SSH秘密鍵 |
| `credentials.json`, `service-account.json` | クラウド認証情報 |
| `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`, `*.keystore` | 証明書・キーストア |
| `.claude/settings.json`, `.claude/settings.local.json` | Claude Code 設定 |

### ツールチェーン設定（protect-files.sh）

| ファイル / パターン | 理由 |
| -------------------- | ---- |
| `biome.json`, `biome.jsonc` | Biome リンター/フォーマッター設定 |
| `.eslintrc.*`, `eslint.config.*` | ESLint 設定 |
| `.prettierrc.*`, `prettier.config.*` | Prettier 設定 |
| `tsconfig.json`, `tsconfig.*.json` | TypeScript コンパイラ設定 |
| `.editorconfig` | エディタ設定 |

---

## 禁止操作（CLAUDE.md + safety-check.sh）

| 操作 | 理由 |
| ---- | ---- |
| `--no-verify` | Git フックの迂回は禁止 |
| `--force` (git push) | 履歴の破壊は原則禁止 |
| `sudo` | 特権昇格は禁止 |
| `curl \| bash` | リモートスクリプトのパイプ実行は禁止 |
| `chmod 777` | 過剰な権限付与は禁止 |
| `dd if=` / `mkfs` | ディスク操作は禁止 |

---

## 3層防御モデル

```text
Layer 1: フック群(--dangerously-skip-permissions でも有効)
   ├─ PreToolUse: safety-check / protect-files / scan-harness(Skill)
   ├─ PostToolUse: commit-quality / console-warn / post-failure-log
   ├─ UserPromptSubmit: user-prompt-submit
   ├─ SessionStart / SessionEnd: session-start / session-end
   ├─ SubagentStop: subagent-audit
   ├─ PreCompact: pre-compact-backup
   └─ Stop / Notification: notify-claude
  ↓
Layer 2: Deny ルール(settings.json)
  ↓ 通常モードで有効
Layer 3: Allow ルール(settings.local.json)
  ↓ 通常モードでのみ有効
meta : self-SAST(scan-harness.sh が constitution hash / secret 混入 / deny 弱体化を検出)
```

> Layer 1 にはブロック系(`safety-check.sh` / `protect-files.sh` / `scan-harness.sh`) + 観測系(`subagent-audit.sh` / `pre-compact-backup.sh` / `post-failure-log.sh` / `session-end.sh`) + 警告系(`commit-quality.sh` / `console-warn.sh` / `user-prompt-submit.sh`) + 通知系(`notify-claude.sh`) が含まれる。観測・通知系はブロックしないが、`--dangerously-skip-permissions` でも記録・通知が残る点で防御機構の一部として機能する。

- Layer 1 は常に有効。最も信頼性の高い防御層
- Layer 2 は通常モードで自動適用
- Layer 3 はプロジェクト固有の許可ルール（テンプレートから設定）
