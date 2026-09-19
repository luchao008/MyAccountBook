/**
 * 「切换账本弹窗层级」运行时验证（真实浏览器，走完整 UI 链路）。
 *
 *   node scripts/verify-account-switch-sheet.mjs
 *
 * 背景（2026-09-19 修复的 bug）：
 *   用户报告「记账页面的切换账本弹窗有层级问题」（截图：弹窗整屏被 50% 黑罩压住）。
 *   根因在 `App.vue` 的全局层级规则（commit 3ee1fba 引入）：为修 modal/toast 被自定义
 *   弹层遮挡，把**所有** `.uni-mask` 抬到 `z-index: 3000 !important`。
 *   而 `uni.showActionSheet` 的遮罩正是 `.uni-mask.uni-actionsheet__mask` ——
 *   遮罩被抬到 3000、弹层 `.uni-actionsheet` 还是 999，遮罩反过来盖住弹层：
 *   弹窗整屏变灰、任何点击都落在遮罩上（只会关掉弹窗，选不中任何账本）。
 *   修复：把 `.uni-actionsheet` 也纳入 3000 组 —— 同 z-index 时靠"DOM 靠后者在上"
 *   保持弹层在遮罩之上（H5 产物里遮罩在前、弹层在后，见 uni-h5.es.js 渲染函数）。
 *
 * 覆盖：
 *   ① 切账本弹窗能打开（`.uni-actionsheet_toggle`、遮罩可见）
 *   ② ★核心：弹层位于遮罩之上 —— 命中测试：item / 取消 的中心点
 *      `document.elementFromPoint` 必须落在 `.uni-actionsheet` 内部
 *      （bug 时命中的是 `.uni-mask`，这正是"点不动"的直接原因）
 *   ③ 负向对照：运行时把遮罩 z-index 临时抬到弹层之上 → 命中测试应改判为 mask，
 *      证明 ② 的断言不是恒真
 *   ④ 端到端：点弹窗里的临时账本 → 真的切过去（banner 账本名变化）
 *   ⑤ 取消按钮可点（能关掉弹窗）
 *   ⑥ 清理：切回原账本、删掉临时账本
 *
 * ⚠️ **只操作自建数据**：脚本自己建临时账本、自己删，绝不动 demo 已有账本。
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

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-proxy-server'] });
const page = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
page.setDefaultTimeout(8000);
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 160)));

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
 * 准备：建临时账本（保证账本数 ≥ 2，弹窗才是 actionSheet 而不是 modal）
 * ============================================================ */
const stamp = Date.now();
const tmpName = '切换验证' + stamp;
const created = await api('/api/accounts', { method: 'POST', body: JSON.stringify({ name: tmpName }) });
check('[准备] 临时账本已创建', created.status === 200, 'HTTP ' + created.status);
const tmpId = created.body?.data?.id;
if (!tmpId) {
  console.log('临时账本创建失败，终止');
  await browser.close();
  process.exit(1);
}

/* ============================================================
 * ① 打开记账页 → 点账本切换胶囊 → 弹窗出现
 * ============================================================ */
