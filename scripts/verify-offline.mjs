/**
 * 离线记账端到端验证（真实浏览器 + Node 侧查库）。
 *
 *   node scripts/verify-offline.mjs
 *
 * 覆盖：
 *   ① 在线进一次「记一笔」→ 分类缓存落盘
 *   ② 断网 → 记一笔 → 队列里有 1 条、**库里没有**
 *   ③ 恢复网络 → 补传 → 库里出现 1 条、队列清空
 *   ④ 幂等：同一 clientId 再提交 → 库里仍只有 1 条
 *
 * ⚠️ 只在**临时非默认账本**里跑，收尾删账本（流水随 CASCADE 消失）。
 * ⚠️ 用 context.setOffline 模拟断网（翻转 navigator.onLine）。
 * ⚠️ **断网只影响浏览器，Node 的 fetch 仍能查库** —— 故 DB 断言走 Node 侧，
 *    避免"浏览器离线导致断言本身失败"。
 */
import fs from 'node:fs';

const PW =
  process.env.PW_PATH ||
  '/Users/luchao/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js';
const pw = await import(PW);
const { chromium } = pw.default ?? pw;

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  try {
    for (const d of fs.readdirSync(root).filter((x) => x.indexOf('chromium-') === 0).sort().reverse()) {
      for (const arch of ['chrome-mac-arm64', 'chrome-mac-x64']) {
        const p =
          root + '/' + d + '/' + arch + '/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
        if (fs.existsSync(p)) return p;
      }
    }
  } catch {
    /* 让 Playwright 自己找 */
  }
  return undefined;
}

const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const API = process.env.API || 'http://127.0.0.1:7001';
const USER = process.env.SEED_USER || 'demo';
const PASS = process.env.SEED_PASS || '123456';

let pass = 0;
let fail = 0;
const check = (n, ok, extra) => {
  if (ok) {
    pass++;
    console.log('  OK ' + n + ' ' + (extra || ''));
  } else {
    fail++;
    console.log('  FAIL ' + n + ' ' + (extra || ''));
  }
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-proxy-server'] });
const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
const page = await context.newPage();
page.setDefaultTimeout(12000);
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 140)));

let token = '';

