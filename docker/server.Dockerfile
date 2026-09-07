# 本番用APIサーバーイメージ（セルフホスト構成、第8回評価。docs/guide/self-host.md参照）
#
# ビルドコンテキストはリポジトリルート:
#   docker build -f docker/server.Dockerfile .
#
# server/tsconfig.jsonが../src/shared/{types,utils}を型検査・実行時import
# （tsxのtsconfig paths解決）の対象にしており、shared側の依存（zod等）は
# ルートのnode_modulesから解決される。そのためルートの本番依存も併せて
# インストールする（CIのserverジョブと同じ理由。ci.yml参照）。
#
# node:22-slim（glibc）を使う: argon2のネイティブモジュールのプリビルドを
# 確実に使えるようにするため（alpine/muslはビルド環境依存の失敗要因になる）
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
# package-lock.jsonはnpm 11で生成されている（Node 22同梱のnpm 10ではnpm ciが失敗する）
RUN npm install -g npm@11

# ルート依存（sharedが参照するzod等）。--ignore-scripts はprepare（husky）が
# .gitの無いコンテナ内で失敗するのを避けるため（ルートの本番依存にビルド
# スクリプトを要するパッケージは無い）
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# サーバー依存。argon2のネイティブセットアップが必要なため--ignore-scriptsは付けない
COPY server/package.json server/package-lock.json ./server/
WORKDIR /app/server
RUN npm ci --omit=dev

WORKDIR /app
COPY src/shared ./src/shared
COPY server ./server

WORKDIR /app/server
EXPOSE 3001
# 起動時にマイグレーションを適用してからサーバーを開始する
# （drizzle-ormのmigrator＝冪等。適用済みならスキップされる）
CMD ["sh", "-c", "npm run db:migrate && npm run start"]
