/**
 * 日历页运行时验证（真实浏览器）。
 *
 *   node scripts/verify-calendar.mjs
 *
 * 覆盖：收起态 swiper 单月滑动、「今天」按钮显隐、展开面板（渐变过渡 + 虚拟列表）、
 *       展开态滚动、选日期自动收起、标题联动、
 *       收起态滑动换月（视口月份必须与标题一致，逐帧不得闪出第三个月份）。
 *
 * ⚠️ 最后一项是 2026-09-24 补的回归：早先「滑完把 current 复位到中间」只改了组件里的 ref，
 *    uni-app H5 的 swiper 内部 current 不会回写 → 滑动后视口里那张月历比标题差一个月
 *    （标题 10 月、格子却是 11 月），而当时的脚本只断言了「渲染 3 个 item」，漏掉了。
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
/* hasTouch：收起态切月的滑动手势要用 CDP 派发真实 touch 事件（见 §6），没有它事件不生效 */
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

/* ============================================================
 * ⑥ 收起态滑动换月：视口月份必须与标题一致（2026-09-24 补的回归）
 * ============================================================ */
console.log('[6] 收起态滑动换月');

/** 标题里的 {年, 月} */
const titleYM = async () => {
  const t = await page.evaluate(() => document.querySelector('.nav-title')?.textContent.trim() || '');
  const m = t.match(/(\d+)年(\d+)月(\d+)日/);
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
};
/** 某年月的日历格签名：(前置空格数, 天数) —— 同一年里逐月唯一，用它反推"这一格画的是哪个月" */
const expectSig = (y, m) => {
  const first = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  return first + ',' + days;
};
/** 视口中心那一格的签名 + 它是不是中间那一项（idx=1） */
const visibleGrid = () =>
  page.evaluate(() => {
    const sw = document.querySelector('.month-swiper');
    const sr = sw.getBoundingClientRect();
    const items = Array.from(sw.querySelectorAll('uni-swiper-item'));
    const idx = items.findIndex((it) => {
      const r = it.getBoundingClientRect();
      return r.left <= sr.left + sr.width / 2 && r.right >= sr.left + sr.width / 2;
    });
    if (idx < 0) return { idx: -1, sig: '' };
    const cells = Array.from(items[idx].querySelectorAll('.day-cell'));
    const offset = cells.findIndex((c) => c.querySelector('.day'));
    const days = cells.filter((c) => c.querySelector('.day')).length;
    return { idx, sig: offset + ',' + days };
  });
/** 逐帧采样：视口中心那一格画的是哪个月（用于抓"闪错月份"） */
const startSampler = () =>
  page.evaluate(() => {
    window.__frames = [];
    window.__on = true;
    const tick = () => {
      const sw = document.querySelector('.month-swiper');
      if (sw) {
        const sr = sw.getBoundingClientRect();
        const items = Array.from(sw.querySelectorAll('uni-swiper-item'));
        const idx = items.findIndex((it) => {
          const r = it.getBoundingClientRect();
          return r.left <= sr.left + sr.width / 2 && r.right >= sr.left + sr.width / 2;
        });
        let sig = '';
        if (idx >= 0) {
          const cells = Array.from(items[idx].querySelectorAll('.day-cell'));
          sig = cells.findIndex((c) => c.querySelector('.day')) + ',' +
            cells.filter((c) => c.querySelector('.day')).length;
        }
        window.__frames.push({ idx, sig });
      }
      if (window.__on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
const stopSampler = () =>
  page.evaluate(() => {
    window.__on = false;
    return window.__frames.map((f) => f.sig);
  });

/** 真实 touch 手势左/右滑（uni-app swiper 只认 touch） */
async function swipeMonth(dir) {
  const box = await page.evaluate(() => {
    const r = document.querySelector('.month-swiper').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  const from = box.x + (dir === 'left' ? 100 : -100);
  const to = box.x + (dir === 'left' ? -100 : 100);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from, y: box.y }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from + ((to - from) * i) / 8, y: box.y }],
    });
    await sleep(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(1000);
}

const beforeYM = await titleYM();
await startSampler();
await swipeMonth('left');
const frames = await stopSampler();
const afterYM = await titleYM();
const nextM = beforeYM.m === 12 ? 1 : beforeYM.m + 1;
const nextY = beforeYM.m === 12 ? beforeYM.y + 1 : beforeYM.y;
const vis = await visibleGrid();
check('左滑 → 标题进一个月', afterYM.y === nextY && afterYM.m === nextM, `${beforeYM.y}年${beforeYM.m}月 → ${afterYM.y}年${afterYM.m}月`);
check(
  '视口里那张月历 == 标题月（本次修复的核心）',
  vis.sig === expectSig(afterYM.y, afterYM.m),
  `视口 ${vis.sig} / 期望 ${expectSig(afterYM.y, afterYM.m)}（标题 ${afterYM.y}年${afterYM.m}月）`
);
check('复位回中线（可见项 = 中间项 idx1，可继续滑）', vis.idx === 1, 'idx=' + vis.idx);
const sigSeq = frames.filter((s, i) => i === 0 || s !== frames[i - 1]);
check(
  '逐帧只经过 起月/新月 两格，没有闪出第三个月',
  sigSeq.every((s) => s === expectSig(beforeYM.y, beforeYM.m) || s === expectSig(afterYM.y, afterYM.m)),
  JSON.stringify(sigSeq)
);

// 连滑两次：复位若失效（滑不动）这里就会挂
const ym2 = await titleYM();
await swipeMonth('left');
await swipeMonth('left');
const ym3 = await titleYM();
const expIdx = ym2.y * 12 + (ym2.m - 1) + 2;
check(
  '再连滑两次 → 标题共进两个月（复位生效，不是滑不动）',
  ym3.y === Math.floor(expIdx / 12) && ym3.m === (expIdx % 12) + 1,
  `${ym2.y}年${ym2.m}月 → ${ym3.y}年${ym3.m}月`
);
const vis3 = await visibleGrid();
check(
  '连滑后视口月份仍与标题一致',
  vis3.sig === expectSig(ym3.y, ym3.m) && vis3.idx === 1,
  `视口 ${vis3.sig} / 期望 ${expectSig(ym3.y, ym3.m)} / idx=${vis3.idx}`
);

// 右滑回一个月
await swipeMonth('right');
const ym4 = await titleYM();
const backIdx = ym3.y * 12 + (ym3.m - 1) - 1;
check(
  '右滑 → 标题退一个月',
  ym4.y === Math.floor(backIdx / 12) && ym4.m === (backIdx % 12) + 1,
  `${ym3.y}年${ym3.m}月 → ${ym4.y}年${ym4.m}月`
);
const vis4 = await visibleGrid();
check('右滑后视口月份也一致', vis4.sig === expectSig(ym4.y, ym4.m), `视口 ${vis4.sig} / 期望 ${expectSig(ym4.y, ym4.m)}`);
await page.screenshot({ path: '/tmp/cal-swipe.png' });

console.log('\n结果：PASS=' + pass + ' FAIL=' + fail);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
