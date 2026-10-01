/**
 * 分类图标 · 彩色软胶版（「图标选择页 → 标准 Tab」的图标正文）
 *
 * ── 这是什么 ──────────────────────────────────────────────────────────────
 * 「标准」Tab 原本是 15 个**单色线性几何**图标（24 网格 / 1.75px 描边 / `currentColor`）。
 * 本文件把它们换成**彩色软胶渐变**矢量，与同一页「图片」Tab 的 94 张位图插画成一套。
 * key 与 `constants/icons.ts` 的 `CATEGORY_ICONS` / `ROOT_CATEGORY_ICON` / `CHILD_ICON`
 * **完全一致** —— 换的是画法，不是命名，所以所有映射表与数据字段都不用动。
 *
 * ── 规格从哪来（全部实测，可复现）────────────────────────────────────────
 * 不是照感觉画的。下列参数由 `node scripts/measure-cat-icon-style.mjs` 从
 * `assets/cat-icons-original/*.svg`（2048 高清原图）采样全部 94 张后取中位数 / 均值得到：
 *
 *   | 维度 | 实测 | 本文件的取值 |
 *   |---|---|---|
 *   | 内容占画布 | bbox 宽 61.9% / 高 53.3%，左留白 20.3% / 上 17.6% | 48 画布，内容盒约 30×27 居中 |
 *   | 圆角 | roundRatio 中位 0.691 | 矩形圆角 ≈ 边长 25%；条状元素用胶囊（r = 半宽） |
 *   | 饱和度 | p10/p50/p90 = 0.129 / 0.420 / 0.665 | 主色 S ∈ [0.5, 0.9] |
 *   | 明度 | p50 0.962 | 主色 V ∈ [0.82, 1.0]（整体浅亮） |
 *   | 渐变 | 色相档数中位 2（50/94 张为双色相） | **双色相垂直渐变**，顶部浅、底部深 |
 *   | 光源 | lightDir 中位 (−0.006, −0.224) | 高光带压在顶部 |
 *   | 柔光 | glowReach 中位 0.0%（贴轮廓、不外扩） | 径向渐变椭圆，半径贴合外轮廓 |
 *
 * ── 四条实现约定（改之前先读）────────────────────────────────────────────
 * 1. **一个图标一条渐变**，`gradientUnits="userSpaceOnUse"`，坐标固定在图标自身的内容盒上，
 *    而不是默认的 `objectBoundingBox`。默认模式下同一个图标里每个子形状各算各的 bbox，
 *    渐变会被"分段"，看起来像贴纸拼的。参考图集也是"整个物体一条渐变"。
 *    → 这一点由下面的 `art()` 统一保证，**不要**给单个形状另加 fill。
 *
 * 2. **高光 / 暗部用"同一份几何再画一遍"实现，而不是 `clipPath`**。
 *    几何字符串只写一处，`geo` / `sharp` / `outline` 三份几何各画**三遍**
 *    （本色 / 顶部高光 / 底部压深），天然不会出现"裁剪路径和形状对不上"的漂移；
 *    也避开了 `<g>` 不能放进 `clipPath` 的限制。
 *    · 高光渐变 y ∈ `[yTop, yTop+16]` → **只有顶部一段吃到白光**，与实测高光方向一致；
 *    · 暗部渐变从 45% 处起压深到 30% 透明 → **体量感**（只画双色渐变会显得像彩色纸片）。
 *    → 这三遍由 `art()` 统一保证，**不要**给单个形状另加 fill 或单独调光。
 *
 * 3. **渐变 id 必须带图标前缀**。同页会同时渲染多个图标，`url(#id)` 取的是
 *    **文档中第一个同 id 元素** —— id 撞了就是互相串色（见 `constants/color-icons.ts` 同类说明）。
 *    → 由 `art()` 按 `id` 前缀统一生成，**不要手写 id**。
 *
 * 4. **刻意不用 SVG 滤镜**（`feGaussianBlur` 等）。柔光用径向渐变椭圆模拟：
 *    这一页要同时铺几十个图标，滤镜是真实的渲染开销，而项目 2026-10-01 刚做过一轮
 *    "前端丝滑度"优化，不该在这里把成本加回去。
 *
 * ⚠️ 正文由 `ColorIcon` 用 `v-html` 注入 `<svg viewBox="0 0 48 48">`，
 *    所以每个 body 自带 `<defs>`，且 id 唯一。
 */

