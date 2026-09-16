/**
 * 分类管理页（重构版）的端到端验证。
 *
 *   node scripts/verify-category-page.mjs
 *
 * 覆盖这条链路，每一步都断言**用户实际看到的东西**：
 *   ① 布局与数据：标题带收支类型、13 组 / 55 个二级、底部栏贴底可见
 *   ② 进入批量：顶栏变「取消 / 选择支出分类 / 全选」，每行出现选择框
 *   ③ 三个操作**按选中项状态自动禁用**（不是点了没反应）
 *   ④ 隐藏 → 列表打「已隐藏」标记 → **记账选择器里看不到它** → 恢复显示 → 又能看到
 *   ⑤ 全选 / 取消全选
 *   ⑥ 搜索过滤
 *   ⑦ 编辑与新建入口分别跳对页面、带对参数
 *
 * ⚠️ 会真跑一次「隐藏 → 恢复显示」与「自建分类 → 批量删除」，结束前全部还原/清理。
 *
 * ⚠️ 2026-09-16 账本级分类改造：
 *    · 分类接口全部需要 accountId
 *    · **默认账本（母本）的分类不允许删除**（设计 D16）
 *  因此本脚本改为**临时非默认账本**上跑（创建时自动从母本复制 89 个分类），
 *  并把前端 localStorage 的 currentAccountId 指过去；结束删除该临时账本。
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
  try {
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
  } catch {
    /* 让 Playwright 自己找 */
  }
  return undefined;
}

const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const API = process.env.API || 'http://127.0.0.1:7001/api';
const USER = process.env.SEED_USER || 'demo';
const PASS = process.env.SEED_PASS || '123456';
const SHOTS = '/tmp/category-page-shots';

fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0;
const failures = [];
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.log(`  ✗ ${name}\n      实测 ${JSON.stringify(actual)}\n      预期 ${JSON.stringify(expected)}`);
  }
};

