/**
 * 请求层「传输层失败自动重试」的端到端验证（2026-10-03）
 *
 * 为什么要有这个脚本（而不是只靠 utils/retry.ts 的 29 条单测）：
 *
 *   单测钉的是**判据**（哪些失败值得重试），但它钉不住**接线**——
 *   判据再对，只要 errMsg 的真实形状不是 `request:fail`、
 *   或者重试计数没穿过 luch-request 的 `mergeConfig` 白名单、
 *   或者重试被写在了拦截器外面（导致 toast 弹三次），
 *   单测照样全绿而功能是坏的。
 *
 *   所以这里**真的制造失败**（拦截并 abort / 挂起 / 返回 500），
 *   数一数网络请求到底发生了几次，并检查页面终态。
 *
 * ⚠️ 前置：dev server 必须在 5173 上跑着（`cd frontend && npm run dev:h5`）。
 *
 * 用法：node scripts/verify-retry.mjs
 */
import fs from 'node:fs';

const PW = '/Users/luchao/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js';
const pw = await import(PW);
const { chromium } = pw.default ?? pw;

const BASE = 'http://127.0.0.1:5173';
const USER = 'demo';
const PASS = '123456';

/** 被观察的目标接口（流水页主列表，GET，幂等） */
const SUMMARY = '**/api/transactions/summary*';
/** 登录接口（POST，非幂等）—— 用于验证"写接口不重试" */
const LOGIN = '**/api/auth/login';

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
  throw new Error('找不到 playwright 的 Chromium');
}

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 等到 `fn()` 为真（或超时）。返回是否等到了。 */
async function waitUntil(fn, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (fn()) return true;
    await sleep(100);
  }
  return fn();
}

const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ['--no-proxy-server'],
});

// ─────────────────────────────────────────────────────────────
// 先登录（这一步不拦截，走正常路径）
// ─────────────────────────────────────────────────────────────
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true });
const page = await context.newPage();

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)));

/** 收集 [http] 前缀的 warn 日志（重试日志就在里面） */
const httpLogs = [];
page.on('console', (m) => {
  const t = m.text();
  if (t.includes('[http]')) httpLogs.push(t);
});

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await sleep(1500);
if (page.url().includes('/pages/login')) {
  const inputs = page.locator('input');
  await inputs.nth(0).fill(USER);
  await inputs.nth(1).fill(PASS);
  await page.getByText('登录', { exact: true }).last().click();
  await sleep(2500);
}
console.log(`登录后 URL：${page.url().replace(BASE, '')}`);

/** 进流水页（reload 保留 hash，会重新走 onLoad/onShow 触发请求） */
async function gotoTab(hash) {
  const url = `${BASE}/#${hash}`;
  /*
   * ⚠️ 必须区分"换页"与"已在同一页"：
   *    `goto` 到一个**与当前完全相同**的 URL（含 hash）时浏览器不做任何导航，
   *    页面不会重新走 onLoad/onShow ⇒ 请求一次都不会发。
   *    这正是本脚本第一次跑时 A~D 场景全是 "实际 0 次" 的原因
   *    （而基线是切页，所以是好的）。
   */
  if (page.url() === url) {
    await page.reload({ waitUntil: 'domcontentloaded' });
  } else {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  }
  await sleep(1500);
}

/**
 * 跑一个场景：注册路由拦截 → 触发请求 → 统计请求次数与页面终态 → 清理路由。
 *
 * @param behavior (route, nth) => Promise，nth 从 1 起（第几次请求）
 */
async function scenario(name, { hash, pattern, behavior, expectAtLeast, extraWaitMs = 2500 }) {
  console.log(`\n[${name}]`);
  const hits = [];
  const handler = async (route) => {
    hits.push({ t: Date.now(), url: route.request().url() });
    try {
      return await behavior(route, hits.length);
    } catch {
      // 路由在页面导航期间可能被拆掉，忽略
      return;
    }
  };
  await page.route(pattern, handler);

  await gotoTab(hash);
  const reached = await waitUntil(() => hits.length >= expectAtLeast, 15000);
  check(`发出了至少 ${expectAtLeast} 次请求`, reached, `实际 ${hits.length} 次`);

  // 观察窗口：等足够久，确认"没有更多请求"
  await sleep(extraWaitMs);
  const total = hits.length;
  await page.unroute(pattern, handler);
  return { total, logs: httpLogs.slice(), reached };
}

