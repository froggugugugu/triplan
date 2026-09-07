#!/usr/bin/env bash
#
# postgresモードをワンコマンドで起動する。
#
# READMEの6ステップ（Docker起動 → .env → 依存インストール → migrate →
# admin作成 → サーバーとクライアントを別ターミナルで起動）を1本にまとめたもの。
# 各ステップは**冪等**で、2回目以降は既に済んでいるものを飛ばす。
#
#   ./scripts/dev-postgres.sh                 # 起動
#   ./scripts/dev-postgres.sh --reset-admin   # 管理者のパスワードを再設定してから起動
#   ./scripts/dev-postgres.sh --reset-db      # DBを作り直してから起動
#
# 停止は Ctrl+C（サーバー・クライアントの両方を落とす）。
# DBコンテナは起動したまま残す（データ保持のため）。止めるなら docker compose down。
set -euo pipefail

cd "$(dirname "$0")/.."

ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_NAME="${ADMIN_NAME:-管理者}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-AdminPass123}"
API_PORT="${API_PORT:-3001}"
CLIENT_PORT="${CLIENT_PORT:-5173}"

log() { printf '\033[1;34m▶\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$1"; }

RESET_ADMIN=0
for arg in "$@"; do
  case "$arg" in
    --reset-db)
      warn "DBコンテナとボリュームを削除します（データは消えます）"
      docker compose down -v
      ;;
    --reset-admin)
      RESET_ADMIN=1
      ;;
  esac
done

# ── 1. PostgreSQL ────────────────────────────────────────────────────────────
log "PostgreSQLを起動しています..."
docker compose up -d

log "DBの起動を待っています..."
for i in $(seq 1 60); do
  # healthcheckがhealthyになるまで待つ。ここを待たずにmigrateすると接続エラーになる
  status="$(docker compose ps --format '{{.Health}}' postgres 2>/dev/null || true)"
  [ "$status" = "healthy" ] && break
  [ "$i" = "60" ] && { echo "DBが起動しませんでした（docker compose logs postgres を確認してください）"; exit 1; }
  sleep 1
done

# ── 2. 環境変数 ──────────────────────────────────────────────────────────────
if [ ! -f server/.env ]; then
  log "server/.env を作成します（env.exampleから）"
  cp server/env.example server/.env
fi

# ── 3. 依存とマイグレーション ────────────────────────────────────────────────
if [ ! -d server/node_modules ]; then
  log "サーバーの依存をインストールしています..."
  npm --prefix server install
fi
if [ ! -d node_modules ]; then
  log "クライアントの依存をインストールしています..."
  npm install
fi

log "DBマイグレーションを適用しています..."
npm --prefix server run db:migrate

# ── 4. 管理者ユーザー ────────────────────────────────────────────────────────
# 既に存在する場合はスクリプト側が失敗するため、出力を握って続行する
log "管理者ユーザーを用意しています（${ADMIN_EMAIL}）..."
ADMIN_CREATED=0
SEED_ARGS=(--email="$ADMIN_EMAIL" --name="$ADMIN_NAME" --password="$ADMIN_PASSWORD")
[ "$RESET_ADMIN" = "1" ] && SEED_ARGS+=(--reset-password)

if npm --prefix server run db:seed-admin -- "${SEED_ARGS[@]}" \
  >/tmp/seed-admin.log 2>&1; then
  ADMIN_CREATED=1
  [ "$RESET_ADMIN" = "1" ] && log "管理者のパスワードを再設定しました" \
    || log "管理者を作成しました"
else
  warn "管理者は作成済みです（パスワードは変更していません）"
  warn "パスワードが分からない場合: ./scripts/dev-postgres.sh --reset-admin"
fi

# ── 5. サーバーとクライアントを起動 ──────────────────────────────────────────
cleanup() {
  log "停止しています..."
  # プロセスグループごと終了させる（tsx watch / vite は子プロセスを持つ）
  [ -n "${API_PID:-}" ] && kill "$API_PID" 2>/dev/null || true
  [ -n "${WEB_PID:-}" ] && kill "$WEB_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  log "DBコンテナは起動したままです（止める場合: docker compose down）"
}
trap cleanup EXIT INT TERM

log "APIサーバーを起動しています（http://localhost:${API_PORT}）..."
PORT="$API_PORT" npm --prefix server run dev &
API_PID=$!

# --strictPortを付ける: ポートが埋まっているときに黙って別ポートで起動されると、
# クライアントのVITE_API_BASE_URLとずれたり、別プロジェクトのdevサーバーへ
# 繋いでいることに気づけない（過去にE2Eで実際に踏んだ）
log "クライアントを起動しています（http://localhost:${CLIENT_PORT}）..."
VITE_STORAGE_MODE=postgres VITE_API_BASE_URL="http://localhost:${API_PORT}" \
  npm run dev -- --port "$CLIENT_PORT" --strictPort &
WEB_PID=$!

# 既存アカウントのパスワードは分からないため、新規作成したときだけ表示する
# （毎回既定値を表示すると「その値でログインできる」と誤解させる）
if [ "$ADMIN_CREATED" = "1" ]; then
  CRED="${ADMIN_EMAIL} / ${ADMIN_PASSWORD}"
else
  CRED="${ADMIN_EMAIL}（既存アカウントのパスワード）"
fi

cat <<INFO

────────────────────────────────────────────────────────
  postgresモードで起動しました

  URL     : http://localhost:${CLIENT_PORT}
  ログイン: ${CRED}

  停止    : Ctrl+C
  パスワードを忘れた場合: ./scripts/dev-postgres.sh --reset-admin
  DBを作り直す場合      : ./scripts/dev-postgres.sh --reset-db
────────────────────────────────────────────────────────

INFO

# どちらかが落ちたら全体を終了する。
# `wait -n` はbash 4.3以降で、macOS標準のbashは3.2のため使えない（実行して確認済み）。
# 生存確認のポーリングで代替する
while kill -0 "$API_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null; do
  sleep 1
done
warn "サーバーまたはクライアントが停止しました"
