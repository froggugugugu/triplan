# 開発ガイド(Claude Code)

ツール共通の開発ルールは `AGENTS.md`(次の行で取り込む)。本ファイルには Claude Code 固有の仕組み(skill / team / subagent / フック / 権限)だけを書く。

@AGENTS.md

> **"core" として軽量化**(Pro 契約 friendly)。詳細な手順は skill / team / agent が必要時に Read する(skill の行頭 `@` は起動時に全文添付されるため使わない)。
> 各行は「消すと Claude が間違えるか?」で判定して残す(公式ガイド)。ツール共通の規則は `AGENTS.md` に書く。

## スキル(説明と引数は skill 一覧に出るので、ここでは順序と例外だけを書く)

- 標準の流れ: `/brainstorm` → `/prd` → `/architecture` → `/plan` → `/implementing-features` →
  `/code-review` + `/security-scan` + `/legal-check` + `/e2e-testing` + `/performance` + `/refactoring`
- 補助: `/ui-ux-design` / `/hig-compliance` / `/design-system-audit` / `/adr`。手動起動のみ: `/review-fix <PR番号>` / `/harness-refine`(日英ミラー同期必須)
- `/code-review` は本テンプレートの読取専用 skill を指す。同梱の bundled 版は `/review` で呼ぶ

各 skill は詳細(`pitfalls.md` 等)を必要時に Read し、期待動作の基準を `evals/evals.json` に持つ。同梱 skill も併用する:
`/verify`(実アプリで動作確認)/ `/btw`(文脈を汚さない脇質問)/ `/goal <完了条件>`(条件を満たすまで継続)/ `/batch`(大量ファイル並列変更)/ `/loop`(既定プロンプトは `.claude/loop.md`)。

## チームテンプレート

`.claude/teams/` 配下の `TEAM_*.md` を起動すると multi-agent 編成で動く:

- フルライフサイクル: `TEAM_PJM.md`(推奨)
- 機能開発: `TEAM_FEATURE.md` / 品質保証: `TEAM_QA.md`
- 設計: `TEAM_PLANNING.md` / デザイン: `TEAM_DESIGN.md` / リファクタ: `TEAM_REFACTOR.md`

team は起動時に `.claude/teams/README.md` と `.claude/agents/README.md` を Read する。差分の網羅レビューは saved workflow `/review-sweep`。
`.claude/teams/` は `full` プロファイル(`setup.sh` の既定)でのみ同梱。`minimal` / `standard` では個別 skill のみ使える。

- Agent Teams は `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` で有効化(既定は無効)
- `teammateMode` は teammate の**表示先**(`in-process` / `auto` / `tmux` / `iterm2`)。
  リポジトリを分離したいときは subagent の `isolation: worktree` を使う
- PJM チームは `input/` を読み `output/` に成果物生成、PL がタスク分解・割り当て

## ルール階層(原本は `.agents/rules/`。`.claude/rules/` のリンク経由で load される)

- `paths:` なし = 全セッション常時 load(`git-conventions.md` のみ)
- `paths:` あり = 該当ファイルを触ったときだけ load(`document-management.md` / `workflow-advanced.md` / `harness-authoring.md`)
- 言語別・レイヤー別ルールは `.example` をコピーし `paths:` を編集して、`setup.sh --relink` で有効化する(skill を足したときも同じ)
- タスク固有の手順は rules ではなく skill に置く。「毎回必ず X」は指示ではなくフックにする

## 品質ゲートの仕組み

- 各 phase skill は `.agents/quality-gates.md` のゲート基準を必要時に参照する
- `verify-gate.sh` がソース編集後の未検証終了(Stop)と完了マーク(TaskCompleted。Task ツールは `settings.json` の env で有効化済み)を検知する(standard=警告 / strict=差し止め)
- 各 skill は `evals/evals.json`(典型 + 境界)を持つ。skill を変えたら `/skill-eval skill=<名>` で with / without の pass rate を比べ、指示文の棚卸しは `/doctor prompt-audit` と `/skill-doctor` で行う

## ツール利用方針

- 調査: コードは Glob/Grep、ドキュメントは 1) `docs/` → 2) WebFetch 公式 → 3) Context7 MCP → 4) WebSearch。Playwright MCP: E2E デバッグ・ビジュアル確認。図は mermaid(グラフは同梱 `/dataviz`)