// ─────────────────────────────────────────────────────────────
// 场景 0（基线）：不制造失败，正常的流水页到底发几次请求？
//   没有这个基线，后面"重试后 2 次"就无法归因。
// ─────────────────────────────────────────────────────────────
{
  console.log('[基线] 不制造失败');
  const hits = [];
  const handler = (route) => {
    hits.push(1);
    return route.continue();
  };
  await page.route(SUMMARY, handler);
  await gotoTab('/pages/flow/index');
  await waitUntil(() => hits.length >= 1, 15000);
  await sleep(2500);
  await page.unroute(SUMMARY, handler);
  check(
    '基线：一次正常加载只发 1 次 /transactions/summary',
    hits.length === 1,
    `实际 ${hits.length} 次`,
  );
  if (hits.length !== 1) {
    console.log('  ⚠️ 基线不是 1 —— 后面的次数断言不能成立，先排查页面是否存在重复请求。');
  }
}

// ─────────────────────────────────────────────────────────────
// 场景 A（正向）：第 1 次断网，之后放行 ⇒ 应自动重试并最终成功
// ─────────────────────────────────────────────────────────────
{
  const r = await scenario('A · 第 1 次断网后自动重试并成功', {
    hash: '/pages/flow/index',
    pattern: SUMMARY,
    expectAtLeast: 2,
    behavior: (route, nth) => (nth === 1 ? route.abort('failed') : route.continue()),
    extraWaitMs: 2500,
  });
  check('恰好重试 1 次（共 2 次请求）', r.total === 2, `实际 ${r.total} 次`);
  const hasRows = await page.evaluate(() => document.querySelectorAll('.txn').length > 0);
  check(
    '重试后页面拿到了数据（列表有流水行）',
    hasRows,
    `行数=${await page.evaluate(() => document.querySelectorAll('.txn').length)}`,
  );
}

// ─────────────────────────────────────────────────────────────
// 场景 B（负向）：一直断网 ⇒ 重试到 MAX_ATTEMPTS=3 就停，不多不少
// ─────────────────────────────────────────────────────────────
{
  const r = await scenario('B · 一直断网：重试到上限即停（3 次）', {
    hash: '/pages/flow/index',
    pattern: SUMMARY,
    expectAtLeast: 3,
    behavior: (route) => route.abort('failed'),
    extraWaitMs: 3000,
  });
  check('恰好 3 次（MAX_ATTEMPTS），没有无限重试', r.total === 3, `实际 ${r.total} 次`);
  // 最终失败必须让页面落到"空"，而不是卡在骨架/残留上一次的数据
  const rows = await page.evaluate(() => document.querySelectorAll('.txn').length);
  check('全部失败后页面没有残留数据（失败被正确传递到页面）', rows === 0, `流水行 ${rows} 条`);
}

// ─────────────────────────────────────────────────────────────
// 场景 C（负向）：服务端返回 500（已明确响应）⇒ 一次都不重试
// ─────────────────────────────────────────────────────────────
{
  const r = await scenario('C · HTTP 500（服务端已响应）：不重试', {
    hash: '/pages/flow/index',
    pattern: SUMMARY,
    expectAtLeast: 1,
    behavior: (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 50000, message: '服务器开小差了' }),
      }),
    extraWaitMs: 3000,
  });
  check('只发 1 次，没有重试', r.total === 1, `实际 ${r.total} 次`);
}

// ─────────────────────────────────────────────────────────────
// 场景 D（负向）：请求一直挂起 ⇒ 10s 超时后**不重试**（用户已等太久）
// ─────────────────────────────────────────────────────────────
{
  console.log('\n   （本场景要等满一个 10s 超时，约 15s）');
  const r = await scenario('D · 超时：不重试', {
    hash: '/pages/flow/index',
    pattern: SUMMARY,
    expectAtLeast: 1,
    // 既不 abort 也不 fulfill ⇒ 请求一直挂着，由 XHR 自身的 timeout(10s) 收尾
    behavior: () => new Promise(() => {}),
    extraWaitMs: 13000,
  });
  check('只发 1 次（超时不属于可重试的"瞬时失败"）', r.total === 1, `实际 ${r.total} 次`);
}