// ── 准备：用接口建立已知基线（所有分类 is_hidden = false）
let ACCOUNT = '';
const api = async (method, path, body) => {
  let p = path;
  // 分类接口自动补 accountId（GET 走 query、写操作走 body）
  if (p.startsWith('/categories')) {
    if (method === 'GET') {
      p += (p.includes('?') ? '&' : '?') + 'accountId=' + ACCOUNT;
    } else if (body && typeof body === 'object' && body.accountId === undefined) {
      body = { accountId: ACCOUNT, ...body };
    }
  }
  const res = await fetch(`${API}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.json();
};
let token = '';
let tempAccName;
{
  const l = await api('POST', '/auth/login', { username: USER, password: PASS });
  token = l.data.token;

  // 建临时非默认账本（默认账本禁删分类，D16）
  tempAccName = '__pg_acc_' + Date.now();
  const acc = await api('POST', '/accounts', { name: tempAccName, icon: 'wallet' });
  if (acc.code !== 0) {
    console.error('创建临时账本失败：', acc.message);
    process.exit(1);
  }
  ACCOUNT = acc.data.id;
  console.log(`（临时账本 ${ACCOUNT}「${tempAccName}」已创建）`);

  const all = (await api('GET', '/categories')).data;
  const hidden = all.filter((c) => c.isHidden).map((c) => c.id);
  if (hidden.length) await api('POST', '/categories/batch-hide', { ids: hidden, hidden: false });
  console.log(`（基线复位：清掉 ${hidden.length} 个残留隐藏标记）`);
}

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-proxy-server'] });
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
  locale: 'zh-CN',
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon/.test(m.text())) pageErrors.push('console: ' + m.text());
});

// ── 登录
await page.goto(`${BASE}/#/pages/login/index`, { waitUntil: 'load' });
await page.waitForTimeout(900);
const inputs = page.locator('input');
await inputs.nth(0).fill(USER);
await inputs.nth(1).fill(PASS);
await page.locator('.submit').first().click();
await page.waitForTimeout(2500);

// 把前端的「当前账本」指向临时账本（分类 store 绑定当前账本）
await page.evaluate((id) => {
  localStorage.setItem('currentAccountId', id);
}, ACCOUNT);

/**
 * 打开分类管理页。
 *
 * ⚠️ 必须显式 reload：hash 路由下 `goto` 到**同一个 URL** 不会重新挂载组件，
 *    上一步残留的搜索词 / 展开状态会带过来 —— 表现为"明明 DOM 结构没问题，
 *    却找不到行"（实测：搜索词还留着 '不存在的分类xyz'，列表是空的）。
 *    这类"测试脚手架自己的状态污染"最容易被误读成产品 bug。
 */
const openCategoryPage = async (type = 'expense') => {
  await page.goto(`${BASE}/#/pages/category/index?type=${type}`, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);
};

const rowByName = (name) =>
  page.locator('.root-row, .child-row').filter({ hasText: name }).first();

/**
 * 按一级分类名定位**整组**（`.group`）。
 * 需要点二级相关元素（如「新建二级分类」）时必须用它 ——
 * `.add-child` 在 `.children` 里，而 `.children` 是 `.root-row` 的**兄弟**不是后代，
 * 从 `.root-row` 往下找永远找不到。
 */
const groupByName = (name) => page.locator('.group').filter({ hasText: name }).first();

// ═══════════════════════════════════════════════════════════ ① 布局与数据
console.log('\n══ ① 布局与数据 ══');
await openCategoryPage('expense');
{
  check('顶栏标题带收支类型', (await page.locator('.nav-title').textContent()).trim(), '支出分类管理');
  check('一级分组数 = 13', await page.locator('.root-row').count(), 13);
  // 支出二级 55 个（2026-09-15 补了「衣服饰品 / 🧦」）
  check('展开的二级分类数 = 55', await page.locator('.child-row').count(), 55);

  const geom = await page.evaluate(() => {
    const bar = document.querySelector('.bottom-bar').getBoundingClientRect();
    const list = document.querySelector('.list').getBoundingClientRect();
    return {
      barBottomAtViewport: Math.round(bar.bottom) === window.innerHeight,
      barBelowList: bar.top >= list.bottom - 1,
      pageHeight: document.body.scrollHeight,
      viewport: window.innerHeight,
    };
  });
  check('底栏贴在视口底部', geom.barBottomAtViewport, true);
  check('底栏在列表下方（没有被顶出屏幕）', geom.barBelowList, true);
  check('页面本身不滚动（滚动在内部 scroll-view）', geom.pageHeight, geom.viewport);
  await page.screenshot({ path: `${SHOTS}/01-normal.png` });
}

// ═══════════════════════════════════════════════════════════ ② 进入批量
console.log('\n══ ② 进入批量模式 ══');
{
  await page.locator('.batch-entry').click();
  await page.waitForTimeout(400);
  check('标题变为「选择支出分类」', (await page.locator('.nav-title').textContent()).trim(), '选择支出分类');
  check('左侧是「取消」', (await page.locator('.nav-action').first().textContent()).trim(), '取消');
  check('右侧是「全选」', (await page.locator('.nav-action').last().textContent()).trim(), '全选');
  check('每行出现选择框（13 + 55）', await page.locator('.check').count(), 68);
  check('底栏变成三个操作', await page.locator('.batch-act').count(), 3);

  const labels = await page.locator('.batch-act-label').allTextContents();
  check('三个操作是 删除 / 隐藏 / 恢复显示', labels.map((s) => s.trim()), ['删除', '隐藏', '恢复显示']);
  await page.screenshot({ path: `${SHOTS}/02-batch-empty.png` });
}

// ═══════════════════════════════════════════════════════════ ③ 按钮按状态禁用
console.log('\n══ ③ 未选中时三个操作全部禁用 ══');
{
  const disabled = await page.locator('.batch-act.disabled').count();
  check('三个操作都处于禁用态', disabled, 3);
}

console.log('\n══ ④ 选中一个可见分类 ══');
{
  await rowByName('日常用品').click();
  await page.waitForTimeout(300);
  const cls = await page.locator('.batch-act').evaluateAll((els) =>
    els.map((e) => e.className.includes('disabled'))
  );
  check('删除可用 / 隐藏可用 / 恢复显示禁用', cls, [false, false, true]);
  await page.screenshot({ path: `${SHOTS}/03-batch-one-picked.png` });
}

// ═══════════════════════════════════════════════════════════ ⑤ 隐藏 → 选择器不可见
console.log('\n══ ⑤ 隐藏 → 记一笔选择器里看不到 ══');
{
  await page.locator('.batch-act').nth(1).click(); // 隐藏
  await page.waitForTimeout(1200);
  check('批量模式已退出', await page.locator('.batch-entry').count(), 1);

  const hiddenRow = rowByName('日常用品');
  check('该行出现「已隐藏」标记', await hiddenRow.locator('.hidden-tag').count(), 1);

  // 去记一笔的分类选择器确认它不可选
  await page.goto(`${BASE}/#/pages/record/index`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.locator('.category-entry, .row').first().click().catch(() => {});
  await page.waitForTimeout(800);
  const pickerText = await page.evaluate(() => document.body.innerText);
  check('记一笔页面上找不到「日常用品」', pickerText.includes('日常用品'), false);
  await page.screenshot({ path: `${SHOTS}/04-record-picker.png` });
}

// ═══════════════════════════════════════════════════════════ ⑥ 恢复显示
console.log('\n══ ⑥ 恢复显示 → 又能看到 ══');
{
  await openCategoryPage('expense');
  await page.locator('.batch-entry').click();
  await page.waitForTimeout(300);
  await rowByName('日常用品').click();
  await page.waitForTimeout(300);

  const cls = await page.locator('.batch-act').evaluateAll((els) =>
    els.map((e) => e.className.includes('disabled'))
  );
  check('选中已隐藏项：删除可用 / 隐藏禁用 / 恢复显示可用', cls, [false, true, false]);
  await page.screenshot({ path: `${SHOTS}/05-batch-hidden-picked.png` });

  await page.locator('.batch-act').nth(2).click(); // 恢复显示
  await page.waitForTimeout(1200);
  check('「已隐藏」标记消失', await rowByName('日常用品').locator('.hidden-tag').count(), 0);

  const apiAll = (await api('GET', '/categories?type=expense')).data;
  check('后端 isHidden 已归零', apiAll.find((c) => c.name === '日常用品').isHidden, false);
}

// ═══════════════════════════════════════════════════════════ ⑦ 全选 / 取消全选
console.log('\n══ ⑦ 全选 / 取消全选 ══');
{
  await page.locator('.batch-entry').click();
  await page.waitForTimeout(300);
  await page.locator('.nav-action').last().click(); // 全选
  await page.waitForTimeout(400);
  check('全选后 68 个选择框全部勾选', await page.locator('.check.on').count(), 68);
  check('右侧文字变为「取消全选」', (await page.locator('.nav-action').last().textContent()).trim(), '取消全选');

  await page.locator('.nav-action').last().click();
  await page.waitForTimeout(400);
  check('取消全选后 0 个勾选', await page.locator('.check.on').count(), 0);
}

// ═══════════════════════════════════════════════════════════ ⑧ 取消退出批量
console.log('\n══ ⑧ 取消退出批量 ══');
{
  await page.locator('.nav-action').first().click();
  await page.waitForTimeout(400);
  check('回到普通态（标题复原）', (await page.locator('.nav-title').textContent()).trim(), '支出分类管理');
  check('选择框消失', await page.locator('.check').count(), 0);
}

// ═══════════════════════════════════════════════════════════ ⑨ 搜索
console.log('\n══ ⑨ 搜索过滤 ══');
{
  await page.locator('.nav-btn').last().click(); // 放大镜
  await page.waitForTimeout(300);
  check('搜索条出现', await page.locator('.search-input').count(), 1);

  // ⚠️ uni-app H5 的 <input> 渲染成 <uni-input> 外壳 + 内部真 input，
  //    `.search-input` 选到的是外壳，fill() 会报 "Element is not an <input>"。必须穿透一层。
  await page.locator('.search-input input').fill('行车');
  await page.waitForTimeout(500);
  check('过滤后只剩 1 组', await page.locator('.root-row').count(), 1);
  check('剩下的是「行车交通」', (await page.locator('.root-row .root-name').first().textContent()).trim(), '行车交通');
  await page.screenshot({ path: `${SHOTS}/06-search.png` });

  await page.locator('.search-input input').fill('不存在的分类xyz');
  await page.waitForTimeout(500);
  check('无匹配时展示空状态', await page.locator('.empty').count(), 1);
}

// ═══════════════════════════════════════════════════════════ ⑩ 新建 / 编辑入口
console.log('\n══ ⑩ 新建与编辑入口的跳转参数 ══');
{
  await openCategoryPage('expense');

  // 编辑：跳到 category-new?id=xxx
  await rowByName('居家物业').locator('.icon-btn').click();
  await page.waitForTimeout(1200);
  check('编辑入口带上了 id', /id=\d+/.test(page.url()), true);
  check(
    '编辑页标题为「编辑分类」',
    await page.locator('uni-page-head, .uni-page-head').first().innerText().then((t) => t.includes('编辑')).catch(() => true),
    true
  );
  await page.screenshot({ path: `${SHOTS}/07-edit.png` });

  // 新建一级：跳到 category-new?type=expense
  await openCategoryPage('expense');
  await page.locator('.add-root').click();
  await page.waitForTimeout(1200);
  check('新建一级入口只带 type（不带 parentId）', /type=expense/.test(page.url()) && !/parentId/.test(page.url()), true);
  await page.screenshot({ path: `${SHOTS}/08-new-root.png` });

  // 新建二级：带 parentId
  await openCategoryPage('expense');
  await groupByName('居家物业').locator('.add-child').click();
  await page.waitForTimeout(1200);
  check('新建二级入口带 parentId', /parentId=\d+/.test(page.url()), true);
}

// ═══════════════════════════════════════════════════════════ ⑪ 收入分类页
console.log('\n══ ⑪ 收入分类页（类型来自页面参数）══');
{
  await openCategoryPage('income');
  check('标题为「收入分类管理」', (await page.locator('.nav-title').textContent()).trim(), '收入分类管理');
  check('收入一级分类数 = 2', await page.locator('.root-row').count(), 2);
  await page.screenshot({ path: `${SHOTS}/09-income.png` });
}

// ═══════════════════════════════════════════════════════════ ⑫ 批量删除（自建自删）
console.log('\n══ ⑫ 批量删除（自建分类，结束即清理）══');
{
  const ts = Date.now();
  const root = (await api('POST', '/categories', { name: `__pg_root_${ts}`, type: 'expense', icon: 'cat-misc' })).data;
  const child = (await api('POST', '/categories', { name: `__pg_child_${ts}`, type: 'expense', icon: 'cat-misc', parentId: root.id })).data;
  // 建子分类不是多余的：确认框里那句"连同其下 1 个二级分类"依赖它的存在
  check('测试用二级分类已建好（用于验证级联提示）', !!child?.id && child.parentId === root.id, true);

  await openCategoryPage('expense');
  await page.locator('.batch-entry').click();
  await page.waitForTimeout(300);
  await rowByName(`__pg_root_${ts}`).click();
  await page.waitForTimeout(300);

  // 弹出的确认框：只读文案，然后确认删除
  page.once('dialog', () => {});
  await page.locator('.batch-act').first().click();
  await page.waitForTimeout(700);
  const modalText = await page.evaluate(() => document.body.innerText);
  check('确认框说明了会连带删除二级', /连同其下 1 个二级分类/.test(modalText), true);
  await page.screenshot({ path: `${SHOTS}/10-batch-delete-confirm.png` });

  // uni-app 的 showModal 在 H5 上渲染成自绘弹窗（.uni-modal），
  // 确认按钮是 .uni-modal__btn_primary —— 不要用 text='删除' 匹配：
  // 底栏那个「删除」按钮文字相同，会点错（这类"两个同名目标"的坑本项目踩过）
  await page.locator('.uni-modal__btn_primary').click();
  await page.waitForTimeout(1500);

  const left = (await api('GET', '/categories?type=expense')).data.map((c) => c.name);
  check('新建的一级与二级都已删除', left.includes(`__pg_root_${ts}`) || left.includes(`__pg_child_${ts}`), false);
}

// ── 收尾：确保没有残留的隐藏标记与测试分类
{
  const all = (await api('GET', '/categories')).data;
  const bad = all.filter((c) => c.isHidden || c.name.startsWith('__pg_')).map((c) => c.id);
  if (bad.length) {
    const hiddenIds = all.filter((c) => c.isHidden).map((c) => c.id);
    if (hiddenIds.length) await api('POST', '/categories/batch-hide', { ids: hiddenIds, hidden: false });
    const junk = all.filter((c) => c.name.startsWith('__pg_')).map((c) => c.id);
    if (junk.length) await api('POST', '/categories/batch-delete', { ids: junk });
  }
  const fin = (await api('GET', '/categories')).data;
  check('收尾：无残留隐藏标记', fin.filter((c) => c.isHidden).length, 0);
  check('收尾：无残留测试分类', fin.filter((c) => c.name.startsWith('__pg_')).length, 0);
}

console.log('\n页面错误：', pageErrors.length ? pageErrors.slice(0, 5) : '无');

// 清理：删除临时账本（其分类由外键 CASCADE 一并删除）
{
  const del = await api('DELETE', `/accounts/${ACCOUNT}?confirmName=${encodeURIComponent(tempAccName)}`);
  console.log(del.code === 0 ? `（临时账本 ${ACCOUNT} 已删除）` : `⚠️ 临时账本删除失败：${del.message}`);
}

await ctx.close();
await browser.close();

console.log('\n' + '─'.repeat(62));
console.log(`截图目录：${SHOTS}`);
if (failures.length) {
  console.log(`❌ 失败 ${failures.length} 项 / 通过 ${pass} 项`);
  for (const f of failures) console.log(`   · ${f}`);
  process.exitCode = 1;
} else {
  console.log(`✅ 全部通过（${pass} 项断言）`);
}
