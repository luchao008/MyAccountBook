/**
 * 「流水导入」页运行时验证（真实浏览器 + 真实 xlsx）。
 *
 *   node scripts/verify-import.mjs
 *
 * 覆盖：
 *   ① 「我的」页有「流水导入」入口，且能跳到导入页
 *   ② 选择态：说明卡列出「导入到 / 分类匹配 / 重复流水」三项，且**不做假控件**
 *      （不出现「成员 / 商家 / 项目」）
 *   ③ **真的选一个 xlsx 文件** → 预览态出现，汇总计数与 fixture 一致（4 行）
 *   ④ 预览**不写库**（库里条数不变）
 *   ⑤ **列表只列需要关注的记录**（正常流水被省略 + 有「已省略 N 条」提示），
 *      且分组 Tab 不再有「可导入」这一组
 *   ⑥ 切「跳过疑似重复」会**重新请求预览**（方案 B 起不再本地重算）
 *   ⑦ 点「确认导入」→ 结果态，且库里**真的多了 N 条**
 *   ⑧ ★ **提交传的是文件、不是行**（方案 B 的核心契约）—— 这条是防回退的关键：
 *      早先提交回传 `rows`，而预览为控制响应体只回传前 2000 行，
 *      于是**超过 2000 行的账单只能导入 2000 条**，汇总卡却显示全部。
 *
 * ⚠️ **绝不碰真实数据**：
 *   导入是写操作，所以本脚本**先新建一个临时账本**，把 currentAccountId 指过去，
 *   全程在它里面导入，最后删掉该账本（流水随外键 CASCADE 一起消失）。
 *   项目历史上踩过「拿用户真实数据做实验」的坑（点掉过真实流水），这里刻意规避。
 *
 * ⚠️ uni-app H5 把 <view> 渲染成 <uni-view>，Playwright 直接 click 常被 hit-test 拦，
 *    点击一律走 evaluate（项目已验证过的做法）。
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
      const p = root + '/' + d + '/' + arch + '/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
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
page.setDefaultTimeout(8000);
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 160)));

/**
 * 记录发往导入接口的请求体。
 *
 * ⚠️ 只留 **key 名**，不留值 —— 提交体里有 55KB 的 base64，
 * 打进日志既没用又淹没输出。
 */
