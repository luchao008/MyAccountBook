/**
 * 「新建账本选分类」端到端验证（真实浏览器，设计 D3/D4/D6/D9/D17）。
 *
 *   node scripts/verify-account-category.mjs
 *
 * 覆盖：
 *   ① 账本管理页「+ 新建账本」跳转到独立页
 *   ② 新建页有账本名输入 + 分类勾选树
 *   ③ **默认全选**（D3）
 *   ④ 取消一个一级 → 其下二级一并取消（勾一级连带二级，D9）
 *   ⑤ 只勾一个二级 → 其父自动带上（D17）
 *   ⑥ 提交后新账本创建成功，且**只复制了勾选的分类**
 *   ⑦ 空账本名时按钮禁用
 *
 * ⚠️ 会创建并删除一个临时账本，结束前清理干净。
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

const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ['--no-proxy-server'],
});
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 },
  locale: 'zh-CN',
});
const page = await ctx.newPage();
page.setDefaultTimeout(8000);
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

await page.goto(`${BASE}/#/pages/login/index`, { waitUntil: 'load' });
await page.waitForTimeout(900);
const inputs = page.locator('input');
await inputs.nth(0).fill(USER);
await inputs.nth(1).fill(PASS);
await page.locator('.submit').first().click();
await page.waitForTimeout(2500);

const ts = Date.now();
const accName = `__ac_${ts}`;
let createdId = '';

try {
  console.log('\n══ ① 账本管理页「+ 新建账本」跳转 ══');
  await page.goto(`${BASE}/#/pages/account/index`, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);
  check('有「+ 新建账本」按钮', await page.locator('.add-btn-block').count(), 1);
  await page.locator('.add-btn-block').click();
  await page.waitForTimeout(1500);
  checkTrue('跳到新建账本页', page.url().includes('/pages/account-new/index'), page.url());

  console.log('\n══ ② 新建页结构 ══');
  check('有账本名输入框', await page.locator('.input').count(), 1);
  checkTrue('有分类勾选树', (await page.locator('.row').count()) > 10, `rows=${await page.locator('.row').count()}`);

  console.log('\n══ ③ 默认全选 ══');
  {
    const counts = await page.evaluate(() => ({
      boxes: document.querySelectorAll('.checkbox').length,
      checked: document.querySelectorAll('.checkbox.checked').length,
    }));
    check('所有勾选框默认选中', counts.checked, counts.boxes);
    checkTrue('勾选框数量 > 80', counts.boxes > 80, `boxes=${counts.boxes}`);
  }

  console.log('\n══ ④ 取消一级 → 其下二级一并取消 ══');
  {
    // 记录第一个一级及其子数量
    const before = await page.evaluate(() => {
      const root = document.querySelector('.row');
      const rootName = root.querySelector('.row-label').textContent.trim();
      // 该一级之后、下一个一级之前的子行
      const rows = Array.from(document.querySelectorAll('.check-tree .row'));
      const idx = rows.indexOf(root);
      let childCount = 0;
      for (let i = idx + 1; i < rows.length; i++) {
        if (!rows[i].classList.contains('row-child')) break;
        childCount++;
      }
      return { rootName, childCount };
    });
    checkTrue('第一个一级有子分类', before.childCount > 0, `${before.rootName} 有 ${before.childCount} 个子`);

    // 点第一个一级行（取消勾选）
    await page.locator('.row').first().click();
    await page.waitForTimeout(400);
    const after = await page.evaluate((rc) => {
      const root = document.querySelector('.row');
      const rootChecked = root.querySelector('.checkbox').classList.contains('checked');
      // 统计该一级下的子行有多少仍勾选
      const rows = Array.from(document.querySelectorAll('.check-tree .row'));
      const idx = rows.indexOf(root);
      let childChecked = 0;
      for (let i = idx + 1; i < rows.length; i++) {
        if (!rows[i].classList.contains('row-child')) break;
        if (rows[i].querySelector('.checkbox').classList.contains('checked')) childChecked++;
      }
      return { rootChecked, childChecked, expectChildren: rc };
    }, before.childCount);
    check('一级变未勾选', after.rootChecked, false);
    check('其下二级全部取消', after.childChecked, 0);
    await page.screenshot({ path: '/tmp/account-new-uncheck.png' });
  }

  console.log('\n══ ⑤ 只勾一个二级 → 父自动带上 ══');
  {
    // 清空所有勾选（确定性：不依赖按钮文字状态）
    //   当前全选 → 点一次变空；当前部分选中 → 点一次全选、再点一次变空。
    const clickAll = () =>
      page.evaluate(() => {
        const el = document.querySelector('.section-action');
        if (el) el.click();
      });
    let guard = 0;
    while (
      (await page.evaluate(() => document.querySelectorAll('.checkbox.checked').length)) > 0 &&
      guard < 4
    ) {
      await clickAll();
      await page.waitForTimeout(300);
      guard += 1;
    }
    const cleared = await page.evaluate(
      () => document.querySelectorAll('.checkbox.checked').length
    );
    check('清空后 0 勾选', cleared, 0);

    // 点第一个二级行
    const picked = await page.evaluate(() => {
      const child = document.querySelector('.row-child');
      if (!child) return null;
      const name = child.querySelector('.row-label').textContent.trim();
      child.click();
      return { name };
    });
    checkTrue('点到第一个二级', !!picked, picked ? picked.name : 'none');
    await page.waitForTimeout(400);

    const state = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.check-tree .row'));
      const rootIdx = rows.findIndex((r) => !r.classList.contains('row-child'));
      const childIdx = rows.findIndex((r) => r.classList.contains('row-child'));
      return {
        rootChecked: rows[rootIdx].querySelector('.checkbox').classList.contains('checked'),
        rootIndeterminate: rows[rootIdx]
          .querySelector('.checkbox')
          .classList.contains('indeterminate'),
        childChecked: rows[childIdx].querySelector('.checkbox').classList.contains('checked'),
      };
    });
    check('二级被勾选', state.childChecked, true);
    checkTrue('父级显示半选态（未全选）', state.rootIndeterminate && !state.rootChecked, JSON.stringify(state));
  }

  console.log('\n══ ⑥ 空账本名时按钮禁用 ══');
  {
    const disabled = await page.evaluate(() => {
      const btn = document.querySelector('.btn');
      return btn ? btn.classList.contains('disabled') : null;
    });
    check('名字为空 → 创建按钮 disabled', disabled, true);
  }

  console.log('\n══ ⑦ 提交创建（只复制勾选分类）══');
  {
    await page.locator('.input input').fill(accName);
    await page.waitForTimeout(300);
    const notDisabled = await page.evaluate(() => {
      const btn = document.querySelector('.btn');
      return btn ? !btn.classList.contains('disabled') : null;
    });
    check('填名字后按钮可用', notDisabled, true);

    await page.locator('.btn').click();
    await page.waitForTimeout(2500);

    const accs = (await api('GET', '/accounts')).data;
    const created = accs.find((a) => a.name === accName);
    checkTrue('新账本已创建', !!created, accName);
    if (created) {
      createdId = created.id;
      const cats = (await api('GET', `/categories?accountId=${createdId}`)).data;
      // 只勾了一个二级 + 其父（D17）→ 应为 2 个
      check('只复制了勾选的分类（二级 + 其父 = 2）', cats.length, 2);
    }
  }

  console.log('\n页面错误：', pageErrors.length ? pageErrors.slice(0, 3) : '无');
} finally {
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
