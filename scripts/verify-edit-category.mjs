/**
 * 「编辑流水改分类」+「分类维度日头带月份」运行时验证（真实浏览器，走完整 UI 链路）。
 *
 *   node scripts/verify-edit-category.mjs
 *
 * 背景（2026-09-30 luchao 报告）：
 *   ① 流水页点一笔 → 记账页改分类 → 保存 → 流水页**分类没变**（保存不生效）。
 *   ② 流水页按**分类**分组时，明细的「日 + 星期」看不出是哪个月（8月13 与 9月13 同形）。
 *
 * 覆盖：
 *   ① [反例] **时间**维度下日头**不带**月份（组头已含月份，避免重复）
 *   ② ★ **分类**维度下日头**带**月份（`9月15日 周一`）
 *   ③ ★ UI 端到端：编辑页改分类 → 保存 → 返回流水页 → **该行分类名已变**
 *   ④ 独立再查一次详情接口：`categoryId` 确实是新分类（防止"只在响应体里好看"）
 *
 * ⚠️ **只操作自建数据**：先建临时账本、在其中造流水，全程改它，最后删账本
 *    （流水随外键 CASCADE 一起消失）。
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
        root + '/' + d + '/' + arch + '/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
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
page.setDefaultTimeout(10000);
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 160)));

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
await page.waitForTimeout(2000);

/*
 * 登录：直接走接口拿 token 写进 localStorage，而不是点登录表单。
 * `uni.getStorageSync` 对裸字符串是兼容的（JSON.parse 失败即原样返回，见 uni-h5 的
 * getStorageOrigin），所以裸 setItem 能被 store 读到。
 */
const login = await page.evaluate(async function () {
  const r = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'demo', password: '123456' }),
  });
  const j = await r.json();
  if (j && j.code === 0 && j.data && j.data.token) {
    localStorage.setItem('token', j.data.token);
  }
  return { status: r.status, code: j && j.code, token: (j && j.data && j.data.token) || '' };
});
check('[登录] 已拿到 token', !!login.token, 'HTTP ' + login.status + ' code=' + login.code);
if (!login.token) {
  console.log('登录失败，终止');
  await browser.close();
  process.exit(1);
}
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
check(
  '[登录] 页面已认出登录态',
  await page.evaluate(() => !!localStorage.getItem('token'))
);

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
 * 准备：临时账本 + 其中一笔流水（挂二级分类 A）
 * ============================================================ */
const stamp = Date.now();
const accName = '改分类验证' + stamp;
const created = await api('/api/accounts', { method: 'POST', body: JSON.stringify({ name: accName }) });
check('[准备] 临时账本已创建', created.status === 200, 'HTTP ' + created.status);
const accId = created.body?.data?.id;
if (!accId) {
  console.log('临时账本创建失败，终止');
  await browser.close();
  process.exit(1);
}

const today = await page.evaluate(function () {
  var d = new Date();
  var p = function (n) {
    return String(n).padStart(2, '0');
  };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
});

const cats = await api('/api/categories?accountId=' + accId + '&type=expense&visibility=visible');
const leaves = (cats.body?.data || []).filter((c) => c.parentId);
check('[准备] 临时账本里有 ≥2 个二级支出分类', leaves.length >= 2, '共 ' + leaves.length);
const catA = leaves[0];

const ORIGINAL = '33.33';
const seeded = await api('/api/transactions', {
  method: 'POST',
  body: JSON.stringify({
    type: 'expense',
    amount: ORIGINAL,
    categoryId: catA.id,
    recordDate: today,
    note: '改分类验证',
    accountId: accId,
  }),
});
check('[准备] 已在该账本造一笔流水', seeded.status === 200, 'HTTP ' + seeded.status);
const txnId = seeded.body?.data?.id;

await page.evaluate(function (id) {
  localStorage.setItem('currentAccountId', id);
}, accId);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

