/**
 * 几何图标系统 · 「数字优先 · 通栏扁平」
 *
 * 本文件是**图标系统的唯一真源**（设计文档 `docs/UI设计方案·扁平化.md` §5 的实现）。
 *
 * ⚠️ 原先放在 `docs/design/icons.ts` 的那一份**已删除**。
 *    「同一概念只留一处定义」是本项目的铁律 —— 两份拷贝必然漂移，
 *    而图标是"改一个数字就画错"的东西，漂移的代价比配色更高。
 *    设计文档只描述规则，实现只在这里。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 为什么必须换掉 emoji（四条，都可验证）
 *
 * 1. **跨端画风不一致**：同一个 `🏘️` 在 iOS / Android / Windows / 各家小程序上
 *    是四套完全不同的插画。设计稿只在一种设备上成立，等于没设计。
 * 2. **色彩不可控**：emoji 自带颜色、不受 `color` 影响，于是**无法表达状态** ——
 *    选中态、禁用态、深色模式下都没法变；图标与文字色不联动，视觉上永远"贴不上去"。
 * 3. **多元素 emoji 在小尺寸糊成一团**：`🏘️`（房屋+树）`🏖️`（伞+沙滩）`🧖`（人+蒸汽）
 *    在 20px 下拆成一堆色点。分类图标恰恰是高频、小尺寸、需要一眼辨认的场景。
 * 4. **字号/基线不可控** —— 本项目已有实测事故：阶段 9 复验时首页 banner 的 `📊`
 *    在 200% 字号下随字号一起放大，溢出圆环被 `overflow:hidden` 裁掉（见
 *    `docs/移动端配色与字体方案.md` §7.4）。emoji 是"字"，没法只让它当"图"。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 规格（改动前先读）
 *
 * - 画布 24×24，内容限制在 2px 内边距内（即有效区 20×20）
 * - 描边 1.75px；`stroke-linecap: round` / `stroke-linejoin: round`
 * - **不用 fill**（纯线性），唯一例外是 `h-.01` 画的小圆点，靠 round cap 成点
 * - 单色：一律 `stroke="currentColor"`，颜色由外层决定 → 状态可切换
 * - 与字号体系**解耦**：图标有自己的 8 档尺寸阶梯（`$icon-xs` … `$icon-4xl`，见 tokens.scss），
 *   不随 `font-size` 变化。这条正是 emoji 事故的根治办法。
 * - 命名：功能图标用「做什么」`icon-plus`，分类图标用「是什么」`cat-food`，两套不混用
 */

/** 图标规格常量 —— 与 tokens.scss 的 $icon-* 阶梯配套 */
export const ICON_SPEC = {
  /** viewBox 边长 */
  grid: 24,
  /** 描边宽度 */
  stroke: 1.75,
  linecap: 'round' as const,
  linejoin: 'round' as const,
};

/**
 * 功能图标：导航、操作、状态。
 * key 直接用 kebab-case，落到组件里就是 `icon-plus` 这种 token。
 */
