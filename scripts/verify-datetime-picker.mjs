/**
 * 「记一笔 · 底部日期时间选择器」运行时验证（真实浏览器）。
 *
 *   node scripts/verify-datetime-picker.mjs
 *
 * 背景（2026-09-24 luchao 报"点日期半天弹不出来"）：
 *   选择器里的 swiper 曾一次性渲染 2000 ~ MAX_YEAR 的**全部月度**（384 个 swiper-item
 *   + 5 张月历），4x CPU 降速下要 **1258ms** 才进 DOM（一个 1240ms 长任务）。
 *   改成固定 3 项（前 / 当前 / 后）后 ≈ 200ms；首次挂载过的 DOM 用 v-show 留着复用，
 *   再开 ≈ 40ms。
 *
 * 覆盖：
 *   ① 弹出成本：4x 降速下首次挂载 < 600ms、弹层里 swiper-item 恒为 3、重开 < 150ms
 *   ② 默认落点 = 今天所在月；今天的格子带「今」
 *   ③ 手势滑动：换月正确、**视口里那张月历 == 标题月**、逐帧不闪第三个月、
 *      复位后还能继续滑（早先只改 ref 不复位 → 滑两次就卡住 / 显示错月）
 *   ④ 箭头：点一下立即换月；连点 N 次就是 N 个月（不丢点击）
 *   ⑤ 选日期 + 时刻（24+60 滚轮）→ 完成回填到记录页日期行
 *   ⑥ 重开：落点与选中态正确，不残留上一次的滑动偏移
 *
 * ⚠️ 只读验证：全程**不保存**任何记录（选日期/时刻只改表单状态，不落库）。
 * ⚠️ uni-app H5 把 <view> 渲成 <uni-view>，点击一律走 evaluate（项目已验证过的做法）；
 *    手势必须用 CDP 派发真实 touch 事件（swiper 只认 touch）。
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, '0');

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-proxy-server'] });
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
page.setDefaultTimeout(20000);
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200));
});
/*
 * 4x CPU 降速：Mac 不降速时挂载只要 ~50ms，任何写法都"看着挺快"，
 * 断言就没有意义了。降速后旧实现 1258ms / 新实现 ~200ms，阈值才有区分度。
 */
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

/** 登录（demo / 123456），与其它 verify-* 脚本一致 */
async function login() {
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  if (page.url().includes('/pages/login')) {
    const inputs = page.locator('input');
    await inputs.nth(0).fill('demo');
    await inputs.nth(1).fill('123456');
    await page.getByText('登录', { exact: true }).last().click();
    await page.waitForTimeout(3000);
  }
}

/* ── 页面交互小工具 ── */

const isOpen = () =>
  page.evaluate(() => {
    const m = document.querySelector('.month-swiper');
    const mask = m && m.closest('.mask');
    return !!mask && getComputedStyle(mask).display !== 'none';
  });

/** 点记录页的「日期」行打开选择器，返回从点击到弹层可见的耗时（ms） */
const openPicker = () =>
  page.evaluate(async () => {
    const row = Array.from(document.querySelectorAll('.row')).find((r) => {
      const l = r.querySelector('.row-label');
      return l && l.textContent.trim() === '日期' && !r.closest('.mask');
    });
    const t0 = performance.now();
    row.click();
    const appear = await new Promise((resolve) => {
      const timer = setInterval(() => {
        const m = document.querySelector('.month-swiper');
        const mask = m && m.closest('.mask');
        if (mask && getComputedStyle(mask).display !== 'none') {
          clearInterval(timer);
          resolve(performance.now() - t0);
        }
      }, 1);
      setTimeout(() => {
        clearInterval(timer);
        resolve(-1);
      }, 8000);
    });
    // 等首帧真的画完，别把"进 DOM"当成"画出来"
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return Math.round(appear);
  });

const closeSheet = async () => {
  await page.evaluate(() => {
    const m = document.querySelector('.month-swiper');
    const mask = m && m.closest('.mask');
    if (mask) mask.click();
  });
  await page.waitForTimeout(600);
};

/** 日历标题（`2026 年 9 月`）→ { y, m } */
const titleYM = async () => {
  const t = await page.evaluate(
    () => (document.querySelector('.cal-title-text') || {}).textContent || ''
  );
  const m = t.match(/(\d+)\s*年\s*(\d+)\s*月/);
  return m ? { y: Number(m[1]), m: Number(m[2]) } : null;
};

/** 某年月的日历格签名：(前置空格数, 天数) —— 用它反推"这一格画的是哪个月" */
const expectSig = (y, m) => {
  const first = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  return first + ',' + days;
};

/** 视口中心那一格的签名 + 它是不是中间那一项 */
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

