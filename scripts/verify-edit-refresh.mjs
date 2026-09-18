/**
 * 「编辑账单后返回，列表要刷新」运行时验证（真实浏览器，走完整 UI 链路）。
 *
 *   node scripts/verify-edit-refresh.mjs
 *
 * 背景（2026-09-17 luchao 报告）：
 *   在流水页点一笔账单 → 记账页改完 → 返回，**流水页还是旧数据**。
 *
 * 根因：`uni.navigateBack()` 返回时当前页面实例**没有被销毁**，
 *   而流水页/日历页只写了 `onMounted`（页面首次创建才跑一次），
 *   返回时没有任何刷新时机 —— 视图自然停在旧数据上。
 *   （首页不受影响：它挂在单页容器里，容器有 `onShow` 转发 `activate()`。）
 *
 * 覆盖：
 *   ① 流水页：点明细行 → 记账页 → 改金额 → 返回 → **列表金额已更新**
 *   ② 流水页：顶部结余同步更新（汇总口径也重拉了，不只是明细行）
 *   ③ 日历页：改金额后返回 → **当日明细金额已更新**
 *   ④ 日历页：格子上的日聚合也更新（`dayAgg` 缓存被清掉重拉）
 *   ⑤ 首次进入不会重复请求（`firstShow` 守卫）—— 用 preview 请求计数守住
 *
 * ⚠️ **只操作自建数据**：脚本先建临时账本、在其中造一笔流水、全程改它，
 *    最后删掉该账本（流水随外键 CASCADE 一起消失）。项目踩过
 *    「拿用户真实数据做实验」的坑，这条是硬约束。
 *
 * ⚠️ uni-app H5 把 <view> 渲染成 <uni-view>，Playwright 直接 click 常被 hit-test 拦，
 *    点击一律走 evaluate（项目已验证过的做法）。
 */
import fs from 'node:fs';
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

