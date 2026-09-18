/**
 * 「流水导入」页快速切换账本 · 运行时验证（真实浏览器 + 真实 xlsx）。
 *
 *   node scripts/verify-import-account.mjs
 *
 * 背景（2026-09-17 luchao 要求）：流水导入页要能快速切换账本，
 * 不必先退出去到「账本管理」或首页切完再回来。
 *
 * 覆盖：
 *   ① 选择态「导入到」显示当前账本名，且该行**可点**（有箭头）
 *   ② 点它 → 弹 action sheet → 选中另一个账本 → 文案立即更新
 *   ③ ★ **预览态换账本会重新预览**，而不是留着一份按旧账本算出来的报告
 *   ④ ★ 报告确实是**按账本**算的：同一份文件、两个账本 → 分类降级数不同
 *      （A 账本有全套分类 → 1 条降级；B 账本一个分类都没有 → 4 条全降级）
 *   ⑤ 换账本后「确认导入」写进的是**新账本**
 *
 * ⚠️ **只操作自建数据**：脚本建两个临时账本、在其中导入，最后都删掉
 *    （流水随外键 CASCADE 一起消失）。项目踩过「拿用户真实数据做实验」的坑。
 *
 * ⚠️ uni-app H5 把 <view> 渲染成 <uni-view>，Playwright 直接 click 常被 hit-test 拦，
 *    点击一律走 evaluate（项目已验证过的做法）。
 * ⚠️ `page.goto('...#/pages/xxx')` **只改 hash，不重新加载文档** ——
 *    pinia store 不会重读 localStorage，改了 currentAccountId 后必须显式 `page.reload()`。
 */
import fs from 'node:fs';
import path from 'node:path';
const PW = '/Users/luchao/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js';
const pw = await import(PW);
const { chromium } = pw.default ?? pw;
function findChrome() {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  for (const d of fs.readdirSync(root).filter((x) => x.indexOf('chromium-') === 0).sort().reverse()) {
    for (const arch of ['chrome-mac-arm64', 'chrome-mac-x64']) {
      const p =
        root +
        '/' +
        d +
        '/' +
        arch +
        '/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
      if (fs.existsSync(p)) return p;
    }
  }
}
let pass = 0,
  fail = 0;
const check = (n, ok, extra) => {
  if (ok) {
    pass++;
    console.log('  OK ' + n + ' ' + (extra || ''));
  } else {
    fail++;
    console.log('  FAIL ' + n + ' ' + (extra || ''));
  }
};

const FIXTURE = path.resolve('scripts/fixtures/ledger-sample.xlsx');
if (!fs.existsSync(FIXTURE)) {
  console.error('缺少测试用 xlsx：' + FIXTURE + '\n请先跑 `node scripts/gen-import-fixture.mjs`');
  process.exit(1);
}

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-proxy-server'] });
const page = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
page.setDefaultTimeout(10000);
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 160)));

/** 记录提交请求打到哪个账本（验证「写进的是新账本」） */
const commits = [];
page.on('request', (r) => {
  if (r.url().indexOf('/api/transactions/import/commit') < 0) return;
  let body = {};
  try {
    body = JSON.parse(r.postData() || '{}');
  } catch {
    /* 忽略 */
  }
  commits.push(body.accountId);
});

async function clickByText(sel, text, nth) {
  return await page.evaluate(
    function (a) {
      var list = Array.from(document.querySelectorAll(a.sel)).filter(function (e) {
        return e.textContent.indexOf(a.text) >= 0;
      });
      var el = list[a.nth || 0];
      if (!el) return false;
      el.click();
      return true;
    },
    { sel, text, nth: nth || 0 }
  );
}

await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
if (page.url().indexOf('/pages/login') >= 0) {
  const inputs = page.locator('input');
  await inputs.nth(0).fill('demo');
  await inputs.nth(1).fill('123456');
  await page.evaluate(function () {
    var b = document.querySelector('.submit,uni-button,button');
    if (b) b.click();
  });
  await page.waitForTimeout(2500);
}

