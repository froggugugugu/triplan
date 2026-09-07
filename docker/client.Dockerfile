# 本番用クライアントイメージ（セルフホスト構成、第8回評価。docs/guide/self-host.md参照）
# nginxで静的配信し、/api/* を同一オリジンのままAPIサーバーコンテナへ中継する
# （ブラウザから見て同一オリジン＝CORS問題が構造的に消える）。
#
# ビルドコンテキストはリポジトリルート:
#   docker build -f docker/client.Dockerfile .
FROM node:22-slim AS build
WORKDIR /app
RUN npm install -g npm@11
COPY package.json package-lock.json ./
# HUSKY=0: prepareスクリプト（husky）を.gitの無いコンテナ内でスキップする。
# --ignore-scriptsにしないのはesbuild等のセットアップスクリプトが必要なため
ENV HUSKY=0
RUN npm ci
COPY . .
# API接続先は空文字=相対パス（/api/...）。nginxが同一オリジンでserverへ中継する
ENV VITE_STORAGE_MODE=postgres VITE_API_BASE_URL=""
# 型検査はCI（.github/workflows/ci.yml）が担うため、ここではバンドルのみ行う
RUN npx vite build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
