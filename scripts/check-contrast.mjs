#!/usr/bin/env node
/**
 * 配色校验器：复现 docs/移动端配色与字体方案.md 中的全部实测数值。
 *
 * 为什么要有这个文件：
 *   该文档声明「所有对比度、色盲可区分度均为脚本实测值」，并承诺「后续任何颜色改动
 *   都应重跑校验，而不是目测」。如果校验脚本不存在，这句承诺就是空的。
 *
 * 用法：
 *   node scripts/check-contrast.mjs          # 跑校验，全部通过退出码 0，有 MISMATCH 退出码 1
 *   node scripts/check-contrast.mjs --verbose # 额外打印未断言的信息性数据
 *
 * 标准：
 *   - 对比度按 WCAG 2.2 相对亮度公式（sRGB 线性化后加权）
 *   - 色盲可区分度用 Viénot/Brettel 线性近似模拟 deutan / protan，模拟空间欧氏距离 ×255
 *   - 灰度可辨性用相对亮度差 ΔL
 *
 * 阈值约定：正文 ≥4.5，大字/控件 ≥3.0，装饰豁免；
 *          色盲可区分度 ≥40 视为可区分，环形图相邻段 ≥70。
 *
 * 零依赖，纯 Node ESM。
 */

import { readFileSync, readdirSync } from 'fs';

// ---------------------------------------------------------------- 基础计算