const api = async (pathName, options) =>
  await page.evaluate(
    async function (a) {
      const res = await fetch(a.pathName, {
        ...a.options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + localStorage.getItem('token'),
          ...(a.options && a.options.headers ? a.options.headers : {}),
        },
      });
      return { status: res.status, body: await res.json() };
    },
    { pathName, options: options || {} }
  );

/* ============================================================
 * 准备：两个临时账本
 *   A = 从母本复制**全部**分类（导入时只有 1 条分类降级）
 *   B = **一个分类都不要**（导入时 4 条全部降级）
 * 两者对同一份文件的报告必然不同 —— 这正是「报告按账本算」的判据。
 * ============================================================ */
const stamp = Date.now();
const nameA = '导入切账本A' + stamp;
const nameB = '导入切账本B' + stamp;
const a = await api('/api/accounts', { method: 'POST', body: JSON.stringify({ name: nameA }) });
const b = await api('/api/accounts', {
  method: 'POST',
  body: JSON.stringify({ name: nameB, copyAll: false, categoryIds: [] }),
});
check('[准备] 两个临时账本已创建', a.status === 200 && b.status === 200);
const idA = a.body?.data?.id;
const idB = b.body?.data?.id;
if (!idA || !idB) {
  console.log('临时账本创建失败，终止');
  await browser.close();
  process.exit(1);
}
const catsB = await api('/api/categories?accountId=' + idB);
check('[准备] B 账本确实一个分类都没有', (catsB.body?.data || []).length === 0, 'n=' + (catsB.body?.data || []).length);

/** 指到某账本并**整页 reload**（hash 导航不会重建 pinia store） */
async function enterAs(accountId) {
  await page.evaluate(function (id) {
    localStorage.setItem('currentAccountId', id);
  }, accountId);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
}

/* ============================================================
 * ① 选择态：账本行可点
 * ============================================================ */