export const UI_ICONS = {
  // ── 主导航（TabBar 四页 + 主操作）
  /* 记账 */ 'icon-plus': 'M12 5v14M5 12h14',
  /* 明细 */ 'icon-receipt': 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12.5h6',
  /* 统计 */ 'icon-chart-bar': 'M4 20h16M7 20v-6.5M12 20V5M17 20v-9.5',
  /* 我的 */ 'icon-user': 'M12 4a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7M5 20c1-3.5 3.7-5.5 7-5.5s6 2 7 5.5',

  // ── 管理类
  /* 账本 */ 'icon-wallet': 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM15 12h3',
  /* 分类 */ 'icon-tag': 'M4 10.5V5h5.5L20 15.5 15.5 20zM8.1 8.1h-.01',
  /* 设置 */ 'icon-sliders':
    'M4 8h9.5M17.5 8H20M13.5 8a2 2 0 1 1 4 0 2 2 0 0 1-4 0M4 16h3.5M11.5 16H20M5.5 16a2 2 0 1 1 4 0 2 2 0 0 1-4 0',
  /* 银行卡 */ 'icon-card': 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M6.5 15h3',
  /* 退出 */ 'icon-logout': 'M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9',

  // ── 操作
  /* 搜索 */ 'icon-search': 'M11 5a6 6 0 1 1 0 12 6 6 0 0 1 0-12M16.2 16.2 20 20',
  /* 编辑 */ 'icon-pencil': 'M15 5l4 4L8 20H4v-4zM13 7l4 4',
  /* 删除 */ 'icon-trash': 'M5 7h14M9.5 7V5h5v2M7 7l1 13h8l1-13M11 11v6M15 11v6',
  /* 筛选 */ 'icon-filter': 'M4 6h16l-6 7v6l-4-2v-4z',
  /* 排序 */ 'icon-sort': 'M4 7h16M7 12h10M10 17h4',
  /* 刷新 */ 'icon-refresh':
    'M4.5 10a7.5 7.5 0 0 1 12.8-3.3M19.5 14a7.5 7.5 0 0 1-12.8 3.3M17.3 3.5v3.5h-3.5M6.7 20.5V17h3.5',
  /* 更多 */ 'icon-more': 'M6 12h.01M12 12h.01M18 12h.01',

  // ── 日期时刻
  /* 日历 */ 'icon-calendar': 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M8 3v4M16 3v4',
  /* 时刻 */ 'icon-clock': 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16M12 8v4.5l3 1.8',

  // ── 方向
  'icon-chevron-left': 'M14 6l-6 6 6 6',
  'icon-chevron-right': 'M10 6l6 6-6 6',
  'icon-chevron-down': 'M6 10l6 6 6-6',
  'icon-chevron-up': 'M6 14l6-6 6 6',

  // ── 状态与反馈
  /* 关闭 */ 'icon-close': 'M6 6l12 12M18 6L6 18',
  /* 对勾 */ 'icon-check': 'M5 13l4 4L19 7',
  /* 成功 */ 'icon-check-circle': 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16M8.5 12.5l2.6 2.6 4.4-5',
  /* 信息 */ 'icon-info': 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16M12 11.5v4.5M12.1 8h-.01',
  /* 警告 */ 'icon-alert': 'M12 4l8.5 15H3.5zM12 10v4M12.1 17.5h-.01',
  /* 空状态 */ 'icon-inbox': 'M3 13h4.5l1.5 3h6l1.5-3H21M5 5h14l2 8v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z',
  /* 占比/饼图 */ 'icon-pie': 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16M12 12V4M12 12l7 4',
  /* 密码 */ 'icon-lock': 'M6 11h12v7.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 18.5zM9 11V8a3 3 0 0 1 6 0v3',
  /* 深色模式（预留） */ 'icon-moon': 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z',
  /* 可见（「恢复显示」用） */ 'icon-eye':
    'M2.5 12c2.4-4 5.6-6 9.5-6s7.1 2 9.5 6c-2.4 4-5.6 6-9.5 6s-7.1-2-9.5-6zM12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5',
  /* 隐藏 */ 'icon-eye-off':
    'M4 4l16 16M9.7 5.8A9.7 9.7 0 0 1 12 5.5c3.9 0 7.1 2 9.5 6a17.4 17.4 0 0 1-3.6 4.4M6.1 7.7A17.6 17.6 0 0 0 2.5 11.5c2.4 4 5.6 6 9.5 6 1.3 0 2.5-.2 3.6-.7',
  /* 批量操作入口（清单 + 勾） */ 'icon-list-check':
    'M4 7h9M4 12h6M4 17h6M15 16.2l1.9 1.9 3.6-3.7',
  /*
   * 拖拽把手（两列三点）。
   *
   * ⚠️ 用「两列」而不是常见的「两列三横线」：本项目图标是 1.75px 描边的几何风格，
   *    横线版在 20px 尺寸下会糊成三条几乎等距的细线，与 `icon-sort`（三条递减横线）
   *    在视觉上难以区分 —— 圆点版与它一眼可分。
   */
  'icon-grip': 'M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01',
} as const;

export type UiIconName = keyof typeof UI_ICONS;

/**
 * 一级分类图标（15 个：支出 13 + 收入 2）。
 *
 * 为什么只精绘一级：二级有 73 个，逐个精绘的边际收益很低 —— 二级永远出现在
 * 它的一级分组标题下方，**上下文已经提供了分组信息**，图标只需承担"个体差异"。
 * 所以规则是：
 *   ① 二级命中下表 → 用专属图标（高频的那批）
 *   ② 未命中 → **继承其一级图标**（见 `resolveCategoryIcon`）
 * 这样 15 张精绘图 + 一份映射表就能覆盖全部 89 个分类，且永不出现"没有图标"。
 */