/** '#RGB' 或 '#RRGGBB' → [r, g, b] */
function toRgb(hex) {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

/** sRGB 分量线性化（WCAG 定义） */
function linearize(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** 相对亮度 L */
function luminance(hex) {
  const [r, g, b] = toRgb(hex).map(linearize);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 两色对比度 */
function contrast(a, b) {
  const [la, lb] = [luminance(a), luminance(b)];
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** 色盲模拟：返回线性 RGB 三元组 */
function simulate(hex, kind) {
  const [r, g, b] = toRgb(hex).map(linearize);
  if (kind === 'deutan') return [0.625 * r + 0.375 * g, 0.7 * r + 0.3 * g, 0.3 * g + 0.7 * b];
  if (kind === 'protan')
    return [0.567 * r + 0.433 * g, 0.558 * r + 0.442 * g, 0.242 * g + 0.758 * b];
  return [r, g, b];
}

/** 模拟空间欧氏距离 ×255 */
function distance(a, b, kind) {
  const [x, y] = [simulate(a, kind), simulate(b, kind)];
  return Math.sqrt(x.reduce((acc, v, i) => acc + (v - y[i]) ** 2, 0)) * 255;
}

/** 色盲可区分度：取 deutan / protan 的较差者（保守口径） */
function cvd(a, b) {
  return Math.min(distance(a, b, 'deutan'), distance(a, b, 'protan'));
}

const pairsOf = (arr) => arr.flatMap((a, i) => arr.slice(i + 1).map((b) => [a, b]));

// ---------------------------------------------------------------- 断言框架

let passed = 0;
const failures = [];

/** 断言：actual 应等于 expected（容差 tol） */
function expect(label, actual, expected, tol = 0.01) {
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) passed += 1;
  else failures.push({ label, actual, expected, tol });
  const mark = ok ? '\x1b[32m✅\x1b[0m' : '\x1b[31m❌ MISMATCH\x1b[0m';
  const shown = Number.isInteger(expected) === false || tol < 1 ? actual.toFixed(2) : actual;
  console.log(`  ${mark}  ${label.padEnd(46)} 实测 ${String(shown).padStart(6)}  文档 ${expected}`);
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

// 文档中的关键色值（与 docs/移动端配色与字体方案.md 保持一致）
const WHITE = '#FFFFFF';
const PAGE = '#F5F6F8';
const BRAND = {
  400: '#FF8552',
  500: '#FF6B35',
  600: '#CF4A12',
  700: '#C7430F',
  800: '#B33A0C',
  900: '#8F2E08',
};

console.log('\x1b[1m配色校验 —— 对照 docs/移动端配色与字体方案.md\x1b[0m');

// ---------------------------------------------------------------- 1. 现状体检
section('1. 现状体检（文档 §1.2 的 11 处不达标，必须复现出来）');
expect('#333 正文 on 白', contrast('#333333', WHITE), 12.63);
expect('#666 次要 on 白', contrast('#666666', WHITE), 5.74);
expect('#999 辅助 on 白（不达标）', contrast('#999999', WHITE), 2.85);
expect('#bbb 最弱 on 白（不达标）', contrast('#BBBBBB', WHITE), 1.92);
expect('#ccc 占位 on 白（不达标）', contrast('#CCCCCC', WHITE), 1.61);
expect('#999 on 页面底（不达标）', contrast('#999999', PAGE), 2.63);
expect('白字 on #FF6B35 按钮（不达标）', contrast(WHITE, '#FF6B35'), 2.84);
expect('白字 on 渐变亮端 #FFB347（不达标）', contrast(WHITE, '#FFB347'), 1.78);
expect('收入 #52C41A on 白（不达标）', contrast('#52C41A', WHITE), 2.27);
expect('支出 #FF4D4F on 白（不达标）', contrast('#FF4D4F', WHITE), 3.27);
expect('链接 #4A90D9 on 白（不达标）', contrast('#4A90D9', WHITE), 3.34);

// ---------------------------------------------------------------- 2. 品牌橙阶
section('2. 品牌主色阶（文档 §2.2）—— 按职责分档，白字对比度');
expect('brand-400 #FF8552 白字', contrast(WHITE, BRAND[400]), 2.41);
expect('brand-500 #FF6B35 白字（禁放文字）', contrast(WHITE, BRAND[500]), 2.84);
expect('brand-600 #CF4A12 白字（按钮底）', contrast(WHITE, BRAND[600]), 4.52);
expect('brand-700 #C7430F 白字（文字/焦点环）', contrast(WHITE, BRAND[700]), 4.95);
expect('brand-800 #B33A0C 白字（按下态）', contrast(WHITE, BRAND[800]), 5.95);
expect('brand-900 #8F2E08 白字（渐变暗端）', contrast(WHITE, BRAND[900]), 8.2);
expect('深墨字 #3D1200 on #FF6B35（备选路线）', contrast('#3D1200', BRAND[500]), 5.76);

// ---------------------------------------------------------------- 3. 辅助色
section('3. 辅助色（文档 §2.3）');
expect('info #1D63B8 on 白', contrast('#1D63B8', WHITE), 5.95);
expect('success #0B8038 on 白', contrast('#0B8038', WHITE), 5.05);
expect('warning #B45309 on 白', contrast('#B45309', WHITE), 5.02);
expect('danger #D92D20 on 白', contrast('#D92D20', WHITE), 4.83);
expect('warning #B45309 ↔ 图表橙 #C2410C 色盲距离', cvd('#B45309', '#C2410C'), 11.7, 0.1);

section('4. 浅底徽标（文档 §2.3 末尾）—— 深字压浅底，独立色值');
expect('收入徽标 #0B6B33 on #E7F6ED', contrast('#0B6B33', '#E7F6ED'), 5.94);
expect('支出徽标 #B42318 on #FDECEA', contrast('#B42318', '#FDECEA'), 5.75);
expect('品牌徽标 #B33A0C on #FFF1EB', contrast('#B33A0C', '#FFF1EB'), 5.4);
expect('中性徽标 #4A5563 on #EEF1F5', contrast('#4A5563', '#EEF1F5'), 6.69);
console.log('  \x1b[2m-- 反例：直接复用主语义色会掉下去，这正是要拆徽标色的原因 --\x1b[0m');
expect('  $income #0B8038 on #E7F6ED（勉强过）', contrast('#0B8038', '#E7F6ED'), 4.52);
expect('  $expense #D92D20 on #FDECEA（不达标）', contrast('#D92D20', '#FDECEA'), 4.22);
expect('  $brand-700 #C7430F on #FFF1EB（差 0.01）', contrast('#C7430F', '#FFF1EB'), 4.49);

// ---------------------------------------------------------------- 5. 文字与边界
section('5. 文字色阶与边界（文档 §2.4 / §2.5）');
expect('border-input #8A94A6 on 白（控件需 3:1）', contrast('#8A94A6', WHITE), 3.06);
expect('text-primary #1F2329 on 卡片', contrast('#1F2329', WHITE), 15.78);
expect('text-primary #1F2329 on 页面底', contrast('#1F2329', PAGE), 14.59);
expect('text-secondary #5A6472 on 卡片', contrast('#5A6472', WHITE), 6.0);
expect('text-secondary #5A6472 on 页面底', contrast('#5A6472', PAGE), 5.55);
expect('text-tertiary #6E7787 on 卡片', contrast('#6E7787', WHITE), 4.51);
expect('text-tertiary #6E7787 on 页面底', contrast('#6E7787', PAGE), 4.17);
expect('text-disabled #A8B0BD on 卡片（豁免）', contrast('#A8B0BD', WHITE), 2.19);
expect('text-disabled #A8B0BD on 页面底（豁免）', contrast('#A8B0BD', PAGE), 2.02);

// ---------------------------------------------------------------- 6. 图表序列
const SERIES = ['#C2410C', '#1D63B8', '#C2185B', '#0E7C42', '#7C3AED', '#0E7490', '#8A94A6'];
section('6. 图表 7 色序列（文档 §2.7）');
{
  const white = SERIES.map((c) => contrast(c, WHITE));
  const lo = Math.min(...white);
  const hi = Math.max(...white);
  expect('序列对白底最低可见度', lo, 3.06);
  expect('序列对白底最高可见度', hi, 5.95);

  const adjacent = SERIES.slice(0, -1).map((c, i) => [c, SERIES[i + 1]]);
  const adjMin = Math.min(...adjacent.map(([a, b]) => cvd(a, b)));
  const adjWorst = adjacent.reduce((worst, p) => (cvd(...p) < cvd(...worst) ? p : worst));
  expect('相邻段色盲可区分度最低值（阈值 ≥70）', adjMin, 75.0, 0.1);

  const allMin = Math.min(...pairsOf(SERIES).map(([a, b]) => cvd(a, b)));
  const allWorst = pairsOf(SERIES).reduce((worst, p) => (cvd(...p) < cvd(...worst) ? p : worst));
  expect('全组合最小可区分度（不相邻，靠图例兜底）', allMin, 15.6, 0.1);

  console.log(`  \x1b[2m相邻最接近的一对：${adjWorst.join(' ↔ ')}\x1b[0m`);
  console.log(
    `  \x1b[2m全组合最接近的一对：${allWorst.join(' ↔ ')}（文档称 品牌橙红 ↔ 品红）\x1b[0m`,
  );
  if (allMin >= 40) {
    failures.push({
      label: '全组合最小可区分度应低于 40（文档明确标注为需图例兜底）',
      actual: allMin,
      expected: '<40',
      tol: 0,
    });
  }
}

// ---------------------------------------------------------------- 7. 深色模式
section('7. 深色模式（文档 §5）—— 全部以 bg-card #24272E 为基准');
console.log(
  '  \x1b[2m本段曾因底色混用而出错：文档一度同时存在按 #1E2126 与 #22252B 算出的数值。\n' +
    '  以下断言强制全部以 #24272E 为基准，底色一改就得重算——这正是本节要防的错。\x1b[0m',
);
{
  const DARK_PAGE = '#14161A';
  const DARK_CARD = '#24272E';
  expect('bg-card 对 bg-page 的层级对比（需 ≥1.2）', contrast(DARK_CARD, DARK_PAGE), 1.21);
  expect('divider #31363E on 卡片（装饰，豁免）', contrast('#31363E', DARK_CARD), 1.23);
  expect('border-input #6B7484 on 卡片（控件需 3:1）', contrast('#6B7484', DARK_CARD), 3.17);
  expect('text-primary #E8EAED on 卡片', contrast('#E8EAED', DARK_CARD), 12.4);
  expect('text-secondary #B4BCC8 on 卡片', contrast('#B4BCC8', DARK_CARD), 7.81);
  expect('text-tertiary #98A1AF on 卡片', contrast('#98A1AF', DARK_CARD), 5.73);
  expect('text-disabled #5A6270 on 卡片（豁免）', contrast('#5A6270', DARK_CARD), 2.43);
  expect('brand-700 深色版 #FF8A5B on 卡片', contrast('#FF8A5B', DARK_CARD), 6.43);
  expect('收入深色版 #3DD68C on 卡片', contrast('#3DD68C', DARK_CARD), 7.97);
  expect('支出深色版 #FF6B6B on 卡片', contrast('#FF6B6B', DARK_CARD), 5.39);

  // 深色模式的核心论断：亮色 token 不能直接复用
  console.log('  \x1b[2m-- 反例：亮色 token 直接搬到深色卡片 --\x1b[0m');
  const reuseBrand = contrast('#C7430F', DARK_CARD);
  const reuseIncome = contrast('#0B8038', DARK_CARD);
  console.log(
    `  \x1b[2m   brand-700 #C7430F → ${reuseBrand.toFixed(2)}:1   收入 #0B8038 → ${reuseIncome.toFixed(2)}:1\x1b[0m`,
  );
  for (const [label, value] of [
    ['#C7430F', reuseBrand],
    ['#0B8038', reuseIncome],
  ]) {
    if (value >= 4.5) {
      failures.push({
        label: `深色下直接复用亮色 ${label} 竟达标，文档的“必须提亮”论断存疑`,
        actual: value,
        expected: '<4.5',
        tol: 0,
      });
    }
  }
}

// ---------------------------------------------------------------- 8. 旧调色板
section('8. 旧图表调色板体检（文档 §2.7 要求替换的真实理由）');
{
  // 真源：frontend/src/components/RingChart.vue 的 8 色数组
  const OLD = [
    '#FF6B35',
    '#4A90D9',
    '#F5A623',
    '#7ED321',
    '#BD10E0',
    '#50E3C2',
    '#9B9B9B',
    '#FF4081',
  ];
  const dl = (a, b) => Math.abs(luminance(a) - luminance(b));

  console.log('  \x1b[2m-- 真正混淆的色对（色盲距离 < 40）--\x1b[0m');
  expect('品牌橙 #FF6B35 ↔ 琥珀 #F5A623', cvd('#FF6B35', '#F5A623'), 17.1, 0.1);
  expect('琥珀 #F5A623 ↔ 品红 #FF4081', cvd('#F5A623', '#FF4081'), 23.0, 0.1);
  expect('品牌橙 #FF6B35 ↔ 品红 #FF4081', cvd('#FF6B35', '#FF4081'), 28.1, 0.1);
  expect('紫 #BD10E0 ↔ 薄荷 #50E3C2', cvd('#BD10E0', '#50E3C2'), 28.6, 0.1);
  expect('青柠 #7ED321 ↔ 中性灰 #9B9B9B', cvd('#7ED321', '#9B9B9B'), 33.4, 0.1);

  const worst = pairsOf(OLD).reduce((w, p) => (cvd(...p) < cvd(...w) ? p : w));
  const confusable = pairsOf(OLD).filter(([a, b]) => cvd(a, b) < 40);
  console.log(
    `  \x1b[2m旧 ${OLD.length} 色里共有 ${confusable.length} 对在色盲下不可靠，最差一对 ${worst.join(' ↔ ')}\x1b[0m`,
  );
  if (confusable.length < 4) {
    failures.push({
      label: '旧调色板混淆色对应不少于 4 对（文档论断）',
      actual: confusable.length,
      expected: '>=4',
      tol: 0,
    });
  }

  console.log('  \x1b[2m-- 灰度不可辨的色对（ΔL < 0.05）--\x1b[0m');
  expect('链接蓝 #4A90D9 ↔ 品红 #FF4081 的 ΔL', dl('#4A90D9', '#FF4081'), 0.001, 0.002);
  expect('品牌橙 #FF6B35 ↔ 中性灰 #9B9B9B 的 ΔL', dl('#FF6B35', '#9B9B9B'), 0.007, 0.002);
  expect('琥珀 #F5A623 ↔ 青柠 #7ED321 的 ΔL', dl('#F5A623', '#7ED321'), 0.043, 0.002);

  console.log('  \x1b[2m-- 已推翻的旧结论（回归防护：文档不得再声称它们混淆）--\x1b[0m');
  const greenPair = cvd('#7ED321', '#50E3C2');
  console.log(
    `  \x1b[2m   青柠 #7ED321 ↔ 薄荷 #50E3C2 = ${greenPair.toFixed(1)}（旧文档称"色盲下几乎同色"，实为误判）\x1b[0m`,
  );
  if (greenPair < 40) {
    failures.push({
      label: '青柠↔薄荷 实测应可区分（≥40），否则文档修订有误',
      actual: greenPair,
      expected: '>=40',
      tol: 0,
    });
  }
}

// ---------------------------------------------------------------- 9. token 文件自洽
section('9. token 文件自洽性（frontend/src/styles/tokens.scss）');
{
  const tokensPath = new URL('../frontend/src/styles/tokens.scss', import.meta.url);
  const tokenLines = readFileSync(tokensPath, 'utf8').split('\n');

  /**
   * 逐条校验三类事实，缺一不可：
   *   ① 变量声明的色值 == 预期；② 行尾注释里写的对比度 == 预期；③ 重算结果 == 预期
   * 只查①会漏掉「数字陈旧」，只查③会漏掉「注释是假的」——本项目两种都踩过。
   */
  const TOKEN_CHECKS = [
    ['$brand-400', '#ff8552', 2.41, WHITE],
    ['$brand-500', '#ff6b35', 2.84, WHITE],
    ['$brand-600', '#cf4a12', 4.52, WHITE],
    ['$brand-700', '#c7430f', 4.95, WHITE],
    ['$brand-800', '#b33a0c', 5.95, WHITE],
    ['$brand-900', '#8f2e08', 8.2, WHITE],
    ['$brand-ink', '#3d1200', 5.76, '#ff6b35'],
    ['$info', '#1d63b8', 5.95, WHITE],
    ['$success', '#0b8038', 5.05, WHITE],
    ['$warning', '#b45309', 5.02, WHITE],
    ['$danger', '#d92d20', 4.83, WHITE],
    ['$badge-income-text', '#0b6b33', 5.94, '#e7f6ed'],
    ['$badge-expense-text', '#b42318', 5.75, '#fdecea'],
    ['$badge-brand-text', '#b33a0c', 5.4, '#fff1eb'],
    ['$badge-neutral-text', '#4a5563', 6.69, '#eef1f5'],
    ['$border-input', '#8a94a6', 3.06, WHITE],
    ['$text-primary', '#1f2329', 15.78, WHITE],
    ['$text-secondary', '#5a6472', 6.0, WHITE],
    ['$text-tertiary', '#6e7787', 4.51, WHITE],
    ['$text-disabled', '#a8b0bd', 2.19, WHITE],
    ['$income', '#0b8038', 5.05, WHITE],
    ['$expense', '#d92d20', 4.83, WHITE],
    ['$dark-bg-card', '#24272e', 1.21, '#14161a'],
    ['$dark-divider', '#31363e', 1.23, '#24272e'],
    ['$dark-border-input', '#6b7484', 3.17, '#24272e'],
    ['$dark-text-primary', '#e8eaed', 12.4, '#24272e'],
    ['$dark-text-secondary', '#b4bcc8', 7.81, '#24272e'],
    ['$dark-text-tertiary', '#98a1af', 5.73, '#24272e'],
    ['$dark-text-disabled', '#5a6270', 2.43, '#24272e'],
    ['$dark-brand', '#ff8a5b', 6.43, '#24272e'],
    ['$dark-income', '#3dd68c', 7.97, '#24272e'],
    ['$dark-expense', '#ff6b6b', 5.39, '#24272e'],
  ];

  for (const [varName, hex, claimed, bg] of TOKEN_CHECKS) {
    const idx = tokenLines.findIndex((l) =>
      new RegExp('^' + varName.replace('$', '\\$') + ':').test(l.trim()),
    );
    const line = idx >= 0 ? tokenLines[idx] : null;
    if (!line) {
      failures.push({ label: `tokens.scss 缺少 ${varName}`, actual: 'missing', expected: hex, tol: 0 });
      console.log(`  \x1b[31m❌ MISMATCH\x1b[0m  ${varName.padEnd(24)} 未找到声明`);
      continue;
    }
    const hexOk = (line.match(/#[0-9a-fA-F]{6}/) || [''])[0].toLowerCase() === hex;
    // 对比度可以写在同一行，也可以写在上一行的说明注释里
    const sameLine = (line.match(/(\d+\.\d+):1/) || [])[1];
    const prevLine = idx > 0 ? (tokenLines[idx - 1].match(/(\d+\.\d+):1/) || [])[1] : undefined;
    const comment = sameLine ?? prevLine;
    const commentOk = comment !== undefined && Math.abs(Number(comment) - claimed) <= 0.005;
    const real = contrast(hex, bg);
    const realOk = Math.abs(real - claimed) <= 0.005;
    const ok = hexOk && commentOk && realOk;
    if (!ok) {
      failures.push({
        label: `${varName} 自洽性（色值/注释/实测）`,
        actual: `hex=${hexOk ? 'ok' : 'NG'} 注释=${comment ?? '无'} 实测=${real.toFixed(2)}`,
        expected: `${hex} / ${claimed}`,
        tol: 0,
      });
    } else {
      passed += 1;
    }
    console.log(
      `  ${ok ? '\x1b[32m✅\x1b[0m' : '\x1b[31m❌ MISMATCH\x1b[0m'}  ${varName.padEnd(24)} ${hex}  注释 ${String(
        comment ?? '—',
      ).padStart(5)}  实测 ${real.toFixed(2)}`,
    );
  }
}

// ---------------------------------------------------------------- 10. 跨文件重复
section('10. 图表配色跨文件一致性（SCSS 变量 ↔ TS 常量）');
{
  const tokensSrc = readFileSync(
    new URL('../frontend/src/styles/tokens.scss', import.meta.url),
    'utf8',
  );
  const chartSrc = readFileSync(
    new URL('../frontend/src/constants/chart.ts', import.meta.url),
    'utf8',
  );

  const seriesBlock = tokensSrc.match(/\$chart-series:\s*\(([\s\S]*?)\);/);
  const scssSeries = (seriesBlock ? seriesBlock[1].match(/#[0-9a-fA-F]{6}/g) : []).map((c) =>
    c.toLowerCase(),
  );

  // ⚠️ 必须只解析 CHART_SERIES 这一个数组。
  // 早先这里扫的是 chart.ts 的**全部** hex 字面量，于是同文件里的 CHART_TRACK /
  // CHART_TRACK_EMPTY（底环色，#ffffff / #edeff3）被一并抓进来，色序立刻对不上账。
  // 「解析范围写宽了」和「值不一致」报的是同一条错，排查时极易误判 —— 所以收窄到数组本身。
  const tsBlock = chartSrc.match(/CHART_SERIES\s*=\s*\[([\s\S]*?)\]\s*as const/);
  const tsSeries = (tsBlock ? tsBlock[1].match(/'#[0-9a-fA-F]{6}'/g) || [] : []).map((c) =>
    c.replace(/'/g, '').toLowerCase(),
  );

  console.log(`  \x1b[2mSCSS $chart-series 共 ${scssSeries.length} 色；TS CHART_SERIES 共 ${tsSeries.length} 色\x1b[0m`);
  // 先卡住「解析到几条」，否则解析失败退化成空数组时会伪装成「不一致」
  expect('CHART_SERIES 解析到的色数', tsSeries.length, 7, 0);
  const same =
    scssSeries.length > 0 && scssSeries.length === tsSeries.length && scssSeries.every((c, i) => c === tsSeries[i]);
  if (same) passed += 1;
  else
    failures.push({
      label: 'SCSS $chart-series 与 TS CHART_SERIES 不一致（双写必须同步）',
      actual: scssSeries.join(',') || '(未解析到)',
      expected: tsSeries.join(','),
      tol: 0,
    });
  console.log(`  ${same ? '\x1b[32m✅\x1b[0m' : '\x1b[31m❌ MISMATCH\x1b[0m'}  两处色序完全一致`);

  // 序列的「可承载白字」契约：前 6 色成立、第 7 色（中性灰）不成立
  const solid = tsSeries.slice(0, 6).map((c) => contrast(c, WHITE));
  const muted = contrast(tsSeries[6] ?? '#8a94a6', WHITE);
  const solidMin = Math.min(...solid);
  expect('可承载白字的实心序列最低值（首页区间图标依赖）', solidMin, 5.18, 0.01);
  expect('中性灰（仅供图表填充，禁放白字）', muted, 3.06, 0.01);
  console.log(
    `  \x1b[2m   实心序列：${solid.map((v) => v.toFixed(2)).join(' / ')}\x1b[0m`,
  );
}

// ---------------------------------------------------------------- 11. 旧色值残留
section('11. 旧色值残留扫描（迁移回归防护）');
{
  const LEGACY = [
    '#ff6b35',
    '#52c41a',
    '#ff4d4f',
    '#4a90d9',
    '#ff9563',
    '#ffb347',
    '#ffb98a',
    '#fff1eb',
    '#f5f5f5',
    '#f2f3f5',
    '#f0f0f0',
    '#f7f8fa',
    '#f7f7f8',
    '#fafafa',
    '#eee',
    '#eceff3',
    '#e55a28',
    '#c0c4cc',
    '#ddd',
    '#bbb',
    '#ccc',
    '#999',
    '#666',
    '#333',
  ];
  const root = new URL('../frontend/src/', import.meta.url);
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = new URL(e.name + (e.isDirectory() ? '/' : ''), dir);
      if (e.isDirectory()) return walk(p);
      return e.name.endsWith('.vue') ? [p] : [];
    });

  const hits = [];
  for (const file of walk(root)) {
    const text = readFileSync(file, 'utf8');
    text.split('\n').forEach((line, i) => {
      for (const m of line.match(/#[0-9a-fA-F]{3,8}\b/g) || []) {
        if (LEGACY.includes(m.toLowerCase())) {
          hits.push(`${file.pathname.split('/frontend/src/')[1]}:${i + 1}  ${m}`);
        }
      }
    });
  }

  if (hits.length === 0) {
    passed += 1;
    console.log('  \x1b[32m✅\x1b[0m  .vue 文件中旧色值零残留（全部走 token / 常量）');
  } else {
    failures.push({
      label: `.vue 中残留旧色值 ${hits.length} 处`,
      actual: hits.slice(0, 8).join(' | '),
      expected: '0（应改走 token 或 constants/chart.ts）',
      tol: 0,
    });
    console.log(`  \x1b[31m❌ MISMATCH\x1b[0m  残留 ${hits.length} 处：`);
    for (const h of hits.slice(0, 12)) console.log(`      ${h}`);
  }
}

// ---------------------------------------------------------------- 12. §1.2 计数自洽
section('12. §1.2「不达标处数」与表内 ❌ 行数一致');
{
  const docSrc = readFileSync(new URL('../docs/移动端配色与字体方案.md', import.meta.url), 'utf8');
  const sec = (docSrc.match(/### 1\.2 [\s\S]*?(?=### 1\.3 )/) || [''])[0];
  const rows = sec.split('\n').filter((l) => l.trim().startsWith('|') && l.includes('❌')).length;
  const declared = Number((sec.match(/(\d+)\s*处不达标/) || [])[1]);

  console.log(`  \x1b[2m§1.2 表内 ❌ 行数 = ${rows}；文中声明 = ${Number.isFinite(declared) ? declared : '(未找到)'}\x1b[0m`);
  if (rows > 0 && rows === declared) {
    passed += 1;
    console.log(`  \x1b[32m✅\x1b[0m  声明值 ${declared} == 表内 ❌ 行数 ${rows}`);
  } else {
    failures.push({
      label: '§1.2 声明的「不达标处数」与表内 ❌ 行数不一致',
      actual: `表内 ❌ ${rows} 行 / 文中声明 ${Number.isFinite(declared) ? declared : '未找到'}`,
      expected: '两者必须相等',
      tol: 0,
    });
    console.log(`  \x1b[31m❌ MISMATCH\x1b[0m  表内 ❌ 行数与文中声明不一致`);
  }
}

// ---------------------------------------------------------------- 13. 字号阶梯
section('13. 字号阶梯自洽（文档 §3.2 ↔ tokens.scss ↔ 各 .vue）');
{
  const tokensSrc = readFileSync(
    new URL('../frontend/src/styles/tokens.scss', import.meta.url),
    'utf8',
  );
  const docSrc = readFileSync(new URL('../docs/移动端配色与字体方案.md', import.meta.url), 'utf8');

  // —— ① 文档 §3.2 的字号表：`font-xxx` → [字号, 行高]
  const sec32 = (docSrc.match(/### 3\.2 [\s\S]*?(?=### 3\.3 )/) || [''])[0];
  const docScale = {};
  for (const line of sec32.split('\n')) {
    const tok = line.match(/`(font-[a-z0-9-]+)`/);
    if (!tok) continue;
    const size = line.match(/\|\s*(\d+)px\s*\|/);
    const lh = line.match(/\|\s*(\d+)\s*\(\d/);
    if (size && lh) docScale[tok[1]] = [Number(size[1]), Number(lh[1])];
  }
  expect('文档 §3.2 表内字号档数', Object.keys(docScale).length, 8, 0);

  // —— ② tokens.scss 的声明
  const declared = {};
  for (const m of tokensSrc.matchAll(/\$(font-[a-z0-9-]+):\s*(\d+)px/g)) {
    if (m[1] === 'font-family-base') continue;
    declared[m[1]] = (declared[m[1]] || []).concat(Number(m[2]));
  }
  const declaredLh = {};
  for (const m of tokensSrc.matchAll(/\$(lh-[a-z0-9-]+):\s*(\d+)px/g)) {
    declaredLh[m[1]] = Number(m[2]);
  }

  const scaleMismatch = [];
  for (const [tok, [size, lh]] of Object.entries(docScale)) {
    const gotSize = (declared[tok] || [])[0];
    const gotLh = declaredLh['lh-' + tok.replace(/^font-/, '')];
    if (gotSize !== size || gotLh !== lh) {
      scaleMismatch.push(`${tok}: 文档 ${size}/${lh}，tokens ${gotSize ?? '缺失'}/${gotLh ?? '缺失'}`);
    }
  }
  if (Object.keys(docScale).length === 8 && scaleMismatch.length === 0) {
    passed += 1;
    console.log('  \x1b[32m✅\x1b[0m  8 档字号 / 行高：文档 §3.2 == tokens.scss');
  } else {
    failures.push({
      label: '字号阶梯在文档与 tokens.scss 之间不一致',
      actual: scaleMismatch.join(' | ') || '（档数不为 8）',
      expected: '文档 §3.2 的 8 档与 tokens.scss 逐条相等',
      tol: 0,
    });
    console.log(`  \x1b[31m❌ MISMATCH\x1b[0m  ${scaleMismatch.join(' | ')}`);
  }

  // —— ③ 允许出现的 token 全集
  const srcRoot = new URL('../frontend/src/', import.meta.url);
  const vueList = [];
  const collectVue = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = new URL(e.name + (e.isDirectory() ? '/' : ''), dir);
      if (e.isDirectory()) return collectVue(p);
      return e.name.endsWith('.vue') ? [p] : [];
    });
  vueList.push(...collectVue(srcRoot));

  const allowedFont = new Set();
  for (const m of tokensSrc.matchAll(/\$(font-(?!family)[a-z0-9-]+)\s*:/g)) allowedFont.add('$' + m[1]);
  const allowedIcon = new Set();
  for (const m of tokensSrc.matchAll(/\$(icon-[a-z0-9-]+)\s*:/g)) allowedIcon.add('$' + m[1]);
  const allowedWeight = new Set();
  for (const m of tokensSrc.matchAll(/\$(weight-[a-z0-9-]+)\s*:/g)) allowedWeight.add('$' + m[1]);

  expect('字号 token 档数（$font-*）', allowedFont.size, 8, 0);
  expect('图标 token 档数（$icon-*）', allowedIcon.size, 8, 0);
  expect('字重 token 档数（$weight-*）', allowedWeight.size, 3, 0);

  const straySize = [];
  const strayWeight = [];
  const weight700 = [];
  const missingLh = [];
  for (const f of vueList) {
    const rel = f.pathname.split('/frontend/src/')[1];
    const sm = readFileSync(f, 'utf8').match(/<style[\s\S]*?<\/style>/);
    if (!sm) continue;
    const block = sm[0];

    for (const m of block.matchAll(/font-size:\s*([^;\n]+);/g)) {
      const v = m[1].trim();
      if (!allowedFont.has(v) && !allowedIcon.has(v)) straySize.push(`${rel}  font-size: ${v}`);
    }
    for (const m of block.matchAll(/font-weight:\s*([^;\n]+);/g)) {
      const v = m[1].trim();
      if (/^700\b/.test(v)) weight700.push(`${rel}  font-weight: ${v}`);
      if (!allowedWeight.has(v)) strayWeight.push(`${rel}  font-weight: ${v}`);
    }
    // 规则级：凡声明「文字字号」的规则，必须同时声明行高（图标与控件居中特例除外）
    for (const chunk of block.split('}')) {
      if (!chunk.includes('{')) continue;
      const fm = chunk.match(/font-size:\s*(\$font-[a-z0-9-]+);/);
      if (!fm) continue;
      if (!chunk.includes('line-height')) {
        const sel = chunk.split('{')[0].trim().split('\n').pop().trim();
        missingLh.push(`${rel}  ${sel}  (${fm[1]})`);
      }
    }
  }

  const checkList = (list, label, expected) => {
    if (list.length === 0) {
      passed += 1;
      console.log(`  \x1b[32m✅\x1b[0m  ${label}`);
    } else {
      failures.push({ label, actual: list.slice(0, 6).join(' | '), expected, tol: 0 });
      console.log(`  \x1b[31m❌ MISMATCH\x1b[0m  ${label}（${list.length} 处）`);
      for (const x of list.slice(0, 8)) console.log(`      ${x}`);
    }
  };
  checkList(straySize, '.vue 中不存在阶梯外的 font-size', '只允许 $font-* / $icon-*');
  checkList(weight700, '不存在被禁用的 font-weight: 700', '只允许 400/500/600');
  checkList(strayWeight, '.vue 中的 font-weight 全部走 token', '只允许 $weight-*');
  checkList(
    missingLh,
    '所有声明文字字号的规则都显式声明了 line-height',
    'WCAG 1.4.12：行高必须显式声明',
  );

  // —— ④ 计数自洽（第十九次新增）
  //
  // 为什么要专门断言「计数」：本项目已经**两次**栽在同一个坑上 ——
  //   · §1.2 的「9 处不达标」从方案初版一直错到第十八次（实际 11 处）；
  //   · §1.3 的「共 8 档 / 11px 出现 3 处」错到第十九次（实际 17 档 / 11px 出现 6 处）。
  // 两次的共同点：**校验器只断言"数值"，没有任何人检查"计数"**。
  // 所以这里的做法是——把计数本身也变成断言。改字号就必然要同步改这里，
  // 否则脚本直接报 MISMATCH，不会像前两次那样悄悄漂过去。
  //
  // 这三个数字对应的文档位置：方案 §1.3「迁移后」那段。
  let nText = 0;
  let nIcon = 0;
  let nLiteral = 0;
  for (const f of vueList) {
    const sm = readFileSync(f, 'utf8').match(/<style[\s\S]*?<\/style>/);
    if (!sm) continue;
    for (const m of sm[0].matchAll(/font-size:\s*([^;\n]+);/g)) {
      const v = m[1].trim();
      if (v.startsWith('$font-')) nText += 1;
      else if (v.startsWith('$icon-')) nIcon += 1;
      else nLiteral += 1;
    }
  }
  expect('.vue 中 font-size 出现总次数（方案 §1.3）', nText + nIcon + nLiteral, 114, 0);
  expect('  其中文字字号 $font-*', nText, 91, 0);
  expect('  其中图标尺寸 $icon-*', nIcon, 23, 0);
  expect('  其中字面量（必须为 0）', nLiteral, 0, 0);
}

// ---------------------------------------------------------------- 14. 焦点可见性
section('14. 焦点可见性（WCAG 2.4.7）');
{
  const srcRoot = new URL('../frontend/src/', import.meta.url);
  const collectVue = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = new URL(e.name + (e.isDirectory() ? '/' : ''), dir);
      if (e.isDirectory()) return collectVue(p);
      return e.name.endsWith('.vue') ? [p] : [];
    });

  const appSrc = readFileSync(new URL('../frontend/src/App.vue', import.meta.url), 'utf8');
  const hasRule = /:focus-visible\s*\{/.test(appSrc) && /outline-offset/.test(appSrc);
  if (hasRule) passed += 1;
  else
    failures.push({
      label: 'App.vue 缺少 :focus-visible 焦点环',
      actual: '未找到 :focus-visible / outline-offset',
      expected: ':focus-visible 规则 + outline-offset',
      tol: 0,
    });
  console.log(
    `  ${hasRule ? '\x1b[32m✅\x1b[0m' : '\x1b[31m❌ MISMATCH\x1b[0m'}  App.vue 定义了 :focus-visible 焦点环`,
  );

  // 「禁止 outline: none 一刀切」——这是全项目最容易把无障碍做废的一行
  const killed = [];
  for (const f of collectVue(srcRoot)) {
    const t = readFileSync(f, 'utf8');
    if (/outline\s*:\s*none/.test(t)) killed.push(f.pathname.split('/frontend/src/')[1]);
  }
  if (killed.length === 0) {
    passed += 1;
    console.log('  \x1b[32m✅\x1b[0m  全项目没有 outline: none（焦点环不会被一刀切掉）');
  } else {
    failures.push({
      label: '存在 outline: none，键盘焦点环被抹掉',
      actual: killed.join(' | '),
      expected: '0 处',
      tol: 0,
    });
    console.log(`  \x1b[31m❌ MISMATCH\x1b[0m  ${killed.join(' | ')}`);
  }

  // 焦点环必须用达标色（$brand-700 = 4.95:1，已在 §2 断言过色值，这里断言「用的是它」）
  const tokensSrc = readFileSync(
    new URL('../frontend/src/styles/tokens.scss', import.meta.url),
    'utf8',
  );
  const ringOk = /\$focus-ring:\s*[^;]*\$brand-700/.test(tokensSrc);
  if (ringOk) passed += 1;
  else
    failures.push({
      label: '$focus-ring 未使用 $brand-700（4.95:1）',
      actual: (tokensSrc.match(/\$focus-ring:[^;]*;/) || ['未找到'])[0],
      expected: '$focus-ring 基于 $brand-700',
      tol: 0,
    });
  console.log(
    `  ${ringOk ? '\x1b[32m✅\x1b[0m' : '\x1b[31m❌ MISMATCH\x1b[0m'}  $focus-ring 基于 $brand-700（4.95:1）`,
  );
}

// ---------------------------------------------------------------- 汇总
console.log(`\n${'─'.repeat(72)}`);
if (failures.length === 0) {
  console.log(`\x1b[32m\x1b[1m全部通过\x1b[0m：${passed} 项断言与文档一致。`);
  console.log('文档中的数值可复现，配色改动后重跑本脚本即可验证。');
} else {
  console.log(`\x1b[31m\x1b[1m发现 ${failures.length} 处不一致\x1b[0m（已通过 ${passed} 项）：`);
  for (const f of failures) {
    console.log(`  · ${f.label}`);
    console.log(
      `      实测 ${typeof f.actual === 'number' ? f.actual.toFixed(2) : f.actual}，文档/预期 ${f.expected}`,
    );
  }
  console.log('\n以上不一致必须二选一处理：改文档，或改色值 —— 不能放着不管。');
  process.exitCode = 1;
}
