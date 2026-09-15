/**
 * 底部安全区（Safari 全屏 / iPhone home indicator）几何验证。
 *
 *   node scripts/verify-safe-area.mjs
 *
 * 为什么需要它：`reflow-audit.mjs` 只测 320/375px × 字号缩放，
 * **不模拟 safe-area** —— 于是"固定底栏被安全区挤扁"这类问题完全没有覆盖。
 * 而这个 bug 只在 Safari「添加到主屏幕」后出现，桌面浏览器永远看不出来。
 *
 * 被测的坑：`box-sizing: border-box` + 固定 `height` + `padding-bottom: env(safe-area-inset-bottom)`
 *   → border-box 下 **height 包含 padding**，安全区会**吃掉内容高度**。
 *   实测（safe-area=34px）：`.tab-item` 高度 55 → **21**，凸起项 48px 的圆被压扁。
 *   修法：height 也跟着安全区长（`calc(56px + env(...))`），padding 只负责顶开内容。
 *
 * ⚠️ 模拟时必须**同时**覆盖 height 与 padding —— 两者都用 env()。
 *    只覆盖 padding 会把新写的 height 一起盖掉，测的是旧行为（踩过）。
 * ⚠️ 只读不写。
 */
import fs from 'node:fs';

const PW =
  process.env.PW_PATH ||
  '/Users/luchao/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js';
const pw = await import(PW);
const { chromium } = pw.default ?? pw;

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const root = `${process.env.HOME}/Library/Caches/ms-playwright`;
  for (const d of fs
    .readdirSync(root)
    .filter((x) => x.startsWith('chromium-'))
    .sort()
    .reverse()) {
    for (const arch of ['chrome-mac-arm64', 'chrome-mac-x64']) {
      const p = `${root}/${d}/${arch}/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
      if (fs.existsSync(p)) return p;
    }
  }
}

/** iPhone home indicator 的典型值 */
const SAFE = 34;

let pass = 0;
let fail = 0;
const check = (n, ok, extra = '') => {
  if (ok) {
    pass += 1;
    console.log('  OK   ' + n + ' ' + extra);
  } else {
    fail += 1;
    console.log('  FAIL ' + n + ' ' + extra);
  }
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-proxy-server'] });
const page = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 150)));

await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
if (page.url().includes('/pages/login')) {
  const inputs = page.locator('input');
  await inputs.nth(0).fill('demo');
  await inputs.nth(1).fill('123456');
  await page.getByText('登录', { exact: true }).last().click();
  await page.waitForTimeout(3000);
}
await page.goto('http://127.0.0.1:5173/#/pages/main/index', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

/** 量底栏与凸起项的几何 */
const measure = () =>
  page.evaluate(() => {
    const bar = document.querySelector('.tabbar');
    if (!bar) return null;
    const btn = document.querySelector('.raised-btn');
    const item = document.querySelector('.tab-item:not(.raised)');
    const br = bar.getBoundingClientRect();
    const rr = btn ? btn.getBoundingClientRect() : null;
    return {
      barH: Math.round(br.height),
      barTop: Math.round(br.top),
      barBottom: Math.round(br.bottom),
      itemH: item ? Math.round(item.getBoundingClientRect().height) : null,
      btnW: rr ? Math.round(rr.width) : null,
      btnH: rr ? Math.round(rr.height) : null,
      overhang: rr ? Math.round(br.top - rr.top) : null,
    };
  });

console.log('[1] 桌面 / 无安全区（safe-area = 0）');
const base = await measure();
console.log('    ', JSON.stringify(base));
check('底栏高 56', base.barH === 56, 'barH=' + base.barH);
check('普通项高度 55', base.itemH === 55, 'itemH=' + base.itemH);
check('凸起圆 48×48', base.btnW === 48 && base.btnH === 48, base.btnW + 'x' + base.btnH);
check('凸起圆越出顶边（overhang 22）', base.overhang === 22, 'overhang=' + base.overhang);

console.log('[2] 模拟 Safari 全屏（safe-area = ' + SAFE + 'px，修复后的公式）');
await page.addStyleTag({
  content:
    '.tabbar--safe{height:calc(56px + ' + SAFE + 'px)!important;padding-bottom:' + SAFE + 'px!important}',
});
await page.waitForTimeout(400);
const fixed = await measure();
console.log('    ', JSON.stringify(fixed));
check('底栏高 = 56 + 安全区', fixed.barH === 56 + SAFE, 'barH=' + fixed.barH);
check(
  '普通项高度**不变**（55，与桌面一致）—— 这是本 bug 的核心',
  fixed.itemH === 55,
  'itemH=' + fixed.itemH
);
check('凸起圆仍是 48×48', fixed.btnW === 48 && fixed.btnH === 48, fixed.btnW + 'x' + fixed.btnH);
check('凸起圆仍越出顶边 22', fixed.overhang === 22, 'overhang=' + fixed.overhang);
check('底栏底边贴屏幕底', fixed.barBottom === 812, 'barBottom=' + fixed.barBottom);

console.log('[3] 负向验证：改回"修复前"的公式，断言必须失败');
// 负向验证是项目铁律：没验过"能报错"的断言等于没有断言
await page.addStyleTag({
  content: '.tabbar--safe{height:56px!important;padding-bottom:' + SAFE + 'px!important}',
});
await page.waitForTimeout(400);
const broken = await measure();
console.log('    ', JSON.stringify(broken));
check(
  '确认"修复前"确实会塌陷（itemH=21）—— 证明上面那条断言是有效的',
  broken.itemH === 21,
  'itemH=' + broken.itemH
);

console.log('[4] 流水页筛选栏（同一个坑）');
await page.goto('http://127.0.0.1:5173/#/pages/flow/index', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
const flowBar = () =>
  page.evaluate(() => {
    const bar = document.querySelector('.filter-bar');
    if (!bar) return null;
    const item = document.querySelector('.filter-item');
    const br = bar.getBoundingClientRect();
    return {
      barH: Math.round(br.height),
      barBottom: Math.round(br.bottom),
      itemH: item ? Math.round(item.getBoundingClientRect().height) : null,
    };
  });
const fBase = await flowBar();
console.log('    桌面:', JSON.stringify(fBase));
check('筛选栏高 48', fBase.barH === 48, 'barH=' + fBase.barH);

await page.addStyleTag({
  content:
    '.filter-bar{height:calc(48px + ' + SAFE + 'px)!important;padding-bottom:' + SAFE + 'px!important}',
});
await page.waitForTimeout(400);
const fFixed = await flowBar();
console.log('    模拟安全区:', JSON.stringify(fFixed));
check('筛选栏高 = 48 + 安全区', fFixed.barH === 48 + SAFE, 'barH=' + fFixed.barH);
/*
 * ⚠️ 期望值是 **47 不是 48**：`.filter-bar` 高 48px 含 1px border-top，
 *    border-box 下内容区 = 47。这里断言的是"与桌面一致"，
 *    而不是某个我凭空算出来的数 —— 桌面实测就是 47（见上面 fBase 的输出）。
 */
check(
  '筛选项高度不变（与桌面一致，实测 47）',
  fFixed.itemH === fBase.itemH,
  'itemH=' + fFixed.itemH + ' (桌面 ' + fBase.itemH + ')'
);
check('筛选栏底边贴屏幕底', fFixed.barBottom === 812, 'barBottom=' + fFixed.barBottom);

await page.screenshot({ path: '/tmp/safe-area-fixed.png' });
console.log('');
console.log('结果：PASS=' + pass + ' FAIL=' + fail);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