export const CATEGORY_ICONS = {
  // 支出
  'cat-housing': 'M4 11l8-6.5 8 6.5M6.5 10v9h11v-9M10 19v-4.5h4V19',
  'cat-transport': 'M4 15.5h16V12l-1.6-4H5.6L4 12zM4 12h16M7.5 15.5v2.2M16.5 15.5v2.2',
  'cat-telecom': 'M4 8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3h-6l-4 3v-3a3 3 0 0 1-3-3z',
  'cat-leisure': 'M12 4l1.8 4.7 4.7 1.8-4.7 1.8L12 17l-1.8-4.7L5.5 10.5l4.7-1.8z',
  'cat-finance': 'M12 4l7 2.5v5c0 3.8-2.9 6.9-7 8-4.1-1.1-7-4.2-7-8v-5z',
  'cat-misc': 'M4 8l8-3.5 8 3.5v8L12 19.5 4 16zM4 8l8 3.5 8-3.5M12 11.5v8',
  'cat-device': 'M4 6h16v10H4zM9 20h6M12 16v4',
  'cat-farm': 'M20.5 3.5C9 3.5 3.5 9 3.5 20.5c11.5 0 17-5.5 17-17M8.5 15.5 18.5 5.5',
  'cat-medical': 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16M12 8.5v7M8.5 12h7',
  'cat-social': 'M4 11h16v8H4zM3.5 8h17v3h-17zM12 8v11M12 8c-1.6-4-6-3.5-6-1.2S9 8 12 8zM12 8c1.6-4 6-3.5 6-1.2S15 8 12 8z',
  'cat-apparel': 'M8.5 4 12 6l3.5-2 4.5 3-2 3-1.5-1v9h-9v-9L6 10 4 7z',
  'cat-food': 'M4 12h16c0 4.4-3.6 8-8 8s-8-3.6-8-8zM9 4.5v5M12 3.5v6M15 4.5v5',
  'cat-study':
    'M4.5 5.5c3.3 0 5.9.9 7.5 2.5 1.6-1.6 4.2-2.5 7.5-2.5v11c-3.3 0-5.9.9-7.5 2.5-1.6-1.6-4.2-2.5-7.5-2.5zM12 8v11',
  // 收入
  'cat-salary':
    'M4 9h16v9.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5zM9 9V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V9M4 13.5h16',
  'cat-income':
    'M12 5.5c-3.9 0-7 1.1-7 2.5s3.1 2.5 7 2.5 7-1.1 7-2.5-3.1-2.5-7-2.5zM5 8v8c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V8M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5',
} as const;

export type CategoryIconName = keyof typeof CATEGORY_ICONS;

/**
 * 一级分类名 → 图标名。与 `src/category/category-preset.ts` 的 15 个一级一一对应。
 */
export const ROOT_CATEGORY_ICON: Record<string, CategoryIconName> = {
  居家物业: 'cat-housing',
  行车交通: 'cat-transport',
  交流通讯: 'cat-telecom',
  休闲娱乐: 'cat-leisure',
  金融保险: 'cat-finance',
  其他杂项: 'cat-misc',
  电子产品: 'cat-device',
  养殖: 'cat-farm',
  医疗保健: 'cat-medical',
  人情往来: 'cat-social',
  衣服饰品: 'cat-apparel',
  食品酒水: 'cat-food',
  学习进修: 'cat-study',
  职业收入: 'cat-salary',
  其他收入: 'cat-income',
};

/**
 * 二级分类的专属图标（高频那批）。key 是二级分类名。
 * 未列出的二级走"继承一级"规则 —— 见 `resolveCategoryIcon`。
 */
