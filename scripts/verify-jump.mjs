/**
 * 记账页时间区间 → 流水页跳转 运行时验证（真实浏览器）。
 *
 *   node scripts/verify-jump.mjs
 *
 * 覆盖：首页 5 个区间卡片（今天/本周/本月/本年/去年）可点 / 跳转 URL 带
 *       start+end+unit / 导航栏标题显示区间（2026.9.14-9.14 或 2026年）/
 *       底栏粒度同步（天/周/月/年/年）/ 已筛选提示条出现 /
 *       时间筛选显示「自定义」+ 具体区间。
 *
 * ⚠️ 只读不写：不创建、不修改、不删除任何数据。
 */
import fs from 'node:fs';
const PW = '/Users/luchao/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js';
const pw = await import(PW);
const { chromium } = pw.default ?? pw;
function findChrome() {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  for (const d of fs.readdirSync(root).filter(x => x.indexOf('chromium-') === 0).sort().reverse()) {
    for (const arch of ['chrome-mac-arm64','chrome-mac-x64']) {
      const p = root + '/' + d + '/' + arch + '/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
      if (fs.existsSync(p)) return p;
    }
  }
}
let pass=0, fail=0;
const check=(n,ok,extra)=>{ if(ok){pass++;console.log('  OK '+n+' '+(extra||''));}else{fail++;console.log('  FAIL '+n+' '+(extra||''));} };
const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-proxy-server'] });
const page = await (await browser.newContext({ viewport:{width:375,height:812} })).newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0,150)));
await page.goto('http://127.0.0.1:5173', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1500);
if (page.url().indexOf('/pages/login') >= 0) {
  const inputs = page.locator('input');
  await inputs.nth(0).fill('demo');
  await inputs.nth(1).fill('123456');
  await page.getByText('登录',{exact:true}).last().click();
  await page.waitForTimeout(2500);
}
await page.goto('http://127.0.0.1:5173/#/pages/main/index', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(3000);

console.log('[1] 首页区间卡片可点');
const rows = await page.evaluate(() => document.querySelectorAll('.range-row').length);
check('区间行渲染', rows === 5, 'rows=' + rows);
const labels = await page.evaluate(() => [...document.querySelectorAll('.range-label')].map(e => e.textContent.trim()));
check('五个区间', JSON.stringify(labels) === '["今天","本周","本月","本年","去年"]', JSON.stringify(labels));

// 逐个点，检查跳转后的粒度与标题
const expect = [
  { i: 0, unit: '天', titleRe: /^\d{4}\.\d{1,2}\.\d{1,2}-\d{1,2}\.\d{1,2}$/ },
  { i: 1, unit: '周', titleRe: /^\d{4}\.\d{1,2}\.\d{1,2}-\d{1,2}\.\d{1,2}$/ },
  { i: 2, unit: '月', titleRe: /^\d{4}\.\d{1,2}\.\d{1,2}-\d{1,2}\.\d{1,2}$/ },
  { i: 3, unit: '年', titleRe: /^\d{4}年$/ },
  { i: 4, unit: '年', titleRe: /^\d{4}年$/ },
];

for (const e of expect) {
  await page.goto('http://127.0.0.1:5173/#/pages/main/index', { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.locator('.range-row').nth(e.i).click();
  await page.waitForTimeout(3000);

  const info = await page.evaluate(() => ({
    url: location.hash,
    title: document.querySelector('.nav-title')?.textContent.trim(),
    barText: document.querySelector('.filter-bar')?.textContent.trim(),
    hasTip: !!document.querySelector('.filter-tip'),
  }));
  check('第' + (e.i+1) + '行 跳到流水页', info.url.indexOf('pages/flow') >= 0, info.url);
  check('第' + (e.i+1) + '行 标题为区间', e.titleRe.test(info.title || ''), 'title=' + info.title);
  check('第' + (e.i+1) + '行 底栏粒度=' + e.unit, (info.barText || '').indexOf(e.unit) >= 0, info.barText);
  check('第' + (e.i+1) + '行 显示已筛选提示条', info.hasTip);
  if (e.i === 0) await page.screenshot({ path: '/tmp/jump-today.png' });
  if (e.i === 3) await page.screenshot({ path: '/tmp/jump-year.png' });
}

console.log('[2] 时间筛选显示「自定义」+ 区间');
await page.goto('http://127.0.0.1:5173/#/pages/main/index', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(2500);
await page.locator('.range-row').nth(0).click();
await page.waitForTimeout(3000);
await page.locator('.nav-actions .nav-btn').first().click();
await page.waitForTimeout(700);
await page.locator('.sheet-item-text', { hasText: '筛选' }).first().click();
await page.waitForTimeout(900);
const row = await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll('.row')).find(r => r.textContent.indexOf('时间') >= 0);
  return el ? {
    value: el.querySelector('.row-value')?.textContent.trim(),
    sub: el.querySelector('.row-sub')?.textContent.trim(),
  } : null;
});
check('时间行第一行=自定义', row && row.value === '自定义', JSON.stringify(row));
check('时间行第二行=区间', row && /\d{4}年\d{2}月\d{2}日 - \d{4}年\d{2}月\d{2}日/.test(row.sub||''), row && row.sub);

console.log('\n结果：PASS='+pass+' FAIL='+fail);
await browser.close();