// ─────────────────────────────────────────────────────────────
// 场景 E（负向）：POST（登录）断网 ⇒ 不重试（避免重复提交）
//   需要独立 context：已登录状态下不会再调登录接口。
// ─────────────────────────────────────────────────────────────
{
  console.log('\n[E · POST 断网不重试]');
  const ctx2 = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true });
  const p2 = await ctx2.newPage();
  const hits = [];
  const handler = (route) => {
    hits.push(1);
    return route.abort('failed');
  };
  await p2.route(LOGIN, handler);
  await p2.goto(BASE, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  if (p2.url().includes('/pages/login')) {
    const inputs = p2.locator('input');
    await inputs.nth(0).fill(USER);
    await inputs.nth(1).fill(PASS);
    await p2.getByText('登录', { exact: true }).last().click();
  }
  await waitUntil(() => hits.length >= 1, 15000);
  await sleep(3000);
  await p2.unroute(LOGIN, handler);
  check(
    'POST /auth/login 断网后只发 1 次（写接口不重试）',
    hits.length === 1,
    `实际 ${hits.length} 次`,
  );
  await ctx2.close();
}

// ─────────────────────────────────────────────────────────────
// 代码结构判据："重试提前 return" 是「提示只弹一次」的前提。
//
// 为什么不用 DOM 数 toast：uni-h5 的 toast 是**单例复用**的
// （`state2.toastThin` 是共享状态，后一次调用只改文案/重置定时器），
// 所以"弹了 3 次"与"弹了 1 次"在 DOM 上长得一样，数不出来。
// 退而求其次，用**可复现的结构判据**：提示逻辑必须排在重试之后。
// ─────────────────────────────────────────────────────────────
{
  console.log('\n[代码结构]');
  const src = fs.readFileSync(new URL('../frontend/src/utils/request.ts', import.meta.url), 'utf8');
  const iRetry = src.indexOf('return http.request(config)');
  const iToast = src.indexOf('uni.showToast({ title: message');
  check(
    '重试以 return 提前退出 ⇒ 提示逻辑只可能在"最终失败"时执行一次',
    iRetry > 0 && iToast > iRetry,
    `重试@${iRetry} / 提示@${iToast}`,
  );
  check(
    '重试计数走 config.custom（mergeConfig 白名单外的唯一通道）',
    src.includes('config.custom'),
  );
}

// ─────────────────────────────────────────────────────────────
// 日志侧证
// ─────────────────────────────────────────────────────────────
console.log('\n[观测日志]');
const retryLogs = httpLogs.filter((l) => l.includes('传输层失败'));
console.log(`  ⓘ 重试日志 ${retryLogs.length} 条，示例：`);
retryLogs.slice(0, 4).forEach((l) => console.log(`     ${l.slice(0, 130)}`));
check(
  '确实打印过重试日志（说明判据认出了 errMsg 的真实形状）',
  retryLogs.length > 0,
  `${retryLogs.length} 条`,
);

/*
 * 失败形状：把实测到的 errMsg / statusCode **去重**列出来。
 * 这是整份验证里最硬的一条证据 —— 它直接证明"超时"与"断网"在运行时
 * 确实产生了**不同的 errMsg**，也就是"超时不重试"这条判据有真实依据，
 * 而不是照着源码猜的。
 */
const shapes = new Map();
for (const l of httpLogs) {
  const i = l.indexOf('{');
  if (i < 0 || !l.includes('请求失败')) continue;
  shapes.set(l.slice(i), l.slice(i));
}
console.log(`  ⓘ 实测失败形状（去重 ${shapes.size} 种）：`);
for (const s of shapes.values()) console.log(`     ${s.slice(0, 150)}`);
const shapeText = [...shapes.keys()].join(' ');
check(
  '实测到 statusCode 为 undefined + errMsg 为 request:fail（判据的前提成立）',
  shapeText.includes('request:fail'),
  '',
);
check(
  '实测到超时的 errMsg 与断网**不同**（"超时不重试"有真实依据）',
  /request:fail timeout/.test(shapeText),
  shapeText.includes('request:fail timeout') ? 'request:fail timeout' : '未观察到 timeout 形状',
);

check(
  '页面运行期无未捕获异常',
  pageErrors.length === 0,
  pageErrors.slice(0, 2).join(' | ') || '无',
);

await browser.close();

console.log('\n' + '─'.repeat(52));
console.log(`合计 通过 ${pass} 失败 ${fail}`);
process.exit(fail ? 1 : 0);
