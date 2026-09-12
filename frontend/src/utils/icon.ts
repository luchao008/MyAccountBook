/**
 * 分类图标映射
 *
 * 后端 icon 字段存的是字符串标识（如 food / transport），不含图标资源。
 * 前端用 emoji 映射展示，避免为十几个分类引入图标库或切图。
 * 未命中的标识返回默认图标。
 */
const ICON_MAP: Record<string, string> = {
  // 支出
  food: '🍜',
  transport: '🚌',
  shopping: '🛍️',
  home: '🏠',
  entertainment: '🎮',
  medical: '💊',
  education: '📚',
  gift: '🎁',
  other: '📦',
  // 收入
  salary: '💰',
  bonus: '🏆',
  investment: '📈',
  parttime: '⏰',
  redpacket: '🧧',
  // 账本
  wallet: '📁',
};

const DEFAULT_ICON = '📦';

/**
 * 取分类图标。
 *
 * 兼容两种存法：
 *   - 老数据是标识符（food / transport），走映射表
 *   - 新的两级分类体系直接把 emoji 存进 icon 字段，原样返回
 *
 * 判断方式：只由字母数字和连字符组成的才当作标识符去查表，
 * 其余（含中文、emoji）一律原样返回。
 */
export function iconOf(key?: string | null): string {
  if (!key) return DEFAULT_ICON;
  if (!/^[a-z0-9_-]+$/i.test(key)) return key;
  return ICON_MAP[key] || DEFAULT_ICON;
}

/**
 * 记账应用主色。
 * ⚠️ 取实心按钮底（白字 4.52:1）。装饰用色是 #ff6b35，可承载文字的深阶是 #c7430f，
 *    三档职责见 docs/移动端配色与字体方案.md §2.2。
 * ⚠️ 实测：以下三个常量**当前全项目无引用**（历史遗留）。保留是为了不破坏对外导出，
 *    但它们与 tokens.scss 是重复定义，将来要加「主色」相关常量请优先从 token 取。
 */
export const THEME_COLOR = '#CF4A12';
/** 支出红、收入绿（符合国内记账习惯） */
export const COLOR_EXPENSE = '#D92D20';
export const COLOR_INCOME = '#0B8038';
