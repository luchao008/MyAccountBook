# MyAccountBook 项目长期记忆

## 架构与环境
- 后端：Midway（`src/`，端口 7001），启动 `npm run dev`；前端：uni-app + Vue3 + Vite（`frontend/`，端口 5173），启动 `npm run dev:h5`；前端 `/api` 走 Vite 代理到后端。
- 演示账号：demo / 123456。前端页面路由是 hash 形式：`http://127.0.0.1:5173/#/pages/xxx/index`。
- 用户用 git worktree 管理 workbuddy 分支（路径 `/Users/luchao/WorkBuddy/Worktrees/MyAccountBook/`）；删除这类分支要先 `git worktree remove` 再删分支。远程仓库 `git@github.com:luchao008/MyAccountBook.git`。

## 图标与分类体系
- 分类预置：`src/category/category-preset.ts`，89 个分类（15 一级 + 74 二级），icon 字段存 emoji；前端经 `frontend/src/constants/icons.ts` 的 `EMOJI_TO_ICON` / `resolveCategoryIcon` 解析成图标（三级回退，永不空）。
- 图标四套：界面单色 `UI_ICONS`（icon-*）+ 分类单色 `CATEGORY_ICONS`（cat-*，图标选择器「标准」Tab）在 `constants/icons.ts`；彩色两集 `colorful:`(329)/`life:`(141) 由 `scripts/gen-color-icons.mjs` 生成到 `constants/color-icons.ts`（动态 import 分包）；**分类图片图标 `img:<中文分类名>`**（**94 张，双份产物** `.png`+`.webp`，映射在 `constants/cat-icons.ts`，解析在 `utils/catIcon.ts`，由 `scripts/gen-cat-icons.mjs` 生成）。
- ⚠️ **图片图标自 2026-10-01 起是双份产物，扩展名按平台拼**：`.webp` 给 H5（省 88.6%）、`.png` 给小程序/App（无法离线确认小程序对**包内本地 webp** 的支持，不支持就是安静地显示空白）。`CAT_ICON_FILES` 的值是**不带扩展名的基名**（`"wucan"`），扩展名由 `utils/catIcon.ts` 用条件编译 `#ifdef H5` / `#ifndef H5` 拼。**改映射格式与改消费方必须同批合入**，否则拼出 `.png.webp` 两端同时坏；两段条件编译必须互补互斥，**别改成平台白名单**。构建期还会按平台剔除用不到的那一套（`vite.config.ts` 的 `pruneUnusedIconFormat()`）。
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

## 分类选择器高亮归属（2026-09-30 定版）
- 二级分类的**高亮归属**用独立的 `pickedKey` 状态（`frontend/src/components/CategoryPicker.vue`），与左侧联动高亮 `activeKey` **解耦**。
- 为什么：`activeKey` 会随右侧滚动变化（onMainScroll 反推），若高亮直接绑 activeKey，选中后一滚动高亮就丢/跑位。
- `pickedKey` 只在两处更新：①打开时 `syncActiveOnOpen()`（优先「最近使用」，否则所属一级）；②用户点击 `pick()`（跟随点的那份副本，最近使用/一级二选一）。
- 同一二级分类在「最近使用」和所属一级各出现一次，**同一时刻只高亮一份**（由 pickedKey 决定是哪份）。

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

