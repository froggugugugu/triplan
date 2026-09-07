---
type: document
title: 本番セルフホスト手順
description: Docker Composeでweb（クライアント）・APIサーバー・PostgreSQLの3コンテナを立ち上げ、チームで使える本番構成を運用する手順。バックアップ・更新・トラブルシュートを含む。
tags: [guide, self-host, docker, operations]
status: active
sources:
  - docker-compose.prod.yml / docker/ 配下（2026-08-23時点）
---

## この手順でできること

開発用のクイックスタート（`npm run dev:postgres`）はNode.jsと2つのターミナルが必要な
「開発者の構成」です。この手順では**Dockerだけで完結する常駐構成**を立ち上げます。

```
ブラウザ ──→ web（nginx: 画面の配信 + /api/* の中継）──→ server（API）──→ db（PostgreSQL）
```

- ブラウザが接続するのは `web` だけ（既定: `http://localhost:8080`）。APIは同一オリジンの
  `/api/*` として中継されるため、CORS設定の悩みが構造的にありません
- データは名前付きボリューム `triplan-prod-db` に永続化されます

## 前提

- Docker（`docker compose` が使えること）。Node.jsは**不要**です
- リポジトリのクローン

## 手順

### 1. 環境変数を用意する

```bash
cp deploy/env.example deploy/prod.env
```

`deploy/prod.env` を開き、`change-me` の値を**必ず**置き換えます。

```bash
# ランダム値の生成（それぞれ別の値を使うこと）
openssl rand -hex 32
```

| 変数 | 説明 |
| --- | --- |
| `POSTGRES_PASSWORD` | DBパスワード（接続文字列にも自動で使われます） |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_PEPPER` | 認証トークンの署名用（16文字以上・別々の値） |
| `SSO_ENCRYPTION_KEY` | 暗号化鍵（64桁の16進数、`openssl rand -hex 32`） |
| `CORS_ORIGIN` | 公開オリジン。既定 `http://localhost:8080`。ドメインを当てる場合はそのURL |
| `WEB_PORT` | 公開ポート（既定8080） |

`deploy/prod.env` はgit管理外です（誤ってコミットされない構成になっています）。

### 2. ビルドして起動する

```bash
docker compose --env-file deploy/prod.env -f docker-compose.prod.yml up -d --build
```

初回はイメージのビルドに数分かかります。`server` は起動時にDBマイグレーションを
自動適用します（冪等なので再起動しても安全です）。

```bash
# 状態確認（3つとも Up になること）
docker compose --env-file deploy/prod.env -f docker-compose.prod.yml ps
```

### 3. 管理者ユーザーを作成する

```bash
docker compose --env-file deploy/prod.env -f docker-compose.prod.yml \
  exec server npm run db:seed-admin -- \
  --email=admin@example.com --name=管理者 --password=<8文字以上>
```

`http://localhost:8080` を開き、このアカウントでログインできれば完了です。
以降のユーザー追加は画面（管理画面 → ユーザー管理）から行えます。

## バックアップとリストア

データはすべてPostgreSQLにあります。定期的にダンプを取ってください。

```bash
# バックアップ（プレーンSQL形式）
docker compose --env-file deploy/prod.env -f docker-compose.prod.yml \
  exec db pg_dump -U postgres resource_manager > backup-$(date +%Y%m%d).sql

# リストア（空のDBに流し込む）
docker compose --env-file deploy/prod.env -f docker-compose.prod.yml \
  exec -T db psql -U postgres resource_manager < backup-YYYYMMDD.sql
```

アプリ内の「データ管理」（JSONエクスポート）は業務データのみが対象で、
ユーザー・監査ログ等は含みません。**基盤のバックアップは`pg_dump`を正とし**、
JSONエクスポートは移行・退避の補助として使い分けてください。

## 更新手順

```bash
git pull
docker compose --env-file deploy/prod.env -f docker-compose.prod.yml up -d --build
```

新しいイメージがビルドされ、コンテナが入れ替わります。DBマイグレーションは
`server` の起動時に自動適用されます。**更新前にバックアップを取る**ことを推奨します。

## 停止・削除

```bash
# 停止（データは保持される）
docker compose --env-file deploy/prod.env -f docker-compose.prod.yml down

# データごと完全に削除する（元に戻せません）
docker compose --env-file deploy/prod.env -f docker-compose.prod.yml down -v
```

## HTTPS（ドメイン）で公開する場合

本構成はHTTP（社内ネットワーク・VPN内での利用）を想定しています。
インターネットへ公開する場合は、`web`（`WEB_PORT`）の手前にHTTPS終端を担う
リバースプロキシ（Caddy・nginx＋certbot・クラウドのLB等）を置き、
`deploy/prod.env` の `CORS_ORIGIN` を公開URL（`https://...`）へ変更してください。

## トラブルシュート

| 症状 | 確認すること |
| --- | --- |
| `POSTGRES_PASSWORD を設定し…` と表示されて起動しない | `--env-file deploy/prod.env` を付け忘れていないか。`deploy/prod.env` が存在するか |
| `server` が再起動を繰り返す | `docker compose ... logs server`。環境変数の検証エラー（`JWT_ACCESS_SECRET`が16文字未満・`SSO_ENCRYPTION_KEY`が64桁hexでない等）は起動時にfail-fastで表示されます |
| ログインできない（401） | 手順3の管理者作成を実行したか。メール・パスワードの打ち間違いがないか |
| ポート8080が使用中 | `deploy/prod.env` の `WEB_PORT` を変更して `up -d` し直す |
| 画面は出るがAPIエラーになる | `docker compose ... logs server` と、ブラウザ開発者ツールで `/api/health` の応答を確認 |
