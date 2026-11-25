# ガードレール — 安全機構の全体像

本ファイルは、プロジェクトに適用されるすべての安全機構をまとめた参照文書。
`AGENTS.md` / `CLAUDE.md` の各セクションに分散するルールを一元的に把握できるようにする。

---

## エージェント別の対応(Claude Code / Codex)

フック本体(`.agents/hooks/*.sh`)は 2 つのエージェントで共有する。違うのは登録先と、フックでは表現できない層の実装だけである。
次の「フック一覧」以降は Claude Code 側の設定(`.claude/settings.json`)を基準に書いてあり、Codex 側は本節の表で読み替える。

| 層 | Claude Code | Codex |
| --- | --- | --- |
| Layer 0 サンドボックス | 任意(`sandbox`) | 既定で有効。`.codex/config.toml` の権限プロファイル `blueprint`(書込はワークスペースだけ、ネットワークは都度確認) |
| Layer 1 フック | `.claude/settings.json` の `hooks` | `.codex/hooks.json`。`.agents/hooks/lib/codex-adapter.sh` 経由で同じスクリプトを呼ぶ |
| Layer 2 禁止・確認 | `permissions.deny` / `ask` | `.codex/rules/default.rules` の `forbidden` / `prompt` |
| Layer 2 シークレットの読取禁止 | `Read()` deny | 権限プロファイルの `deny`(同じ 16 対象) |
| Layer 3 個人の許可 | `.claude/settings.local.json` | `~/.codex/config.toml` と `~/.codex/rules/`(リポジトリには置かない) |
| ハーネス自体の保護 | `protect-files.sh` + `config-guard.sh` | 権限プロファイルで `.git` `.agents` `.codex` `.claude/settings*.json` を読取専用にする + `protect-files.sh` |
| サブエージェントの書込範囲 | `scope-guard.sh`(agent frontmatter のフック) | 指示文だけ(下の「同じ保証にならない点」) |

`validate-harness.sh` が、deny / ask と rules、`Read()` deny と権限プロファイルの対応漏れを ERROR にする。片方だけを変えることはできない。

### Codex 側で登録しているフック(`.codex/hooks.json`)

| イベント | 対象 | フック |
| -------- | ---- | ------ |
| SessionStart | — | `session-start.sh` |
| UserPromptSubmit | — | `user-prompt-submit.sh` / `scan-harness.sh`(プロンプト中の最初の `$name` を skill 名として判定する) |
| PreToolUse | Bash | `safety-check.sh`(`--fail-closed`) |
| PreToolUse | apply_patch | `protect-files.sh`(`--fail-closed`) |
| PostToolUse | Bash | `commit-quality.sh` / `verify-gate.sh track` |
| PostToolUse | apply_patch | `console-warn.sh` / `verify-gate.sh track` |
| PermissionRequest | — | `permission-denied-log.sh request` |
| SubagentStart / SubagentStop | — | `subagent-audit.sh` |
| PreCompact | — | `pre-compact-backup.sh` |
| Stop | — | `verify-gate.sh gate` |
| SessionEnd | — | `session-end.sh` |

Codex のファイル編集は `apply_patch` として届き、パッチ本文が `tool_input.command` に入る。アダプタがパッチの触るファイルごとに
`tool_input.file_path` を持つ入力へ直してフックを呼ぶので、フック側は Claude Code と同じ形の入力だけを扱えばよい。

アダプタの解析が Codex 本体の解析と食い違うと、見落としたファイルへの編集が検査を通らずに実行される。そのためブロック系(`--fail-closed`)では、
行の前後の空白と CR を落としてから照合し、次の場合は編集を止める: 指示の語(Add / Update / Delete File、Move to)を含むのに正規の形でない行がある
(全角空白や NBSP での字下げを含む。`+` `-` で始まる本文の行は対象外)/ パスを 1 つも取り出せない /
パスの前後に不可視の空白(NBSP・全角空白など)か制御文字がある / `jq` が無くてパッチを解析できない。Codex でブロック系フックを使うには `jq` が必須である。
この解析はアダプタ独自のもので、Codex 本体の解析と完全に同じである保証は無い。読めない形を止める方向に倒してあるが、秘密情報の保護はフックだけに頼らず、
権限プロファイルの `deny` と合わせて考える。

### Codex で同じ保証にならない点(公式仕様と実測。2026-11-14 / codex-cli 0.162.1)