/** 单个图标：画布边长 + SVG 正文（含 defs） */
export interface CategoryIconArt {
  /** viewBox 边长（本集统一 48） */
  box: number;
  /** SVG 正文，会被注入 `<svg viewBox="0 0 box box">` */
  body: string;
}

interface ArtSpec {
  /** 渐变 / 元素的 id 前缀（必须唯一，全小写字母） */
  id: string;
  /** 渐变起点色（顶部，浅） */
  from: string;
  /** 渐变终点色（底部，深） */
  to: string;
  /** 内容盒顶 y —— 渐变与高光的起点 */
  yTop: number;
  /** 内容盒底 y —— 渐变终点 */
  yBot: number;
  /** 柔光椭圆 `[中心 y, rx, ry]` */
  glow: [number, number, number];
  /** 扁平几何：圆角矩形 / 圆 / 椭圆 / 光滑路径（不描边，靠自身 rx 收圆角） */
  geo?: string;
  /** 尖角几何：靠 round join 的描边收圆角（三角形、盾牌、衣服…） */
  sharp?: string;
  /** `sharp` 的描边宽度 */
  sw?: number;
  /** 空心几何：只描边不填充（礼物蝴蝶结的圆环、蒸汽…） */
  outline?: string;
  /** `outline` 的描边宽度 */
  ow?: number;
  /** 细节层（车窗、圆点、缎带、对勾…），画在高光之上 */
  details?: string;
}

/**
 * 高光带高度：`yTop` 往下 20 单位内从 46% 白渐隐到 0。
 *
 * 这个跨度是量出来的，不是选的：`node --experimental-strip-types
 * scripts/measure-cat-icon-style.mjs --ours` 会算"最亮 8% 像素的重心相对外接框中心"
 * （lightDir），参考集中位 −0.224。第一版跨度只给了 16，实测 −0.315（偏 −41%），
 * 高光全挤在顶上 —— 拉到 20 之后就落回容差内。
 */
const GLOSS_SPAN = 22;
/**
 * 暗部带：从内容盒 45% 处开始往下加深，到最底部 16% 透明度。
 *
 * ⚠️ 这个值只能小。参考图集的体量**不是靠压暗底部**做的 —— 实测其本体明度
 * p10/p50/p90 = 0.888 / 0.962 / 0.992，**最暗的 10% 也仍然很亮**；
 * 体积感来自"顶部浅而低饱和 → 底部深而高饱和"的**饱和/色相推移**，明度对比极弱。
 * 第一版给了 0.30，实测本体高光重心 −0.363（参考 −0.190，超了 91%）——
 * 压暗底部会把"最亮的那批像素"全挤到顶上，光就假了。
 */
const SHADE_FROM = 0.45;
const SHADE_ALPHA = 0.1;

/**
 * 把一份几何画三遍：本色 → 顶部高光 → 底部压深。
 * 几何只写一处，三层叠加自动对齐 —— 见文件头第 2 条约定。
 */