## 部署与传输层（gzip / 预压缩 / 缓存分层）· 2026-10-01
- **三层分工**：`/api` 由**应用层**压（`src/middleware/compress.middleware.ts`，koa-compress，阈值 1KB、只 gzip，注册在 `useMiddleware` 数组**最外层**才能读到 `ResponseMiddleware` 包装后的最终 body）；**静态产出**由 nginx 压（`gzip_static` 吐构建期预压的 `.gz`，`gzip` 兜底没预压过的）；浏览器缓存按「文件名带不带内容 hash」分层。**完整理由与踩坑见 `docs/工程约定与踩坑.md` §八 —— 动部署前先读它。**
- `deploy/build-and-export.sh` 的 **`3/7` 步**跑 `scripts/precompress.mjs` 生成 `.gz`：位置必须在两个前端构建完**之后**、打镜像**之前**（早于构建会压到旧产物，晚于打镜像则进不去镜像）。白名单只压文本、**跳过 PNG/WebP/WOFF2/ICO**；增量跳过；保留原文件（`.gz` 是额外产物，不是替换品）。
- 缓存分层：带 hash 的产物 1 年 `immutable`；`/static/cat-icons/` 1 年（靠 `?v=`）；**`/static/` 其余只给 7 天**（logo/app-icon/tabbar 是固定名、无版本号）；`index.html` 与 admin 的 `_app.config.js` **必须 `no-cache`**（否则用户被锁在旧版本，`?v=` 的新地址传不出去）。
- ⚠️ **绝不要给 nginx 的 `/api` 加 `proxy_set_header Accept-Encoding ""`** —— 会悄悄让接口体积回到未压缩状态**且不报任何错**（后端以为客户端不支持 gzip 而不压，nginx 的 `gzip_proxied any` 又只压"未压缩的"代理响应）。已在 `deploy/nginx.conf` 的 `location /api/` 就地写了警告注释。
- ⚠️ 改完后端 `src/` **必须 `npm run build`**（`npm start` 走 `dist/`）；同理 `frontend/dist` 陈旧就等于部署旧代码 —— 曾实测到陈旧产物让图标多传 2.7 MB。部署一律走 `build-and-export.sh`，别手工拼镜像。
- 验收判据：**nginx 返回的字节数 == 磁盘上 `.gz` 的字节数**（只有相等才证明走的是 `gzip_static` 预压缩，而不是"看起来也压了"的动态压缩）；另需单独造一个没有 `.gz` 的文件，验动态兜底路径确实生效。

## 已核实「不必再查」的性能结论（2026-10-01 实测，别重复排查）
- **报表页那个 747 KB 的 ECharts 从不加载**：注入路径 `ecinit` 只挂在 `<block v-if="echarts">` 内，而 `echarts` 仅由 `echartsH5` / `echartsApp` 两个 **prop 默认 `false` 且全项目无人传**（三个 grep 全空）置真。它只是产物里的死重量。报表页真实成本 = 壳 **4.7 KB gz** + 异步图表格 **69 KB gz**。
- **`<image lazy-load>` 在 H5 是 no-op**：`uni-h5.es.js` 里 `lazyLoad` 只出现 1 次（prop 声明本身）、读取 `.lazyLoad` **0 次**。H5 想懒加载只能自己上 IntersectionObserver 或"只渲染可视区"（小程序端该属性有效）。
- **`admin-web` 的 antd 注册表是超集，但量级没有传言那么大**：对照构建实测（裁掉 16/21 个注册）只省 **−235 KiB raw / −70 KB gz**，不是 423 KB。admin 真正的大头是首屏必须的 `bootstrap` chunk **415 KB gz**；用户列表页 `list` chunk 560 KiB 里几乎全是 `vxe-table`（但它是懒加载、不伤首屏）。
- **接口响应字段不用精简**（审计实测，我**未复现**）：100 条 raw 42.8 → 31.1 KB，但 **gzip 只从 4.3 → 2.8 KB** —— 嵌套的 `account` 对象 100 行完全相同，正是 gzip 最擅长消掉的冗余。结论方向可信（gzip 已开的前提下收益很小），但**这两个数字要引用前请先自己测一遍**。

## 验证脚本约定（scripts/verify-*.mjs）
- 用 playwright-core：`/Users/luchao/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js`；Chromium 从 `~/Library/Caches/ms-playwright` 找。
- 跑之前需 5173 + 7001 服务在跑；脚本只操作自建临时数据（自己建、自己删），绝不动用户已有数据。
- 常用断言模式：登录 → 走真实 UI → 接口旁证；关键回归点要有负向对照（证明断言不是恒真）。
- **不需要起服务的静态校验器（改完先跑这些，秒级）**：`scripts/verify-cat-icon-assets.mjs`（图标资产 30 条：两套按基名一一对应 / 映射格式 / 文件头尺寸 alpha / **有没有哪个 webp 反而更大** / **用 uni 真实预处理器实测两端产出的 URL**）与 `scripts/precompress.mjs`（预压缩，同时可当产物完整性审计）。它们是 Playwright 版的**离线前哨**。
- ⚠️ 写校验器时两条硬要求（否则会造出"永远绿的校验器"）：**每条断言都要带"样本数 > 0"前置条件**（空集合会让断言空洞通过）；**匹配范围要先剥掉注释**（注释里大段讨论 `.png` / `#ifdef` 会让判据被污染，实测因此报过 4 个假阳性）。
