---
type: document
title: 外部ツール連携（完了同期・通知・公開API）
description: Backlog/Asana/Jira/GitHubへのAPI起票と完了同期（CSV・Webhook）、チャットツール通知、読み取り専用の公開API v1。
tags: [guide, integration, webhook, api]
status: active
sources:
  - 実装コード（2026-08-20時点）
---

## 完了同期の考え方

タスクの日々の実行管理はBacklog・Asana・Jira・GitHub等の専門ツールで行い、**完了の事実だけ**を
本ツールへ同期します。これによりWBSの完了チェック（＝EVMのEV）が二重入力なしで回ります。

対応ツール: **Backlog／Asana／Jira／GitHub Issues**（いずれも無料枠で試せます）＋汎用CSV。

## 行き①: API起票（postgresモードのみ・おすすめ）

WBSのタスクを外部ツールへ**ワンクリックで作成**します。作成と同時に外部ツール側のIDを
記録するため、以降の完了同期がタイトル変更に影響されません。

**準備（管理者・1回だけ）**

> 無料アカウントの作成からトークン発行・必要IDの取得までの詳細な手順は
> **[外部ツール接続のセットアップ](external-tools-setup.md)** にまとめています。
> 画面へ登録する前にコマンドで疎通確認する方法も載せています。

1. 外部ツールでAPIトークンを発行する

   | ツール | 発行場所 | 必要な権限 |
   | ------ | -------- | ---------- |
   | Backlog | 個人設定 → API | （APIキー） |
   | Jira | Atlassianアカウント → セキュリティ → APIトークン | メールアドレスと対で使います |
   | Asana | 開発者コンソール → Personal Access Token | — |
   | GitHub | Settings → Developer settings → Fine-grained PAT | 対象リポジトリの **Issues: Read and write** |

2. 画面右上の設定 → 「**外部ツール接続**」→「接続を追加」でツール・接続名・
   APIトークン（Backlog/Jiraは自社のURLも）を登録する
3. 一覧の「**起票先**」で作成先（プロジェクト／リポジトリ）を選ぶ。
   「**接続テスト**」で疎通を確認できます

**起票する**

WBS画面の「**API起票**」→ 接続を選ぶ → 対象件数を確認して実行。

- 対象は選択中プロジェクトの**未起票のリーフタスク**だけです。起票済みのタスクは自動的に
  除外されるため、**何度実行しても二重に作られません**（失敗した分だけをやり直せます）
- 外部ツールのレート制限に配慮して1秒に1件ずつ作成します（50件で約1分）。
  一度に起票できるのは50件までです
- 工程名はBacklog=カテゴリー／Asana=セクション／Jira・GitHub=ラベルとして付きます。
  **BacklogのカテゴリーとAsanaのセクションは、外部ツール側に無ければ作成されます**
- ごくまれに「作成はされたが記録できなかった」状態になることがあります（通信断など）。
  その場合は起票履歴に失敗として残るので、外部ツール側を確認してから再実行してください

## 行き②: 連携CSV出力（どちらのモードでも使えます）

1. WBS画面で「**連携CSV出力**」→ 出力形式（Backlog/Asana/Jira/汎用）を選んでダウンロード
2. 外部ツールの標準CSVインポートで取り込む

- 件名は `[P012-03-01] ログイン機能` の形式で出力されます。
  **角括弧内のコードが同期の鍵なので、外部ツール側で消さないでください**
- 工程の階層はグループ列（Backlog=カテゴリー／Asana=Section／Jira=Epic）に写ります
- **GitHubは出力形式にありません**。GitHubにはIssueのCSVインポート標準機能が無いため、
  API起票か、`gh` CLI（GitHub公式）での一括起票を使ってください:

```bash
# 連携CSV（汎用形式）の各行から Issue を作成する例
gh issue create --repo <owner>/<repo> --title "[P012-03-01] ログイン機能" --body "<完了条件>"
```

## 帰り①: 完了CSV取込（どちらのモードでも使えます）

1. 外部ツールから課題一覧をCSVエクスポート
   （GitHubは `gh issue list --state all --limit 1000 --json number,title,state,closedAt`
   の出力をCSV化して使います）
2. WBS画面の「**完了CSV取込**」→ 取込元ツールを選択（列・完了語彙を自動推定）
3. ドライランで「完了へ変わる／未完了へ戻る／スキップ」を確認して適用

初回の同期で外部ツール側のタスクIDを学習するため、以降は件名が変更されても追跡できます。
曖昧な行（コード重複・同名複数）は誤帰属を防ぐため取り込まれず、理由が同期履歴に残ります。

- GitHubのCSV取込では**タスクIDを学習しません**（件名の `[コード]` で突合します）。
  CSVの`number`列は `123` という番号だけで、Webhook側が学習する `owner/repo#123` とは
  別の形式になり、同じタスクなのに別IDとして扱われてしまうためです。GitHubのID学習は
  Webhook経由の同期にお任せください