const importCalls = [];
page.on('request', (r) => {
  const u = r.url();
  if (!u.includes('/api/transactions/import/')) return;
  let keys;
  try {
    keys = Object.keys(JSON.parse(r.postData() || '{}'));
  } catch {
    keys = ['(无法解析)'];
  }
  importCalls.push({ url: u.replace(/^https?:\/\/[^/]+/, ''), keys });
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
async function clickNth(sel, n) {
  return await page.evaluate(
    function (a) {
      var el = document.querySelectorAll(a.sel)[a.n];
      if (!el) return false;
      el.click();
      return true;
    },
    { sel, n: n || 0 }
  );
}

/* ============================================================
 * 准备：登录 + 建临时账本 + 把 currentAccountId 指过去
 * ============================================================ */

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

const api = async (pathName, options) => {
  return await page.evaluate(
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
};

const stamp = Date.now();
const created = await api('/api/accounts', {
  method: 'POST',
  body: JSON.stringify({ name: '导入验证临时账本' + stamp }),
});
check('[准备] 临时账本创建成功', created.status === 200, 'HTTP ' + created.status);
const tmpAccountId = created.body?.data?.id;
if (!tmpAccountId) {
  console.log('无法创建临时账本，终止');
  await browser.close();
  process.exit(1);
}

/** 该账本当前条数 */
async function countIn(accountId) {
  const r = await api('/api/transactions?accountId=' + accountId + '&page=1&size=1');
  return r.body?.data?.total ?? -1;
}

const before = await countIn(tmpAccountId);
check('[准备] 临时账本初始为空', before === 0, 'total=' + before);

/* ============================================================
 * ① 入口
 * ============================================================ */
console.log('[1] 「我的」页有「流水导入」入口');
await page.goto('http://127.0.0.1:5173/#/pages/account-select/index', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await clickByText('.tab-text', '我的');
await page.waitForTimeout(1200);
var mine = await page.evaluate(function () {
  return document.body.innerText;
});
check('有「流水导入」入口', mine.indexOf('流水导入') >= 0);
check('「数据导出」入口仍在（回归）', mine.indexOf('数据导出') >= 0);

await page.evaluate(function () {
  var list = Array.from(document.querySelectorAll('.menu-item')).filter(function (e) {
    return e.textContent.indexOf('流水导入') >= 0;
  });
  if (list[0]) list[0].click();
});
await page.waitForTimeout(2200);
var hash = await page.evaluate(function () {
  return location.hash;
});
check('跳到了导入页', hash.indexOf('/pages/import/index') >= 0, hash);

/* ============================================================
 * ② 选择态
 * ============================================================ */
console.log('[2] 选择态：说明卡 + 不做假控件');
await page.evaluate(function (id) {
  localStorage.setItem('currentAccountId', id);
}, tmpAccountId);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2200);

var selectBody = await page.evaluate(function () {
  return document.body.innerText;
});
check('说明卡有「导入到」', selectBody.indexOf('导入到') >= 0);
check('说明卡有「分类匹配」', selectBody.indexOf('分类匹配') >= 0);
check('说明卡有「重复流水」', selectBody.indexOf('重复流水') >= 0);
check('说明「不会自动新建」分类', selectBody.indexOf('不会自动新建') >= 0);
var fakes = ['成员', '商家', '项目分类'].filter(function (f) {
  return selectBody.indexOf(f) >= 0;
});
check('不出现假控件（成员/商家/项目）', fakes.length === 0, JSON.stringify(fakes));
var hasBtn = await page.evaluate(function () {
  return Array.from(document.querySelectorAll('.btn-text')).some(function (e) {
    return e.textContent.indexOf('选择文件') >= 0;
  });
});
check('有「选择文件」按钮', hasBtn);

/* ============================================================
 * ③ 真的选文件 → 预览
 * ============================================================ */
console.log('[3] 选文件 → 预览（真解析）');
const chooserPromise = page.waitForEvent('filechooser');
await page.evaluate(function () {
  var list = Array.from(document.querySelectorAll('.btn-text')).filter(function (e) {
    return e.textContent.indexOf('选择文件') >= 0;
  });
  var btn = list[0] && list[0].closest('.btn');
  if (btn) btn.click();
});
const chooser = await chooserPromise;
await chooser.setFiles(FIXTURE);
await page.waitForTimeout(3000);

var summary = await page.evaluate(function () {
  var cells = Array.from(document.querySelectorAll('.summary-cell'));
  var out = {};
  cells.forEach(function (c) {
    var cap = c.querySelector('.summary-cap');
    var num = c.querySelector('.summary-num');
    if (cap && num) out[cap.textContent.trim()] = num.textContent.trim();
  });
  return out;
});
check('预览态出现汇总卡', Object.keys(summary).length > 0, JSON.stringify(summary));
check('总行数 = 4（fixture 3 支出 + 1 收入）', summary['总行数'] === '4', summary['总行数']);
check('无法导入 = 0', summary['无法导入'] === '0', summary['无法导入']);
check('分类降级 = 1（fixture 故意留了一条不存在的二级）', summary['分类降级'] === '1', summary['分类降级']);
check('将导入 = 4', summary['将导入'] === '4', summary['将导入']);
var sheetsTxt = await page.evaluate(function () {
  return Array.from(document.querySelectorAll('.sheet-item')).map(function (e) {
    return e.textContent.trim();
  });
});
check('两个工作表小计都在', sheetsTxt.length === 2, JSON.stringify(sheetsTxt));

console.log('[4] 预览不写库');
const afterPreview = await countIn(tmpAccountId);
check('预览后库里仍为 0 条', afterPreview === 0, 'total=' + afterPreview);

/* ============================================================
 * ⑤ 分组 Tab
 * ============================================================ */
console.log('[5] 只列异常记录 + 分组 Tab 过滤');
/*
 * ★ 核心回归点（luchao 2026-09-17）：**正常流水不进列表**。
 * fixture 4 行里 3 行正常，只有 1 行分类降级 —— 列表应只出现那 1 行。
 */
var tabCount = await page.evaluate(function () {
  return document.querySelectorAll('.tab').length;
});
check('4 个分组 Tab（全部/分类降级/疑似重复/无法导入，无「可导入」）', tabCount === 4, 'n=' + tabCount);
var hasOkTab = await page.evaluate(function () {
  return Array.from(document.querySelectorAll('.tab-text')).some(function (e) {
    return e.textContent.indexOf('可导入') >= 0;
  });
});
check('Tab 里不再有「可导入」这一组', hasOkTab === false);
await clickByText('.tab-text', '全部');
await page.waitForTimeout(500);
var allRows = await page.evaluate(function () {
  return document.querySelectorAll('.row').length;
});
check('「全部」只列出 1 行异常（3 条正常被省略）', allRows === 1, 'rows=' + allRows);
var hasHint = await page.evaluate(function () {
  return document.body.innerText.indexOf('已省略 3 条正常流水') >= 0;
});
check('有「已省略 3 条正常流水」提示', hasHint);
var abnormalStatus = await page.evaluate(function () {
  var el = document.querySelector('.row-status');
  return el ? el.textContent.trim() : '';
});
check('列出的那行是「分类降级」', abnormalStatus === '分类降级', abnormalStatus);

/* ============================================================
 * ⑥ 开关：跳过重复
 * ============================================================ */
console.log('[6] 「跳过疑似重复」开关');
var beforeToggle = await page.evaluate(function () {
  return Array.from(document.querySelectorAll('.btn-text'))
    .map(function (e) {
      return e.textContent.trim();
    })
    .find(function (t) {
      return t.indexOf('确认导入') >= 0;
    });
});
check('按钮显示「确认导入 4 条」', beforeToggle === '确认导入 4 条', beforeToggle);
const callsBeforeToggle = importCalls.length;
await clickNth('.switch-row', 0);
await page.waitForTimeout(1200);
var switchOn = await page.evaluate(function () {
  var el = document.querySelector('.switch');
  return el ? el.className.indexOf('switch-on') >= 0 : null;
});
check('开关已切到「不跳过重复」', switchOn === false, 'switchOn=' + switchOn);
/* ★ 方案 B 起，切开关要**重新问一次服务端**（前端手里只有异常行，算不出 importable） */
check(
  '切开关会重新请求预览（不再本地重算）',
  importCalls.length > callsBeforeToggle,
  'calls ' + callsBeforeToggle + ' → ' + importCalls.length
);
await clickNth('.switch-row', 0);
await page.waitForTimeout(1200);
var switchBack = await page.evaluate(function () {
  var el = document.querySelector('.switch');
  return el ? el.className.indexOf('switch-on') >= 0 : null;
});
check('再点一次切回「跳过重复」（默认态）', switchBack === true, 'switchOn=' + switchBack);

/* ============================================================
 * ⑦ 确认导入
 * ============================================================ */
console.log('[7] 确认导入 → 结果态 + 库里真的多了');
await page.evaluate(function () {
  var list = Array.from(document.querySelectorAll('.btn-text')).filter(function (e) {
    return e.textContent.indexOf('确认导入') >= 0;
  });
  var btn = list[0] && list[0].closest('.btn');
  if (btn) btn.click();
});
await page.waitForTimeout(3500);

var doneBody = await page.evaluate(function () {
  return document.body.innerText;
});
check('结果态出现「导入完成」', doneBody.indexOf('导入完成') >= 0);
var resultSummary = await page.evaluate(function () {
  var cells = Array.from(document.querySelectorAll('.summary-cell'));
  var out = {};
  cells.forEach(function (c) {
    var cap = c.querySelector('.summary-cap');
    var num = c.querySelector('.summary-num');
    if (cap && num) out[cap.textContent.trim()] = num.textContent.trim();
  });
  return out;
});
check('已导入 = 4', resultSummary['已导入'] === '4', JSON.stringify(resultSummary));

const afterCommit = await countIn(tmpAccountId);
check('库里真的有 4 条了', afterCommit === 4, 'total=' + afterCommit);

/*
 * ★★ 方案 B 的核心契约（luchao 2026-09-17 拍板）。
 *
 * 早先：预览回传全部行 → 提交把 `rows` 原样发回。而预览为控制响应体
 * 只回传前 2000 行，于是**超过 2000 行的账单只能导入 2000 条**，
 * 汇总卡与按钮却都显示全部 —— 用户以为全进去了。
 *
 * 现在：提交**传文件**，服务端重新解析。行数上限只剩文件体积（2MB ≈ 3 万行）。
 * 这两条断言就是防回退的：任何人把 commit 改回传 rows，立刻红。
 */
const commitCall = importCalls.filter((c) => c.url.indexOf('/commit') >= 0).pop();
check('发过 /import/commit 请求', !!commitCall, JSON.stringify(importCalls.map((c) => c.url)));
check(
  '提交传的是**文件**（filename + contentBase64）',
  !!commitCall &&
    commitCall.keys.indexOf('filename') >= 0 &&
    commitCall.keys.indexOf('contentBase64') >= 0,
  commitCall ? JSON.stringify(commitCall.keys) : ''
);
check(
  '提交**不再传行**（没有 rows 字段）',
  !!commitCall && commitCall.keys.indexOf('rows') < 0,
  commitCall ? JSON.stringify(commitCall.keys) : ''
);

/* 分类是否真的挂上了（fixture 用的是母本分类，临时账本复制了全部，应精确命中） */
const imported = await api('/api/transactions?accountId=' + tmpAccountId + '&page=1&size=10');
const rows = imported.body?.data?.list ?? [];
check(
  '导入的流水全部带上了分类（降级那条挂到一级，不是未分类）',
  rows.length === 4 && rows.every((r) => !!r.category),
  JSON.stringify(rows.map((r) => r.category && r.category.name))
);
check(
  '金额与时刻正确（35.50 / 12:30）',
  rows.some((r) => r.amount === '35.50' && r.recordTime === '12:30:00'),
  JSON.stringify(rows.map((r) => [r.amount, r.recordTime]))
);

/* ============================================================
 * 清理：删掉临时账本（流水随 CASCADE 一起消失）
 * ============================================================ */
console.log('[8] 清理临时账本');
const accName = created.body.data.name;
const del = await api(
  '/api/accounts/' + tmpAccountId + '?confirmName=' + encodeURIComponent(accName),
  { method: 'DELETE' }
);
check('临时账本已删除', del.status === 200, 'HTTP ' + del.status);
const gone = await api('/api/accounts/' + tmpAccountId);
check('临时账本确实不存在了', gone.status === 404, 'HTTP ' + gone.status);

console.log('\n结果：PASS=' + pass + ' FAIL=' + fail);
await browser.close();
process.exit(fail ? 1 : 0);