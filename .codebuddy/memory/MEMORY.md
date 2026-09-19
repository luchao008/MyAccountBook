# MyAccountBook 项目长期记忆

## 架构与环境
- 后端：Midway（`src/`，端口 7001），启动 `npm run dev`；前端：uni-app + Vue3 + Vite（`frontend/`，端口 5173），启动 `npm run dev:h5`；前端 `/api` 走 Vite 代理到后端。
- 演示账号：demo / 123456。前端页面路由是 hash 形式：`http://127.0.0.1:5173/#/pages/xxx/index`。
- 用户用 git worktree 管理 workbuddy 分支（路径 `/Users/luchao/WorkBuddy/Worktrees/MyAccountBook/`）；删除这类分支要先 `git worktree remove` 再删分支。远程仓库 `git@github.com:luchao008/MyAccountBook.git`。

## 图标与分类体系
- 分类预置：`src/category/category-preset.ts`，89 个分类（15 一级 + 74 二级），icon 字段存 emoji；前端经 `frontend/src/constants/icons.ts` 的 `EMOJI_TO_ICON` / `resolveCategoryIcon` 解析成图标（三级回退，永不空）。
- 图标三套：界面单色 `UI_ICONS`（icon-*）+ 分类单色 `CATEGORY_ICONS`（cat-*，15 个，图标选择器「标准」Tab）在 `constants/icons.ts`；彩色两集 `colorful:`(329)/`life:`(141) 由 `scripts/gen-color-icons.mjs` 生成到 `constants/color-icons.ts`（动态 import 分包，勿并入首屏）。
- 图标选择页 `pages/icon-picker/index.vue`：Tab=多彩/生活/标准，选中经 `EVENT_ICON_PICKED` 回传。
- 2026-09-19 导入 75 个中文名分类图标（3D 彩色、白底位图）到 `frontend/src/static/cat-icons/`，接入形态未定，见 `docs/分类图标比对与导入报告.md`。

## 前端约定（v1.1 设计体系）
- 弹层层级：自定义弹层最高 1200（CategoryPicker/DateTimePicker 1200，FlowFilterPanel 等 1000，TabBar 100）；`uni.showModal/showToast/showActionSheet` 等系统弹层统一由 `frontend/src/App.vue` 抬到 **z-index 3000**（H5 专属块内）。
- ⚠️ actionSheet 的遮罩 `.uni-mask.uni-actionsheet__mask` 与弹层 `.uni-actionsheet` 是兄弟节点，必须**整层一起抬**，只抬遮罩会让遮罩反盖弹层（2026-09-19 修过）。
- 代码注释风格：大量「踩过/实测/为什么」注释，修改时保持同等详细度；固定宽度用 min-width；颜色只用 tokens（`frontend/src/styles/tokens.scss`）。
- 点击 uni-app H5 的 `<view>` 元素时，Playwright 直接 click 常被 hit-test 拦，一律走 `page.evaluate` 内 `el.click()`。

## 验证脚本约定（scripts/verify-*.mjs）
- 用 playwright-core：`/Users/luchao/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js`；Chromium 从 `~/Library/Caches/ms-playwright` 找。
- 跑之前需 5173 + 7001 服务在跑；脚本只操作自建临时数据（自己建、自己删），绝不动用户已有数据。
- 常用断言模式：登录 → 走真实 UI → 接口旁证；关键回归点要有负向对照（证明断言不是恒真）。
