// iOS 风格样板 · 数值校验器（v1.1）
//
// 依据：docs/UI设计方案·iOS风格样板.md
// 作用：把文档里写下的每一个对比度数值都算一遍，防止"文档说的"和"实际色值"漂移。
//
// 用法：node scripts/check-ios-tokens.mjs
// 退出码：任一断言不通过 → 1（可直接接进 CI）
//
// ────────────────────────────────────────────────────────────────────────
// v1.1（2026-09-16）修订：luchao 指出「线条太深」。逐像素采样 11 张参考图后确认 ——
//   分隔线 #C6C6C8(1.71:1) → #F1F1F1(1.13:1)，页面底 #F2F2F7 → #F8F8F8，
//   卡片去描边，主色 #0060DF → #A85F12（暖橙金）+ 青绿强调。
//   v1.0 的旧值保留在本文件里作对照，方便回退与比对。
//
// ⚠️ 负向验证过：把 CAL.gold 改成 '#E4AD77' 会报 MISMATCH 且退出码 1。
//    （没验过"能报错"的校验器等于没有校验器。）

import process from 'node:process';

// ==========================================================================
// 1. 核心算法（WCAG 2.x relative luminance / contrast ratio）
// ==========================================================================

const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`非法色值：${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};

const lin = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

const lum = (hex) => {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

const ratio = (a, b) => {
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

// ---- 色盲可区分度（与 check-contrast.mjs 同一套 Viénot/Brettel 线性近似）----
// 环形图是**闭环**：首段与末段在 12 点方向也相邻，所以相邻校验必须比 (n-1, 0)。
// 这一点本项目踩过 —— 旧版校验只比 i 与 i+1，把"青/翠绿互换"的收益看漏了。

const simulate = (hex, kind) => {
  const [r, g, b] = hexToRgb(hex).map(lin);
  if (kind === 'deutan') return [0.625 * r + 0.375 * g, 0.7 * r + 0.3 * g, 0.3 * g + 0.7 * b];
  if (kind === 'protan') return [0.567 * r + 0.433 * g, 0.558 * r + 0.442 * g, 0.242 * g + 0.758 * b];
  return [r, g, b];
};

const distance = (a, b, kind) => {
  const x = simulate(a, kind);
  const y = simulate(b, kind);
  return Math.sqrt(x.reduce((s, v, i) => s + (v - y[i]) ** 2, 0)) * 255;
};

const cvd = (a, b) => Math.min(distance(a, b, 'deutan'), distance(a, b, 'protan'));

/** 闭环相邻的最小可区分度及其所在的一对 */
function minAdjacentCvd(series) {
  let min = Infinity;
  let pair = null;
  for (let i = 0; i < series.length; i++) {
    const a = series[i];
    const b = series[(i + 1) % series.length];
    const d = cvd(a, b);
    if (d < min) {
      min = d;
      pair = [a, b];
    }
  }
  return { min: Math.round(min * 100) / 100, pair };
}

// ==========================================================================
// 2. 断言骨架
// ==========================================================================

let pass = 0;
let failed = 0;
const failures = [];

function expectEq(label, actual, expected, tol = 0.01) {
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) pass += 1;
  else {
    failed += 1;
    failures.push(`${label}：实际 ${actual} ≠ 文档 ${expected}`);
  }
  console.log(
    `${ok ? 'OK  ' : 'FAIL'}  ${label.padEnd(50)} ${String(actual).padStart(7)}  (文档 ${expected})`,
  );
}

function expectMin(label, actual, min) {
  const ok = actual >= min;
  if (ok) pass += 1;
  else {
    failed += 1;
    failures.push(`${label}：${actual} < ${min}`);
  }
  console.log(
    `${ok ? 'OK  ' : 'FAIL'}  ${label.padEnd(50)} ${String(actual).padStart(7)}  (需 ≥ ${min})`,
  );
}

/** 断言字符串完全相等（色值、配对描述这类） */
function expectStr(label, actual, expected) {
  const ok = actual === expected;
  if (ok) pass += 1;
  else {
    failed += 1;
    failures.push(`${label}：实际 "${actual}" ≠ 文档 "${expected}"`);
  }
  console.log(
    `${ok ? 'OK  ' : 'FAIL'}  ${label.padEnd(50)} ${String(actual).padStart(7)}  (文档 ${expected})`,
  );
}

/** 断言「故意不达标」——把"限定用途"的结论钉住 */
function expectBelow(label, actual, max) {
  const ok = actual < max;
  if (ok) pass += 1;
  else {
    failed += 1;
    failures.push(`${label}：${actual} 不再低于 ${max}，原有"限定用途"结论需重新评估`);
  }
  console.log(
    `${ok ? 'OK  ' : 'FAIL'}  ${label.padEnd(50)} ${String(actual).padStart(7)}  (应 < ${max})`,
  );
}

const r2 = (n) => Math.round(n * 100) / 100;

// ==========================================================================
// 3. v1.1 调色板（与文档 §2 一一对应）
// ==========================================================================

const W = '#FFFFFF';

const C = {
  // 背景三层（v1.1：更浅更中性）
  bgPage: '#F8F8F8',
  bgCard: '#FFFFFF',
  bgInset: '#F5F5F5',
  separator: '#F1F1F1', // ⭐ v1.1 核心修订
  fillSystem: '#F1F1F1',

  // 文字
  label: '#222226',
  label2: '#6B6B72',
  label3: '#9A9AA0',

  // 主色 · 暖橙金（双轨）
  goldFill: '#E4AD77', // 实测参考图原值，仅图形
  gold: '#A85F12', // 文字 / 实心按钮底
  goldSoft: '#FDF6EF', // 浅金底
  goldPressed: '#8F5312',

  // Hero 区块（2026-09-16 用户选定：浅金底 + 深金字）
  heroSoft: '#FDF6EF',
  heroSoftEnd: '#FBF0E4',
  heroInk: '#8F5312',

  // 强调 · 青绿（三档）
  teal: '#56C4C5', // 图形 / 图表
  tealLarge: '#2E9496', // 大号金额
  tealText: '#0E7375', // 小字

  // 语义色：收入保持业务约定；支出 2026-09-16 用户选定改青绿 #0F7B7C
  income: '#D92D20',
  expense: '#0F7B7C',
  badgeExpenseBg: '#F2FAF9', // 支出徽标底（配 #0F7B7C 字 = 4.78）
  darkExpense: '#3DD6C8', // 深色下的青绿支出（原 #3DD68C 是正绿）
  darkGold: '#E4AD77', // 深色下的品牌金（亮色金 #A85F12 在暗底只有 3.49，必须提亮）

  // v1.0 旧值（保留作对照 / 回退参考）
  v10Separator: '#C6C6C8',
  v10BgPage: '#F2F2F7',
  v10Blue: '#0060DF',
  v10BorderCard: '#E8E8EB',
};

// ==========================================================================
// 4. 第 1 节 · 线条与背景（v1.1 的核心修订）
// ==========================================================================

console.log('\n== 1. 线条：v1.0 → v1.1 的深度差（luchao 反馈的那件事）==');
expectEq('v1.1 分隔线 #F1F1F1 压白卡', r2(ratio(C.separator, W)), 1.13);
expectEq('v1.0 分隔线 #C6C6C8 压白卡（对照）', r2(ratio(C.v10Separator, W)), 1.71);
expectEq(
  '两版分隔线的深度差（这就是"太深"的量化）',
  r2(ratio(C.v10Separator, W) - ratio(C.separator, W)),
  0.58,
);
expectBelow('v1.1 分隔线足够淡（< 1.2 才算"几乎看不见"）', r2(ratio(C.separator, W)), 1.2);

console.log('\n== 2. 背景：卡片在灰底上的存在感 ==');
expectEq('v1.1 页面底 #F8F8F8 压白卡', r2(ratio(C.bgPage, W)), 1.06);
expectEq('v1.0 页面底 #F2F2F7 压白卡（对照）', r2(ratio(C.v10BgPage, W)), 1.12);
expectEq('内嵌槽 #F5F5F5 压白卡', r2(ratio(C.bgInset, W)), 1.09);
expectEq('v1.1 页面底压灰底本身', r2(ratio(C.bgPage, C.separator)), 1.06);

// ==========================================================================
// 5. 第 3 节 · 文字阶梯（双底核验）
// ==========================================================================

console.log('\n== 3. 文字阶梯：白卡 / 灰底 双底核验 ==');
expectEq('label #222226 压白卡', r2(ratio(C.label, W)), 15.85);
expectEq('label #222226 压灰底', r2(ratio(C.label, C.bgPage)), 14.93);
expectEq('label-2 #6B6B72 压白卡', r2(ratio(C.label2, W)), 5.29);
expectEq('label-2 #6B6B72 压灰底', r2(ratio(C.label2, C.bgPage)), 4.98);
expectMin('label-2 必须双底达标（白卡）', r2(ratio(C.label2, W)), 4.5);
expectMin('label-2 必须双底达标（灰底）', r2(ratio(C.label2, C.bgPage)), 4.5);
expectMin('label-2 压内嵌槽 #F5F5F5', r2(ratio(C.label2, C.bgInset)), 4.5);
expectBelow('label-3 #9A9AA0 白卡（故意不达标→仅装饰）', r2(ratio(C.label3, W)), 4.5);

// ==========================================================================
// 6. 第 4 节 · 主色暖橙金（双轨）
// ==========================================================================

console.log('\n== 4. 主色 · 暖橙金：参考图原值 vs AA 校准值 ==');
expectEq('参考图原值 #E4AD77 压白卡', r2(ratio(C.goldFill, W)), 1.99);
expectEq('参考图原值 #E4AD77 压灰底', r2(ratio(C.goldFill, C.bgPage)), 1.88);
expectBelow('gold-fill 直接配白字不达标（比 iOS 蓝还差）', r2(ratio(W, C.goldFill)), 4.5);
expectBelow('gold-fill 不足以承载正文', r2(ratio(C.goldFill, W)), 4.5);

expectEq('校准 gold #A85F12 压白卡', r2(ratio(C.gold, W)), 4.87);
expectEq('校准 gold #A85F12 压灰底', r2(ratio(C.gold, C.bgPage)), 4.59);
expectMin('gold 作白底文字', r2(ratio(C.gold, W)), 4.5);
expectMin('gold 作灰底文字', r2(ratio(C.gold, C.bgPage)), 4.5);
expectMin('gold 作实心按钮底 + 白字', r2(ratio(C.gold, W)), 4.5);
expectMin('gold-pressed 作按下态 + 白字', r2(ratio(C.goldPressed, W)), 4.5);
// 对称性：一个值打通「金字」与「白字按钮」
expectEq('对称性：白底金字 == 金底白字', r2(ratio(C.gold, W)), r2(ratio(W, C.gold)));
// 浅金底 + 深金字
expectEq('gold #A85F12 压浅金底 #FDF6EF', r2(ratio(C.gold, C.goldSoft)), 4.55);
expectMin('浅金底上的金字达标', r2(ratio(C.gold, C.goldSoft)), 4.5);

console.log('\n== 4b. Hero 区块：渐变两端都要达标 ==');
expectEq('Hero 亮端 #FDF6EF 上的深金字 #8F5312', r2(ratio(C.heroInk, C.heroSoft)), 5.74);
expectEq('Hero 暗端 #FBF0E4 上的深金字 #8F5312', r2(ratio(C.heroInk, C.heroSoftEnd)), 5.47);
expectMin('Hero 亮端达标', r2(ratio(C.heroInk, C.heroSoft)), 4.5);
expectMin('Hero 暗端达标（渐变的暗端才是风险点）', r2(ratio(C.heroInk, C.heroSoftEnd)), 4.5);
// ⚠️ 关键：浅金 Hero 与页面底的亮度差只有 1.01 —— 它靠**色相**被看见，不靠亮度。
//    所以底不能再浅了（再浅就真的糊进页面），字也不能用 #A85F12（暗端会跌到 4.33）。
expectEq('Hero 亮端与页面底 #F8F8F8 的亮度关系', r2(ratio(C.heroSoft, C.bgPage)), 1.01);
expectEq('Hero 暗端与页面底 #F8F8F8 的亮度关系', r2(ratio(C.heroSoftEnd, C.bgPage)), 1.06);
expectBelow('若改用 #A85F12 作 Hero 字，暗端会跌破（故不用）', r2(ratio(C.gold, C.heroSoftEnd)), 4.5);

// ==========================================================================
// 7. 第 5 节 · 强调色青绿（三档）
// ==========================================================================

console.log('\n== 5. 强调 · 青绿：三档分工 ==');
expectEq('teal #56C4C5 压白卡', r2(ratio(C.teal, W)), 2.08);
expectEq('teal #56C4C5 压灰底', r2(ratio(C.teal, C.bgPage)), 1.96);
expectBelow('teal 连大字标准 3.0 都不到（参考图的青色 0.00 也不合格）', r2(ratio(C.teal, W)), 3.0);
expectEq('teal-large #2E9496 压白卡', r2(ratio(C.tealLarge, W)), 3.63);
expectMin('teal-large 过大字标准 3.0', r2(ratio(C.tealLarge, W)), 3.0);
expectBelow('teal-large 仍不足以承载小字', r2(ratio(C.tealLarge, W)), 4.5);
expectEq('teal-text #0E7375 压白卡', r2(ratio(C.tealText, W)), 5.63);
expectEq('teal-text #0E7375 压灰底', r2(ratio(C.tealText, C.bgPage)), 5.3);
expectMin('teal-text 可承载小字', r2(ratio(C.tealText, W)), 4.5);

// ==========================================================================
// 8. 第 6 节 · 收支语义色 + 载体约束
// ==========================================================================

console.log('\n== 6. 收支语义色：v1.1 未变更，载体约束继续有效 ==');
expectEq('收入 #D92D20 压白卡', r2(ratio(C.income, W)), 4.83);
expectEq('收入 #D92D20 压新灰底 #F8F8F8', r2(ratio(C.income, C.bgPage)), 4.55);
expectMin('收入 在白卡与 #F8F8F8 上都达标', r2(ratio(C.income, C.bgPage)), 4.5);
// ⚠️ v1.1 的好消息：底色从 #F2F2F7 换成 #F8F8F8 后，收入红的灰底对比度
//    从 4.33（跌破）升到 4.55（达标）—— 载体约束仍然保留，但余量变大了。
expectEq('支出 #0F7B7C 压白卡（青绿版）', r2(ratio(C.expense, W)), 5.07);
expectEq('支出 #0F7B7C 压灰底', r2(ratio(C.expense, C.bgPage)), 4.77);
expectMin('支出 双底都达标', r2(ratio(C.expense, C.bgPage)), 4.5);
// 徽标：浅青底 + 青绿字
expectEq('支出徽标 #0F7B7C 压 #F2FAF9', r2(ratio(C.expense, C.badgeExpenseBg)), 4.78);
expectMin('支出徽标达标', r2(ratio(C.expense, C.badgeExpenseBg)), 4.5);
// ⚠️ 不能用 teal-large #2E9496 当列表金额 —— 它压灰底只有 3.41
expectBelow('teal-large #2E9496 不能作列表金额（压灰底跌破）', r2(ratio(C.tealLarge, C.bgPage)), 4.5);

// ==========================================================================
// 9. 第 7 节 · 深色模式
// ==========================================================================

console.log('\n== 7. 深色模式（沿用 v1.0）==');
expectEq('dark label 压 dark card #2C2C2E', r2(ratio('#FFFFFF', '#2C2C2E')), 13.94);
expectEq('dark label-2 #98989F 压 dark card', r2(ratio('#98989F', '#2C2C2E')), 4.86);
expectMin('dark label-2 达标', r2(ratio('#98989F', '#2C2C2E')), 4.5);
expectEq('dark blue #0A84FF 压 #1C1C1E', r2(ratio('#0A84FF', '#1C1C1E')), 4.66);
// 品牌金：亮/暗各配一个值（与 iOS 把 #007AFF 提到 #0A84FF 同一个做法）
expectBelow('亮色金 #A85F12 在暗底上跌破（故不能复用）', r2(ratio('#A85F12', '#1C1C1E')), 4.5);
expectEq('dark gold #E4AD77 压 #1C1C1E（页面底）', r2(ratio(C.darkGold, '#1C1C1E')), 8.54);
expectEq('dark gold #E4AD77 压 #2C2C2E（卡片）', r2(ratio(C.darkGold, '#2C2C2E')), 7);
expectMin('dark gold 双底达标', r2(ratio(C.darkGold, '#2C2C2E')), 4.5);
// 有意思的对称：#E4AD77 在亮色下只能做图形（1.99），在深色下反而能当文字（8.54）。
// 同一个值在两套主题里的「职责」不同 —— 别看到"亮色禁用"就以为它全局不能用。
expectEq('同一个 #E4AD77 在亮色下的对比度（对照）', r2(ratio(C.darkGold, '#FFFFFF')), 1.99);
expectEq('dark 支出 #3DD6C8 压 #1C1C1E（青绿版）', r2(ratio(C.darkExpense, '#1C1C1E')), 9.44);
expectEq('dark 支出 #3DD6C8 压 #2C2C2E', r2(ratio(C.darkExpense, '#2C2C2E')), 7.73);
expectMin('dark 支出达标', r2(ratio(C.darkExpense, '#2C2C2E')), 4.5);
// 旧值 #3DD68C（正绿）保留作对照
expectEq('旧 dark 支出 #3DD68C 压 #1C1C1E（对照）', r2(ratio('#3DD68C', '#1C1C1E')), 9.07);
expectEq('dark 收入提亮版 #FF6B6B 压 #2C2C2E', r2(ratio('#FF6B6B', '#2C2C2E')), 5.02);
expectMin('dark 收入提亮版达标', r2(ratio('#FF6B6B', '#2C2C2E')), 4.5);
expectBelow('dark 下不能直接复用亮色收入红', r2(ratio('#D92D20', '#2C2C2E')), 4.5);

// ==========================================================================
// 10. 第 8 节 · 度量计数
// ==========================================================================

console.log('\n== 8. 度量阶梯：计数与档位（不是值，是"有几档"）==');

const RADIUS = { xs: 6, sm: 10, md: 14, lg: 16, sheet: 20, pill: 999 };
expectEq('圆角档数', Object.keys(RADIUS).length, 6);
expectEq('v1.1 卡片圆角（v1.0 是 10）', RADIUS.lg, 16);
expectBelow('圆角最大档（不含 pill）≤ 20', RADIUS.sheet, 21);

const SPACING = { 页面边距: 16, 列表行高: 56, 分组间距: 32, 图标文字间: 12 };
expectEq('间距档数', Object.keys(SPACING).length, 4);
expectMin('列表行高 ≥ 44（WCAG 触控目标）', SPACING.列表行高, 44);
// ⚠️ 参考图实测：列表行分隔线间距 168px 物理 / 3x = 56pt，与 v1.0 一致 —— 这条没改。
expectEq('列表行高与参考图实测一致', SPACING.列表行高, 56);

const FONT = {
  'display-lg': [36, 44],
  display: [28, 36],
  h1: [20, 28],
  h2: [17, 24],
  'body-lg': [16, 24],
  body: [15, 24],
  'body-sm': [14, 22],
  caption: [12, 18],
};
expectEq('字号档数（沿用现有 8 档，v1.1 未动）', Object.keys(FONT).length, 8);
for (const [name, [size, lh]] of Object.entries(FONT)) {
  expectMin(`字号 ${name} 行高 ≥ 字号`, lh, size);
}
expectMin('最小字号 ≥ 12（中文硬下限）', Math.min(...Object.values(FONT).map((v) => v[0])), 12);

const ICON = [12, 14, 16, 20, 24, 28, 48, 64];
expectEq('图标尺寸档数（与字号解耦）', ICON.length, 8);
expectMin('最小图标 ≥ 12', Math.min(...ICON), 12);

// ==========================================================================
// 11. 第 9 节 · 动效与阴影
// ==========================================================================

console.log('\n== 9. 动效 / 阴影：档位与时长区间 ==');

const DURATION = {
  列表按下: 100,
  按钮按下: 120,
  视图切换: 250,
  页面转场: 300,
  弹层出现: 400,
  成功反馈: 500,
};
expectEq('动效档数', Object.keys(DURATION).length, 6);
for (const [k, v] of Object.entries(DURATION)) {
  expectMin(`时长 ${k} 在 100–500ms 区间内`, v <= 500 ? v : 0, 100);
}

const SHADOW = ['none', 'card', 'float', 'sheet', 'fab'];
expectEq('阴影档数', SHADOW.length, 5);
expectEq('其中"零阴影"档数（列表/卡片靠背景分层）', SHADOW.filter((s) => s === 'none').length, 1);

// ==========================================================================
// 12. 图表序列（v1.1 重排：青绿打头，贴合参考图）
// ==========================================================================

console.log('\n== 10. 图表序列：闭环相邻可区分度 + 白底对比度 ==');

// 参考图的环形图实测配色（1206×2622 采样）：青绿 #56C4C5 / 蓝 #5F8EF4 / 紫 #6F54F4 / 橙 #F5862D
// ⚠️ 参考图的 4 个色里 2 个连 3:1 都不到（青绿 2.08、橙 2.52），**色值不能照抄**，
//    只能借它的**色相骨架**（青绿主导 + 蓝/紫/橙）。
const CHART_OLD = ['#c2410c', '#1d63b8', '#c2185b', '#0e7490', '#7c3aed', '#0e7c42', '#8a94a6'];
const CHART = ['#0E7C86', '#7c3aed', '#0e7c42', '#c2185b', '#1d63b8', '#c2410c', '#8a94a6'];

expectEq('序列档数（Top6 + 「其他」）', CHART.length, 7);
expectStr('末位必须是「其他」专用的中性灰', CHART[6], '#8a94a6');

const chartContrast = CHART.map((c) => r2(ratio(c, W)));
const head6 = chartContrast.slice(0, 6);
expectEq('前 6 色压白卡的最小值', Math.min(...head6), 4.95);
expectMin('前 6 色都能当白字底色（≥4.5）', Math.min(...head6), 4.5);
expectEq('首色（青绿，占比最大的分类）压白卡', chartContrast[0], 4.95);
expectBelow('第 7 色「其他」灰仅作填充，禁放白字', chartContrast[6], 4.5);

const adj = minAdjacentCvd(CHART);
const adjOld = minAdjacentCvd(CHART_OLD);
expectEq('闭环相邻最小可区分度', adj.min, 73.63);
expectMin('闭环相邻达标（阈值 70）', adj.min, 70);
expectStr('最弱的一对（灰 ↔ 青绿首尾相接处）', adj.pair.join(' ↔ '), '#8a94a6 ↔ #0E7C86');
expectEq('旧序列的闭环最小（对照）', adjOld.min, 90.15);
// ⚠️ 重排的代价：把青绿从第 4 位提到首位，弱对从「灰↔橙红」变成「灰↔青绿」，
//    可区分度 90.15 → 73.63。仍高于阈值 70，但余量只剩 3.63 —— 不要再动这两个色。
expectBelow('重排确实付出了代价（记录在案，非无限余量）', adj.min, adjOld.min);

// ==========================================================================
// 13. 汇总
// ==========================================================================

console.log('\n' + '─'.repeat(78));
if (failed === 0) {
  console.log(`全部通过：${pass} 项断言`);
  console.log('v1.1 数值与文档一致。\n');
  process.exit(0);
} else {
  console.log(`通过 ${pass} 项，未通过 ${failed} 项：\n`);
  for (const f of failures) console.log('  · ' + f);
  console.log('\n未通过项必须处理：要么改文档，要么改色值/数值 —— 不能放着不管。\n');
  process.exit(1);
}