/** 逐帧采样：视口中心那一格画的是哪个月（抓"闪错月份"） */
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
          const offset = cells.findIndex((c) => c.querySelector('.day'));
          sig = offset + ',' + cells.filter((c) => c.querySelector('.day')).length;
        }
        window.__frames.push(sig);
      }
      if (window.__on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
const stopSampler = () =>
  page.evaluate(() => {
    window.__on = false;
    return window.__frames;
  });

/** 真实 touch 左/右滑（uni-app swiper 只认 touch） */
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

const tapArrow = (dir) =>
  page.evaluate((d) => document.querySelectorAll('.cal-nav')[d === 'prev' ? 0 : 1].click(), dir);
const tapDone = () =>
  page.evaluate(() => document.querySelector('.done').click());
const dateRowText = () =>
  page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('.row')).find((r) => {
      const l = r.querySelector('.row-label');
      return l && l.textContent.trim() === '日期';
    });
    return row ? row.textContent.replace(/\s+/g, ' ') : '';
  });
/** 点视口里那一格的第 N 天（三格都在 DOM 里，点错格就会选到邻月） */
const tapDayInVisibleGrid = (day) =>
  page.evaluate((d) => {
    const sw = document.querySelector('.month-swiper');
    const sr = sw.getBoundingClientRect();
    const vis = Array.from(sw.querySelectorAll('uni-swiper-item')).find((it) => {
      const r = it.getBoundingClientRect();
      return r.left <= sr.left + sr.width / 2 && r.right >= sr.left + sr.width / 2;
    });
    const cell = Array.from(vis.querySelectorAll('.day')).find((c) => c.textContent.trim() === String(d));
    if (cell) cell.click();
    return !!cell;
  }, day);

/* ============================================================
 * ① 弹出成本
 * ============================================================ */