/** Node 侧调后端（不受浏览器离线影响） */
const nodeApi = async (path, options) => {
  const res = await fetch(API + path, {
    ...(options || {}),
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
      ...(options && options.headers ? options.headers : {}),
    },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

/** 读离线队列（前端 utils/offline 的 storage key） */
const readQueue = () =>
  page.evaluate(() => {
    // ⚠️ uni-app 的 setStorageSync 会包一层 {type,data}，必须用 uni.getStorageSync 解
    var v = typeof uni !== 'undefined' ? uni.getStorageSync('offlineTxnQueue') : null;
    if (Array.isArray(v)) return v;
    if (v && Array.isArray(v.data)) return v.data;
    return [];
  });

const pressKey = (label) =>
  page.evaluate((t) => {
    var keys = Array.from(document.querySelectorAll('.keyboard .key'));
    var el = keys.find((k) => k.textContent.trim() === t);
    if (el) {
      el.click();
      return true;
    }
    return false;
  }, label);

/* ============================================================
 * 登录 + 准备临时账本
 * ============================================================ */
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
if (page.url().indexOf('/pages/login') >= 0) {
  const inputs = page.locator('input');
  await inputs.nth(0).fill(USER);
  await inputs.nth(1).fill(PASS);
  await page.evaluate(function () {
    var b = document.querySelector('.submit,uni-button,button');
    if (b) b.click();
  });
  await page.waitForTimeout(2500);
}
token = await page.evaluate(() => localStorage.getItem('token') || '');
check('已取得 token', !!token);

console.log('[1] 建临时账本');
const accName = '__offline_acc_' + Date.now();
const mk = await nodeApi('/api/accounts', { method: 'POST', body: JSON.stringify({ name: accName }) });
check('临时账本已创建', mk.status === 200 || mk.status === 201, 'HTTP ' + mk.status);
const accId = mk.body && mk.body.data && mk.body.data.id;
check('拿到账本 id', !!accId, String(accId));

await page.evaluate((id) => localStorage.setItem('currentAccountId', id), accId);
// ⚠️ 必须 reload：hash 路由下 goto 到同 document 不重挂，store 仍指向旧账本
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1500);

const cats = await nodeApi('/api/categories?type=expense&accountId=' + accId + '&visibility=visible');
const firstCat = cats.body && cats.body.data && cats.body.data.find((c) => !c.parentId);
check('临时账本有可记账的支出分类', !!firstCat, firstCat ? firstCat.name : '(无)');

/* ============================================================
 * ① 在线进一次记一笔 → 分类缓存落盘
 * ============================================================ */
console.log('[2] 在线进「记一笔」一次（写分类缓存）');
await page.goto(BASE + '/#/pages/record/index', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
const cacheKeys = await page.evaluate(() =>
  Object.keys(localStorage).filter((k) => k.indexOf('categoryCache:') === 0)
);
check('分类缓存已落盘', cacheKeys.length > 0, cacheKeys.join(','));

/* ============================================================
 * ② 断网（页面已加载好）→ 记一笔 → 入队
 * ============================================================ */
console.log('[3] 断网后记一笔');
await context.setOffline(true);
await page.waitForTimeout(500);
check('浏览器已切到离线', (await page.evaluate(() => navigator.onLine)) === false);

await pressKey('5');
await page.waitForTimeout(300);

// 打开分类选择器选一个
await page.evaluate(() => {
  var row = Array.from(document.querySelectorAll('.row')).find((r) => r.textContent.indexOf('分类') >= 0);
  if (row) row.click();
});
await page.waitForTimeout(1000);
const picked = await page.evaluate((catName) => {
  var items = Array.from(document.querySelectorAll('.grid-item'));
  var el = items.find((i) => i.textContent.trim().indexOf(catName) >= 0) || items[0];
  if (el) {
    el.click();
    return el.textContent.trim();
  }
  return '';
}, firstCat ? firstCat.name : '');
check('已选到一个分类', !!picked, picked);

// 点完成 → save() 入队（导航前读队列，避免离线导航失败）
await pressKey('完成');
await page.waitForTimeout(600);

const q1 = await readQueue();
check('★ 离线后队列里有 1 条', q1.length === 1, 'len=' + q1.length);
if (q1.length) {
  check('队列项带 clientId', !!q1[0].clientId, String(q1[0].clientId));
  check('队列项金额为 5.00', q1[0].payload.amount === '5.00', q1[0].payload.amount);
}

// 库里应仍为空（Node 侧查，不受浏览器离线影响）
const beforeFlush = await nodeApi('/api/transactions?accountId=' + accId + '&page=1&size=5');
check(
  '★ 离线期间库里没有该笔',
  beforeFlush.body && beforeFlush.body.data.total === 0,
  'total=' + (beforeFlush.body && beforeFlush.body.data.total)
);

/* ============================================================
 * ③ 恢复网络 → 补传
 * ============================================================ */
console.log('[4] 恢复网络并补传');
await context.setOffline(false);
await page.waitForTimeout(500);
check('浏览器已恢复在线', (await page.evaluate(() => navigator.onLine)) === true);

// 手动调前端补传（确定性；app 的 onNetworkStatusChange 也会触发，二者幂等）
const flushed = await page.evaluate(async () => {
  try {
    const mod = await import('/src/utils/offline.ts');
    return await mod.flushQueue();
  } catch (e) {
    return { error: String(e) };
  }
});
check('补传已执行', !flushed.error, JSON.stringify(flushed));
await page.waitForTimeout(1200);

const q2 = await readQueue();
check('★ 补传后队列清空', q2.length === 0, 'len=' + q2.length);

const afterFlush = await nodeApi('/api/transactions?accountId=' + accId + '&page=1&size=5');
check('★ 库里出现 1 条', afterFlush.body.data.total === 1, 'total=' + afterFlush.body.data.total);

/* ============================================================
 * ④ 幂等
 * ============================================================ */
console.log('[5] 幂等验证（重复提交同一 clientId）');
if (q1.length) {
  const dup = await nodeApi('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({ ...q1[0].payload, clientId: q1[0].clientId }),
  });
  check('重复提交返回成功', dup.status === 200, 'HTTP ' + dup.status);
  const afterDup = await nodeApi('/api/transactions?accountId=' + accId + '&page=1&size=5');
  check('★ 幂等：库里仍只有 1 条', afterDup.body.data.total === 1, 'total=' + afterDup.body.data.total);
}

/* ============================================================
 * 清理
 * ============================================================ */
console.log('[6] 清理临时账本');
const del = await nodeApi('/api/accounts/' + accId + '?confirmName=' + encodeURIComponent(accName), {
  method: 'DELETE',
});
check('临时账本已删除', del.status === 200, 'HTTP ' + del.status);

console.log('\n结果：PASS=' + pass + ' FAIL=' + fail);
await browser.close();
process.exit(fail ? 1 : 0);