## 帰り②: Webhook（postgresモードのみ・完了操作の瞬間に自動同期）

1. サーバーの環境変数 `TASK_WEBHOOK_SECRET` にランダム値を設定（`server/env.example`参照）
2. 外部ツールのWebhook設定に次のURLを登録:

```
https://<サーバー>/api/webhooks/tasks/backlog?secret=<設定した値>
（sourceは backlog / jira / asana / github / generic）
```

- Backlog: 課題の状態が「完了」になったイベントを取り込みます。完了とみなす状態名は
  `TASK_WEBHOOK_BACKLOG_DONE_STATUSES` 環境変数でカスタマイズできます（カンマ区切り）
- Jira: ステータスカテゴリが完了（Done系）かで判定します（ステータス名は自由でOK）
- Asana: Webhook作成時のハンドシェイクに自動応答します。タスク詳細の取得に
  `ASANA_ACCESS_TOKEN`（Personal Access Token）の設定が必要です
- GitHub: Issueのclose/reopenを取り込みます（下記の設定手順を参照）。追加の環境変数は不要です
- 同じイベントが再送されても二重反映はされません（冪等）

### GitHubの設定手順

リポジトリの **Settings → Webhooks → Add webhook** で次のとおり設定します。

| 項目 | 値 |
| ---- | -- |
| Payload URL | `https://<サーバー>/api/webhooks/tasks/github?secret=<設定した値>` |
| Content type | `application/json` |
| Which events | 「Let me select individual events」→ **Issues** のみチェック |

- Issueを**クローズすると完了**、**リオープンすると未完了**に戻ります
  （ラベル付け・編集など他の操作では何も起きません）
- 登録直後にGitHubが送る疎通確認（ping）にも応答するため、登録は成功として表示されます
- 初回の同期で `owner/repo#123` 形式のIDを学習し、以降はIssueのタイトルを変更しても追跡できます

## 同期の履歴

WBS画面下部の「完了同期履歴」に、いつ・どの経路から・何件反映/スキップしたかが残ります。
API起票の結果（作成件数・失敗理由）も同じ履歴に残ります。

## チャットツール通知（postgresモードのみ）

業務イベントとアラートをチャットツールへ送出できます。設定は「システム設定 → 通知設定」
（`users:manage`権限）から行います。

- **対応プロバイダ6種**: Slack／Microsoft Teams（Workflows）／Google Chat／Discord／
  Chatwork／汎用Webhook
- **即時イベント**: 月次締め/解除・変更要求の承認/却下（業務処理をブロックしない送出）
- **日次ダイジェスト**: アラートセンターと同一判定の5種（納期・SaaS更新・稼働超過・
  ベースライン乖離・予算超過）を重大度順に1通へ集約。送信時刻は環境変数
  `NOTIFY_DIGEST_TIME`（HH:MM、未設定なら無効）。チャンネルごとに最小重大度で絞り込めます
- **通知文面に具体的な金額は含めません**（予算超過は消化率%のみ）。Webhook URL・APIトークンは
  暗号化保存の書き込み専用で、画面には設定済みフラグだけが表示されます
- テスト送信と送信ログ（直近20件）で疎通を確認できます

## 公開API（読み取り専用）

BIツール・会計システム・スクリプトから集計結果を直接取得できます（postgresモード専用）。

1. 管理者が「システム設定 → APIキー」でキーを発行します（`rpk_...`。発行時に一度だけ表示）
2. リクエストヘッダに `X-Api-Key: rpk_...` を付けてGETします

```bash
curl -H "X-Api-Key: rpk_..." http://localhost:3001/api/v1/project-finance
```

| エンドポイント | 内容 |
| -------------- | ---- |
| `GET /api/v1/billing` | 請求データ（請求マイルストン×案件） |
| `GET /api/v1/project-finance` | 案件別収支（受注・予算・実コスト・粗利・原価4区分・配賦後利益） |
| `GET /api/v1/statements/partner-payment?month=YYYY-MM&mode=actual` | 協力会社への支払明細（準委任精算適用済み） |
| `GET /api/v1/statements/client?month=YYYY-MM` | 発注元向け明細 |
| `GET /api/v1/projects` | プロジェクト一覧（進捗率・タスク数。金額なし） |
| `GET /api/v1/projects/{id}` | プロジェクト詳細（タスクツリー・スケジュール・完了状態） |
| `GET /api/v1/projects/{id}/evm` | EVM（PV/EV/ACの週次系列。画面と同一算出） |
| `GET /api/v1/alerts` | アラート一覧（画面と同一判定） |

詳細な仕様は **OpenAPI仕様書** `GET /api/v1/openapi.yaml`（認証不要）を参照してください。
数値は画面・CSV出力と同一の実装で算出されるため、常に一致します。