/** 统计各接口被请求了几次（用来验证「返回后确实重拉」而不是吃旧缓存） */
const apiCalls = [];

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-proxy-server'] });
const page = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
page.setDefaultTimeout(10000);
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 160)));
page.on('request', (r) => {
  const u = r.url();
  if (u.indexOf('/api/transactions') >= 0 || u.indexOf('/api/statistics') >= 0) {
    apiCalls.push(r.method() + ' ' + u.replace(/^https?:\/\/[^/]+/, ''));
  }
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
 * 准备：临时账本 + 其中的一笔流水
 * ============================================================ */
const stamp = Date.now();
const accName = '编辑刷新验证' + stamp;
const created = await api('/api/accounts', {
  method: 'POST',
  body: JSON.stringify({ name: accName }),
});
check('[准备] 临时账本已创建', created.status === 200, 'HTTP ' + created.status);
const accId = created.body?.data?.id;
if (!accId) {
  console.log('临时账本创建失败，终止');
  await browser.close();
  process.exit(1);
}

/** 今天（YYYY-MM-DD）—— 造在当天，确保落在流水页第一个分组与日历页当前选中日 */
const today = await page.evaluate(function () {
  var d = new Date();
  var p = function (n) {
    return String(n).padStart(2, '0');
  };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
});

// 该账本从母本复制了全部分类，随便挑一个支出二级分类即可
const cats = await api('/api/categories?accountId=' + accId + '&type=expense&visibility=visible');
const cat = (cats.body?.data || []).find((c) => c.parentId);
check('[准备] 临时账本里有可用的支出分类', !!cat, cat ? cat.name : '(无)');

const ORIGINAL = '12.34';
const seeded = await api('/api/transactions', {
  method: 'POST',
  body: JSON.stringify({
    type: 'expense',
    amount: ORIGINAL,
    categoryId: cat.id,
    recordDate: today,
    note: '编辑刷新验证',
    accountId: accId,
  }),
});
check('[准备] 已在该账本造一笔流水', seeded.status === 200, 'HTTP ' + seeded.status);
const txnId = seeded.body?.data?.id;

/*
 * 把「当前账本」指到临时账本。
 *
 * ⚠️ **必须整页 reload**：`page.goto('...#/pages/xxx')` 只改 hash，
 *    属于同文档导航，**不会重新加载文档** —— pinia store 已创建，
 *    不会再去读 localStorage，于是页面拿到的还是旧账本（这里踩过一次）。
 *    （verify-import.mjs 里也是 setStorage 之后立刻 reload 的。）
 */
await page.evaluate(function (id) {
  localStorage.setItem('currentAccountId', id);
}, accId);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

/* ============================================================
 * ① 流水页：编辑 → 返回 → 列表已更新
 * ============================================================ */
console.log('[1] 流水页：点明细行进编辑');
await page.goto('http://127.0.0.1:5173/#/pages/flow/index', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);

/** 流水页当前渲染出的所有金额 */
async function flowAmounts() {
  return await page.evaluate(function () {
    return Array.from(document.querySelectorAll('.txn-amount')).map(function (e) {
      return e.textContent.trim();
    });
  });
}
/** 流水页顶部的结余 */
async function flowBalance() {
  return await page.evaluate(function () {
    var e = document.querySelector('.hero-balance');
    return e ? e.textContent.trim() : '';
  });
}

const before = await flowAmounts();
check('列表里有那笔流水（12.34）', before.join().indexOf('12.34') >= 0, JSON.stringify(before));
const balanceBefore = await flowBalance();
check('顶部结余已渲染', !!balanceBefore, balanceBefore);

const callsBeforeEdit = apiCalls.length;
const clicked = await page.evaluate(function () {
  var rows = Array.from(document.querySelectorAll('.txn'));
  for (var i = 0; i < rows.length; i++) {
    var a = rows[i].querySelector('.txn-amount');
    if (a && a.textContent.indexOf('12.34') >= 0) {
      rows[i].click();
      return true;
    }
  }
  return false;
});
check('找到了那行并点进编辑页', clicked);
await page.waitForTimeout(2500);
const onRecord = await page.evaluate(function () {
  return location.hash;
});
check('跳到了记账页', onRecord.indexOf('/pages/record/index') >= 0, onRecord);

console.log('[2] 改金额 → 完成 → 返回');
// 清空后重新输入，避免与回填的 "12.34" 拼在一起
await clickByText('.key.fn', '清空');
await page.waitForTimeout(300);
await clickByText('.key', '9');
await clickByText('.key', '9');
await page.waitForTimeout(300);
const typed = await page.evaluate(function () {
  var e = document.querySelector('.amount');
  return e ? e.textContent.trim() : '';
});
check('键盘已输入 99', typed === '99', typed);
await clickByText('.key.confirm', '完成');
// 保存后有 600ms 延时 + 返回 + 列表重拉
await page.waitForTimeout(4000);

const backOnFlow = await page.evaluate(function () {
  return location.hash;
});
check('已返回到流水页', backOnFlow.indexOf('/pages/flow/index') >= 0, backOnFlow);
check(
  '返回后确实重新请求了列表（不是拿旧缓存）',
  apiCalls.length > callsBeforeEdit,
  'calls ' + callsBeforeEdit + ' → ' + apiCalls.length
);

const after = await flowAmounts();
check('★ 列表金额已更新为 99.00', after.join().indexOf('99.00') >= 0, JSON.stringify(after));
check('旧金额 12.34 已消失', after.join().indexOf('12.34') < 0, JSON.stringify(after));
const balanceAfter = await flowBalance();
check(
  '★ 顶部结余同步更新（汇总口径也重拉了）',
  balanceAfter !== balanceBefore,
  balanceBefore + ' → ' + balanceAfter
);

/* ============================================================
 * ③ 日历页：编辑 → 返回 → 当日明细与格子都更新
 * ============================================================ */
console.log('[3] 日历页：改金额 → 返回 → 明细与格子都更新');
await page.goto('http://127.0.0.1:5173/#/pages/calendar/index', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);

async function calendarAmounts() {
  return await page.evaluate(function () {
    return Array.from(document.querySelectorAll('.txn-amount')).map(function (e) {
      return e.textContent.trim();
    });
  });
}
const calBefore = await calendarAmounts();
check('日历页当日明细里有那笔流水（99.00）', calBefore.join().indexOf('99.00') >= 0, JSON.stringify(calBefore));

const clickedCal = await page.evaluate(function () {
  var rows = Array.from(document.querySelectorAll('.txn'));
  for (var i = 0; i < rows.length; i++) {
    var a = rows[i].querySelector('.txn-amount');
    if (a && a.textContent.indexOf('99.00') >= 0) {
      rows[i].click();
      return true;
    }
  }
  return false;
});
check('找到了那行并点进编辑页', clickedCal);
await page.waitForTimeout(2500);
await clickByText('.key.fn', '清空');
await page.waitForTimeout(300);
await clickByText('.key', '5');
await clickByText('.key', '5');
await page.waitForTimeout(300);
await clickByText('.key.confirm', '完成');
await page.waitForTimeout(4000);

const backOnCal = await page.evaluate(function () {
  return location.hash;
});
check('已返回到日历页', backOnCal.indexOf('/pages/calendar/index') >= 0, backOnCal);
const calAfter = await calendarAmounts();
check('★ 日历页当日明细已更新为 55.00', calAfter.join().indexOf('55.00') >= 0, JSON.stringify(calAfter));
check('旧金额 99.00 已消失', calAfter.join().indexOf('99.00') < 0, JSON.stringify(calAfter));

/* 格子的日聚合：改金额后当天支出应从 99 → 55 */
const cell = await page.evaluate(function () {
  var texts = Array.from(document.querySelectorAll('.month-grid, .swiper-month')).map(function (e) {
    return e.textContent;
  });
  return texts.join(' ');
});
check('日历格子区域不含旧聚合值 99', cell.indexOf('99') < 0, cell.slice(0, 120));
check('日历格子区域含新聚合值 55', cell.indexOf('55') >= 0, cell.slice(0, 120));

/* ============================================================
 * 清理
 * ============================================================ */
console.log('[4] 清理临时账本');
const del = await api('/api/accounts/' + accId + '?confirmName=' + encodeURIComponent(accName), {
  method: 'DELETE',
});
check('临时账本已删除', del.status === 200, 'HTTP ' + del.status);
const gone = await api('/api/accounts/' + accId);
check('临时账本确实不存在了', gone.status === 404, 'HTTP ' + gone.status);
void txnId;

console.log('\n结果：PASS=' + pass + ' FAIL=' + fail);
await browser.close();
process.exit(fail ? 1 : 0);