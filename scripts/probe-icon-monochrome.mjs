/**
 * 图标「单色性」探针 —— 实拍 + DOM 断言。
 *
 *   node scripts/probe-icon-monochrome.mjs [后缀]
 *
 * 被测：底栏「首页」与「我的 → 收入分类管理」两处图标。
 *
 * 背景（2026-10-03）：这两处原先写的是 `icon-home` / `icon-income`，
 * 而这两个名字**根本不在 `UI_ICONS` 里** —— `resolveIconName()` 静默回退成
 * 彩色软胶的 `FALLBACK_ICON = cat-misc`，于是界面上是"一个彩色图标混在单色里"。
 * 修法是把两个真图标补进 `UI_ICONS`；本探针负责证明"补了之后真的是单色线性"。
 *
 * 判据（两条**都要**过）：
 *   ① `stroke="currentColor"` 存在 —— 颜色由外层决定，这才是"单色"的可验证含义
 *   ② 正文里**没有**硬编码颜色（`fill="#xxx"`）—— 有就是彩色软胶分支
 * ⚠️ 只看"看起来是灰的"不算数：`cat-misc` 里有深色元素，肉眼容易骗过。
 *
 * 截图落 `docs/screenshots/`。
 */
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(import.meta.dirname, '../docs/screenshots');
const SUFFIX = process.argv[2] || 'after';

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

let pass = 0;
let fail = 0;
const check = (n, ok, extra = '') => {
  if (ok) {
    pass += 1;
    console.log('  OK   ' + n + (extra ? ' ' + extra : ''));
  } else {
    fail += 1;
    console.log('  FAIL ' + n + (extra ? ' ' + extra : ''));
  }
};

/** 单色判据：有 currentColor、无硬编码色 */
function isMonochrome(html) {
  if (!html) return { ok: false, why: 'svg 不存在' };
  const hasCurrent = /stroke="currentColor"/.test(html);
  const hardColor = html.match(/fill="#[0-9a-fA-F]{3,8}"/);
  if (!hasCurrent) return { ok: false, why: '没有 stroke="currentColor"' };
  if (hardColor) return { ok: false, why: `写了硬编码颜色 ${hardColor[0]}（彩色分支）` };
  return { ok: true, why: '' };
}

const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ['--no-proxy-server'],
});
const page = await (
  await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
).newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 150)));

await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1800);

if (page.url().includes('/pages/login')) {
  const inputs = page.locator('input');
  await inputs.nth(0).fill('demo');
  await inputs.nth(1).fill('123456');
  await page.getByText('登录', { exact: true }).last().click();
  await page.waitForTimeout(3000);
}

// 兜底：确保落在启动页（底栏「首页 / 我的」所在的容器页）
if (!page.url().includes('/pages/account-select')) {
  await page.goto('http://127.0.0.1:5173/#/pages/account-select/index', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(2500);
}

/** 读底栏每一项的图标外框 HTML */
const readTabs = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.tab-item')].map((el) => ({
      text: (el.textContent || '').trim(),
      html: (el.querySelector('svg') || {}).outerHTML || null,
    })),
  );

// ── ① 底栏「首页」 ────────────────────────────────────────────────────────
let tabs = await readTabs();
const homeTab = tabs.find((t) => t.text.startsWith('首页'));
console.log(`\n底栏共 ${tabs.length} 项：${tabs.map((t) => t.text).join(' / ')}`);
check('底栏存在「首页」项', !!homeTab);
if (homeTab) {
  const r = isMonochrome(homeTab.html);
  check('底栏「首页」图标是单色线性', r.ok, r.ok ? '' : `→ ${r.why}`);
}

await page.locator('.tabbar').screenshot({ path: path.join(OUT, `09-tabbar-home-${SUFFIX}.png`) });

// ── ② 「我的」视图 → 收入分类管理 ─────────────────────────────────────────
await page.evaluate(() => {
  const el = [...document.querySelectorAll('.tab-item')].find((e) =>
    (e.textContent || '').includes('我的'),
  );
  if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await page.waitForTimeout(2500);

const rows = await page.evaluate(() =>
  [...document.querySelectorAll('.menu-item')].map((el) => ({
    text: (el.textContent || '').trim(),
    html: (el.querySelector('svg') || {}).outerHTML || null,
  })),
);
console.log(`\n「我的」菜单共 ${rows.length} 行：${rows.map((r) => r.text).join(' / ')}`);

for (const label of ['收入分类管理', '支出分类管理']) {
  const row = rows.find((r) => r.text.startsWith(label));
  check(`存在「${label}」行`, !!row);
  if (row) {
    const r = isMonochrome(row.html);
    check(`「${label}」图标是单色线性`, r.ok, r.ok ? '' : `→ ${r.why}`);
  }
}

await page.screenshot({ path: path.join(OUT, `10-mine-menu-${SUFFIX}.png`), fullPage: false });

console.log(`\n${fail === 0 ? '✅' : '❌'} 通过 ${pass} / 失败 ${fail}`);
console.log(`截图：docs/screenshots/09-tabbar-home-${SUFFIX}.png, 10-mine-menu-${SUFFIX}.png`);

await browser.close();
process.exit(fail ? 1 : 0);
