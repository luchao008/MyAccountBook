/**
 * 页面高度诊断：**内容不足一屏，却出现了滚动条**。
 *
 *   node scripts/diagnose-scroll.mjs
 *
 * 环境变量：BASE / SEED_USER / SEED_PASS / PW_PATH / CHROME
 *
 * 输出每个页面/视图的：
 *   - 视口高、文档 scrollHeight、溢出量
 *   - 从内容根一路到 html 的高度构成（含 min-height / padding / position / box-sizing）
 *
 * 判定思路：滚动条只在 `scrollHeight > clientHeight` 时出现。
 * 内容没超一屏却溢出，必然是某个祖先的 min-height 或 padding 叠加超过了视口
 * （典型：`min-height: 100vh` 又处在带 padding-top 的容器里 → 总高 = 100vh + 导航栏高）。
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

/** 内容根的选择器（不同页面各取一个已存在的） */
async function snapshot(tag) {
  const info = await page.evaluate(() => {
    const doc = document.documentElement;
    const root =
      document.querySelector('.main') ||
      document.querySelector('uni-page-body > .page') ||
      document.querySelector('.page');

    const chain = [];
    let el = root;
    while (el && el !== doc.parentElement) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      chain.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || '').slice(0, 36),
        h: Math.round(r.height),
        pos: cs.position,
        minH: cs.minHeight,
        padT: cs.paddingTop,
        padB: cs.paddingBottom,
        box: cs.boxSizing,
      });
      el = el.parentElement;
    }

    const cs = getComputedStyle(document.documentElement);
    const wrapper = document.querySelector('uni-page-wrapper');

    return {
      viewport: window.innerHeight,
      docScroll: doc.scrollHeight,
      docClient: doc.clientHeight,
      overflow: doc.scrollHeight - doc.clientHeight,
      // uni-app H5 是否暴露导航栏/tabBar 高度变量（有的话就不必硬编码 44px）
      cssVars: {
        windowTop: cs.getPropertyValue('--window-top').trim(),
        windowBottom: cs.getPropertyValue('--window-bottom').trim(),
      },
      wrapperHeight: wrapper ? Math.round(wrapper.getBoundingClientRect().height) : null,
      chain,
    };
  });

  const flag = info.overflow > 0 ? `✗ 溢出 ${info.overflow}px` : '✓ 无滚动';
  console.log(`\n===== ${tag} =====`);
  console.log(`视口 ${info.viewport} · 文档 ${info.docScroll} · clientHeight ${info.docClient} → ${flag}`);
  console.log(
    `内容区(uni-page-wrapper) 高 ${info.wrapperHeight} · ` +
      `--window-top=${JSON.stringify(info.cssVars.windowTop)} --window-bottom=${JSON.stringify(info.cssVars.windowBottom)}`,
  );
  console.log('高度构成（内容根 → html）：');
  for (const c of info.chain) {
    console.log(
      `  ${c.tag}.${c.cls}  h=${c.h} pos=${c.pos} minH=${c.minH} padT=${c.padT} padB=${c.padB} box=${c.box}`,
    );
  }
  return info;
}

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

if (await page.locator('.submit').count()) {
  await page.locator('.uni-input-input').nth(0).fill(USER);
  await page.locator('.uni-input-input').nth(1).fill(PASS);
  await page.locator('.submit').first().click();
  await page.waitForTimeout(2500);
}

// 主容器：逐个视图测。
// ⚠️ 2026-09-14 起容器只剩「记账」一个视图（「我的」移出、明细已下线、统计成独立页），
//    列失效的项会静默点到不存在的格子 —— 那样什么都不会发生，却仍输出一份"零溢出"的漂亮结论。
const views = [['记账', 'home']];
for (const [text, key] of views) {
  const item = page.locator('.tabbar .tab-item', { hasText: text }).first();
  if (await item.count()) {
    await item.click();
    await page.waitForTimeout(1200);
    await snapshot(`主容器 · ${key}`);
  }
}

// 账本选择页
await page.goto(BASE + '#/pages/account-select/index', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1800);
await snapshot('账本选择页');

await browser.close();