## セキュリティ(多層防御)

- **多層防御**: sandbox(Layer 0・任意) → フック(Layer 1) → deny/ask(Layer 2) → allow(Layer 3)
- **`--no-verify` 禁止 / `--force` 付きの push は原則禁止**。安全に関わる禁止事項は `AGENTS.md` と重複しても本ファイルに置く(分類器が import 先を読むかは公式に記載が無い)
- `.env` / 秘密鍵 / `*.pem` は `Read()` deny で読み取り自体を遮断し、外向き・不可逆操作(push / merge / publish / apply)は `ask` で毎回確認
- auto mode(v2.1.283 以降は全プランで既定)でも `ask` は必ず確認され、`deny` は分類器より前に効く。分類器は本ファイルも読む
- フックは `--dangerously-skip-permissions` でも有効。`scan-harness.sh` が `constitution.md` の改変を検知する
- SessionStart フックが起動時に `project-config.md` / `docs/` / `settings.local.json` をチェックし、`output/tasks/PROGRESS.md` があれば冒頭を注入する
- 詳細(deny ルール一覧、保護ファイル、権限設計)は `.agents/guardrails.md` と `.claude/permissions-guide.md`

## フェーズ別出力スタイル

`.claude/output-styles/` に 4 種同梱し `/output-style <名>` で切替(いずれも `keep-coding-instructions: true`): 要件定義 `phase-prd` / 設計 `phase-design` /
実装 `phase-implementation` / レビュー `phase-review`。

## ワークフロー制御

### 1. 計画ファースト

非自明タスク(3+ ステップ or アーキテクチャ判断)は計画モードで開始。差分を 1 文で説明できる作業は計画を省く。検証ステップも計画に含める。

### 2. サブエージェント戦略

定義集と使い分けは `.claude/agents/README.md`(常時 import しない)。書込可能な 3 agent は `scope-guard.sh` が書込範囲を強制する。
委譲するのは、並列化できる独立作業・大量の読込・隔離が要る検証に限る。数回のツール呼び出しで済む作業は自分で行う(spawn 深さは `settings.json` で 1 に固定)。
完了直前に fresh context の `/code-review`(バグ)と `verifier` agent(仕様照合)を 1 回ずつ回し、全件報告させて正確性・要件に影響する MUST だけ対応する。

### 3. コンテキスト保全

`/rewind` でファイル・会話をチェックポイントから復元できる(`fileCheckpointingEnabled`)。無関係なタスクの前に `/clear`。
同じ修正を 2 回繰り返したら `/clear` して指示を書き直す。コンパクト時は PreCompact でバックアップし、
SessionStart(`compact`)が中核ルールを即座に再注入する。`paths:` 付き rule と skill 本文は要約で薄れる(詳細は `.agents/guardrails.md`)。

### 4. 詳細手順(必要時のみ load)

自己改善ループ / 完了前検証 / 自律バグ修正 / タスク管理 / 長期タスクの詳細は `.agents/rules/workflow-advanced.md`(ソースを触ると自動 load)。

## コンパクト時の指示(Compact instructions)

コンパクト(要約)では次を必ず保持する: 変更したファイル一覧 / 実行した検証コマンドと結果 / 未完了タスクと次の一手 /
採用・却下した設計判断とユーザーが述べた制約(原文のまま)/ 行き詰まりと試した回避策 / 出力先(`output/`)の規約。ツール出力の生データは捨ててよい。

## プロジェクト固有情報

常時 load するのはコードから読めない情報(コマンド・規約・落とし穴)だけにする。import しても文脈コストは減らない(公式 memory ガイド)。

<!-- triplan: architecture.md / data-model.md は PR #37 で索引化（非空行300行以内）済みのため 4 本とも常時 load を維持する -->
@docs/project.md              <!-- 技術スタック・コマンド・ルーティング・ストア索引 -->
@docs/architecture.md          <!-- レイヤー構成・テスト配置・ドキュメント責務 -->
@docs/data-model.md            <!-- エンティティ索引・データモデル共通の原則 -->
@docs/development-patterns.md  <!-- コード規約・パターン・過去の問題 -->

- 反証しながら実装する: 正しさの確認に加え、境界値・異常系・想定外入力で破ろうとするテストを併記する
- 依存方向（`project-config.md` §4.4）は `npm run depcruise` で、セキュリティ方針は §10 で確認する
