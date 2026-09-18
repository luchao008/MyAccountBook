/**
 * 「删除账本」运行时验证（真实浏览器，走完整 UI 链路）。
 *
 *   node scripts/verify-account-delete.mjs
 *
 * 背景（2026-09-17 修复的 bug）：
 *   用户报告「删除账本，名字输入正确，后端接口提示没有拿到名称」。
 *   根因在 `api/account.ts` 的 `deleteAccount`：
 *     `http.delete(url, { params: { confirmName } })`
 *   luch-request 的签名是 `delete(url, data, options)` —— 第二个参数是**请求体**，
 *   不是 axios 那种 config。`{ params }` 被当成 body 发走，URL 上没有查询串，
 *   后端 `DeleteAccountQueryDTO.confirmName` 直接 422「"confirmName" 是必须的」。
 *
 * 覆盖：
 *   ① 账本页能进入，临时账本出现在列表里
 *   ② 点「删除」→ 弹出可输入弹窗（`.uni-modal__textarea`）
 *   ③ **原样输入账本名 → 确定 → 真的删掉**（这是 bug 的正面复现）
 *   ④ 请求 URL 上**带查询串** confirmName（守「不能再退回 body 写法」）
 *   ⑤ 名字输错 → 后端拒绝（40001），账本仍在
 *   ⑥ 校验「至少留一个账本」的入口仍在（删除按钮受 list.length > 1 约束）
 *
 * ⚠️ **只操作自建数据**：脚本自己建临时账本、自己删，绝不动 demo 已有账本。
 *    项目踩过「拿用户真实数据做实验」的坑，这条是硬约束。
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

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-proxy-server'] });
const page = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
page.setDefaultTimeout(8000);
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 160)));

/** 记录所有 DELETE /api/accounts 请求的真实 URL 与响应 */
const deleteCalls = [];
page.on('response', async (r) => {
  if (r.request().method() === 'DELETE' && r.url().includes('/api/accounts')) {
    let body = '';
    try {
      body = JSON.stringify(await r.json());
    } catch {
      /* 忽略 */
    }
    deleteCalls.push({ url: r.url(), status: r.status(), body });
  }
});

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

/** 点某个账本行里的某个动作（按行内文字精确定位，不裸点第 N 个） */
async function clickActionOf(name, actionText) {
  return await page.evaluate(
    function (a) {
      var items = Array.from(document.querySelectorAll('.list-item'));
      for (var i = 0; i < items.length; i++) {
        var n = items[i].querySelector('.item-name');
        if (!n || n.textContent.trim() !== a.name) continue;
        var acts = Array.from(items[i].querySelectorAll('.action'));
        for (var k = 0; k < acts.length; k++) {
          if (acts[k].textContent.trim() === a.actionText) {
            acts[k].click();
            return true;
          }
        }
      }
      return false;
    },
    { name, actionText }
  );
}

/* ============================================================
 * 准备：建两个临时账本（删一个、留一个）
 * ============================================================ */
const stamp = Date.now();
const nameA = '删除验证A' + stamp;
const nameB = '删除验证B' + stamp;
const a = await api('/api/accounts', { method: 'POST', body: JSON.stringify({ name: nameA }) });
const b = await api('/api/accounts', { method: 'POST', body: JSON.stringify({ name: nameB }) });
check('[准备] 两个临时账本已创建', a.status === 200 && b.status === 200);
const idA = a.body?.data?.id;
if (!idA) {
  console.log('临时账本创建失败，终止');
  await browser.close();
  process.exit(1);
}

/* ============================================================
 * ① 账本页
 * ============================================================ */
