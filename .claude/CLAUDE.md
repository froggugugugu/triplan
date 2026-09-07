# 開発ガイド

プロジェクト横断で適用する開発ルール・品質基準・ワークフロー。
全ロール(PM / PdM / 開発 / レビュー / テスト)共通で参照する。

> **本ファイルは "core" として軽量化されている**(Pro 契約 friendly)。
> 詳細は各 skill / team / agent が必要時に `@import` で個別に取得する。
> プロジェクト固有のパラメータは `project-config.md` に集約。

## 全般

- 必ず日本語で応対する
- 調査やデバッグにはサブエージェントを活用してコンテキストを節約する
- 重要な決定事項は定期的にマークダウンファイルに記録する
- CLAUDE.md は横断ルールのみ記載し、詳細な手順はスキルに委譲する

## スキル一覧(全引数省略可)

| スキル | 用途・トリガー |
| ------ | -------------- |
| `/brainstorm <要求メモ>` | `/prd` 前段の Socratic 質問駆動(読取専用) |
| `/prd <ファイル>` | 要求メモから PRD 生成(読取専用) |
| `/architecture <ファイル>` | 要求メモからシステムアーキテクチャ設計(読取専用) |
| `/plan <説明 or ファイル>` | 設計ドキュメント生成(読取専用) |
| `/adr <判断タイトル>` | 設計判断の経緯・根拠を ADR に記録 |
| `/implementing-features <タスク>` | TDD による機能実装・バグ修正 |
| `/ui-ux-design <対象>` | デザインシステム準拠の UI/UX 設計・レビュー・実装 |
| `/hig-compliance <対象>` | Apple HIG 準拠のシステム横断 UI 一貫性チェック |
| `/design-system-audit <対象>` | デザイントークン整合性監査・標準化 |
| `/e2e-testing <対象機能>` | Playwright E2E テスト作成 |
| `/code-review <対象>` | コードレビュー(読取専用) |
| `/security-scan <対象>` | 脆弱性スキャン・OWASP / CVE 監査(読取専用) |
| `/legal-check <対象>` | OSS ライセンス・プライバシー・知財チェック(読取専用) |
| `/performance <対象>` | 計測ファーストのパフォーマンス最適化 |
| `/refactoring <対象>` | 大規模コード再構成・責務移動 |
| `/review-fix <PR番号>` | CodeRabbit/Copilot レビュー指摘の自動修正 |
| `/harness-refine <対象 or 指示>` | ハーネス骨格の自己採点 → 強化 → セルフレビュー(2 ラウンド固定 / 日英ミラー同期必須) |

各 skill は起動時に必要な詳細(`pitfalls.md`、`guardrails.md` 等)を個別に `@import` する。

## チームテンプレート

`.claude/teams/` 配下の `TEAM_*.md` を起動すると multi-agent 編成で動く:

- フルライフサイクル: `TEAM_PJM.md`(推奨)
- 機能開発: `TEAM_FEATURE.md` / 品質保証: `TEAM_QA.md`
- 設計: `TEAM_PLANNING.md` / デザイン: `TEAM_DESIGN.md` / リファクタ: `TEAM_REFACTOR.md`

team 起動時に `.claude/teams/README.md` と `.claude/agents/README.md` が自動 load される。

> **プロファイル別の同梱について**: `.claude/teams/` は `full` プロファイル(`bash setup.sh <dir> --profile full`、デフォルト)でのみ同梱される。`minimal` / `standard` プロファイルではこのディレクトリ自体が存在せず、チーム機能(`TEAM_*.md`)は利用できない。個別の `/skill` コマンドは各プロファイルの同梱範囲内で通常通り利用できる。

## 開発原則

- 仕様が曖昧な場合は推測で進めず、選択肢を 1〜2 つ提示して確認する
- ユーザーデータの削除・上書きは仕様で明示要求された場合のみ
- 保存値と表示値が区別されるならデータモデルと UI で分離する
- 決定論的であること(丸めモード・フォーマット・集計スコープを明確に)
- 過剰設計を避ける — 現要件に必要な最小限の複雑さで実装
- コードから読み取れる情報をドキュメントに重複させない
- 実装は反証しながら進める。正しさの確認だけでなく境界値・異常系で意図的に破ろうとするテストを併記する

## ドキュメント管理(短縮版)

- **人間管理**: `project-config.md`(13 セクション) / `input/requirements/` / `constitution.md`(repo ルート)
- **AI 管理**: `docs/*.md`(プロジェクト派生情報) / `output/`(成果物) / `testreport/`(ツール生データ)
- **AI が更新可能なセクション**: `project-config.md` §2(技術スタック)/ §3(コマンド)/ §11(既知の落とし穴)のみ。§1 / §4-§10 / §12 / §13 は人間決定領域(改変不可)
- **一次更新責務**: `docs/*.md` と `project-config.md` §2/§3 は `/implementing-features` skill が集約。他 skill は発見事項を報告
- **詳細**(競合防止表 / docs 更新の細則):`/implementing-features` が起動時に `@.claude/rules/document-management.md` を load

