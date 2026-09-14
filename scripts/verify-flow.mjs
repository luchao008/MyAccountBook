/**
 * 流水页 + 日历页运行时验证（真实浏览器）。
 *
 *   node scripts/verify-flow.mjs
 *
 * 覆盖：分组展开（含按日分组）、更多弹窗（导出/筛选/排序）、
 *       分组粒度切换（年/季/月/周/天）、分类多选、搜索框、日历页（格子/金额/FAB）。
 *
 * ⚠️ 只读不写：不创建、不修改、不删除任何数据。
 */
import fs from 'node:fs';
const PW = '/Users/luchao/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js';
const pw = await import(PW);
const { chromium } = pw.default ?? pw;
function findChrome() {
  const root = `${process.env.HOME}/Library/Caches/ms-playwright`;
  for (const d of fs.readdirSync(root).filter(x=>x.startsWith('chromium-')).sort().reverse())
    for (const arch of ['chrome-mac-arm64','chrome-mac-x64']) {
      const p = `${root}/${d}/${arch}/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
      if (fs.existsSync(p)) return p;
    }
}
let pass=0, fail=0;
const check = (n, ok, extra = '') => {
  if (ok) {
    pass += 1;
    console.log('  ✅ ' + n + ' ' + extra);
  } else {
    fail += 1;
    console.log('  ❌ ' + n + ' ' + extra);
  }
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-proxy-server'] });
const page = await (await browser.newContext({ viewport:{width:375,height:812} })).newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0,150)));

await page.goto('http://127.0.0.1:5173', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1500);
if (page.url().includes('/pages/login')) {
  const inputs = page.locator('input');
  await inputs.nth(0).fill('demo'); await inputs.nth(1).fill('123456');
  await page.getByText('登录',{exact:true}).last().click();
  await page.waitForTimeout(2500);
}
await page.goto('http://127.0.0.1:5173/#/pages/flow/index', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(3000);

console.log('[1] 展开分组');
{
  const head = page.locator('.group-head').first();
  await head.click();
  await page.waitForTimeout(2500);
  const txnCount = await page.evaluate(() => document.querySelectorAll('.txn').length);
  check('展开后出现明细行', txnCount > 0, 'txn=' + txnCount);
  const dayHeads = await page.evaluate(() => document.querySelectorAll('.day-head').length);
  check('明细按日分组', dayHeads > 0, 'day=' + dayHeads);
}

console.log('[2] 更多弹窗');
{
  await page.locator('.nav-actions .nav-btn').first().click();
  await page.waitForTimeout(700);
  const t = await page.evaluate(() => document.body.innerText);
  check('批量操作标题', t.includes('批量操作'));
  check('流水导出', t.includes('流水导出'));
  check('筛选', t.includes('筛选'));
  check('排序', t.includes('排序'));
  check('取消', t.includes('取消'));
  // 关闭
  await page.locator('.sheet-cancel').click();
  await page.waitForTimeout(500);
}

console.log('[3] 分组粒度弹层');
{
  await page.locator('.filter-item').first().click();
  await page.waitForTimeout(700);
  const t = await page.evaluate(() => document.body.innerText);
  for (const u of ['年','季','月','周','天']) check('粒度选项 ' + u, t.includes(u));
  // 选「天」
  await page.locator('.sheet-item-text', { hasText: '天' }).first().click();
  await page.waitForTimeout(2500);
  const key = await page.evaluate(() => document.querySelector('.group-title')?.textContent.trim());
  check('切到「天」后分组标题变化', /\d+月\d+日/.test(key || ''), 'title=' + key);
}

console.log('[4] 分类多选弹层');
{
  await page.locator('.filter-item').nth(1).click();
  await page.waitForTimeout(1000);
  const t = await page.evaluate(() => document.body.innerText);
  check('选择分类标题', t.includes('选择分类'));
  check('取消全选', t.includes('取消全选'));
  const rows = await page.evaluate(() => document.querySelectorAll('.cat-row').length);
  check('分类行渲染', rows > 0, 'rows=' + rows);
  // 选第一个 + 确定
  await page.locator('.cat-row').first().click();
  await page.waitForTimeout(300);
  const checked = await page.evaluate(() => document.querySelectorAll('.cat-check.checked').length);
  check('勾选生效', checked > 0, 'checked=' + checked);
  await page.locator('.btn-confirm').first().click();
  await page.waitForTimeout(2500);
  const label = await page.evaluate(() => [...document.querySelectorAll('.filter-item')].map(e=>e.textContent.trim()));
  check('筛选栏显示已选数量', JSON.stringify(label).includes('已选'), JSON.stringify(label));
}

console.log('[5] 搜索');
{
  await page.locator('.nav-actions .nav-btn').nth(2).click();
  await page.waitForTimeout(700);
  const hasBar = await page.evaluate(() => !!document.querySelector('.search-bar'));
  check('搜索框展开', hasBar);
  await page.locator('.search-input input').fill('午饭');
  await page.locator('.search-input input').press('Enter');
  await page.waitForTimeout(2500);
  /*
   * ⚠️ 这里不能写成 `groups >= 0` —— 那永远为真，等于没校验（"报告里写了断言但判定通过"
   *    比没有断言更糟）。正确的判据是"搜索后进入了某种确定的结果态"：
   *    要么有分组、要么显示空状态，**但不能是错误态或加载态**。
   */
  const state = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      groups: document.querySelectorAll('.group').length,
      empty: t.includes('该条件下暂无流水'),
      err: t.includes('加载失败'),
      loading: t.includes('加载中'),
    };
  });
  check(
    '搜索后进入确定结果态（分组 / 空 / 非错误）',
    !state.err && !state.loading && (state.groups > 0 || state.empty),
    JSON.stringify(state)
  );
}

console.log('[6] 日历页');
{
  await page.goto('http://127.0.0.1:5173/#/pages/calendar/index', { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(3000);
  const cells = await page.evaluate(() => document.querySelectorAll('.day').length);
  check('日历格子渲染', cells >= 28, 'cells=' + cells);
  const fab = await page.evaluate(() => !!document.querySelector('.fab'));
  check('FAB 存在', fab);
  const amounts = await page.evaluate(() => document.querySelectorAll('.day-amount').length);
  check('格子显示金额', amounts > 0, 'amounts=' + amounts);
  await page.screenshot({ path: '/tmp/calendar.png', fullPage: true });
}

console.log(`\n结果：PASS=${pass} FAIL=${fail}`);
await browser.close();
process.exit(fail>0?1:0);
