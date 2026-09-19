# MyAccountBook 项目长期记忆

## 架构与环境
- 后端：Midway（`src/`，端口 7001），启动 `npm run dev`；前端：uni-app + Vue3 + Vite（`frontend/`，端口 5173），启动 `npm run dev:h5`；前端 `/api` 走 Vite 代理到后端。
- 演示账号：demo / 123456。前端页面路由是 hash 形式：`http://127.0.0.1:5173/#/pages/xxx/index`。
- 用户用 git worktree 管理 workbuddy 分支（路径 `/Users/luchao/WorkBuddy/Worktrees/MyAccountBook/`）；删除这类分支要先 `git worktree remove` 再删分支。远程仓库 `git@github.com:luchao008/MyAccountBook.git`。

## 图标与分类体系
- 分类预置：`src/category/category-preset.ts`，89 个分类（15 一级 + 74 二级），icon 字段存 emoji；前端经 `frontend/src/constants/icons.ts` 的 `EMOJI_TO_ICON` / `resolveCategoryIcon` 解析成图标（三级回退，永不空）。
- 图标四套：界面单色 `UI_ICONS`（icon-*）+ 分类单色 `CATEGORY_ICONS`（cat-*，图标选择器「标准」Tab）在 `constants/icons.ts`；彩色两集 `colorful:`(329)/`life:`(141) 由 `scripts/gen-color-icons.mjs` 生成到 `constants/color-icons.ts`（动态 import 分包）；**分类图片图标 `img:<中文分类名>`**（75 张，`static/cat-icons/<拼音>.png`，映射在 `constants/cat-icons.ts`，解析在 `utils/catIcon.ts`，由 `scripts/gen-cat-icons.mjs` 生成）。
- ⚠️ 静态资源文件名必须 ASCII：uni-app H5 dev server 静态中间件不解码 URL，中文名文件在 dev 下必然 404（回退 index.html）——图片资源统一用拼音文件名。
- 图标选择页 `pages/icon-picker/index.vue`：Tab=图片/多彩/生活/标准（图片为默认），选中经 `EVENT_ICON_PICKED` 回传。
- 渲染收敛在 `CategoryIcon.vue` 一处：`img:` → `<image>` / 彩色 → ColorIcon / 其余 → SvgIcon（emoji 兜底）；图片图标不触发彩色分包加载。
- 分类默认图标：54 个二级分类用 `img:`（预置 + 存量迁移 `src/migration/*-CategoryImageIcons.ts`），其余二级/一级仍走 emoji → 单色兜底。

## uCharts / qiun-data-charts 使用约定（踩坑总结，2026-09-19）
- **opts 里的函数会被丢掉**：组件把 opts 做两次 `JSON.parse(JSON.stringify())` → 自定义格式只能走 vendor
  `uni_modules/qiun-data-charts/js_sdk/u-charts/config-ucharts.js` 的**命名 formatter 表**，opts 里写 `format: '<名字>'`。
  本项目已在该表加 `amountWan`（万元压缩）/ `oddMonth`（只显示单数月）/ `trendTooltip`（tooltip 文案）→ **升级 uni_modules 需重新加回**。
- 工具提示文案用**组件属性** `tooltipFormat="xxx"`（不是 opts 键）；`extra.tooltip.bgColor` 必须是 **hex**（rgba 会让 hexToRgb 抛错、tooltip 整个画不出来）。
- `yAxis.showTitle` 是轴级总开关（`opts.yAxis.showTitle`，不是 yAxis.data[i] 里的），vendor 的 mix 默认 true → 不关会画出 `undefined`。
- 点选索引一律用 uCharts 回传的 `currentIndex`（它按"最近分类点"判界）；X 轴标签落点是 `area[3] + eachSpacing*i`。
- 验证技巧：注入 `CanvasRenderingContext2D.prototype.fillText` 可抓取 canvas 上画过的**每一段文字及其坐标** ——
  这是断言"有没有 undefined / 数据标签 / chip 是否对齐"的唯一手段（DOM 里查不到）。

## 分类选择器（记一笔）视觉规格 · 2026-09-19 定版
- 网格：4 列（25%），图标直接落在卡片上（无背板圆），40px（<360px 视口降 36）；名称 12px / #222226，图标下方居中、允许两行、**无 margin-top**（2026-09-19 luchao 定）。
- 选中：整格奶油卡片（$v11-gold-soft 底 + 1px rgba(143,83,18,.18) 描边 + 名称 500）；未选中无底无框。
- ⚠️ 网格容器必须 `align-items: flex-start`（否则两行名格子会把同行卡片拉伸出一条空白）。
- ⚠️ 窄屏 <360px：侧栏 92→80、面板内边距 12→8（否则 320px 下 4 字名断成 3+1）。

## 前端约定（v1.1 设计体系）
- 弹层层级：自定义弹层最高 1200（CategoryPicker/DateTimePicker 1200，FlowFilterPanel 等 1000，TabBar 100）；`uni.showModal/showToast/showActionSheet` 等系统弹层统一由 `frontend/src/App.vue` 抬到 **z-index 3000**（H5 专属块内）。
- ⚠️ actionSheet 的遮罩 `.uni-mask.uni-actionsheet__mask` 与弹层 `.uni-actionsheet` 是兄弟节点，必须**整层一起抬**，只抬遮罩会让遮罩反盖弹层（2026-09-19 修过）。
- 代码注释风格：大量「踩过/实测/为什么」注释，修改时保持同等详细度；固定宽度用 min-width；颜色只用 tokens（`frontend/src/styles/tokens.scss`）。
- 点击 uni-app H5 的 `<view>` 元素时，Playwright 直接 click 常被 hit-test 拦，一律走 `page.evaluate` 内 `el.click()`。

## 验证脚本约定（scripts/verify-*.mjs）
- 用 playwright-core：`/Users/luchao/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js`；Chromium 从 `~/Library/Caches/ms-playwright` 找。
- 跑之前需 5173 + 7001 服务在跑；脚本只操作自建临时数据（自己建、自己删），绝不动用户已有数据。
- 常用断言模式：登录 → 走真实 UI → 接口旁证；关键回归点要有负向对照（证明断言不是恒真）。