| 点 | 内容 | 補い方 |
| --- | --- | --- |
| フックは信頼するまで動かない | プロジェクトを信頼し、`/hooks` でフックを確認して信頼するまで実行されない。フックを変えるたびに再度の信頼が要る | 信頼前に効くのは rules と権限プロファイル。導入直後に `/hooks` を開く |
| フックは完全な強制境界ではない | 公式ドキュメントが「有用なガードレールとして扱え」と明記。ホスト側ツール(WebSearch など)はフックを通らない | 例外の無い禁止は rules・権限プロファイル・CI にも置く |
| フェイルクローズの設定が無い | Claude Code の `onFailure: block` に当たるものが無い | フック本体が無いときはアダプタの `--fail-closed` が止める。アダプタ自体を起動できないとき(git リポジトリではないプロジェクトを、ルート以外のディレクトリから起動した場合など)は素通りする |
| サブエージェント単位の制限が無い | カスタムエージェントは親のサンドボックスと権限を継ぐ。エージェント単位のフックも無い | 読取専用と書込範囲を `.codex/agents/*.toml` の指示文の冒頭に書き下している(強制ではない) |
| rules は先頭一致だけ | `git push origin main --force` や `<任意> --no-verify` のように、危険なフラグが引数の途中・末尾にある形は書けない | `safety-check.sh` が正規表現で止める |
| 権限プロファイルは beta | 読み込まれる設定のどこかに `sandbox_mode` があると(`~/.codex/config.toml` や `--sandbox` を含む)旧来の設定が使われ、シークレットの読取禁止が効かなくなる | 個人設定に `sandbox_mode` を書かない。`codex doctor` の `denied-read rules` が 0 でないことを確認する |
| `:workspace` の継承だけでは保護されない | 公式ドキュメントは「継げば `.git` `.agents` `.codex` が読取専用のまま」と書くが、実測では書込めた | 権限プロファイルで明示している(validator が欠落を ERROR にする) |
| 対応するイベントが無い | `config-guard.sh`(ConfigChange)/ `instructions-log.sh` / `post-failure-log.sh` / `post-compact-restore.sh` / `verify-gate.sh` の task・teammate / 通知(`notify-claude.sh`) | 設定の保護は権限プロファイルが担う。通知は `~/.codex/config.toml` の `notify` |
| team と saved workflow が無い | Claude Code の拡張 | 同じ skill を順に実行する |

どちらのエージェントにも依存させたくない禁止事項(シークレット、`--no-verify`、`--force` 付きの push)は、git フックと CI にも置く。

---

## フック一覧(18 スクリプト / settings 27 登録 + agent frontmatter 3 登録)

| フック | イベント | 対象 | 動作 | 説明 |
| ------ | -------- | ---- | ---- | ---- |
| `safety-check.sh` | PreToolUse | Bash | ブロック | 危険なシェルコマンドを検出・阻止 |
| `protect-files.sh` | PreToolUse | Edit\|Write\|NotebookEdit | ブロック | 機密ファイル・設定ファイルへの書き込みを阻止 |
| `scan-harness.sh` | PreToolUse | Skill | 警告/ブロック | ハーネス自身の SAST(secret 混入・constitution 改変・local deny の弱体化検出) |
| `scan-harness.sh` | **UserPromptExpansion** | `*`(slash command) | 警告/ブロック | `/skill` の直接入力は PreToolUse(Skill) を通らないため、同じ判定(高リスク skill 抑止・self-SAST)を展開前にかける |
| `scan-harness.sh filechanged` | **FileChanged** | `constitution.md` | 警告 + 記録 | Edit 以外(`sed -i`・外部エディタ)による `constitution.md` の改変をファイル監視で検知(ブロック不可。`testreport/config-changes/`) |
| `user-prompt-submit.sh` | UserPromptSubmit | — | 警告/ブロック | 機密パターン検出 |
| `session-start.sh` | SessionStart | `startup` 等 / **`compact`** | 警告 + 文脈注入 | 起動時は project-config.md / docs/ / settings.local.json のチェックと PROGRESS.md 注入。コンパクト直後は中核ルールを即座に再注入 |
| `session-end.sh` | SessionEnd | — | 観測 | セッション終了サマリを `output/reports/sessions/<date>.md` に追記 |
| `commit-quality.sh` | PostToolUse | Bash(`if: Bash(git commit *)`) | 警告 | Conventional Commits 形式チェック・シークレット検出。`if` で git commit のときだけ起動 |
| `console-warn.sh` | PostToolUse | Edit\|Write | 警告 | デバッグステートメント(console.log 等)の残存検出 |
| `verify-gate.sh track` | PostToolUse | Bash\|Edit\|Write\|NotebookEdit | 観測 | ソース編集 / 検証コマンド実行の時刻を記録(`testreport/.verify/`) |
| `verify-gate.sh gate` | **Stop** | — | 警告/差し戻し | 編集後に検証コマンドが無ければ standard=警告 / strict=1 回差し戻し(検証ゲート) |
| `verify-gate.sh task` | **TaskCompleted** | — | 警告/差し止め | 同条件でタスクの完了マークを standard=警告 / strict=exit 2 で差し止め(品質ゲート③の機械強制) |
| `verify-gate.sh teammate` | **TeammateIdle** | — | 警告/差し止め | agent teams の teammate が手待ちに入る直前に同条件を判定(strict=exit 2 で作業継続を求める) |
| `permission-denied-log.sh` | **PermissionDenied** | `*` | 観測 | auto mode の分類器による拒否を記録(`testreport/denials/`) |
| `permission-denied-log.sh request` | **PermissionRequest** | `*` | 観測 | 権限ダイアログが出た / 無人実行(dontAsk・background subagent)で自動拒否された呼び出しを `kind=request` で記録。allow ルール追加の材料 |
| `config-guard.sh` | **ConfigChange** | `*` | 記録 + ブロック | 設定変更を記録し、`disableAllHooks` / local の deny 定義 / Layer 1 ブロック系フックの削除はセッションへの適用を止める(`testreport/config-changes/`) |
| `scope-guard.sh <scope>` | PreToolUse(**agent frontmatter**) | Edit\|Write\|NotebookEdit | ブロック | 書込可能な subagent の範囲外書込を阻止(doc-synchronizer=docs / doc-writer=output / test-writer=tests) |
| `post-failure-log.sh` | **PostToolUseFailure** | `*` | 観測 | ツール失敗時の構造化エラーログ(`testreport/failures/`) |
| `post-failure-log.sh` | **StopFailure** | `*` | 観測 | API エラー(rate_limit / overloaded / billing_error 等)でターンが終了した事実を `tool=api:<error>` で記録 |
| `instructions-log.sh` | **InstructionsLoaded** | `*` | 観測 | CLAUDE.md / rules が context に載った事実(`load_reason`)を記録(`testreport/instructions/`)。rule 棚卸しの実測値 |
| `subagent-audit.sh` | **SubagentStart** | — | 観測 + 文脈注入 | 起動記録 + サブエージェントへガードレールを注入 |
| `subagent-audit.sh` | SubagentStop | — | 観測 | 完了記録(`testreport/agents/`) |
| `pre-compact-backup.sh` | PreCompact | — | 観測 | コンパクト直前の会話履歴バックアップ(`testreport/transcripts/`) |
| `post-compact-restore.sh` | **PostCompact** | — | 観測 | 圧縮後の要約を `testreport/transcripts/` に保全 |
| `notify-claude.sh` | Stop / Notification / **StopFailure** | — | 通知(async) | タスク完了・入力待ち・API エラー停止の外部通知(ntfy) |

