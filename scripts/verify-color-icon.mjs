/**
 * 验证彩色图标（`ColorIcon`）在 H5 下真的渲染出来了。
 *
 *   node scripts/verify-color-icon.mjs
 *
 * 为什么值得单独一个脚本：这个组件的实现方式是 `v-html` 往**原生 `<svg>`** 里塞图标 body。
 * uni-app 的模板编译器对 `v-html` 有自己的处理（在 `<view>` 上会走 rich-text），
 * 如果它把 `<svg>` 上的 `v-html` 也一并改写，图标就会**静默渲染成空白** ——
 * 不报错、不警告，只是看不见。这类"看起来没坏"的问题必须靠**量 DOM** 来抓。
 *
 * 判据（缺一不可）：
 *   1. `.color-icon` 元素存在
 *   2. 它里面有子元素（说明 v-html 真的注入了）
 *   3. 它的渲染尺寸 > 0
 *   4. 有实际可见的路径（getBBox 宽高 > 0）
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
  try {
    const dirs = fs
      .readdirSync(root)
      .filter((d) => d.startsWith('chromium-'))
      .sort()
      .reverse();
    for (const d of dirs) {
      for (const arch of ['chrome-mac-arm64', 'chrome-mac-x64']) {
        const p = `${root}/${d}/${arch}/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
        if (fs.existsSync(p)) return p;
      }
    }
  } catch {
    /* 让 Playwright 自己找 */
  }
  return undefined;
}

const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const USER = process.env.SEED_USER || 'demo';
const PASS = process.env.SEED_PASS || '123456';
// 注：本脚本检查页面上**任意**一个 svg.color-icon 是否真的渲染出来（v-html 是否生效），
// 不需要指定具体 key —— 原先在这里声明过一个 ICON_KEY 常量但从未接线，已删除。

const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ['--no-proxy-server'],
});
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
const page = await ctx.newPage();

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

if (await page.locator('.submit').count()) {
  await page.locator('.uni-input-input').nth(0).fill(USER);
  await page.locator('.uni-input-input').nth(1).fill(PASS);
  await page.locator('.submit').first().click();
  await page.waitForTimeout(2500);
}

await page.goto(BASE + '#/pages/category/index', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2200);

// 展开全部分组，让目标分类进入 DOM
const groups = await page.locator('.group-header').count();
for (let i = 0; i < groups; i++) {
  await page.locator('.group-header').nth(i).click();
  await page.waitForTimeout(120);
}
await page.waitForTimeout(600);

const info = await page.evaluate(() => {
  const el = document.querySelector('svg.color-icon');
  if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  // 不写初始值：try / catch 两条路径都会赋值，写 `= null` 属于永远读不到的死赋值
  let bbox;
  try {
    const b = el.getBBox();
    bbox = { w: Math.round(b.width), h: Math.round(b.height) };
  } catch {
    bbox = 'getBBox 抛错';
  }
  return {
    found: true,
    childCount: el.children.length,
    childTags: [...el.children].map((c) => c.tagName.toLowerCase()).slice(0, 4),
    rect: { w: Math.round(r.width), h: Math.round(r.height) },
    viewBox: el.getAttribute('viewBox'),
    bbox,
    innerLen: (el.innerHTML || '').length,
  };
});

console.log('===== 彩色图标渲染检查 =====');
console.log(JSON.stringify(info, null, 1));

await page.screenshot({ path: process.env.SHOT || '/tmp/color-icon-check.png' });
console.log(`\n截图：${process.env.SHOT || '/tmp/color-icon-check.png'}`);

console.log('\n===== 判定 =====');
if (!info.found) {
  console.log('✗ 页面上没有 svg.color-icon —— 要么数据里还没有彩色 key，要么组件没渲染');
} else {
  const checks = [
    ['.color-icon 存在', true],
    [`v-html 注入了子元素（${info.childCount} 个）`, info.childCount > 0],
    [`渲染尺寸 > 0（${info.rect.w}×${info.rect.h}）`, info.rect.w > 0 && info.rect.h > 0],
    [`图标有实际图形（bbox ${JSON.stringify(info.bbox)}）`, typeof info.bbox === 'object' && info.bbox.w > 0],
    [`viewBox 用的是集合自己的边长（${info.viewBox}）`, /^0 0 (\d+) \1$/.test(info.viewBox || '')],
  ];
  for (const [name, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${name}`);
}

// 把含彩色图标的那一行滚进视口再截图，否则截到的是列表顶部，看不出效果
const holder = page.locator('.group-header:has(svg.color-icon), .child-row:has(svg.color-icon)').first();
if (await holder.count()) {
  await holder.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await holder.screenshot({ path: process.env.SHOT_ROW || '/tmp/color-icon-row.png' });
  console.log(`\n单行截图：${process.env.SHOT_ROW || '/tmp/color-icon-row.png'}`);
}
await page.screenshot({ path: process.env.SHOT || '/tmp/color-icon-check.png' });
console.log(`整屏截图：${process.env.SHOT || '/tmp/color-icon-check.png'}`);

await browser.close();