/* ============================================================
 * ① 时间维度 · **月**粒度：日头不带月份（反例，防止"无脑加月"）
 * ============================================================ */
await page.goto('http://127.0.0.1:5173/#/pages/flow/index', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);

const dayHeads = async () =>
  await page.evaluate(function () {
    return Array.from(document.querySelectorAll('.day-head-text')).map(function (e) {
      return e.textContent.trim();
    });
  });
const txnNames = async () =>
  await page.evaluate(function () {
    return Array.from(document.querySelectorAll('.txn-name')).map(function (e) {
      return e.textContent.trim();
    });
  });

const timeHeads = await dayHeads();
check(
  '① 时间维度 · 月粒度：日头是「N日 周X」，不含月份（反例，防无脑加月）',
  timeHeads.length > 0 && timeHeads.every((t) => /^\d{1,2}日\s*周[一二三四五六日]$/.test(t)),
  JSON.stringify(timeHeads)
);
const namesBefore = await txnNames();
check('   该笔流水挂在分类 A', namesBefore.indexOf(catA.name) >= 0, JSON.stringify(namesBefore));

/* ============================================================
 * ①b 时间维度 · 年 / 季 / 周 粒度：日头**必须带月份**
 *
 * 2026-10-03 新规则（luchao 定）：只有「时间 × 月粒度」不带月份，
 * 其余维度一律带 —— 年/季/分类的明细跨月，**ISO 周还会跨月**（如 9月30 ~ 10月6），
 * 组头都不含月份，只写「30日 周三」没法定位到具体哪天。
 *
 * ⚠️ 这条是**新规则的唯一守卫**：删掉它，把判据退回 `groupBy === 'category'`
 *    也不会有人发现（页面照样能跑，只是年/季/周下日头丢了月份）。
 * ============================================================ */
for (const gran of ['年', '季', '周']) {
  console.log(`[1b] 切到「${gran}」粒度 → 日头应带月份`);
  const openedUnit = await page.evaluate(function () {
    var items = document.querySelectorAll('.filter-item');
    if (!items.length) return false;
    items[0].click();
    return true;
  });
  check(`   ${gran}：粒度弹层已打开`, openedUnit);
  await page.waitForTimeout(600);
  const pickedGran = await clickByText('.sheet-item-row', gran);
  check(`   ${gran}：已选「${gran}」粒度`, pickedGran);
  await page.waitForTimeout(4000);

  const heads = await dayHeads();
  check(
    `①b ★ ${gran}粒度：日头带月份（如「9月30日 周三」）`,
    heads.length > 0 && heads.every((t) => /^\d{1,2}月\d{1,2}日\s*周[一二三四五六日]$/.test(t)),
    JSON.stringify(heads)
  );
}

// 复位到默认（月），避免影响后续步骤的前提
console.log('[1b] 复位到「月」粒度');
await page.evaluate(function () {
  document.querySelectorAll('.filter-item')[0].click();
});
await page.waitForTimeout(600);
await clickByText('.sheet-item-row', '月');
await page.waitForTimeout(3000);

/* ============================================================
 * ② 分类维度：日头带月份
 * ============================================================ */
console.log('[2] 底栏切到「分类 · 二级」维度');
const openedLevel = await page.evaluate(function () {
  var items = document.querySelectorAll('.filter-item');
  if (items.length < 2) return false;
  items[1].click();
  return true;
});
check('   分类维度弹层已打开', openedLevel);
await page.waitForTimeout(600);
const picked = await clickByText('.sheet-item-row', '二级分类');
check('   已选「二级分类」', picked);
await page.waitForTimeout(4000);

const catHeads = await dayHeads();
check(
  '② ★ 分类维度：日头带月份（如「9月30日 周三」）',
  catHeads.length > 0 && catHeads.every((t) => /^\d{1,2}月\d{1,2}日\s*周[一二三四五六日]$/.test(t)),
  JSON.stringify(catHeads)
);

