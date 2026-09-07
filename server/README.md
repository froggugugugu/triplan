# APIサーバー（postgresモード用）

`VITE_STORAGE_MODE=postgres` で動かすクライアントが接続する、Fastify + Drizzle ORM + PostgreSQL の独立したAPIサーバー。
既定の `local` モード（localStorage）では本サーバーもDockerも不要（`npm run dev` だけで動く）。

技術スタック・ディレクトリ構成・エンティティ一覧は [`docs/project.md`](../docs/project.md) / [`docs/architecture.md`](../docs/architecture.md) を参照。本ファイルはローカルでの起動手順のみを扱う。

## 前提

- Docker（Docker Desktop 等。`docker compose` コマンドが使えること）
- Node.js 22以上（npm 11以上）

## 手順

### 1. PostgreSQLコンテナを起動する

リポジトリルートで実行する（`docker-compose.yml` はルート直下に配置済み）。

```bash
docker compose up -d
```

named volume（`triplan-postgres-data`）にデータを永続化するコンテナが起動する。`docker compose down` で停止してもデータは残る（完全に消したい場合のみ `docker compose down -v`）。

起動確認:

```bash
docker compose ps
```

`postgres` サービスが `healthy` になれば準備完了。

### 2. サーバーの環境変数を設定する

```bash
cp server/env.example server/.env
```

`server/.env` は `.gitignore` 対象（コミットされない）。`DATABASE_URL` は手順1のコンテナ設定（`postgres`/`postgres`/`resource_manager`/`5432`）と一致した既定値のまま使える。以下は開発用の仮値のままでも動くが、本番運用する場合は必ず置き換えること:

- `JWT_ACCESS_SECRET` / `JWT_REFRESH_PEPPER`: `openssl rand -base64 48` 等で生成した十分な長さのランダム値
- `SSO_ENCRYPTION_KEY`: `openssl rand -hex 32`（64文字の16進数、`server/src/env.ts` がフォーマット検証する）

### 3. 依存パッケージをインストールする（初回のみ）

```bash
npm --prefix server install
```

### 4. マイグレーションを適用する

```bash
npm --prefix server run db:migrate
```

### 5. 管理者ユーザーを作成する

```bash
npm --prefix server run db:seed-admin -- --email=admin@example.com --name=管理者 --password=<8文字以上のパスワード>

既に同じメールのユーザーが居る場合は何も変更せず終了します。
開発中にパスワードが分からなくなったときは `--reset-password` を付けると再設定できます。
```

ここで指定したメールアドレス・パスワードが `/login` 画面でのログイン情報になる。

### 6. APIサーバーを起動する

```bash
npm --prefix server run dev
```

`http://localhost:3001` で起動する（既定ポート）。

### 7. クライアントをpostgresモードで起動する

別ターミナルで、リポジトリルートから実行する。

```bash
VITE_STORAGE_MODE=postgres npm run dev
```

`VITE_API_BASE_URL` は既定で `http://localhost:3001` を参照するため、サーバーのポートを変えていなければ指定不要。`http://localhost:5173` にアクセスすると `/login` へリダイレクトされるので、手順5で作成した管理者アカウントでログインする。

環境変数はこのコマンド実行時のみ有効（インライン指定）。`.env.local` 等に恒久化すると、以降 `npm run dev` を素で実行したときも意図せずpostgresモードになってしまうため避けること。既定の `local` モードに戻したい場合は、単に `npm run dev` を（`VITE_STORAGE_MODE` を付けずに）実行すればよい。

## 停止・後片付け

```bash
# サーバー・クライアントは各ターミナルでCtrl+C

# Postgresコンテナを停止（データは保持）
docker compose down

# データも含めて完全に削除する場合のみ
docker compose down -v
```

## その他のコマンド

```bash
npm --prefix server run db:studio    # Drizzle Studio（ブラウザでDBの中身を確認）
npm --prefix server run db:migrate-from-json  # localStorageのエクスポートJSON → PostgreSQLへの一括移行CLI
```

`npm --prefix server run test:run`（統合テスト）はTestcontainersを使うため別途Dockerが必要（本手順の常駐コンテナとは独立に、テスト実行のたびに使い捨てコンテナが起動する）。

## Webhook受信（外部タスク管理ツールとの完了同期）

Backlog/Jira/Asanaの完了イベントを受信してWBS完了チェックへ自動反映する。

1. `server/.env` に `TASK_WEBHOOK_SECRET`（16文字以上のランダム値。`openssl rand -hex 24`）を設定して再起動
2. 外部ツールのWebhook設定に `http://<サーバー>/api/webhooks/tasks/<source>?secret=<値>` を登録
   （`<source>` = `backlog` / `jira` / `asana` / `generic`）
3. Asanaのみ、タスク詳細のAPIフェッチ用に `ASANA_ACCESS_TOKEN` も必要

シークレット未設定時はエンドポイント自体が無効（全401）。同一イベントの再送は二重反映されない（冪等）。