function art(spec: ArtSpec): CategoryIconArt {
  const {
    id,
    from,
    to,
    yTop,
    yBot,
    glow,
    geo = '',
    sharp = '',
    sw = 0,
    outline = '',
    ow = 0,
    details = '',
  } = spec;
  const [gcy, grx, gry] = glow;

  const roundAttrs = (paint: string) =>
    `fill="${paint}" stroke="${paint}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"`;

  /** 同一份几何，分别套本色 / 高光 / 暗部三种 paint */
  const passes = (paint: string) =>
    (geo ? `<g fill="${paint}">${geo}</g>` : '') +
    (sharp ? `<g ${roundAttrs(paint)}>${sharp}</g>` : '') +
    (outline
      ? `<g fill="none" stroke="${paint}" stroke-width="${ow}" stroke-linecap="round" stroke-linejoin="round">${outline}</g>`
      : '');

  return {
    box: 48,
    body:
      `<defs>` +
      `<linearGradient id="${id}-g" gradientUnits="userSpaceOnUse" x1="20" y1="${yTop}" x2="28" y2="${yBot}">` +
      `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
      `</linearGradient>` +
      `<linearGradient id="${id}-h" gradientUnits="userSpaceOnUse" x1="15" y1="${yTop}" x2="15" y2="${yTop + GLOSS_SPAN}">` +
      `<stop offset="0" stop-color="#FFFFFF" stop-opacity=".15"/>` +
      `<stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>` +
      `</linearGradient>` +
      `<linearGradient id="${id}-s" gradientUnits="userSpaceOnUse" x1="15" y1="${yTop}" x2="15" y2="${yBot}">` +
      `<stop offset="0" stop-color="${to}" stop-opacity="0"/>` +
      `<stop offset="${SHADE_FROM}" stop-color="${to}" stop-opacity="0"/>` +
      `<stop offset="1" stop-color="${to}" stop-opacity="${SHADE_ALPHA}"/>` +
      `</linearGradient>` +
      `<radialGradient id="${id}-a" cx=".5" cy=".5" r=".5">` +
      `<stop offset="0" stop-color="${to}" stop-opacity=".20"/>` +
      `<stop offset="1" stop-color="${to}" stop-opacity="0"/>` +
      `</radialGradient>` +
      `</defs>` +
      // ① 柔光：贴着轮廓、不外扩
      `<ellipse cx="24" cy="${gcy}" rx="${grx}" ry="${gry}" fill="url(#${id}-a)"/>` +
      // ② 本色
      passes(`url(#${id}-g)`) +
      // ③ 顶部高光：完全相同的几何再画一遍，只吃顶部一段的白色渐变
      passes(`url(#${id}-h)`) +
      // ④ 底部压深：同一份几何第三遍，只有下段吃到深色 → 体量感
      passes(`url(#${id}-s)`) +
      // ⑤ 细节层
      details,
  };
}

/**
 * 15 个一级分类图标（支出 13 + 收入 2）。
 * 配色按色相环铺开：暖橙 → 珊瑚 → 玫紫 → 靛蓝 → 天青 → 薄荷 → 青绿 → 黄绿，
 * 与「图片」集的色相分布同族（那套本身也是蓝橙两带为主）。
 */
export const CATEGORY_ICONS_ART = {
  // ── 支出 ────────────────────────────────────────────────────────────────
  /**
   * 居家物业 · 屋檐 + 主体 + 门 · 琥珀
   *
   * 屋檐刻意比主体**宽出一截**（檐口外挑）。第一版两者同宽，56px 下糊成一个圆角方块，
   * 完全读不出"房子" —— 小尺寸图标靠**轮廓的宽窄对比**建立识别度。
   */
  'cat-housing': art({
    id: 'ch',
    from: '#FFC46B',
    to: '#FF9B90',
    yTop: 9,
    yBot: 38,
    glow: [27, 17, 13.5],
    geo: '<rect x="14.5" y="21" width="19" height="16.5" rx="4.5"/>',
    sharp: '<path d="M13 21.6L24 11.2L35 21.6"/>',
    sw: 5.6,
    details:
      '<rect x="21" y="28.5" width="6" height="9" rx="3" fill="#FFFFFF" fill-opacity=".62"/>',
  }),

  /** 行车交通 · 车身 + 车窗 + 双轮 · 天蓝 */
  'cat-transport': art({
    id: 'ct',
    from: '#6FB7FF',
    to: '#9787FF',
    yTop: 15,
    yBot: 37,
    glow: [27, 17, 13],
    geo:
      '<rect x="9.5" y="14.5" width="29" height="18" rx="8"/>' +
      '<circle cx="16.5" cy="33.5" r="3.6"/><circle cx="31.5" cy="33.5" r="3.6"/>',
    details:
      '<g fill="#FFFFFF" fill-opacity=".92">' +
      '<rect x="14.2" y="18.6" width="6" height="8" rx="2.6"/>' +
      '<rect x="21.6" y="18.6" width="6" height="8" rx="2.6"/>' +
      '<rect x="29" y="18.6" width="6" height="8" rx="2.6"/></g>',
  }),

  /** 交流通讯 · 圆角气泡 + 三个点 · 蓝紫 */
  'cat-telecom': art({
    id: 'ck',
    from: '#8C9CFF',
    to: '#B96AFF',
    yTop: 12,
    yBot: 33,
    glow: [24, 17, 13],
    geo: '<rect x="9.5" y="12" width="29" height="20.5" rx="8"/>',
    details:
      '<g fill="#FFFFFF" fill-opacity=".95">' +
      '<circle cx="17.5" cy="22.2" r="2.2"/><circle cx="24" cy="22.2" r="2.2"/>' +
      '<circle cx="30.5" cy="22.2" r="2.2"/></g>',
  }),

  /** 休闲娱乐 · 四角星 + 小星点 · 淡紫 */
  'cat-leisure': art({
    id: 'cl',
    from: '#BC96FF',
    to: '#DC74FF',
    yTop: 10,
    yBot: 38,
    glow: [26, 16, 13.5],
    sharp:
      '<path d="M24 10C25.4 17.6 30.4 22.6 38 24C30.4 25.4 25.4 30.4 24 38C22.6 30.4 17.6 25.4 10 24C17.6 22.6 22.6 17.6 24 10Z"/>',
    sw: 2.4,
    details:
      '<path d="M36.5 7.8C36.8 9.8 38.3 11.3 40.3 11.6C38.3 11.9 36.8 13.4 36.5 15.4' +
      'C36.2 13.4 34.7 11.9 32.7 11.6C34.7 11.3 36.2 9.8 36.5 7.8Z" fill="#FFFFFF" fill-opacity=".55"/>',
  }),

  /** 金融保险 · 盾牌 + 对勾 · 青蓝 */
  'cat-finance': art({
    id: 'cf',
    from: '#6BD3EB',
    to: '#8EA3F8',
    yTop: 10,
    yBot: 38,
    glow: [26, 16, 13.5],
    sharp:
      '<path d="M24 10L35.5 14.1V23.2C35.5 30.3 30.6 35.6 24 38C17.4 35.6 12.5 30.3 12.5 23.2V14.1Z"/>',
    sw: 3,
    details:
      '<path d="M18.6 23.4L22.4 27.2L29.8 19.4" fill="none" stroke="#FFFFFF" stroke-opacity=".92"' +
      ' stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>',
  }),

  /** 其他杂项 · 盖 + 盒 · 灰蓝 */
  'cat-misc': art({
    id: 'cm',
    from: '#A6BACE',
    to: '#9B9ACC',
    yTop: 12,
    yBot: 37,
    glow: [26, 17, 13],
    geo: '<rect x="9.5" y="12.5" width="29" height="8" rx="4"/><rect x="12" y="19.5" width="24" height="17" rx="5"/>',
    details: '<rect x="21" y="15" width="6" height="3" rx="1.5" fill="#FFFFFF" fill-opacity=".5"/>',
  }),

  /** 电子产品 · 显示器 + 支架 + 底座 · 青蓝 */
  'cat-device': art({
    id: 'cd',
    from: '#5FB8F2',
    to: '#8D84FE',
    yTop: 13,
    yBot: 39,
    glow: [26, 17, 13.5],
    geo:
      '<rect x="9.5" y="13" width="29" height="19.5" rx="5.5"/>' +
      '<rect x="21.5" y="32" width="5" height="4.5" rx="2"/>' +
      '<rect x="15.5" y="35" width="17" height="4" rx="2"/>',
    details:
      '<rect x="13" y="16.5" width="22" height="12.5" rx="3.2" fill="#FFFFFF" fill-opacity=".9"/>',
  }),

  /** 养殖 · 叶片 + 叶脉 · 黄绿 */
  'cat-farm': art({
    id: 'cr',
    from: '#9BDF66',
    to: '#3AD95E',
    yTop: 10,
    yBot: 38,
    glow: [25, 15, 14.5],
    sharp: '<path d="M24 10C33.2 16.2 35.4 25.6 24 38C12.6 25.6 14.8 16.2 24 10Z"/>',
    sw: 2.4,
    details:
      '<path d="M24 14.5V32" fill="none" stroke="#FFFFFF" stroke-opacity=".45" stroke-width="2"' +
      ' stroke-linecap="round"/>',
  }),

  /** 医疗保健 · 圆角十字 · 薄荷绿 */
  'cat-medical': art({
    id: 'ce',
    from: '#6FDCC6',
    to: '#70B5E6',
    yTop: 10,
    yBot: 38,
    glow: [24, 16, 14],
    geo: '<rect x="19.5" y="10" width="9" height="28" rx="4.5"/><rect x="10" y="19.5" width="28" height="9" rx="4.5"/>',
  }),

  /** 人情往来 · 礼物盒 + 缎带 + 蝴蝶结 · 珊瑚 */
  'cat-social': art({
    id: 'cs',
    from: '#FF9C7E',
    to: '#FF7591',
    yTop: 9,
    yBot: 38,
    glow: [27, 17, 13],
    geo: '<rect x="11" y="18.5" width="26" height="7" rx="3.5"/><rect x="13.5" y="25.5" width="21" height="13" rx="4"/>',
    outline: '<circle cx="19.6" cy="13.6" r="4.4"/><circle cx="28.4" cy="13.6" r="4.4"/>',
    ow: 3.4,
    details:
      '<rect x="21.8" y="18.5" width="4.4" height="20" rx="2.2" fill="#FFFFFF" fill-opacity=".5"/>',
  }),

  /** 衣服饰品 · T 恤（宽肩窄身 + 深领口弧 + 袖口/下摆圆角）· 粉紫 */
  'cat-apparel': art({
    id: 'ca',
    from: '#FF9DCC',
    to: '#FF8176',
    yTop: 12,
    yBot: 38,
    glow: [26, 16, 13.5],
    // 领口必须"深"才读得出是衣服：第一版控制点只下沉 3 单位，56px 下顶边看着是平的。
    sharp:
      '<path d="M13 16.6L18 13.2Q24 22.6 30 13.2L36.6 16.6L39.6 23.6Q40.2 25.6 38.2 26.2' +
      'L34 27.4V35.2Q34 38 31.4 38H16.6Q14 38 14 35.2V27.4L9.8 26.2Q7.8 25.6 8.4 23.6Z"/>',
    sw: 3,
    details:
      '<path d="M18.6 16.6Q24 23.4 29.4 16.6" fill="none" stroke="#FFFFFF" stroke-opacity=".42"' +
      ' stroke-width="1.8" stroke-linecap="round"/>',
  }),

  /** 食品酒水 · 碗 + 双蒸汽 · 蜜橙 */
  'cat-food': art({
    id: 'co',
    from: '#FFC460',
    to: '#9CC73A',
    yTop: 8,
    yBot: 37,
    glow: [26, 17, 15],
    geo: '<rect x="7.5" y="19.5" width="33" height="6.4" rx="3.2"/><path d="M10.4 25.9H37.6A13.6 11 0 0 1 10.4 25.9Z"/>',
    outline:
      '<path d="M18.4 16C21.6 13.4 16.2 11 19.4 8.2"/>' +
      '<path d="M29.4 16C32.6 13.4 27.2 11 30.4 8.2"/>',
    ow: 3.2,
  }),

  /**
   * 学习进修 · **合起的书**（封面 + 书脊 + 页口 + 露头书签）· 靛蓝
   *
   * 第一版画的是"摊开的两页"，56px 下看起来就是两扇门 —— 小尺寸下"两片并排矩形"
   * 是最容易读错的造型。合起的书有书脊与页口两层明暗，且**书签要露出封面之外**，
   * 否则整块只是一个圆角方块。
   */
  'cat-study': art({
    id: 'cu',
    from: '#9AACFF',
    to: '#BA7EFF',
    yTop: 8.4,
    yBot: 37,
    glow: [25, 16, 13.5],
    geo: '<rect x="11.5" y="12.5" width="25" height="24.5" rx="4.5"/>',
    details:
      // 书脊（左侧受光的一条）
      '<rect x="12.4" y="13.5" width="5.6" height="22.5" rx="2.8" fill="#FFFFFF" fill-opacity=".28"/>' +
      // 页口（底部的书页切面）
      '<rect x="15.5" y="30.8" width="19.4" height="4.6" rx="2.3" fill="#FFFFFF" fill-opacity=".5"/>' +
      // 书签：必须高出封面顶边，才有识别度
      '<rect x="26.6" y="8.4" width="4.2" height="12.4" rx="2.1" fill="#FFFFFF" fill-opacity=".72"/>',
  }),

  /**
   * 职业收入 · 卡包（露出的卡片 + 卡身 + 卡扣）· 金黄
   *
   * 第一版只有一个圆角矩形 + 右侧一个小圆，56px 下读不出"钱包"。加了**露头的卡片**
   * 之后轮廓立刻可辨 —— 小尺寸图标要靠"多出来的一块"建立识别度，不能只靠内部细节。
   */
  'cat-salary': art({
    id: 'cw',
    from: '#FFD66E',
    to: '#FFAD99',
    yTop: 10,
    yBot: 37,
    glow: [26, 17, 13],
    geo: '<rect x="9.5" y="14.5" width="29" height="20" rx="6.5"/>',
    details:
      // 露出的卡片（顶边圆角、底边压在卡包口上）
      '<path d="M16.5 14.5V13.4Q16.5 10.4 19.5 10.4H28.5Q31.5 10.4 31.5 13.4V14.5Z"' +
      ' fill="#FFFFFF" fill-opacity=".68"/>' +
      // 卡包翻盖线
      '<rect x="11.8" y="22" width="25" height="2.2" rx="1.1" fill="#FFFFFF" fill-opacity=".42"/>' +
      // 卡扣
      '<circle cx="33.4" cy="24.6" r="2.5" fill="#FFFFFF" fill-opacity=".62"/>',
  }),

  // ── 收入 ────────────────────────────────────────────────────────────────
  /** 其他收入 · 三根递增圆角柱 · 薄荷青 */
  'cat-income': art({
    id: 'cn',
    from: '#79E0AD',
    to: '#3FC7E0',
    yTop: 14,
    yBot: 38,
    glow: [27, 17, 13.5],
    geo:
      '<rect x="11.5" y="27" width="7.4" height="11" rx="3.7"/>' +
      '<rect x="20.3" y="21.5" width="7.4" height="16.5" rx="3.7"/>' +
      '<rect x="29.1" y="14.5" width="7.4" height="23.5" rx="3.7"/>',
  }),
} as const;

/** 集内图标数量（自检用；与 `CATEGORY_ICONS` 必须一致） */
export const CATEGORY_ICON_ART_COUNT = 15;
