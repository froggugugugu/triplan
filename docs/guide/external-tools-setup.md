---
type: document
title: 外部ツール接続のセットアップ（無料アカウントで試す）
description: Backlog/Asana/Jira/GitHubの無料プランでAPI起票を試すための、アカウント作成・トークン発行・必要IDの取得手順。
tags: [guide, integration, setup, api]
status: active
sources:
  - 各ツールの公式ドキュメント（2026-08-20時点で確認）
  - 実装コード
---

## この文書について

[外部ツール連携](integration.md)のAPI起票を**無料アカウントで試す**ための準備手順です。
4ツールすべて無料プランでAPIを利用できます（2026-08-20時点、公式情報で確認）。

| ツール | 無料プラン | 主な制限 | 出典 |
| ------ | ---------- | -------- | ---- |
| GitHub | Free | パブリック/プライベートとも無制限。Issues標準搭載 | [github.com/pricing](https://github.com/pricing) |
| Jira | Jira Free | 「Free forever for up to 10 users」 | [atlassian.com/software/jira/pricing](https://www.atlassian.com/software/jira/pricing) |
| Asana | Personal | 「Free forever」（1〜2人向け） | [asana.com/pricing](https://asana.com/pricing) |
| Backlog | フリープラン | **最大10ユーザー・1プロジェクト**まで | [backlog.com/ja/pricing](https://backlog.com/ja/pricing/) |

> **Backlogの注意**: 公式の料金ページに「2027年1月1日からプランが新しくなります」という告知が
> あります。フリープランの扱いが変わる可能性があるため、長期運用の前に最新の条件を確認してください。

**まず試すなら GitHub が最短です**（アカウントがあれば5分ほど。URLもメールアドレスも不要で、
必要なのはトークンとリポジトリ名だけ）。

---

## 共通の注意

- **専用のテスト用プロジェクト／リポジトリを作ってください**。API起票は実際に課題を作成し、
  工程名のカテゴリー・セクションも（無ければ）作成します。本番の場所では試さないでください
- トークンは**必要最小限の権限**で発行し、**有効期限**を設定してください
- トークンをコミットしないでください。設定は画面（システム設定 →「外部ツール接続」）から
  登録すれば暗号化して保存され、以降は画面にも表示されません

---

## GitHub

### 1. アカウント（未所持の場合）

[github.com/signup](https://github.com/signup) から無料アカウントを作成します。

### 2. テスト用リポジトリを作る

`New repository` → 名前（例 `rp-integration-test`）→ Private でも構いません → Create。
**Issues が有効**であることを確認します（Settings → General → Features → Issues）。

### 3. トークンを発行する

Settings（右上のアバター）→ Developer settings → **Personal access tokens → Fine-grained tokens**
→ `Generate new token`

| 項目 | 設定 |
| ---- | ---- |
| Expiration | 30日など短めに |
| Repository access | Only select repositories → 上で作ったリポジトリ |
| Permissions → Repository permissions → **Issues** | **Read and write** |

> Issuesを`Read and write`にしないと、起票は通ってもラベル（工程名）が**エラーにならず黙って
> 無視されます**（GitHubの公式仕様: "Only users with push access can set labels for new issues.
> Labels are silently dropped otherwise."）。

`Generate token` で表示される `github_pat_...` をコピーします（**再表示できません**）。

### 4. 必要な情報

| 項目 | 例 | 取得元 |
| ---- | -- | ------ |
| APIトークン | `github_pat_...` | 手順3 |
| オーナー | `your-name` | リポジトリURLの `github.com/<オーナー>/<リポジトリ>` |
| リポジトリ | `rp-integration-test` | 同上 |

---

## Backlog

### 1. アカウント

[backlog.com/ja/](https://backlog.com/ja/) から新規登録します。スペース名（`xxx.backlog.jp` の
`xxx` 部分）を決めます。登録直後は有料プランの試用期間になるため、**フリープランを使う場合は
スペース設定からプランを変更**してください（フリープランは1プロジェクトまで）。

### 2. APIキーを発行する

右上のアイコン → **個人設定** → **API** → 「登録」でメモ（用途）を入力して発行。
表示された文字列がAPIキーです。

### 3. 必要な情報

| 項目 | 例 | 取得元 |
| ---- | -- | ------ |
| スペースURL | `https://xxx.backlog.jp` | ブラウザのURL（`.backlog.com` / `.backlogtool.com` も可） |
| APIキー | 手順2の文字列 | 個人設定 → API |
| プロジェクトID | `12345`（数値） | 下の検証コマンドが一覧表示します |
| 課題種別ID | `3`（数値） | 同上（プロジェクトIDを指定すると表示されます） |
| 優先度ID | `3`（=中） | 同上 |

> プロジェクトIDは画面上では見えにくいため、下記の**検証コマンドで一覧を出す**のが確実です。

---

## Asana

### 1. アカウント

[asana.com](https://asana.com/) から無料登録します（Personalプラン）。
テスト用のプロジェクトを1つ作成します。

### 2. Personal Access Token を発行する

[app.asana.com/0/my-apps](https://app.asana.com/0/my-apps)（Developer Console）→
**Personal access tokens** → `Create new token` → 名前を付けて作成。
表示されたトークンをコピーします（再表示できません）。

### 3. 必要な情報

| 項目 | 例 | 取得元 |
| ---- | -- | ------ |
| アクセストークン | `2/1234567890/...` | 手順2 |
| プロジェクトgid | `1201234567890123` | 検証コマンドが一覧表示（プロジェクトURLの数字でも可） |

---

## Jira

### 1. アカウント

[atlassian.com/software/jira/free](https://www.atlassian.com/software/jira/free) から
無料サイト（`https://xxx.atlassian.net`）を作成します。テスト用プロジェクトを1つ作り、
**プロジェクトキー**（例 `TEST`）を控えます。

### 2. APIトークンを発行する

[id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
→ **Create API token** → 名前と有効期限を設定して作成 → 表示された文字列をコピー。

### 3. 必要な情報

| 項目 | 例 | 取得元 |
| ---- | -- | ------ |
| サイトURL | `https://xxx.atlassian.net` | ブラウザのURL |
| メールアドレス | `you@example.com` | Atlassianアカウントのログイン用（トークンと対で使います） |
| APIトークン | 手順2の文字列 | |
| プロジェクトキー | `TEST` | プロジェクト設定、または検証コマンドの一覧 |
| 課題タイプID | `10001` | 検証コマンドが一覧表示 |

---

## 接続を検証する

画面から登録する前に、**コマンドで疎通と必要IDを確認**できます。サーバー起動もDBも不要です。

```bash
# ① 疎通確認だけ（何も作成しません）
EXT_TOOL=github EXT_TOKEN='github_pat_xxx' \
  npm --prefix server run verify:external-tool

# ② 起票先を指定して、選択肢（プロジェクトID・課題種別ID）も確認
EXT_TOOL=backlog EXT_TOKEN='xxx' EXT_BASE_URL='https://xxx.backlog.jp' \
  EXT_TARGET='{"projectId":12345,"issueTypeId":3,"priorityId":3}' \
  npm --prefix server run verify:external-tool

# ③ 実際にテスト課題を1件作って、外部IDの形式まで確認する
EXT_TOOL=github EXT_TOKEN='github_pat_xxx' \
  EXT_TARGET='{"owner":"your-name","repo":"rp-integration-test"}' \
  EXT_CREATE=1 npm --prefix server run verify:external-tool
```

ツール別の環境変数:

| ツール | EXT_BASE_URL | EXT_EMAIL | EXT_TARGET |
| ------ | ------------ | --------- | ---------- |
| github | 不要 | 不要 | `{"owner":"...","repo":"..."}` |
| backlog | スペースURL | 不要 | `{"projectId":123,"issueTypeId":3,"priorityId":3}` |
| asana | 不要 | 不要 | `{"projectGid":"120..."}` |
| jira | サイトURL | 必要 | `{"projectKey":"TEST","issueTypeId":"10001"}` |

- トークンは画面に**伏字**（先頭4文字と文字数のみ）で表示されます
- `EXT_CREATE=1` を付けたときだけ実際に課題が作られます。作られた課題は削除して構いません
- `EXT_TARGET` を省略すると、選択肢の一覧だけが表示されます（IDを調べる用途）

検証が通ったら、同じ値を画面（システム設定 →「外部ツール接続」）へ登録すれば、
WBS画面の「API起票」から使えるようになります。

## うまくいかないとき

| 症状 | 原因と対処 |
| ---- | ---------- |
| `401` | トークンの誤り・失効。Jiraはメールアドレスとトークンの組み合わせを確認 |
| `403` | 権限不足。GitHubはIssuesが`Read and write`か、対象リポジトリが選択されているかを確認 |
| `404`（GitHub） | オーナー名／リポジトリ名の誤り。大文字小文字も一致させる |
| `対応していないホストです` | URLの打ち間違い。Backlogは`.backlog.jp`/`.backlog.com`/`.backlogtool.com`、Jiraは`.atlassian.net`のみ対応（オンプレミス版・Server/DCは非対応） |
| ラベルが付かない（GitHub） | トークンにpush権限がない。GitHubは権限不足のラベルをエラーにせず無視します |
