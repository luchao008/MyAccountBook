/**
 * 分类删除提示的文案验证。
 *
 *   node scripts/verify-category-delete.mjs
 *
 * 为什么需要它：提示文案是由**调用的地方**传子分类数决定的，
 * 历史上两处都传错了 ——
 *   删一级分类传 `0`         → 该提示"会连同 N 个二级一起删"却不提示；
 *   删二级分类传 `childrenOf(root.id).length`（**兄弟数量**）→ 不该提示却提示。
 * 这类错误不报错、不崩溃，只会让用户看到一句错话，所以必须自动盯住。
 *
 * ⚠️ 本脚本**不会真的删除**：读完弹窗文案后一律点「取消」。
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

const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ['--no-proxy-server'],
});
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
const page = await ctx.newPage();

/** 读当前弹窗内容 */
const modalText = () =>
  page.evaluate(() => {
    const el =
      document.querySelector('.uni-modal__bd') ||
      document.querySelector('[class*="modal"] [class*="bd"]');
    return el ? el.textContent.trim() : '(没读到弹窗内容)';
  });

/** 点弹窗的第一个按钮（取消），绝不执行删除 */
async function dismiss() {
  const btn = page.locator('.uni-modal__ft .uni-modal__btn, .uni-modal__btn').first();
  if (await btn.count()) await btn.click();
  await page.waitForTimeout(700);
}

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

// 展开第一个一级分类，好让二级行渲染出来
const firstName = await page.locator('.group-header .group-name').first().textContent();
const childCount = Number((await page.locator('.group-header .group-count').first().textContent()) || '0');
await page.locator('.group-header').first().click();
await page.waitForTimeout(900);

console.log(`一级分类「${firstName?.trim()}」下二级数量（页面显示的角标）= ${childCount}`);

// ── 用例 1：删一级分类，应提示"该分类下还有 N 个二级分类"
await page.locator('.group-header .action').first().click();
await page.waitForTimeout(800);
const rootText = await modalText();
await dismiss();

// ── 用例 2：删二级分类，**不应**出现"还有 N 个二级分类"
await page.locator('.child-row .action').first().click();
await page.waitForTimeout(800);
const childText = await modalText();
await dismiss();

console.log('\n===== 一级分类的删除弹窗 =====');
console.log(rootText);
console.log('\n===== 二级分类的删除弹窗 =====');
console.log(childText);

const rootSaysCount = /还有\s*\d+\s*个二级分类/.test(rootText);
const childSaysCount = /还有\s*\d+\s*个二级分类/.test(childText);

console.log('\n===== 判定 =====');
const checks = [
  ['一级：提示里带"还有 N 个二级分类"', rootSaysCount],
  [`一级：N 与页面角标一致（${childCount}）`, rootSaysCount && Number(rootText.match(/还有\s*(\d+)\s*个/)?.[1]) === childCount],
  ['二级：提示里**不**出现"还有 N 个二级分类"', !childSaysCount],
  ['二级：提示里仍说明"会变为未分类"', childText.includes('未分类')],
];
for (const [name, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${name}`);

await browser.close();
