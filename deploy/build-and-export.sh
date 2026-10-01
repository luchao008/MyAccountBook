#!/usr/bin/env bash
# 在 Mac 上构建三个镜像并导出为 tar，供群晖 NAS docker load 导入。
#
#   bash deploy/build-and-export.sh
#
# 产物：deploy/out/backend.tar、deploy/out/frontend.tar、deploy/out/admin.tar
#
# ⚠️ 镜像都**不在容器内装依赖**（原因见 deploy/Dockerfile.backend 顶部注释：
#    本机 Clash TUN 模式会重置构建容器的 TLS 连接，容器内 npm 拉不动包），
#    依赖与编译产物都在本机准备好后拷进镜像。
#
# ⚠️ PATH：本机 node/pnpm 在 /usr/local/bin（默认 PATH 可能不含），显式补上。
set -euo pipefail

export PATH=/usr/local/bin:$PATH

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
OUT="$ROOT/deploy/out"
mkdir -p "$OUT"

# ⚠️ --network host：Docker Desktop 会把 config.json 里的代理
#    （http://127.0.0.1:xxxx）注入构建容器，容器内 127.0.0.1 不是宿主机。
#    这里虽已不装依赖，但 host 网络仍可避免其它隐性的代理问题。
BUILD_FLAGS="--network host"

echo "== 1/7 构建 App 前端静态产物（本机）=="
( cd "$ROOT/frontend" && npm run build:h5 )

echo "== 2/7 构建中台前端静态产物（本机）=="
( cd "$ROOT/admin-web" && pnpm build:antd )

# ⚠️ 必须在两个前端产物都构建完**之后**、打镜像**之前**跑：
#    镜像里的 nginx 开了 `gzip_static`，靠的就是这里生成的 `.gz`；
#    Dockerfile 是整目录 COPY，所以 .gz 会被一起带进镜像，无需改 Dockerfile。
#    早于构建跑会压到上一次的旧产物，晚于打镜像跑则根本进不去镜像。
#    脚本是增量的（.gz 比源文件新就跳过），重复部署几乎零成本。
echo "== 3/7 预压缩静态产物（生成 .gz 供 nginx 直接吐）=="
node "$ROOT/scripts/precompress.mjs"

echo "== 4/7 安装后端依赖并编译（本机）=="
# npm ci 而不是 install：保证 node_modules 与 package-lock.json 严格一致 ——
# 这一份 node_modules 会被**原样打进镜像**，必须可复现。
( cd "$ROOT" && npm ci --no-audit --no-fund && npm run build )

echo "== 5/7 构建后端镜像（只拷 node_modules + dist）=="
docker build $BUILD_FLAGS -f deploy/Dockerfile.backend -t account-book-backend:latest .

echo "== 6/7 构建前端镜像（只拷静态产物）=="
docker build $BUILD_FLAGS -f deploy/Dockerfile.frontend -t account-book-frontend:latest .

echo "== 7/7 构建中台镜像（只拷静态产物）=="
docker build $BUILD_FLAGS -f deploy/Dockerfile.admin -t account-book-admin:latest .

echo "== 导出为 tar =="
docker save account-book-backend:latest -o "$OUT/backend.tar"
docker save account-book-frontend:latest -o "$OUT/frontend.tar"
docker save account-book-admin:latest -o "$OUT/admin.tar"

echo ""
echo "完成。把这三个 tar + deploy/docker-compose.yml + deploy/.env.example 传到 NAS："
ls -lh "$OUT"/*.tar
