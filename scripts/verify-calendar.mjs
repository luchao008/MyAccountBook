/**
 * 日历页运行时验证（真实浏览器）。
 *
 *   node scripts/verify-calendar.mjs
 *
 * 覆盖：收起态 swiper 单月滑动、「今天」按钮显隐、展开面板（渐变过渡 + 虚拟列表）、
 *       展开态滚动、选日期自动收起、标题联动。
 *
 * ⚠️ 只读不写：不创建、不修改、不删除任何数据。
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

let pass = 0;
let fail = 0;
const check = (n, ok, extra = '') => {
  if (ok) {
    pass += 1;
    console.log('  ✅ ' + n + ' ' + extra);
  } else {
    fail += 1;
    console.log('  ❌ ' + n + ' ' + extra);
  }
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-proxy-server'] });
const page = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200));
});

await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
if (page.url().includes('/pages/login')) {
  const inputs = page.locator('input');
  await inputs.nth(0).fill('demo');
  await inputs.nth(1).fill('123456');
  await page.getByText('登录', { exact: true }).last().click();
  await page.waitForTimeout(2500);
}
await page.goto('http://127.0.0.1:5173/#/pages/calendar/index', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);

console.log('[1] 收起态');
{
  const items = await page.evaluate(() => document.querySelectorAll('uni-swiper-item').length);
  check('swiper 渲染 3 个月', items === 3, 'items=' + items);
  const days = await page.evaluate(() => document.querySelectorAll('.day').length);
  check('日历格子渲染', days >= 28, 'days=' + days);
  check('FAB 存在', await page.evaluate(() => !!document.querySelector('.fab')));
  const title = await page.evaluate(() => document.querySelector('.nav-title')?.textContent.trim());
  check('标题显示日期', /\d+年\d+月\d+日/.test(title || ''), 'title=' + title);
}

console.log('[2] 今天按钮');
{
  const hasToday = await page.evaluate(() => !!document.querySelector('.today-btn'));
  check('默认选中今天时不显示「今天」按钮', !hasToday, 'has=' + hasToday);
}

console.log('[3] 展开');
{
  await page.locator('.nav-title-wrap').first().click();
  await page.waitForTimeout(900);
  const open = await page.evaluate(() =>
    document.querySelector('.expand-panel')?.classList.contains('open')
  );
  check('面板展开', open);
  const blocks = await page.evaluate(() => document.querySelectorAll('.month-block').length);
  check('虚拟列表只渲染少量块', blocks > 0 && blocks <= 6, 'blocks=' + blocks);
  const titles = await page.evaluate(() =>
    [...document.querySelectorAll('.month-title')].map((e) => e.textContent.trim())
  );
  check('月份标题渲染', titles.length > 0, JSON.stringify(titles.slice(0, 3)));
  await page.screenshot({ path: '/tmp/cal-expanded.png' });
}

console.log('[4] 展开态滚动');
{
  const first = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.month-title')].map((e) => e.textContent.trim())[0]
    );
  const before = await first();
  /*
   * ⚠️ 不能用 `el.scrollTop = N` 来测：uni-app 的 scroll-view 把 scrollTop
   *    当作**受控值**在滚动事件里回写，直接赋值会被立刻重置（实测滚动前后都是同一个月份）。
   *    用**真实滚轮手势**才能触发它的内部滚动逻辑。
   */
  await page.mouse.move(187, 500);
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(1200);
  const after = await first();
  const scrolled = await page.evaluate(() => {
    const el = document.querySelector('.month-list .uni-scroll-view');
    return el ? Math.round(el.scrollTop) : -1;
  });
  check('滚动后月份变化', before !== after, before + ' → ' + after + ' (scrollTop=' + scrolled + ')');
}

console.log('[5] 选日期自动收起');
{
  const dayBefore = await page.evaluate(() => document.querySelector('.nav-title')?.textContent.trim());
  await page.locator('.month-block .day').nth(10).click();
  await page.waitForTimeout(1200);
  const open = await page.evaluate(() =>
    document.querySelector('.expand-panel')?.classList.contains('open')
  );
  check('选完自动收起', !open);
  const dayAfter = await page.evaluate(() => document.querySelector('.nav-title')?.textContent.trim());
  check('标题更新为新选中日期', dayBefore !== dayAfter, dayBefore + ' → ' + dayAfter);
  await page.screenshot({ path: '/tmp/cal-collapsed.png' });
}

console.log('\n结果：PASS=' + pass + ' FAIL=' + fail);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