await login();
await page.goto('http://127.0.0.1:5173/#/pages/record/index', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

console.log('[1] 弹出成本（4x CPU 降速）');
const t1 = await openPicker();
const domStats = await page.evaluate(() => {
  const mask = document.querySelector('.month-swiper').closest('.mask');
  return {
    items: document.querySelectorAll('uni-swiper-item').length,
    nodes: mask.querySelectorAll('*').length,
    days: document.querySelectorAll('.day-cell .day').length,
  };
});
check('首次挂载 < 600ms（旧实现 1258ms）', t1 > 0 && t1 < 600, 'appear=' + t1 + 'ms');
check('弹层里 swiper-item 恒为 3（不是全量月份）', domStats.items === 3, 'items=' + domStats.items);
check('弹层节点数 < 500（旧实现 2000+）', domStats.nodes < 500, 'nodes=' + domStats.nodes);
check('渲染出日历格子', domStats.days >= 80, 'days=' + domStats.days);

/* ============================================================
 * ② 默认落点与选中态
 * ============================================================ */
console.log('[2] 默认落点');
const today = new Date();
const ym0 = await titleYM();
check('落点 = 今天所在月', ym0.y === today.getFullYear() && ym0.m === today.getMonth() + 1, `${ym0.y}年${ym0.m}月`);
const vis0 = await visibleGrid();
check('视口那张月历 = 今天所在月', vis0.sig === expectSig(today.getFullYear(), today.getMonth() + 1), '视口 ' + vis0.sig);
check('今天的格子带「今」或选中态', await page.evaluate(() => !!document.querySelector('.day.today, .day.selected')));

/* ============================================================
 * ③ 手势滑动（换月正确 / 视口月份 == 标题 / 不闪第三个月 / 复位后可继续滑）
 * ============================================================ */
console.log('[3] 手势滑动');
const before = await titleYM();
await startSampler();
await swipeMonth('left');
const frames = await stopSampler();
const after = await titleYM();
const expNext = { y: before.m === 12 ? before.y + 1 : before.y, m: before.m === 12 ? 1 : before.m + 1 };
check('左滑 → 标题进一个月', after.y === expNext.y && after.m === expNext.m, `${before.y}年${before.m}月 → ${after.y}年${after.m}月`);
const vis1 = await visibleGrid();
check(
  '视口那张月历 == 标题月',
  vis1.sig === expectSig(after.y, after.m),
  `视口 ${vis1.sig} / 期望 ${expectSig(after.y, after.m)}`
);
check('复位回中线（可见项 = 中间项 idx1）', vis1.idx === 1, 'idx=' + vis1.idx);
const sigSeq = frames.filter((s, i) => i === 0 || s !== frames[i - 1]);
check(
  '逐帧只经过 起月/新月，没闪出第三个月',
  sigSeq.every((s) => s === expectSig(before.y, before.m) || s === expectSig(after.y, after.m)),
  JSON.stringify(sigSeq)
);

const ymA = await titleYM();
await swipeMonth('left');
await swipeMonth('left');
const ymB = await titleYM();
const idxB = ymA.y * 12 + (ymA.m - 1) + 2;
check(
  '连滑两次 → 共进两个月（复位生效，不是滑不动）',
  ymB.y === Math.floor(idxB / 12) && ymB.m === (idxB % 12) + 1,
  `${ymA.y}年${ymA.m}月 → ${ymB.y}年${ymB.m}月`
);
const visB = await visibleGrid();
check('连滑后视口月份仍与标题一致', visB.sig === expectSig(ymB.y, ymB.m) && visB.idx === 1, `视口 ${visB.sig} / idx=${visB.idx}`);

await swipeMonth('right');
const ymC = await titleYM();
const idxC = ymB.y * 12 + (ymB.m - 1) - 1;
check('右滑 → 标题退一个月', ymC.y === Math.floor(idxC / 12) && ymC.m === (idxC % 12) + 1, `${ymB.y}年${ymB.m}月 → ${ymC.y}年${ymC.m}月`);

/* ============================================================
 * ④ 箭头：立即换月 + 连点不丢
 * ============================================================ */
console.log('[4] 箭头翻月');
const ymArrow = await titleYM();
await tapArrow('next');
await page.waitForTimeout(300);
const ymNext = await titleYM();
const idxD = ymArrow.y * 12 + (ymArrow.m - 1) + 1;
check('点 › 立即 +1 月', ymNext.y === Math.floor(idxD / 12) && ymNext.m === (idxD % 12) + 1, `${ymArrow.y}年${ymArrow.m}月 → ${ymNext.y}年${ymNext.m}月`);
await tapArrow('next');
await tapArrow('next');
await tapArrow('next');
await page.waitForTimeout(400);
const ymNext4 = await titleYM();
const idxE = ymArrow.y * 12 + (ymArrow.m - 1) + 4;
check('连点 3 次 › = 再 +3 月（不丢点击）', ymNext4.y === Math.floor(idxE / 12) && ymNext4.m === (idxE % 12) + 1, `${ymNext.y}年${ymNext.m}月 → ${ymNext4.y}年${ymNext4.m}月`);
for (let i = 0; i < 4; i += 1) await tapArrow('prev');
await page.waitForTimeout(400);
const ymBack = await titleYM();
check('连点 4 次 ‹ 回到原点', ymBack.y === ymArrow.y && ymBack.m === ymArrow.m, `${ymNext4.y}年${ymNext4.m}月 → ${ymBack.y}年${ymBack.m}月`);

/* ============================================================
 * ⑤ 选日期 + 时刻 → 完成回填
 * ============================================================ */
console.log('[5] 选日期 / 时刻 / 回填');
const ymPick = await titleYM();
const tapped = await tapDayInVisibleGrid(15);
await page.waitForTimeout(300);
check('点到视口里那一格的第 15 天', tapped);
const selDay = await page.evaluate(
  () => (document.querySelector('.selected .day-text') || {}).textContent || ''
);
check('15 号变选中态', selDay === '15', 'selected=' + selDay);
await page.evaluate(() => {
  const row = Array.from(document.querySelectorAll('.mask .row')).find(
    (r) => r.textContent.indexOf('时刻') >= 0
  );
  row.click();
});
await page.waitForTimeout(500);
const wheel = await page.evaluate(() => ({
  wheels: document.querySelectorAll('.wheel').length,
  items: document.querySelectorAll('.wheel-item').length,
}));
check('时刻滚轮渲染 24 + 60 项', wheel.wheels === 1 && wheel.items === 84, JSON.stringify(wheel));
await tapDone();
await page.waitForTimeout(500);
const wantDate = `${ymPick.y}-${pad(ymPick.m)}-15`;
check('记录页日期行回填为新选的日期（带时刻）', new RegExp(`${wantDate} \\d\\d:\\d\\d`).test(await dateRowText()), await dateRowText());
check('点完成后弹层隐藏', (await isOpen()) === false);

/* ============================================================
 * ⑥ 重开：状态归位
 * ============================================================ */
console.log('[6] 重开归位');
const t2 = await openPicker();
check('重开 < 150ms（DOM 复用，不重建）', t2 >= 0 && t2 < 150, 'appear=' + t2 + 'ms');
const ymR = await titleYM();
check('重开落点 = 上次选中的月份', ymR.y === ymPick.y && ymR.m === ymPick.m, `${ymR.y}年${ymR.m}月`);
const reopen = await page.evaluate(() => ({
  selected: (document.querySelector('.selected .day-text') || {}).textContent || '',
  count: document.querySelectorAll('.selected').length,
}));
check('重开后选中态唯一且仍是 15 号', reopen.selected === '15' && reopen.count === 1, JSON.stringify(reopen));
await page.screenshot({ path: '/tmp/datetime-picker.png' });
await closeSheet();

console.log('\n结果：PASS=' + pass + ' FAIL=' + fail + '（全程未保存任何记录）');
await browser.close();
process.exit(fail > 0 ? 1 : 0);