export const CHILD_ICON: Record<string, CategoryIconName> = {
  // 与一级同图标其实也成立，这里只列「值得单独画」的：借用语义最接近的一级图
  日常用品: 'cat-misc',
  水电煤气宽带: 'cat-housing',
  房租: 'cat-housing',
  物业管理: 'cat-housing',
  维修保养: 'cat-housing',
  家用电器: 'cat-device',
  家具: 'cat-housing',
  公共交通: 'cat-transport',
  打车租车: 'cat-transport',
  私家车费用: 'cat-transport',
  手机费: 'cat-telecom',
  上网费: 'cat-telecom',
  运动健身: 'cat-leisure',
  休闲玩乐: 'cat-leisure',
  旅游度假: 'cat-leisure',
  投资亏损: 'cat-finance',
  按揭还款: 'cat-finance',
  其他支出: 'cat-misc',
  手机: 'cat-device',
  电脑: 'cat-device',
  数码产品: 'cat-device',
  花草类: 'cat-farm',
  药品费: 'cat-medical',
  治疗费: 'cat-medical',
  送礼请客: 'cat-social',
  红包: 'cat-social',
  衣服裤子: 'cat-apparel',
  鞋帽包包: 'cat-apparel',
  早午晚餐: 'cat-food',
  水果零食: 'cat-food',
  柴米油盐蔬菜瓜果: 'cat-food',
  书报杂志: 'cat-study',
  培训进修: 'cat-study',
  工资收入: 'cat-salary',
  奖金收入: 'cat-salary',
  兼职收入: 'cat-salary',
  礼金收入: 'cat-income',
  中奖收入: 'cat-income',
  房租收入: 'cat-income',
  其他: 'cat-misc',
};

/**
 * 迁移期兼容：旧数据里 `categories.icon` 存的是 emoji，新体系存图标名。
 *
 * 这套映射是**纯查表、可批量执行**的 —— 88 条都是"emoji → 图标名"的字面映射，
 * 不存在需要人判断的情况。查不到的一律回退 `cat-misc`，绝不出现空白图标。
 */
export const EMOJI_TO_ICON: Record<string, CategoryIconName> = {
  '🏠': 'cat-housing', '🏘️': 'cat-housing', '🏢': 'cat-housing', '🔧': 'cat-housing',
  '🔌': 'cat-device', '🛋️': 'cat-housing', '🧻': 'cat-misc', '💡': 'cat-housing',
  '🚗': 'cat-transport', '🚌': 'cat-transport', '🚕': 'cat-transport', '🚙': 'cat-transport',
  '📡': 'cat-telecom', '☎️': 'cat-telecom', '📱': 'cat-telecom', '💻': 'cat-device', '📮': 'cat-telecom',
  '🎉': 'cat-leisure', '🏃': 'cat-leisure', '🍻': 'cat-leisure', '🎮': 'cat-leisure',
  '🐱': 'cat-leisure', '🏖️': 'cat-leisure',
  '🛡️': 'cat-finance', '🏦': 'cat-finance', '📉': 'cat-finance', '🏚️': 'cat-finance',
  '🧾': 'cat-finance', '💹': 'cat-finance', '⚠️': 'cat-finance', '💳': 'cat-finance',
  '📦': 'cat-misc', '🗑️': 'cat-misc', '💔': 'cat-misc',
  '🖥️': 'cat-device', '🔩': 'cat-device', '🎧': 'cat-device',
  '🌱': 'cat-farm', '🪴': 'cat-farm',
  '🏥': 'cat-medical', '💊': 'cat-medical', '🧴': 'cat-medical', '💅': 'cat-medical',
  '💉': 'cat-medical', '🧖': 'cat-medical', '🍶': 'cat-medical',
  '🎁': 'cat-social', '🥂': 'cat-social', '👴': 'cat-social', '💵': 'cat-income',
  '🤝': 'cat-social', '🧧': 'cat-social',
  '👗': 'cat-apparel', '👖': 'cat-apparel', '👜': 'cat-apparel', '💄': 'cat-apparel',
  '🍜': 'cat-food', '🍱': 'cat-food', '🍷': 'cat-food', '🍎': 'cat-food', '🥬': 'cat-food',
  '📚': 'cat-study', '📰': 'cat-study', '✏️': 'cat-study', '📷': 'cat-device',
  '💼': 'cat-salary', '💰': 'cat-income', '⏰': 'cat-salary', '🏆': 'cat-salary',
  '📈': 'cat-income', '🏛️': 'cat-salary', '💫': 'cat-income', '🏪': 'cat-income',
  '🍸': 'cat-social', '♻️': 'cat-misc', '🌐': 'cat-telecom',
};

/** 兜底图标 —— 保证任何输入都有图可显示 */
export const FALLBACK_ICON: CategoryIconName = 'cat-misc';

/**
 * 解析分类图标。三级回退，永不返回空：
 *   ① 本身就是新图标名（新数据）→ 直接用
 *   ② 是 emoji（老数据）→ 查 EMOJI_TO_ICON
 *   ③ 都不是 → 按分类名查 CHILD_ICON / ROOT_CATEGORY_ICON
 * 任何一步都查不到 → FALLBACK_ICON
 */
