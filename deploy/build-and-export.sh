#!/usr/bin/env bash
# 在 Mac 上构建两个镜像并导出为 tar，供群晖 NAS docker load 导入。
#
#   bash deploy/build-and-export.sh
#
# 产物：deploy/out/backend.tar、deploy/out/frontend.tar
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
OUT="$ROOT/deploy/out"
mkdir -p "$OUT"

# ⚠️ --network host：Docker 会把宿主代理 127.0.0.1:xxxx 注入构建容器，
#    容器内 127.0.0.1 不是宿主 → 不 host 网络会导致 npm ci 卡死/崩溃。
BUILD_FLAGS="--network host"

echo "== 1/3 构建前端静态产物（本机）=="
( cd "$ROOT/frontend" && npm run build:h5 )

echo "== 2/3 构建后端镜像 =="
docker build $BUILD_FLAGS -f deploy/Dockerfile.backend -t account-book-backend:latest .

echo "== 3/3 构建前端镜像（只拷静态产物，不跑 npm）=="
docker build $BUILD_FLAGS -f deploy/Dockerfile.frontend -t account-book-frontend:latest .

echo "== 导出为 tar =="
docker save account-book-backend:latest -o "$OUT/backend.tar"
docker save account-book-frontend:latest -o "$OUT/frontend.tar"

echo ""
echo "完成。把这两个 tar + deploy/docker-compose.yml + deploy/.env.example 传到 NAS："
ls -lh "$OUT"/*.tar