console.log('[1] 打开切账本弹窗');
await page.goto('http://127.0.0.1:5173/#/pages/main/index', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.account-switch', { timeout: 10000 });
await page.waitForTimeout(800);
const originalName = await page.evaluate(function () {
  var el = document.querySelector('.account-name');
  return el ? el.textContent.trim() : '';
});
check('拿到当前账本名（切换后要还原）', !!originalName, originalName);

async function openSheet() {
  await page.evaluate(function () {
    var el = document.querySelector('.account-switch');
    if (el) el.click();
  });
  await page.waitForTimeout(800);
  return await page.evaluate(function () {
    var sheet = document.querySelector('.uni-actionsheet.uni-actionsheet_toggle');
    var mask = document.querySelector('.uni-mask.uni-actionsheet__mask');
    return { sheetOpen: !!sheet, maskVisible: !!mask && getComputedStyle(mask).display !== 'none' };
  });
}
const opened = await openSheet();
check('弹窗已打开（.uni-actionsheet_toggle）', opened.sheetOpen);
check('遮罩可见（.uni-actionsheet__mask）', opened.maskVisible);

/* ============================================================
 * ② ★核心断言：命中测试 —— 弹层必须在遮罩之上
 * ============================================================ */
console.log('[2] 命中测试：item / 取消 中心点应命中弹层而非遮罩');
const hit = await page.evaluate(function () {
  function centerHit(el) {
    var r = el.getBoundingClientRect();
    var x = r.left + r.width / 2;
    var y = r.top + r.height / 2;
    var hitEl = document.elementFromPoint(x, y);
    return {
      text: (el.textContent || '').trim().slice(0, 20),
      hitClass: hitEl ? hitEl.className : '',
      inSheet: !!(hitEl && hitEl.closest && hitEl.closest('.uni-actionsheet')),
      isMask: !!(hitEl && hitEl.classList && hitEl.classList.contains('uni-mask')),
    };
  }
  var sheet = document.querySelector('.uni-actionsheet.uni-actionsheet_toggle');
  var cells = Array.from(sheet.querySelectorAll('.uni-actionsheet__cell'));
  var firstCell = cells[0];
  var lastCell = cells[cells.length - 1];
  var z = function (sel) {
    var el = document.querySelector(sel);
    return el ? getComputedStyle(el).zIndex : '(无)';
  };
  return {
    first: centerHit(firstCell),
    last: centerHit(lastCell),
    maskZ: z('.uni-mask.uni-actionsheet__mask'),
    sheetZ: z('.uni-actionsheet'),
  };
});
console.log('     z-index: mask=' + hit.maskZ + ' sheet=' + hit.sheetZ);
console.log('     首项命中: ' + JSON.stringify(hit.first));
console.log('     取消命中: ' + JSON.stringify(hit.last));
check('首项中心点命中弹层内部', hit.first.inSheet && !hit.first.isMask);
check('取消中心点命中弹层内部', hit.last.inSheet && !hit.last.isMask);
check(
  '遮罩与弹层同处顶层（都 ≥ 3000，靠 DOM 顺序保证弹层在上）',
  Number(hit.maskZ) >= 3000 && Number(hit.sheetZ) >= 3000,
  'mask=' + hit.maskZ + ' sheet=' + hit.sheetZ
);
/* 弹窗打开中的证据图：应见弹层亮白、可读，而不是整屏被黑罩压住 */
await page.screenshot({ path: '/tmp/verify-account-switch-sheet.png' });

/* ============================================================
 * ③ 负向对照：把遮罩抬到弹层之上，命中测试必须改判（证明断言能区分）
 * ============================================================ */
console.log('[3] 负向对照：遮罩抬到弹层之上 → 命中应改判为 mask');
const neg = await page.evaluate(function () {
  var mask = document.querySelector('.uni-mask.uni-actionsheet__mask');
  var sheet = document.querySelector('.uni-actionsheet.uni-actionsheet_toggle');
  var cell = sheet.querySelector('.uni-actionsheet__cell');
  var r = cell.getBoundingClientRect();
  var x = r.left + r.width / 2;
  var y = r.top + r.height / 2;
  /*
   * ⚠️ 必须用 setProperty(..., 'important')：
   *    App.vue 的层级规则带 !important，普通 inline 样式（style.zIndex = …）
   *    根本压不过它 —— 这正是当初 bug 成立的原因（框架的 999 也压不过 3000）。
   */
  mask.style.setProperty('z-index', String(Number(getComputedStyle(sheet).zIndex) + 1), 'important');
  var hitEl = document.elementFromPoint(x, y);
  var isMask = !!(hitEl && hitEl.classList && hitEl.classList.contains('uni-mask'));
  mask.style.removeProperty('z-index');
  return isMask;
});
check('遮罩压住弹层时命中测试确实改判为 mask（断言不是恒真）', neg);

/* ============================================================
 * ④ 端到端：点临时账本 → 真的切过去
 * ============================================================ */
console.log('[4] 点弹窗里的临时账本 → 切换生效');
const clicked = await page.evaluate(function (name) {
  var sheet = document.querySelector('.uni-actionsheet.uni-actionsheet_toggle');
  var cells = Array.from(sheet.querySelectorAll('.uni-actionsheet__cell'));
  for (var i = 0; i < cells.length; i++) {
    if (cells[i].textContent.indexOf(name) >= 0) {
      cells[i].click();
      return true;
    }
  }
  return false;
}, tmpName);
check('找到了临时账本项并点下去', clicked);
await page.waitForTimeout(2000);
const afterSwitch = await page.evaluate(function () {
  var el = document.querySelector('.account-name');
  return el ? el.textContent.trim() : '';
});
check('banner 账本名已切到临时账本', afterSwitch.indexOf(tmpName) >= 0, afterSwitch);
await page.screenshot({ path: '/tmp/verify-account-switch-after.png' });

/* ============================================================
 * ⑤ 取消按钮可点（能关掉弹窗）
 * ============================================================ */
console.log('[5] 取消按钮可点');
await page.waitForTimeout(500);
await openSheet();
const cancelled = await page.evaluate(function () {
  var sheet = document.querySelector('.uni-actionsheet.uni-actionsheet_toggle');
  var cells = Array.from(sheet.querySelectorAll('.uni-actionsheet__cell'));
  var cancel = cells[cells.length - 1];
  if (!cancel) return false;
  cancel.click();
  return true;
});
check('点到了取消按钮', cancelled);
await page.waitForTimeout(800);
const sheetGone = await page.evaluate(function () {
  return !document.querySelector('.uni-actionsheet.uni-actionsheet_toggle');
});
check('弹窗已关闭', sheetGone);

/* ============================================================
 * ⑥ 清理：切回原账本 → 删掉临时账本
 * ============================================================ */
console.log('[6] 清理：切回原账本并删除临时账本');
await openSheet();
const back = await page.evaluate(function (name) {
  var sheet = document.querySelector('.uni-actionsheet.uni-actionsheet_toggle');
  var cells = Array.from(sheet.querySelectorAll('.uni-actionsheet__cell'));
  for (var i = 0; i < cells.length; i++) {
    if (cells[i].textContent.indexOf(name) >= 0) {
      cells[i].click();
      return true;
    }
  }
  return false;
}, originalName);
check('切回了原账本', back);
await page.waitForTimeout(2000);
const restored = await page.evaluate(function () {
  var el = document.querySelector('.account-name');
  return el ? el.textContent.trim() : '';
});
check('banner 账本名已还原', restored.indexOf(originalName) >= 0, restored);

const cleanup = await api('/api/accounts/' + tmpId + '?confirmName=' + encodeURIComponent(tmpName), {
  method: 'DELETE',
});
check('临时账本已清理', cleanup.status === 200, 'HTTP ' + cleanup.status);

console.log(
  '\n结果：PASS=' +
    pass +
    ' FAIL=' +
    fail +
    '（截图：/tmp/verify-account-switch-sheet.png 弹窗打开中 / /tmp/verify-account-switch-after.png 切换后）'
);
await browser.close();
process.exit(fail ? 1 : 0);