### フェイルクローズ(`onFailure: block`)

フックは既定で **fail-open**: スクリプトが起動できない(パス間違い・実行権限なし)、タイムアウトした、想定外の exit code を返したとき、
操作はそのまま通る。壊れた安全フックは「無い」のと同じになる。ブロック系の 4 本には `onFailure: "block"`(v2.1.295)を付け、
フック自身の故障時は操作を止める(fail-closed):

| フック | 登録先 | 故障時 |
| ------ | ------ | ------ |
| `safety-check.sh` / `protect-files.sh` | `settings.json` PreToolUse | ツール呼び出しをブロック |
| `config-guard.sh` | `settings.json` ConfigChange | 設定変更をセッションに適用しない |
| `scope-guard.sh` | agent frontmatter(3 agent) | subagent の書込をブロック |

スクリプト内部の fail-open(jq 不在・パース失敗で exit 0)は維持する。`onFailure` が守るのは「フックが走れなかった」場合で、
「走ったが判定できなかった」場合は作業を止めない。観測系・警告系には付けない(ログの失敗で作業を止める理由がない)。
`validate-harness.sh` は上記 4 本に `onFailure: block` が無いと WARN する。

### コンパクト対策(SessionStart の compact source)

コンテキストのコンパクト後に指示が薄れる問題(pitfalls #21)への対策:

```text
PreCompact   → pre-compact-backup.sh   会話履歴を testreport/transcripts/ に退避
PostCompact  → post-compact-restore.sh 圧縮後の要約を testreport/transcripts/ に保全(副作用のみ)
SessionStart → session-start.sh        source == "compact" のとき、中核ルールと PROGRESS.md の冒頭を
  (compact)                            additionalContext で圧縮後のコンテキストに即座に再注入
```

> **なぜ SessionStart か**: `PostCompact` は公式仕様上 **decision control を一切持たない**
> (`additionalContext` も返せない)side-effect 専用イベント。公式の再注入パターンは
> `SessionStart` の `compact` matcher で、その出力は次のプロンプトを待たずに圧縮後の
> コンテキストへ追加される。ルート CLAUDE.md・AGENTS.md・`paths:` なし rule はディスクから
> 自動で再注入されるが、`paths:` 付き rule と skill 本文(skill ごと 5,000 トークン上限)は薄れる。

> **idle compaction**(v2.1.299 以降): 200K トークン超の会話を約 54 分放置すると、キャッシュ失効前に自動でコンパクトされる。
> 席を離れる前に PROGRESS.md を更新しておけば、戻ったときの再注入は上と同じ経路で効く。止めるなら `"idleCompaction": false`。

### 検証ゲート(Stop フック)

公式ベストプラクティス「Claude に検証手段を与え、Stop フックで決定論的にゲートする」の実装。
「動くはず」で終わる trust-then-verify gap(pitfalls #19)を機械的に塞ぐ。

```text
PostToolUse → verify-gate.sh track   ソース編集 / 検証コマンドのタイムスタンプを記録
Stop        → verify-gate.sh gate    最後の編集より後に検証コマンドが無ければ:
                                        standard: systemMessage で人間に警告
                                        strict:   decision:block で 1 回だけ差し戻し
```

- 検証コマンドの判定: `npm test` / `vitest` / `jest` / `pytest` / `cargo test` / `go test` / `tsc` /
  `eslint` / `biome` / `playwright test` / `make test` など(スクリプト内 `VERIFY_PATTERNS`。プロジェクトに合わせて追記可)
- 対象外: `docs/` `output/` `input/` `.claude/` `.github/` と `.md` / `.json` / `.yaml` / `.toml` の編集
- `stop_hook_active: true`(自分の差し戻し後)と `background_tasks` 非空(待機中)は必ず通す(pitfalls #27)
- strict の差し戻しは 1 回だけ。Claude Code 自身も Stop / SubagentStop の連続ブロックを 8 回で打ち切る(`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`。`0` で無制限)
- 会話内で柔軟な完了条件を判定させたいときは `/goal <条件>`(モデル評価、セッション限り)を併用する
- 回帰テスト: `bash scripts/validate-harness.sh --hooks` が全フックに hook JSON を流して exit code / 出力を検証する(CI でも実行)

### 実行環境ごとの挙動

フックはターミナル / IDE 拡張 / Desktop アプリ / Claude Code on the web の
**すべてで同じイベントが発火する**。ただし到達できる先が異なるため、
本テンプレートのフックは環境によって効き方が変わる。

| | ターミナル / IDE / Desktop | Claude Code on the web（クラウド） | CI（`claude -p`） |
| --- | --- | --- | --- |
| ローカルファイル | ✅ 永続 | ⚠️ **fresh clone**。`testreport/` はセッション終了で消える | ⚠️ ジョブ終了で消える（artifact 化が必要） |
| `notify-claude.sh`（ntfy 送信） | ✅ | ⚠️ 環境のネットワーク設定に依存（既定は制限あり） | ❌ 無意味（`BLUEPRINT_HOOK_PROFILE=minimal` で止める） |
| `session-end.sh` / `pre-compact-backup.sh` | ✅ | ⚠️ 出力は永続しない | ⚠️ 同左 |
| `safety-check.sh` / `protect-files.sh` | ✅ | ✅ | ✅ |
| MCP サーバー | `.mcp.json` | 環境ごとに設定したコネクタ | `.mcp.json`（`--bare` 時は読まれない） |
| 権限プロンプト | 対話 | 自律実行（プロンプトなし） | `--permission-mode` に従う |

**推奨設定**:

- クラウド / CI では `BLUEPRINT_HOOK_PROFILE=minimal` にする。
  観測系フックの出力が永続しない環境で書き込みコストだけ払うのを避けられる
- 監査ログを残したいクラウド実行では、`testreport/` を成果物として
  明示的に取り出す（CI なら `actions/upload-artifact`）
- クラウド環境ではネットワークアクセスが既定で制限される。
  `WebFetch` や外部 MCP に依存する skill は事前に環境設定を確認する

### 定期実行の選び方

「毎週セキュリティ監査を回す」のような定期実行には 3 つの選択肢があり、
**恒久性が大きく異なる**。

| | セッション内（`/loop`・`CronCreate`） | GitHub Actions `schedule` | Routines（クラウド） |
| --- | --- | --- | --- |
| セッション起動が必要 | **必要**（idle のときだけ発火） | 不要 | 不要 |
| 恒久性 | ⚠️ recurring は **7 日で失効** | ✅ | ✅ |
| 最小間隔 | 1 分 | 5 分（実際は遅延あり） | 1 時間 |
| ローカルファイル | ✅ | ✅（clone） | ❌（fresh clone） |
| 新規会話で消える | **消える** | — | — |

- **リポジトリの定期監査には GitHub Actions を使う**。同梱の
  `claude-scheduled-audit.yml.template` が週次で `/security-scan` と
  `/legal-check` を回し、結果を Issue に集約する
- `/loop` はセッション中の短期ポーリング（ビルド待ち等）に限る
- 無人の `/loop`・予約タスクは、`allowed-tools` か `hooks` を宣言した skill を起動前に確認する(v2.1.325)。
  本テンプレートの skill は全て該当するため、ループで使う読取専用の `/code-review` だけ `settings.local.json.template` の allow に `Skill(code-review)` を載せている
- 間隔なしの `/loop` は、次の反復を予約せずに終えたターンで終了する(v2.1.319。旧挙動は `CLAUDE_CODE_LOOP_KEEPALIVE=1`)
- 見ていない端末セッションを確認待ちで止めないなら `permissions.denyInsteadOfPrompting: true`(v2.1.319)。確認が要る呼び出しは拒否され、
  `permission-denied-log.sh` が記録する。`~/.claude/settings.json` か `--settings` でしか効かない(project settings では無視される)
- Actions の cron は `:00` を避ける（混雑して遅延しやすい）
- Routines(`/schedule`)は最小間隔 1 時間で、権限プロンプト無しに走る(含めたコネクタの書込ツールも確認なし)。
  含めるリポジトリ・コネクタ・環境を最小にし、緑のステータスを「成功」と読まずトランスクリプトを確認する

### コントロールの棚卸し(harness rot 対策)

ハーネスの各要素は「モデルがまだ自力でできないこと」の仮定を 1 つずつ符号化している。モデル世代が上がると仮定は陳腐化し、
残った指示は context を食うだけでなく互いに矛盾して従われなくなる。`/harness-refine` の Round 0 で次を棚卸しする:

| 種別 | 判断材料 | 剪定の基準 |
| ---- | -------- | ---------- |
| 指示(CLAUDE.md / rules / skill 本文) | `testreport/instructions/`(load 実績)、`/doctor prompt-audit`(旧世代向けの書き方・存在しない参照・矛盾)、`/skill-doctor`(未使用 skill と一覧コスト) | 直近 N セッションで load も発動も無い `paths:` 付き rule、消しても挙動が変わらない行は消す |
| 強制(hook / deny / ask) | `testreport/denials/`(拒否・ダイアログ)、`testreport/config-changes/`、`testreport/failures/` | **発火が無くても消さない**(安全・不可逆操作の規則に限る。好みを符号化したフックは消す)。由来の pitfall 番号か事故を本ファイルに残し、仕様変更で無意味になったものだけ外す |
| 検証(verify-gate / evals) | `testreport/evals/` の pass rate、`validate-harness.sh --hooks` | 新モデルで同じ eval を回し、下がっていなければ指示側の冗長な検証文を削る |

ルール: 強制は「事故 → 対策」の記録(`pitfalls.md` の番号)を持つ。指示は「消すと Claude が間違えるか?」で毎回判定する。
モデル更新のたびに 1 つずつ外して eval で確かめる(複数同時に外すと原因が分からない)。
集計は `bash .agents/scripts/harness-stats.sh --since 30` で出す(`testreport/` の JSONL を拒否・失敗・設定変更・rule の load・subagent 起動ごとに
集計した Markdown。`--json` で機械可読)。skill の寄与は `/skill-eval` か、テンプレート元リポジトリの `scripts/run_skill_evals.py` の pass rate で測る。

公式の目安: 強制(hook / deny)は「例外が 1 つも無い規則」にだけ使い、好みを符号化したフックは消して Claude の判断に戻す。
本テンプレートのブロック系は 5 本 + deny / ask ルールで、残りは観測・通知系。強制が 40 個に近づいたら大半は好みだと疑う。

### 組織展開(managed settings / OpenTelemetry)

個人が上書きできない組織ポリシーとして固定する場合は managed settings を使う。同梱の
`.claude/managed-settings.example.json` に deny / `disableBypassPermissionsMode` / sandbox /
OpenTelemetry(`CLAUDE_CODE_ENABLE_TELEMETRY` + OTLP エクスポータ)/ `requiredMinimumVersion` の例を置いている。
本テンプレートの `testreport/` ログは machine-local なので、チーム横断の利用量・skill 使用率は OTel で集約する
(`OTEL_LOG_TOOL_DETAILS=1` で skill 名が記録され、未使用 skill を特定できる)。

- **セッション間メッセージ**: 同一マシンの他セッションから、指示に見える文面が届きうる。`settings.json` の `isolatePeerMachines: true`
  (マシン外へ送る前に必ず確認。project 設定からも有効)を既定にし、CI や無人実行では `crossSessionInbound: "refuse"` と
  `permissions.deny` の `SendMessage` / `ListAgents` で両方向を止める(例は `managed-settings.example.json`)
- **OpenTelemetry でのガードレール集計**: `claude_code.safety_event`(v2.1.307)は v2.1.312 で送信されなくなった(docs には記述が残る)。
  フリート横断の発火率は `claude_code.tool_decision`(`decision: reject`、`source: config | hook | user`、auto mode の判定は `classifier_verdict`)で取り、
  どの規則が止めたかは本テンプレートの `testreport/denials/` / `config-changes/` / `failures/` の JSONL で補う
- **agent memory はコードレビュー対象**: `memory: project` の学習は `.claude/agent-memory/<name>/` にコミットされ、次回以降の subagent が指示として読む。
  PR でこの配下が変わったら「指示の変更」として読む(メモリ経由のプロンプトインジェクション対策)

### Hook profile 切替

`BLUEPRINT_HOOK_PROFILE` 環境変数で挙動を切替可能
(`user-prompt-submit.sh` / `session-end.sh` / `scan-harness.sh` / `post-compact-restore.sh` / `subagent-audit.sh` /
`verify-gate.sh` / `permission-denied-log.sh` / `config-guard.sh` / `instructions-log.sh` 対応。`config-guard.sh` は minimal でだけ無効になり、standard と strict は同じ):

| profile | 用途 | 挙動 |
| ------- | ---- | ---- |
| `minimal` | CI / 自動化 | パススルー(検査スキップ)。最小オーバーヘッド |
| `standard`(既定) | 通常開発 | 検出時は警告のみ(non-blocking) |
| `strict` | 高リスク作業 | 検出時に skill / プロンプトをブロック。未検証の終了を差し戻し |

`.envrc` や `direnv` で切り替えるのが推奨。

### フックの動作原則(公式仕様)

- **exit 2 = ブロック**。stderr がブロック理由として Claude に返る
  - 例外: `UserPromptSubmit` は `exit 0 + stdout JSON {"decision":"block","reason":"..."}` で差し戻す
- **exit 0 の stderr は debug log 止まり** — Claude にもユーザーにも届かない
  - 警告を Claude に伝えるには **stdout に `hookSpecificOutput.additionalContext` を出す**
  - 本テンプレートの警告系フックは共通の `emit_context()` でこれを実装している
- **stdout の解釈は先頭 1 文字で決まる**: `{` なら JSON、それ以外はプレーンテキスト
  - プレーンテキストが文脈として渡るのは `UserPromptSubmit` / `UserPromptExpansion` / `SessionStart` のみ
- **fail-open ポリシー**: JSON パース失敗・jq 不在時は操作を許可(作業を止めない)
- **`async: true`**: 外部通信など遅いフックはバックグラウンド実行にできる
  - ただし async フックは `decision` / `permissionDecision` / `continue` を返せない
  - 本テンプレートでは `notify-claude.sh`(ntfy 送信)のみ async
- フックは `--dangerously-skip-permissions` モードでも有効(多層防御)
- **Stop フックの差し戻しは 8 回連続で Claude Code に無視される**。`stop_hook_active` を見て 1 回で通す設計にする
- ハンドラの追加フィールド: `if`(権限ルール構文で発火条件を絞る。例 `"if": "Bash(git *)"`。ツール系 5 イベント限定・best-effort なので安全用途には使わない)/
  `once`(初回成功後に解除。skill frontmatter のフックのみ)/ `asyncRewake`(バックグラウンド実行し exit 2 で Claude を起こす)/ `args`(exec 形式)/ `statusMessage` /
  `onFailure`(`block` でフック自身の故障時に操作を止める。上記「フェイルクローズ」)

### イベント別の decision 可否(抜粋)

| イベント | 制御 |
| -------- | ---- |
| `PreToolUse` | `hookSpecificOutput.permissionDecision`(allow / deny / ask / defer) |
| `UserPromptSubmit` / `PostToolUse` / `PostToolUseFailure` / `Stop` / `SubagentStop` / `PreCompact` | トップレベル `decision: "block"` + `reason` |
| `SessionStart` / `Setup` / `SubagentStart` | **文脈注入のみ**(`additionalContext`)。ブロック不可 |
| `ConfigChange` | トップレベル `decision: "block"` か exit 2 で変更の適用を止める(`policy_settings` は不可。ブロックの文言は誰にも表示されない) |
| `UserPromptExpansion` / `TeammateIdle` / `TaskCompleted` | exit 2 でブロック(展開の中止 / 手待ちの差し止め / 完了マークの差し止め)。`UserPromptExpansion` はプレーンテキストの stdout も文脈として渡る |
| `PostCompact` / `SessionEnd` / `Notification` / `FileChanged` 等 | **制御なし**。ログ・クリーンアップ等の副作用専用 |

### フックタイプの使い分け

| タイプ | 用途 | 例 |
| ------ | ---- | -- |
| `command` | シェルスクリプトを実行。パターンマッチ・ファイル検査等の決定論的チェック | safety-check.sh, protect-files.sh |
| `prompt` | AI に判断を委ねる。文脈依存の柔軟な判定が必要な場合 | 「この Bash コマンドは本番環境で安全か評価せよ」 |
| `http` | 外部エンドポイントに POST。集中管理・監査基盤との連携 | 組織共通の監査サーバー |
| `mcp_tool` | MCP ツールを直接呼ぶ | — |
| `agent` | subagent がツール(Read / Grep / Bash 等)で条件を検証してから判定 | Stop 時に「テストが全件通っているか実行して確認せよ」(実験的) |

- デフォルトは `command` を推奨(決定論的で高速)
- `prompt` / `agent` はコンテキスト依存の判断が必要な場合のみ(トークンを消費する)。`/goal` は prompt 型 Stop フックのセッション限定版
- 同一イベントに複数タイプを併用可能

### 未使用の公式フックイベント(拡張の余地)

本テンプレートで未使用だが、プロジェクト固有に追加できるイベント:

| イベント | タイミング | 用途例 |
| -------- | ---------- | ------ |
| `Setup` | `--init-only` / `-p --init` 実行時 | CI での依存インストール・定期クリーンアップ |
| `PreModelSwitch` / `PostModelSwitch` | `/model` 等でモデルを切り替える前後 | 高コストモデルへの切替の確認・監査(切替はキャッシュを無効化する) |
| `PostToolBatch` | 並列ツール実行の一括完了時 | バッチ単位の検証 |
| `TaskCreated` | タスク作成時(Task ツールは Claude 5 系では `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` が要る。本テンプレートは設定済み) | タスク命名規約の強制 |
| `WorktreeCreate` / `WorktreeRemove` | worktree 作成・削除時 | 分離環境のセットアップ |
| `CwdChanged` / `DirectoryAdded` | 作業ディレクトリの変更・追加時 | 環境変化の監査(direnv の再読込など) |
| `MessageDisplay` | アシスタント出力の表示時 | 表示内容のマスキング |
| `Elicitation` / `ElicitationResult` | MCP のフォーム入力時 | 自動応答 |

`settings.json` に追加する形式:

```json
{
  "hooks": {
    "TaskCompleted": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "./scripts/gate-check.sh", "timeout": 30 }
        ]
      }
    ]
  }
}
```

---

## Deny ルール(settings.json)

### 破壊的シェル操作

| パターン | 目的 |
| -------- | ---- |
| `Bash(rm -rf *)` / `Bash(rm -rf /*)` / `Bash(rm -fr *)` | 再帰削除の防止 |
| `Bash(git push --force *)` / `Bash(git push -f *)` | 強制プッシュの防止 |
| `Bash(git reset --hard *)` | ハードリセットの防止 |
| `Bash(git clean -f *)` | 追跡外ファイル一括削除の防止 |
| `Bash(sudo *)` | 特権昇格の防止 |
| `Bash(chmod 777 *)` | 過剰な権限付与の防止 |
| `Bash(dd if=*)` / `Bash(mkfs*)` | ディスク破壊操作の防止 |
| `Bash(* --no-verify)` / `Bash(* --no-verify *)` | Git フック迂回の防止 |
| `Skill(skill:deploy)` / `Skill(skill:deploy-*)` / `Skill(skill:*-deploy)` | deploy 系 skill の起動禁止 |
| `Skill(skill:production-*)` / `Skill(skill:*-production)` | production 系 skill の起動禁止 |

> `Tool(param:value)` 形式で任意ツールのトップレベル入力パラメータを deny/ask できる。
> `Skill` の `skill` パラメータもその対象なので、高リスク skill を permission 層で止められる。
> `scan-harness.sh` は同じ判定を profile で緩められる運用層として二重化している。

### シークレットの読み取り禁止(新規)

`protect-files.sh` は `Edit`/`Write` 系しか見ないため、**読み取り**は permissions で塞ぐ。
`Read(...)` の deny は Edit/Write もあわせてブロックし、`cat` / `head` / `sed` 等
Claude Code が認識する Bash のファイルコマンドにも適用される。

| パターン | 目的 |
| -------- | ---- |
| `Read(./.env)` / `Read(./.env.*)` | 環境変数ファイル |
| `Read(./secrets/**)` | シークレット置き場 |
| `Read(.npmrc)` | レジストリトークン |
| `Read(credentials.json)` / `Read(service-account.json)` | クラウド認証情報 |
| `Read(id_rsa)` / `Read(id_ed25519)` / `Read(id_ecdsa)` / `Read(id_dsa)` | SSH 秘密鍵 |
| `Read(*.pem)` / `Read(*.key)` / `Read(*.p12)` / `Read(*.pfx)` / `Read(*.jks)` / `Read(*.keystore)` | 証明書・キーストア |
| `Edit(./.env)` / `Edit(./.env.*)` / `Edit(*.pem)` / `Edit(*.key)` | NotebookEdit も含めて改変を禁止 |

> **注意**: Read/Edit の deny は Claude の組み込みファイルツールと認識可能な Bash コマンドにしか効かない。
> Python / Node スクリプトが間接的に開くファイルまでは止まらない。
> OS レベルで完全に塞ぐには `sandbox` を有効化する(後述)。

### Ask ルール(確認を挟む操作)

`acceptEdits` / `bypassPermissions` でも**必ず確認を挟む**外向き・不可逆操作:

| パターン | 目的 |
| -------- | ---- |
| `Bash(git push *)` | リモートへの反映は毎回確認 |
| `Bash(gh pr merge *)` / `Bash(gh release *)` / `Bash(gh repo delete *)` | マージ・リリース・削除 |
| `Bash(npm publish *)` / `Bash(yarn publish *)` / `Bash(pnpm publish *)` | パッケージ公開 |
| `Bash(docker push *)` | イメージ公開 |
| `Bash(kubectl apply *)` / `Bash(kubectl delete *)` | クラスタ変更 |
| `Bash(terraform apply *)` / `Bash(terraform destroy *)` | インフラ変更 |
| `Bash(curl *)` / `Bash(wget *)` | 任意 URL への通信(URL 制限は WebFetch(domain:...) 側で行う) |

> `deny` > `ask` > `allow` の順で評価される。`settings.local.json` の allow に
> `Bash(git push *)` を書いても ask が優先される(意図的な設計)。

---

## 保護ファイル一覧

### シークレット・認証情報(protect-files.sh + deny ルール)

| ファイル / パターン | 理由 |
| -------------------- | ---- |
| `.env`, `.env.local`, `.env.production` 等 | 環境変数(シークレット含有の可能性) |
| `id_rsa`, `id_ed25519`, `id_ecdsa`, `id_dsa` | SSH 秘密鍵 |
| `credentials.json`, `service-account.json` | クラウド認証情報 |
| `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`, `*.keystore` | 証明書・キーストア |
| `.claude/settings.json`, `.claude/settings.local.json` | Claude Code 設定 |

### ツールチェーン設定(protect-files.sh)

| ファイル / パターン | 理由 |
| -------------------- | ---- |
| `biome.json`, `biome.jsonc` | Biome リンター/フォーマッター設定 |
| `.eslintrc.*`, `eslint.config.*` | ESLint 設定 |
| `.prettierrc.*`, `prettier.config.*` | Prettier 設定 |
| `tsconfig.json`, `tsconfig.*.json` | TypeScript コンパイラ設定 |
| `.editorconfig` | エディタ設定 |

---

## 禁止操作(AGENTS.md / CLAUDE.md + safety-check.sh)

| 操作 | 理由 |
| ---- | ---- |
| `--no-verify` | Git フックの迂回は禁止 |
| `--force` (git push) | 履歴の破壊は原則禁止 |
| `sudo` | 特権昇格は禁止 |
| `curl \| bash` | リモートスクリプトのパイプ実行は禁止 |
| `chmod 777` | 過剰な権限付与は禁止 |
| `dd if=` / `mkfs` | ディスク操作は禁止 |

---

## 3 層防御モデル

```text
Layer 0: OS サンドボックス(任意 / settings.local.json で opt-in)
   └─ sandbox.enabled = true で Bash をサンドボックス実行。
      任意のサブプロセスによるファイル・ネットワークアクセスまで OS レベルで制限
  ↓
Layer 1: フック群(--dangerously-skip-permissions でも有効)
   ├─ PreToolUse: safety-check / protect-files / scan-harness(Skill)
   ├─ UserPromptExpansion: scan-harness(/skill の直接入力)
   ├─ PostToolUse: commit-quality / console-warn / verify-gate(track)
   ├─ PostToolUseFailure / StopFailure: post-failure-log
   ├─ PermissionRequest / PermissionDenied: permission-denied-log
   ├─ ConfigChange: config-guard(防御層を弱める設定変更をセッションに適用させない)
   ├─ FileChanged(constitution.md): scan-harness(ディスク上の改変を検知)
   ├─ UserPromptSubmit: user-prompt-submit
   ├─ SessionStart / SessionEnd / InstructionsLoaded: session-start / session-end / instructions-log
   ├─ SubagentStart / SubagentStop: subagent-audit
   ├─ PreCompact / PostCompact: pre-compact-backup / post-compact-restore
   ├─ Stop / TaskCompleted / TeammateIdle: verify-gate(検証ゲート)
   └─ Stop / StopFailure / Notification: notify-claude(async)
  ↓
Layer 2: Deny / Ask ルール(settings.json — チーム共有)
   ├─ deny: 破壊的操作・シークレット読取を無条件で遮断
   └─ ask : 外向き・不可逆操作は権限モードに関わらず確認を挟む
  ↓ 通常モードで有効
Layer 3: Allow ルール(settings.local.json — 個人)
  ↓ 通常モードでのみ有効
meta : self-SAST(scan-harness.sh が constitution hash / secret 混入 / deny 弱体化を検出)
env  : CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1(agent の入れ子禁止 = constitution ④)/
       CLAUDE_CODE_ENABLE_TODO_TOOLS=1(TaskCompleted ゲートの前提。Claude 5 系では既定で無い)
```

> Layer 1 にはブロック系(`safety-check.sh` / `protect-files.sh` / `scan-harness.sh` / `config-guard.sh` / `scope-guard.sh`。
> `onFailure: block` で故障時も fail-closed)+ 観測系(`subagent-audit.sh` / `pre-compact-backup.sh` / `post-compact-restore.sh` /
> `post-failure-log.sh` / `permission-denied-log.sh` / `instructions-log.sh` / `session-end.sh`) + 警告系(`commit-quality.sh` /
> `console-warn.sh` / `user-prompt-submit.sh`) + 通知系(`notify-claude.sh`)が含まれる。
> 観測・通知系はブロックしないが、`--dangerously-skip-permissions` でも記録・通知が残る点で
> 防御機構の一部として機能する。

- Layer 0 は既定で無効。閉域運用や外部コード実行を伴うプロジェクトで有効化する
- Layer 1 は常に有効。最も信頼性の高い防御層
- Layer 2 は通常モードで自動適用。`ask` は `acceptEdits` / `bypassPermissions` でも効く
- Layer 2 の補強(任意): `permissions.blockReadsOutsideWorkingDirectories` と `blockWritesOutsideWorkingDirectories`(v2.1.314)は
  作業ディレクトリ外の読み書きを全権限モードで拒否する(`true` は他の settings で打ち消せない)。例は `managed-settings.example.json`、
  個人で試すなら `settings.local.json.template` の `_comment_working_dir_fence`
- Layer 3 はプロジェクト固有の許可ルール(テンプレートから設定)

### Layer 0 の有効化(任意)

```json
// .claude/settings.local.json
{
  "sandbox": {
    "enabled": true,
    "network": {
      "allowedDomains": ["registry.npmjs.org", "github.com", "api.github.com"]
    }
  }
}
```

サンドボックス内で失敗するコマンドがある場合は `sandbox.excludedCommands` で個別に外す。

v2.1.325 以降、サンドボックス内の Bash も通常の権限フロー(allow / ask / deny)に従う。以前のように確認なしで走らせるなら
`"autoAllowBashIfSandboxed": true` を `sandbox` に足す(ask / deny はそのまま効く)。組織で有効化する場合は最上位の managed source に書く。

認証情報には組み込みの deny リストが**無い**(`~/.aws/credentials` や `~/.ssh` は既定で読める)。`sandbox.credentials` で明示的に塞ぐ:

```json
{
  "sandbox": {
    "credentials": {
      "files": [{ "path": "~/.aws/credentials", "mode": "deny" }, { "path": "~/.ssh", "mode": "deny" }],
      "envVars": [{ "name": "GITHUB_TOKEN", "mode": "deny" }, { "name": "NPM_TOKEN", "mode": "deny" }]
    }
  }
}
```

作業ディレクトリ外の読み取りを全モードで拒否するには `permissions.blockReadsOutsideWorkingDirectories: true`(project settings で有効)。
組織で固定する例は `.claude/managed-settings.example.json`。