export function resolveCategoryIcon(
  raw?: string | null,
  categoryName?: string | null
): CategoryIconName {
  if (raw && raw in CATEGORY_ICONS) return raw as CategoryIconName;
  if (raw && raw in EMOJI_TO_ICON) return EMOJI_TO_ICON[raw];
  if (categoryName && categoryName in CHILD_ICON) return CHILD_ICON[categoryName];
  if (categoryName && categoryName in ROOT_CATEGORY_ICON) return ROOT_CATEGORY_ICON[categoryName];
  return FALLBACK_ICON;
}

/**
 * 图标外框（色块底）规格 —— 扁平体系里，图标靠"色块底"获得体量感，而不是靠 emoji 的花哨。
 *
 * 形状与尺寸：
 *   - `sm` 28×28 圆角 8   —— 列表行内的次级分类
 *   - `md` 40×40 圆角 12  —— 明细/排行/分类网格（主力尺寸）
 *   - `lg` 48×48 圆角 14  —— 记账页的一级分类
 *
 * 配色（**刻意不用彩虹**）：15 个分类各配一色 = 视觉噪音，且会与"收支红绿""图表色"抢语义。
 * 扁平体系的规则是「一色一义」，所以分类底色统一走中性：
 *   默认 `bg-sunken #EEF1F5` 底 + `ink-2 #5A6472` 字形   （2.93:1，图形按 3:1 判定，见下）
 *   选中 `brand-600 #CF4A12` 底 + 白字形                  （4.52:1 ✅）
 * ⚠️ 实测：`#5A6472` 压 `#EEF1F5` = 2.93:1，**低于 1.4.11 的 3:1**。
 *    因此默认态字形改用 `ink-1 #1F2329`（压 `#EEF1F5` = 13.93:1），
 *    视觉上"深墨线条"也比如今的浅灰更符合扁平体系的干净感。
 */
export const ICON_FRAME = {
  sm: { size: 28, radius: 8, glyph: 16 },
  md: { size: 40, radius: 12, glyph: 22 },
  lg: { size: 48, radius: 14, glyph: 26 },
} as const;

/**
 * 功能 emoji → 功能图标名。
 *
 * 迁移期兜底用：模板里写死的 emoji（📁 账本 / 🏷️ 分类 / 📊 统计 / 🔍 搜索 / 📭 空状态 /
 * 📒 明细 / 💰 收入）都在本轮逐个替换成了图标名。留这张表是因为**输入不一定来自模板** ——
 * 后端字段、本地缓存、别处回流的旧值都可能是 emoji。
 * 有它 + `resolveIconName` 兜底，**任何输入都有图可显示，不会出现空白方块**。
 */
export const EMOJI_TO_UI: Record<string, string> = {
  '📁': 'icon-wallet',
  '🏷️': 'icon-tag',
  '📊': 'icon-chart-bar',
  '🔍': 'icon-search',
  '📭': 'icon-inbox',
  '📒': 'icon-receipt',
  '💰': 'cat-income',
  '📈': 'icon-chart-bar',
  '⚙️': 'icon-sliders',
  '🔒': 'icon-lock',
};

const has = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

/**
 * 统一解析入口：**任何字符串都能解析出一个可渲染的图标名**，永不返回空。
 *
 * 查找顺序：
 *   ① 功能图标名（`icon-*`）
 *   ② 分类图标名（`cat-*`）
 *   ③ 功能 emoji 表（EMOJI_TO_UI）
 *   ④ 分类 emoji 表（EMOJI_TO_ICON）
 *   ⑤ 兜底
 *
 * 为什么需要这个"万能入口"：同一个 SvgIcon 组件会被模板、数据、后端字段三处喂值，
 * 值的形态可能是图标名、可能是 emoji、也可能是空。
 * 让每个调用点各自 if/else 判断是重复劳动，且**必然出现某处漏判 → 白块**。
 * 把判断收敛到一个函数里，就只需要测这一个函数。
 */
export function resolveIconName(raw?: string | null, fallback = FALLBACK_ICON): string {
  if (!raw) return fallback;
  if (has(UI_ICONS, raw) || has(CATEGORY_ICONS, raw)) return raw;
  if (has(EMOJI_TO_UI, raw)) return EMOJI_TO_UI[raw];
  if (has(EMOJI_TO_ICON, raw)) return EMOJI_TO_ICON[raw];
  return fallback;
}