console.log('[1] 选择态「导入到」显示当前账本，且可点');
await enterAs(idA);
await page.goto('http://127.0.0.1:5173/#/pages/import/index', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

/** 读「导入到」那一行的值 + 是否有箭头 */
async function pickerRow() {
  return await page.evaluate(function () {
    var rows = Array.from(document.querySelectorAll('.card-row'));
    for (var i = 0; i < rows.length; i++) {
      var label = rows[i].querySelector('.card-label');
      if (label && label.textContent.trim() === '导入到') {
        var v = rows[i].querySelector('.card-value');
        return {
          value: v ? v.textContent.trim() : '',
          clickable: rows[i].className.indexOf('card-row-tap') >= 0,
          arrow: !!rows[i].querySelector('.card-arrow'),
        };
      }
    }
    return null;
  });
}
let row = await pickerRow();
check('「导入到」显示 A 账本名', !!row && row.value === nameA, JSON.stringify(row));
check('该行标记为可点（card-row-tap）', !!row && row.clickable);
check('该行有右向箭头（可点暗示）', !!row && row.arrow);

/* ============================================================
 * ② 点它 → action sheet → 换成 B
 * ============================================================ */
console.log('[2] 点账本行 → action sheet → 选中 B');
await clickByText('.card-row', '导入到');
await page.waitForTimeout(900);
const sheetItems = await page.evaluate(function () {
  return Array.from(document.querySelectorAll('.uni-actionsheet__cell')).map(function (e) {
    return e.textContent.trim();
  });
});
check('弹出了 action sheet', sheetItems.length > 0, JSON.stringify(sheetItems.slice(0, 5)));
check('列表里含 A 与 B 两个临时账本', sheetItems.join().indexOf(nameA) >= 0 && sheetItems.join().indexOf(nameB) >= 0);

const picked = await clickByText('.uni-actionsheet__cell', nameB);
check('点中了 B', picked);
await page.waitForTimeout(1500);
row = await pickerRow();
check('★ 文案立即更新为 B 账本名', !!row && row.value === nameB, JSON.stringify(row));

/* ============================================================
 * ③ 选文件 → 预览（B 账本：无分类 → 4 条全降级）
 * ============================================================ */
console.log('[3] 在 B 账本预览：4 条全部分类降级');
async function readSummary() {
  return await page.evaluate(function () {
    var out = {};
    Array.from(document.querySelectorAll('.summary-cell')).forEach(function (c) {
      var cap = c.querySelector('.summary-cap');
      var num = c.querySelector('.summary-num');
      if (cap && num) out[cap.textContent.trim()] = num.textContent.trim();
    });
    return out;
  });
}
async function selectFixture() {
  const p = page.waitForEvent('filechooser');
  await page.evaluate(function () {
    var list = Array.from(document.querySelectorAll('.btn-text')).filter(function (e) {
      return e.textContent.indexOf('选择文件') >= 0;
    });
    var btn = list[0] && list[0].closest('.btn');
    if (btn) btn.click();
  });
  const ch = await p;
  await ch.setFiles(FIXTURE);
  await page.waitForTimeout(3500);
}
await selectFixture();
let sum = await readSummary();
check('预览态出现', Object.keys(sum).length > 0, JSON.stringify(sum));
check('B 账本（无分类）→ 分类降级 = 4', sum['分类降级'] === '4', sum['分类降级']);

/* ============================================================
 * ④ ★ 预览态换账本 → 重新预览（A 账本只有 1 条降级）
 * ============================================================ */
console.log('[4] ★ 预览态换回 A 账本 → 报告重新算');
const acctText = await page.evaluate(function () {
  var e = document.querySelector('.summary-account');
  return e ? e.textContent.trim() : '';
});
check('汇总卡上显示的是 B 账本名', acctText === nameB, acctText);

await clickByText('.summary-account-tap', nameB);
await page.waitForTimeout(900);
const sheet2 = await page.evaluate(function () {
  return Array.from(document.querySelectorAll('.uni-actionsheet__cell')).map(function (e) {
    return e.textContent.trim();
  });
});
check('预览态也能弹出 action sheet', sheet2.length > 0);
const pickedA = await clickByText('.uni-actionsheet__cell', nameA);
check('点中了 A', pickedA);
await page.waitForTimeout(4000);

const acctText2 = await page.evaluate(function () {
  var e = document.querySelector('.summary-account');
  return e ? e.textContent.trim() : '';
});
check('★ 汇总卡账本名已变成 A', acctText2 === nameA, acctText2);
sum = await readSummary();
check(
  '★ 报告已按 A 重算（分类降级 4 → 1，同一份文件）',
  sum['分类降级'] === '1',
  JSON.stringify(sum)
);
check('总行数不变（仍是同一份文件）', sum['总行数'] === '4', sum['总行数']);

/* ============================================================
 * ⑤ 确认导入写进新账本（A）
 * ============================================================ */
console.log('[5] 确认导入 → 写进 A 账本');
await page.evaluate(function () {
  var list = Array.from(document.querySelectorAll('.btn-text')).filter(function (e) {
    return e.textContent.indexOf('确认导入') >= 0;
  });
  var btn = list[0] && list[0].closest('.btn');
  if (btn) btn.click();
});
await page.waitForTimeout(4000);

check('提交请求打到的是 A 账本', commits.length > 0 && commits[commits.length - 1] === idA, JSON.stringify(commits));
const inA = await api('/api/transactions?accountId=' + idA + '&page=1&size=1');
check('A 账本里写入了 4 条', inA.body?.data?.total === 4, 'total=' + inA.body?.data?.total);
const inB = await api('/api/transactions?accountId=' + idB + '&page=1&size=1');
check('B 账本没有被写入', inB.body?.data?.total === 0, 'total=' + inB.body?.data?.total);

/* ============================================================
 * 清理
 * ============================================================ */
console.log('[6] 清理两个临时账本');
const delA = await api('/api/accounts/' + idA + '?confirmName=' + encodeURIComponent(nameA), {
  method: 'DELETE',
});
const delB = await api('/api/accounts/' + idB + '?confirmName=' + encodeURIComponent(nameB), {
  method: 'DELETE',
});
check('两个临时账本都已删除', delA.status === 200 && delB.status === 200, delA.status + '/' + delB.status);

console.log('\n结果：PASS=' + pass + ' FAIL=' + fail);
await browser.close();
process.exit(fail ? 1 : 0);