console.log('[1] 账本管理页列出临时账本');
await page.goto('http://127.0.0.1:5173/#/pages/account/index', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
const listed = await page.evaluate(function () {
  return Array.from(document.querySelectorAll('.item-name')).map(function (e) {
    return e.textContent.trim();
  });
});
check('临时账本出现在列表里', listed.indexOf(nameA) >= 0, 'items=' + listed.length);
check('删除按钮存在（账本数 > 1）', listed.length > 1, 'items=' + listed.length);

/* ============================================================
 * ② 点删除 → 可输入弹窗
 * ============================================================ */
console.log('[2] 点「删除」弹出输入确认框');
const clicked = await clickActionOf(nameA, '删除');
check('找到了该行的「删除」并点下去', clicked);
await page.waitForTimeout(1200);
const hasTextarea = await page.evaluate(function () {
  return !!document.querySelector('.uni-modal__textarea');
});
check('弹窗是可输入形态（.uni-modal__textarea）', hasTextarea);
const placeholder = await page.evaluate(function () {
  var el = document.querySelector('.uni-modal__textarea');
  return el ? el.getAttribute('placeholder') : '';
});
check('占位文案带账本名', (placeholder || '').indexOf(nameA) >= 0, placeholder);

/* ============================================================
 * ③ 名字输错 → 后端拒绝，账本仍在（先测失败路径，确保成功路径不是假绿）
 * ============================================================ */
console.log('[3] 名字输错 → 拒绝删除（负向先行断言）');
await page.fill('.uni-modal__textarea', '完全不对的名字');
await page.locator('.uni-modal__btn_primary').click();
await page.waitForTimeout(2500);
const stillThere = await api('/api/accounts/' + idA);
check('名字不符时账本仍存在', stillThere.status === 200, 'HTTP ' + stillThere.status);
check(
  '后端返回 40001（确认名不一致）',
  deleteCalls.length > 0 && deleteCalls[deleteCalls.length - 1].body.indexOf('40001') >= 0,
  deleteCalls.length ? deleteCalls[deleteCalls.length - 1].body.slice(0, 120) : '(无请求)'
);

/* ============================================================
 * ④ 名字正确 → 真的删掉
 * ============================================================ */
console.log('[4] 原样输入账本名 → 删除成功');
await clickActionOf(nameA, '删除');
await page.waitForTimeout(1200);
await page.fill('.uni-modal__textarea', nameA);
await page.locator('.uni-modal__btn_primary').click();
await page.waitForTimeout(3000);

const last = deleteCalls[deleteCalls.length - 1];
check('发出了一次 DELETE', !!last);
/* ★ 核心回归点：查询串必须在 URL 上，而不是被塞进 body */
check(
  'DELETE 的 URL 上带 confirmName 查询串',
  !!last && last.url.indexOf('confirmName=') > 0,
  last ? last.url.replace(/^https?:\/\/[^/]+/, '') : '(无请求)'
);
check('URL 上的名字是 URL 编码后的账本名', !!last && last.url.indexOf(encodeURIComponent(nameA)) > 0);
check('后端返回 200（不再报「没拿到名称」）', !!last && last.status === 200, last ? 'HTTP ' + last.status : '');
const gone = await api('/api/accounts/' + idA);
check('账本确实被删掉了', gone.status === 404, 'HTTP ' + gone.status);

/* ============================================================
 * ⑤ 列表刷新 + 另一个账本不受影响
 * ============================================================ */
console.log('[5] 列表已刷新，未误伤其他账本');
await page.waitForTimeout(1000);
const afterList = await page.evaluate(function () {
  return Array.from(document.querySelectorAll('.item-name')).map(function (e) {
    return e.textContent.trim();
  });
});
check('被删的账本已从列表消失', afterList.indexOf(nameA) < 0);
const bAlive = await api('/api/accounts/' + b.body.data.id);
check('另一个临时账本安然无恙', bAlive.status === 200, 'HTTP ' + bAlive.status);

/* ============================================================
 * 清理：删掉剩下的临时账本（用 API，不再走 UI）
 * ============================================================ */
console.log('[6] 清理');
const cleanup = await api(
  '/api/accounts/' + b.body.data.id + '?confirmName=' + encodeURIComponent(nameB),
  { method: 'DELETE' }
);
check('第二个临时账本已清理', cleanup.status === 200, 'HTTP ' + cleanup.status);

console.log('\n结果：PASS=' + pass + ' FAIL=' + fail);
await browser.close();
process.exit(fail ? 1 : 0);