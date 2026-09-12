/**
 * 图表与分类配色 —— 单一真源
 *
 * 依据 `docs/移动端配色与字体方案.md` §2.7，与 `src/styles/tokens.scss` 的 `$chart-series` 一致。
 * ⚠️ 为什么 TS 侧要单独存一份：SCSS 变量传不进 JS（图例圆点、区间图标都由 JS 内联样式渲染），
 *    所以颜色值必须在 SCSS 与 TS 各有一份。**改色时两处必须同步**，
 *    `npm run check:contrast` 会比对一致性并重算全部对比度。
 *
 * ⚠️ 色值不是随手挑的：
 *    1. 全部通过「白底 ≥2.6:1」（填充可见度）；
 *    2. 前 6 色通过「白字压其上 ≥4.5:1」（可承载文字，见 SOLID_SERIES）；
 *    3. 相邻两段在红/绿色盲模拟下的可区分度最低 75.0（阈值 70）——旧调色板的
 *       #FF6B35↔#F5A623 只有 17.1，属于色盲用户眼里的同一个颜色。
 */

/** 图表 7 色序列（Top 6 + 其他）。末位中性灰仅 3.06:1，只能做图表填充，禁放白字。 */
export const CHART_SERIES = [
  '#c2410c', // 1 品牌橙红
  '#1d63b8', // 2 蓝
  '#c2185b', // 3 品红
  '#0e7c42', // 4 翠绿
  '#7c3aed', // 5 紫
  '#0e7490', // 6 青
  '#8a94a6', // 7 中性灰（「其他」专用）
] as const;

/**
 * 可承载白字的实心色序列（= CHART_SERIES 去掉中性灰）。
 * 白字压其上实测 5.18 / 5.95 / 5.87 / 5.28 / 5.70 / 5.36 : 1，全部 ≥4.5。
 * 用途：首页「时间区间统计」的图标底色（其上压 14px 白字）、实心徽标底。
 */
export const SOLID_SERIES = CHART_SERIES.slice(0, 6) as readonly string[];

/** 按索引取一个可承载白字的实心色（自动循环） */
export function solidSeriesAt(index: number): string {
  return SOLID_SERIES[index % SOLID_SERIES.length];
}