## アーキテクチャガバナンス

- レイヤー間の依存方向制限。詳細は `project-config.md` §4.4
- 依存方向違反は検出コマンド(`project-config.md` 記載)で確認
- 循環依存は禁止

## 品質基準・ゲート

- TDD(`project-config.md` §6 で有効化時)、ユニット + E2E
- カバレッジ目標は `project-config.md` §6
- **5 つの品質ゲート**: PRD / 設計 / タスク分解 / 実装 / 検証(各 phase で人間介入可)
- 各 phase skill が起動時に `@.claude/quality-gates.md` を load し、ゲート基準を参照する

## 並行開発

- 同一ファイルの同時編集は禁止
- 共有レイヤー変更は逐次
- `teammateMode`: `in-process`(高速)/ `worktree`(分離)を `settings.local.json` で
- PJM チームは `input/` を読み `output/` に成果物生成、PL がタスク分解・割り当て

## 実装ワークフロー

要件確認 → 影響調査 → テスト設計 → **🚏 設計ゲート**
→ 実装 → リファクター → **🚏 実装ゲート** → セルフレビュー → **🚏 最終ゲート**

## 実装チェックリスト(提出前)

- [ ] データモデル/スキーマ変更を明記、UI 動作(編集 vs 読取)を定義
- [ ] コアアルゴリズム(丸め・書式・集計)を明確化
- [ ] 受け入れ基準との対応 / 既存テスト破壊なし / エッジケース考慮
- [ ] 実装変更に伴い `docs/` 更新、依存方向違反なし、`--no-verify` 不使用

## コミュニケーション規約

- 技術的判断には根拠を添える
- 仕様変更は影響範囲を提示してから着手
- レビュー指摘は修正内容と理由をセットで回答
- 不確実な仮定は「【仮定】」と明示

## ツール利用方針

- ドキュメント参照: 1) `docs/` → 2) WebFetch 公式 → 3) Context7 MCP → 4) WebSearch
- Playwright MCP: E2E デバッグ・ビジュアル確認 / draw.io MCP: 図表

## セキュリティ

- ユーザー入力は必ずバリデート / 依存 CVE を定期確認
- **3 層防御**: フック(Layer 1) → deny(Layer 2) → allow(Layer 3)
- フックは `--dangerously-skip-permissions` でも有効
- SessionStart フックが起動時に `project-config.md` / `docs/` / `settings.local.json` をチェック
- 詳細(deny ルール一覧、保護ファイル、permissions ガイド)は `/security-scan` 等のセキュリティ系 skill 起動時に load
- `project-config.md` §10 にプロジェクト固有ポリシーを定義

> **不変原則** (`constitution.md` で全文管理 / `scan-harness.sh` が改変を検知):
> ①人間↔AI 責務分離 / ②日英 2 言語ミラー / ③5 品質ゲート維持 / ④三層分離(skill/team/agent) /
> ⑤3 層防御維持 / ⑥CLAUDE.md ≤200 行 / ⑦シークレット禁止

## Git 操作

- `--no-verify` 禁止 / `--force` 原則禁止 / フック失敗時はフックを無効化せず原因修正
- Conventional Commits 必須(詳細は `/review-fix` / `/implementing-features` skill が `@.claude/rules/git-conventions.md` を load)

## フェーズ別出力スタイル

`.claude/output-styles/` に 4 種同梱(`/output-style phase-prd` 等で切替):

- 要件定義: `phase-prd` / 設計: `phase-design` / 実装: `phase-implementation` / レビュー: `phase-review`

`statusLine`(`.claude/statusline.sh`)が現在のスタイルとフェーズを自動表示。

## ワークフロー制御

### 1. 計画ファースト

非自明タスク(3+ ステップ or アーキテクチャ判断)は計画モードで開始。検証ステップも計画に含める。

### 2. 調査ファースト

実装前に既存コード・パターン・公式ドキュメントを確認。Glob/Grep → WebFetch → Context7 の優先順位。

### 3. サブエージェント戦略

@.claude/agents/README.md  <!-- 既定 subagent 定義集と使い分けガイド -->

メインコンテキストを圧迫しないよう subagent を積極活用。1 subagent = 1 task。

### 4. 詳細手順(必要時のみ load)

自己改善ループ / 完了前検証 / エレガンス追求 / 自律バグ修正 / タスク管理 / 基本原則は
`.claude/rules/workflow-advanced.md` を必要 skill が load する。

## プロジェクト固有情報(常時 load)

@docs/project.md              <!-- 技術スタック・コマンド・ルーティング -->
@docs/architecture.md          <!-- ディレクトリ構成・テスト一覧 -->
@docs/data-model.md            <!-- スキーマ・バリデーション -->
@docs/development-patterns.md  <!-- コード規約・パターン -->

> **フォールバック**: 上記ファイルが存在しない or stub 状態(5 行未満)なら `project-config.md` の該当セクションを直接参照する。
