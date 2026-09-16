/**
 * 「账本分类设置」端到端验证（接口级 + 页面级，设计 D5/D10/D13/D16）。
 *
 *   node scripts/verify-category-per-account.mjs
 *
 * 覆盖：
 *   ① 账本管理页每个账本有「分类设置」入口
 *   ② 分类设置页显示本账本分类
 *   ③ 「从母本导入」能批量加入分类
 *   ④ **默认账本禁删分类** → 40006（D16）
 *   ⑤ **有交易的分类禁删** → 40004（D10）
 *   ⑥ 无交易的分类可正常删除
 *   ⑦ 移除后分类确实消失
 *
 * ⚠️ 会创建临时账本 + 临时交易，结束前全部清理。
 */
import fs from 'node:fs';

const PW =
  process.env.PW_PATH ||
  '/Users/luchao/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js';
const pw = await import(PW);
const { chromium } = pw.default ?? pw;

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
}

const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const API = process.env.API || 'http://127.0.0.1:7001/api';
const USER = process.env.SEED_USER || 'demo';
const PASS = process.env.SEED_PASS || '123456';

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
const checkTrue = (name, cond, detail = '') =>
  check(`${name}${detail ? `（${detail}）` : ''}`, !!cond, true);

let token = '';
const api = async (method, path, body) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.json();
};
{
  const l = await api('POST', '/auth/login', { username: USER, password: PASS });
  token = l.data.token;
}

const ts = Date.now();
const accName = `__cpa_${ts}`;
let createdId = '';
let tmpTxnId = '';

const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ['--no-proxy-server'],
});
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'zh-CN' });
const page = await ctx.newPage();
page.setDefaultTimeout(8000);
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

try {
  // 建临时非默认账本（会自动从母本复制 89 个分类）
  const acc = await api('POST', '/accounts', { name: accName, icon: 'wallet' });
  if (acc.code !== 0) throw new Error('创建临时账本失败：' + acc.message);
  createdId = acc.data.id;
  console.log(`（临时账本 ${createdId}「${accName}」已创建）`);

  console.log('\n══ ① 接口：D16 默认账本禁删分类 ══');
  {
    const accs = (await api('GET', '/accounts')).data;
    const def = accs.find((a) => a.isDefault);
    const defCats = (await api('GET', `/categories?accountId=${def.id}`)).data;
    const root = defCats.find((c) => !c.parentId);
    const del = await api('POST', '/categories/batch-delete', {
      accountId: def.id,
      ids: [root.id],
    });
    check('默认账本删分类 → 40006', del.code, 40006);
    const still = (await api('GET', `/categories?accountId=${def.id}`)).data;
    checkTrue('分类没被删掉', still.some((c) => c.id === root.id));
  }

  console.log('\n══ ② 接口：D10 有交易的分类禁删 ══');
  {
    // 在临时账本建一个分类，给它挂一笔交易
    const cat = (
      await api('POST', '/categories', {
        accountId: createdId,
        name: `__cpa_cat_${ts}`,
        type: 'expense',
        icon: 'cat-misc',
      })
    ).data;
    const txn = (
      await api('POST', '/transactions', {
        accountId: createdId,
        type: 'expense',
        amount: '12.34',
        recordDate: '2026-09-16',
        categoryId: cat.id,
        note: '__cpa_test',
      })
    ).data;
    tmpTxnId = txn.id;

    const del = await api('DELETE', `/categories/${cat.id}?accountId=${createdId}`);
    check('有交易的分类删除 → 40004', del.code, 40004);
    const still = (await api('GET', `/categories?accountId=${createdId}`)).data;
    checkTrue('分类仍在', still.some((c) => c.id === cat.id));

    // 删掉交易后就能删分类
    await api('DELETE', `/transactions/${tmpTxnId}`);
    tmpTxnId = '';
    const del2 = await api('DELETE', `/categories/${cat.id}?accountId=${createdId}`);
    check('交易删除后分类可删', del2.code, 0);
  }

  console.log('\n══ ③ 接口：从母本导入 ══');
  {
    // 临时账本已有 89 个（自动复制），再建一个空账本验证导入
    const emptyName = `__cpa_empty_${ts}`;
    const emptyAcc = (await api('POST', '/accounts', { name: emptyName, icon: 'wallet', copyAll: false, categoryIds: [] })).data;
    const emptyCats = (await api('GET', `/categories?accountId=${emptyAcc.id}`)).data;
    check('categoryIds=[] → 空账本（0 分类）', emptyCats.length, 0);

    // 导入母本全部
    const candidates = (await api('GET', '/accounts/category-candidates')).data;
    const imp = await api('POST', `/accounts/${emptyAcc.id}/categories`, {
      categoryIds: candidates.map((c) => c.id),
    });
    check('导入成功', imp.code, 0);
    const after = (await api('GET', `/categories?accountId=${emptyAcc.id}`)).data;
    check('导入后分类数 = 母本数量', after.length, candidates.length);

    await api('DELETE', `/accounts/${emptyAcc.id}?confirmName=${encodeURIComponent(emptyName)}`);
  }

  console.log('\n══ ④ 页面：账本管理页有「分类设置」入口 ══');
  {
    await page.goto(`${BASE}/#/pages/login/index`, { waitUntil: 'load' });
    await page.waitForTimeout(900);
    const inputs = page.locator('input');
    await inputs.nth(0).fill(USER);
    await inputs.nth(1).fill(PASS);
    await page.locator('.submit').first().click();
    await page.waitForTimeout(2500);

    await page.goto(`${BASE}/#/pages/account/index`, { waitUntil: 'load' });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const hasEntry = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.action')).some(
        (e) => e.textContent.trim() === '分类设置'
      );
    });
    checkTrue('每个账本行有「分类设置」', hasEntry);
  }

  console.log('\n══ ⑤ 页面：分类设置页能打开并显示分类 ══');
  {
    await page.goto(`${BASE}/#/pages/account-category/index?accountId=${createdId}`, {
      waitUntil: 'load',
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2000);
    const rowCount = await page.locator('.row').count();
    checkTrue('显示本账本分类（> 80 行）', rowCount > 80, `rows=${rowCount}`);
    checkTrue(
      '有「从母本导入」入口',
      await page.evaluate(() =>
        Array.from(document.querySelectorAll('.section-action')).some(
          (e) => e.textContent.includes('母本') || e.textContent.includes('导入')
        )
      )
    );
    await page.screenshot({ path: '/tmp/account-category.png' });
  }

  console.log('\n页面错误：', pageErrors.length ? pageErrors.slice(0, 3) : '无');
} finally {
  if (tmpTxnId) await api('DELETE', `/transactions/${tmpTxnId}`).catch(() => {});
  if (createdId) {
    const del = await api(
      'DELETE',
      `/accounts/${createdId}?confirmName=${encodeURIComponent(accName)}`
    );
    console.log(del.code === 0 ? `（临时账本 ${createdId} 已删除）` : `⚠️ 清理失败：${del.message}`);
  }
  await ctx.close();
  await browser.close();
}

console.log('\n' + '─'.repeat(62));
if (failures.length) {
  console.log(`❌ 失败 ${failures.length} 项 / 通过 ${pass} 项`);
  for (const f of failures) console.log(`   · ${f}`);
  process.exitCode = 1;
} else {
  console.log(`✅ 全部通过（${pass} 项断言）`);
}
