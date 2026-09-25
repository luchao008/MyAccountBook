# frontend-IOS

个人记账 App 的 iOS 原生版本（Objective-C + UIKit），由 `frontend/`（uni-app）移植。

## 环境

- Xcode 26.3（iOS 26 SDK）+ iOS 26.3 模拟器 runtime
- CocoaPods（`/usr/local/bin/pod`）
- Deployment Target: iOS 17.0

## 页面结构（对齐前端）

```
登录页
└─ 账本选择页（启动页，TabBar：首页 / 我的）
   ├─ 首页（HomeView，TabBar：流水 / 记一笔 / 报表）
   │  ├─ 流水页
   │  ├─ 报表页
   │  └─ 记一笔（模态）
   └─ 我的
      ├─ 账本管理 / 新建账本
      ├─ 支出分类管理 / 收入分类管理
      ├─ 流水回收站
      ├─ 数据导出
      ├─ 流水导入
      └─ 日历（首页入口）
```

## 目录结构

```
frontend-IOS/
├── MyAccountBook/
│   ├── Models/        ABUser / ABAccount / ABCategory / ABTransaction / ABStatistics / ABSummaryItem / ABDayGroup
│   ├── Views/         通用组件（ABNavigationBar / ABEmptyView / ABTransactionCell /
│   │                  ABAmountKeyboard / ABCategoryGrid / ABCategoryPicker /
│   │                  ABTimePicker / ABIconView / ABRingChart / ABTrendChart）
│   ├── Controllers/   页面控制器（14 个）
│   ├── Services/      网络层 + 业务 API + 离线队列
│   ├── Utils/         主题 / 配置 / 存储 / 格式化 / 日期 / 根路由 / 图标映射
│   ├── Resources/     Info.plist / Assets / cat-icons（94）/ color-icons（470）
│   ├── AppDelegate.h/.m
│   └── main.m
├── Podfile / Podfile.lock
├── generate_project.rb
├── scripts/           gen_icon_map.js / gen_color_icons.js
└── MyAccountBook.xcworkspace
```

## 依赖

AFNetworking（网络）/ Masonry（布局）/ SDWebImage / MJRefresh / YYModel / YYCache / AAChartKit

## 编译运行

```bash
export PATH="/usr/local/bin:$PATH"   # pod/node/npm 都在这里
pod install
open MyAccountBook.xcworkspace      # 用 workspace 打开

# 命令行编译
xcodebuild -workspace MyAccountBook.xcworkspace -scheme MyAccountBook \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  CODE_SIGNING_ALLOWED=NO build
```

## 重新生成工程

新增源码文件后：

```bash
ruby generate_project.rb && pod install
```

## 图标体系

分类 `icon` 字段四种形态，`ABIconView` 统一分流：

| 形态 | 渲染 |
|---|---|
| `img:<中文名>` | 图片图标（94 张 PNG，`ABIconMap` 映射） |
| `colorful:<名>` / `life:<名>` | 彩色图标（470 张 PNG，`ABColorIconMap` 映射） |
| emoji | 文字渲染 |
| 空 | 兜底 📁 |

生成脚本：`scripts/gen_icon_map.js`（图片图标）、`scripts/gen_color_icons.js`（彩色图标，需 sharp）。

## 后端

- BaseURL 在 `Utils/ABConfig.h`（Dev: `http://127.0.0.1:7001/api`）
- 响应壳 `{code,data,message}`，`code==0` 成功
- 登录态失效业务码 `40100` → 清 session 并跳登录页
- 启动后端：项目根目录 `npm run dev`

## 已实现功能

**核心**：登录/注册、账本选择与管理、首页（banner + 区间统计 + 分类排行）、流水（分组/筛选/排序/滑动删除）、记一笔（金额键盘 + 二级分类 + 时间）、报表（环形图 + 趋势图 + 月/年切换）、日历、分类管理（分组树 + 增删改 + 搜索 / 批量 / 拖动排序）、账本分类设置（含从母本导入）、回收站、导入（xlsx）、导出（CSV）、离线记账队列（含幂等补传）、彩色/图片图标体系。

**统计**：61 个 .m + 60 个 .h + 14,601 行。

详见 `docs/移植实测与缺口.md` —— **实测基线 + 缺口清单，以它为准**。
`docs/移植补全计划.md` 的状态表已过期，仅保留作历史。
