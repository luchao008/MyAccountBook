# 部署到群晖 NAS（Docker）

方案：Mac 上构建镜像 → 导出 tar → NAS 导入运行。数据库用 compose 自带的
MariaDB 10.11（与开发一致），数据持久化到群晖共享文件夹。

## 架构

```
群晖 Container Manager（docker compose）
├── web      nginx:alpine   托管前端静态产物，/api 反代到 backend   ← 对外 :8080
├── backend  node:20-slim   Midway 后端（dist + 生产依赖）           ← 仅内网 7001
└── db       mariadb:10.11  数据卷 → 群晖文件夹                      ← 仅内网 3306
```

前端请求 `/api`（同域），nginx 反代到后端 → 浏览器无跨域，不依赖 CORS。

## 一、在 Mac 上构建并导出镜像

```bash
bash deploy/build-and-export.sh
```

得到 `deploy/out/backend.tar` 和 `deploy/out/frontend.tar`。

## 二、传到 NAS

把以下文件放到 NAS 的一个共享文件夹（例如 `/volume1/docker/account-book/`）：

- `backend.tar`、`frontend.tar`
- `docker-compose.yml`（从 `deploy/` 拷）
- `.env`（复制 `deploy/.env.example` 改名，填密码）

## 三、NAS 上导入镜像并启动

用 SSH 或群晖「终端机」进入该目录：

```bash
# 1. 导入镜像
docker load -i backend.tar
docker load -i frontend.tar

# 2. 建数据目录（DATA_DIR，见 .env）
mkdir -p /volume1/docker/account-book/data

# 3. 启动（首次会自动建表）
docker compose up -d

# 4. 看日志确认后端起来
docker compose logs -f backend
```

浏览器打开 `http://NAS_IP:8080`。

## 四、首次数据初始化（可选：种子账号）

如果需要 demo 账号 + 默认分类体系（种子脚本已编译进 `dist/seed`）：

```bash
docker compose exec backend node dist/seed/index.js
```

（若上面不行，直接在浏览器注册一个新账号即可，首次注册会自动建默认账本与分类。）

## 五、更新部署

代码改动后：

```bash
# Mac
bash deploy/build-and-export.sh
# 传新 tar 到 NAS 后
docker load -i backend.tar && docker load -i frontend.tar
docker compose up -d
```

## 六、备份

数据全在 `.env` 里 `DATA_DIR` 指向的目录，直接备份该文件夹即可。

## 注意

- `DATA_DIR` 必须是**绝对路径**且**已存在、可写**（README §三 的 mkdir 步骤）。
- 群晖若用了别的端口占用 8080，改 `.env` 的 `WEB_PORT`。
- 首次构建镜像较大（含 node），耐心等。