/* ============================================================
 * ③ 编辑改分类 → 保存 → 列表该行分类名已变（用户报的 bug）
 * ============================================================ */
console.log('[3] 点明细行 → 编辑页改分类 → 完成');
const clicked = await page.evaluate(function () {
  var rows = Array.from(document.querySelectorAll('.txn'));
  for (var i = 0; i < rows.length; i++) {
    var a = rows[i].querySelector('.txn-amount');
    if (a && a.textContent.indexOf('33.33') >= 0) {
      rows[i].click();
      return true;
    }
  }
  return false;
});
check('   找到了那行并点进编辑页', clicked);
await page.waitForTimeout(3000);
const hash = await page.evaluate(function () {
  return location.hash;
});
check('   跳到了记账页', hash.indexOf('/pages/record/index') >= 0, hash);

// 打开分类选择器：第一行 `.row` 就是「分类」
const openedPicker = await page.evaluate(function () {
  var rows = document.querySelectorAll('.row');
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].textContent.indexOf('分类') >= 0) {
      rows[i].click();
      return true;
    }
  }
  return false;
});
check('   分类选择器已打开', openedPicker);
await page.waitForTimeout(1200);

// 选一个**与当前不同**的二级分类
const pickedNew = await page.evaluate(function (oldName) {
  var items = Array.from(document.querySelectorAll('.grid-item'));
  for (var i = 0; i < items.length; i++) {
    var n = items[i].querySelector('.name');
    if (n && n.textContent.trim() && n.textContent.trim() !== oldName) {
      items[i].click();
      return n.textContent.trim();
    }
  }
  return '';
}, catA.name);
check('   已选中新分类：' + pickedNew, !!pickedNew && pickedNew !== catA.name);
await page.waitForTimeout(800);

const rowValue = await page.evaluate(function () {
  var e = document.querySelector('.row-value');
  return e ? e.textContent.trim() : '';
});
// 分类行显示的是**全名**（「一级 / 二级」），所以用包含判断而不是相等
check('   编辑页「分类」行已显示新分类', rowValue.indexOf(pickedNew) >= 0, rowValue);

// 键盘主操作键：class `.key.confirm`，文案是「确定」（不是「完成」）
const saved = await page.evaluate(function () {
  var b = document.querySelector('.key.confirm');
  if (!b) return false;
  b.click();
  return true;
});
check('   点了「确定」保存', saved);
await page.waitForTimeout(4500);

const backHash = await page.evaluate(function () {
  return location.hash;
});
check('   已返回流水页', backHash.indexOf('/pages/flow/index') >= 0, backHash);

const namesAfter = await txnNames();
check(
  '③ ★ 列表该行的分类名已变成新分类',
  namesAfter.indexOf(pickedNew) >= 0,
  '期望含「' + pickedNew + '」，实际 ' + JSON.stringify(namesAfter)
);
check('   旧分类名已从列表消失', namesAfter.indexOf(catA.name) < 0, JSON.stringify(namesAfter));

/* ============================================================
 * ④ 独立再查一次详情：确认是**库里的值**变了
 * ============================================================ */
const newCatId = leaves.find((c) => c.name === pickedNew)?.id;
const detail = await api('/api/transactions/' + txnId);
check(
  '④ ★ 详情接口的 categoryId 已是新分类（库里真的改了）',
  !!newCatId && String(detail.body?.data?.categoryId) === String(newCatId),
  'get ' + detail.body?.data?.categoryId + ' / 期望 ' + newCatId + '（' + pickedNew + '）'
);

/* ============================================================
 * 清理
 * ============================================================ */
console.log('[4] 清理临时账本');
const del = await api('/api/accounts/' + accId + '?confirmName=' + encodeURIComponent(accName), {
  method: 'DELETE',
});
check('临时账本已删除', del.status === 200, 'HTTP ' + del.status);

console.log('\n结果：PASS=' + pass + ' FAIL=' + fail);
await browser.close();
process.exit(fail ? 1 : 0);
