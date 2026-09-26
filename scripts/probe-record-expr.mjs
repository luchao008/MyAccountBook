/*
 * 记一笔页「加减表达式键盘」视觉/交互探针（2026-09-26 随该功能入库）。
 *
 *   node scripts/probe-record-expr.mjs
 *
 * 前置：前端 dev server 在 5173（会自动带上工作区改动），后端在 7001。
 * 环境变量：BASE / PW_PATH。
 *
 * 验证点（对应需求逐条）：
 *   1. 键盘布局：右列 －/＋/确定(跨两行)、底行 ./0/⌫（截图 03）
 *   2. 连续运算 + 实时结果：敲 12.5+3-2，断言表达式行与结果"13.5"（截图 04）
 *   3. 金额盒固定高度 118px、货币符号 ¥ 在数字后
 *   4. 退格逐字符删除、尾部悬空运算符被容忍（截图 05）
 * 截图与 console 输出落在 /tmp/record-probe/，断言值直接打印在 stdout。
 */
import fs from 'node:fs';

const PW =
  process.env.PW_PATH ||
  '/Users/luchao/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js';
const pw = await import(PW);
const { chromium } = pw.default ?? pw;

function findChrome() {
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
  return undefined;
}

const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = process.env.SHOT_DIR || '/tmp/record-probe';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: findChrome() });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 300));
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 300)));

// ── 登录
await page.goto(`${BASE}/#/pages/login/index`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/01-login.png` });
const inputs = page.locator('input');
await inputs.nth(0).fill('demo');
await inputs.nth(1).fill('123456');
await page.locator('.submit').first().click();
await page.waitForTimeout(3000);
// 登录后可能落在「选择账本」页（多账本 + 无本地记忆）—— 点第一个账本继续
if (await page.locator('.account-item').count()) {
  await page.locator('.account-item').first().click();
  await page.waitForTimeout(1500);
}
console.log('登录后 URL =', page.url());
console.log(
  '首页元素数(.banner/.rank-card/.account-switch) =',
  await page.locator('.banner, .rank-card, .account-switch').count()
);
await page.screenshot({ path: `${OUT}/02-after-login.png` });

// ── 记一笔页
await page.goto(`${BASE}/#/pages/record/index`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/03-record-empty.png` });

// 敲 12.5+3-2 验证表达式输入与实时结果
async function tap(text) {
  await page.locator('.keyboard .key', { hasText: text }).first().click();
  await page.waitForTimeout(120);
}
for (const k of ['1', '2', '.', '5']) await tap(k);
await page.locator('.keyboard .key.op').nth(1).click(); // ＋
await page.waitForTimeout(120);
await tap('3');
await page.locator('.keyboard .key.op').nth(0).click(); // −
await page.waitForTimeout(120);
await tap('2');
await page.waitForTimeout(400);

const expr = await page.locator('.amount-box .expr').textContent();
const result = await page.locator('.amount-box .amount').textContent();
const currency = await page.locator('.amount-box .currency').textContent();
const boxH = await page.locator('.amount-box').evaluate((el) => el.offsetHeight);
console.log(`表达式行 = "${expr}"  结果 = "${result}"  货币 = "${currency}"  盒高 = ${boxH}px`);
await page.screenshot({ path: `${OUT}/04-record-expr.png` });

// 退格两下到 "12.5+3-"，再清空式退格验证
for (let i = 0; i < 2; i++) await page.locator('.keyboard .key.op').nth(2).click();
await page.waitForTimeout(300);
console.log('退格后表达式 =', await page.locator('.amount-box .expr').textContent());
await page.screenshot({ path: `${OUT}/05-record-backspace.png` });

console.log('\nconsole errors:', errors.length ? errors : '(无)');
await ctx.close();
await browser.close();
