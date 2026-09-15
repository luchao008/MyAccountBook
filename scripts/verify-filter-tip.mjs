/**
 * 流水页「已筛选」提示条运行时验证（真实浏览器）。
 *
 *   node scripts/verify-filter-tip.mjs
 *
 * 覆盖：无筛选时不显示 / 设置筛选后出现且文案正确 / 点「查看全部」弹出条件摘要
 *       （条件行 + 两个按钮）/ 「查看全部流水」清空并隐藏提示条 /
 *       「修改筛选条件」打开筛选面板。
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
await page.goto('http://127.0.0.1:5173/#/pages/flow/index', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(3000);

console.log('[1] 无筛选时不显示提示条');
var t0 = await page.evaluate(function(){ return !!document.querySelector('.filter-tip'); });
check('初始无提示条', !t0);

console.log('[2] 设置筛选后出现提示条');
await page.locator('.nav-actions .nav-btn').first().click();
await page.waitForTimeout(700);
await page.locator('.sheet-item-text', { hasText: '筛选' }).first().click();
await page.waitForTimeout(900);
// 填金额区间
var amtInputs = page.locator('.amount-input input');
await amtInputs.nth(0).fill('1');
await page.waitForTimeout(300);
await page.locator('.btn-confirm').first().click();
await page.waitForTimeout(2500);

var tip = await page.evaluate(function(){
  var el = document.querySelector('.filter-tip');
  return el ? { text: el.textContent.trim(), rect: Math.round(el.getBoundingClientRect().top) } : null;
});
check('提示条出现', !!tip, JSON.stringify(tip));
check('文案正确', !!tip && tip.text.indexOf('已筛选，当前只展示部分流水') >= 0, tip&&tip.text);
check('含「查看全部」', !!tip && tip.text.indexOf('查看全部') >= 0);
await page.screenshot({ path: '/tmp/tip-bar.png' });

console.log('[3] 点查看全部 → 弹层');
await page.locator('.filter-tip-action').click();
await page.waitForTimeout(900);
var sheet = await page.evaluate(function(){
  var rows = Array.from(document.querySelectorAll('.summary-row')).map(function(r){ return r.textContent.trim(); });
  var btns = Array.from(document.querySelectorAll('.summary-btn-text')).map(function(b){ return b.textContent.trim(); });
  return { title: document.querySelector('.sheet-header-title') && document.querySelector('.sheet-header-title').textContent.trim(), rows: rows, btns: btns };
});
check('弹层标题「筛选条件」', sheet.title === '筛选条件', sheet.title);
check('展示金额区间行', sheet.rows.some(function(r){return r.indexOf('金额区间') >= 0;}), JSON.stringify(sheet.rows));
check('两个按钮', JSON.stringify(sheet.btns) === '["查看全部流水","修改筛选条件"]', JSON.stringify(sheet.btns));
await page.screenshot({ path: '/tmp/tip-sheet.png' });

console.log('[4] 点「查看全部流水」→ 清空筛选');
await page.locator('.summary-btn-ghost').click();
await page.waitForTimeout(2500);
var after = await page.evaluate(function(){ return !!document.querySelector('.filter-tip'); });
check('清空后提示条消失', !after);

console.log('[5] 再筛选 → 点「修改筛选条件」→ 打开筛选面板');
await page.locator('.nav-actions .nav-btn').first().click();
await page.waitForTimeout(700);
await page.locator('.sheet-item-text', { hasText: '筛选' }).first().click();
await page.waitForTimeout(900);
await page.locator('.amount-input input').nth(0).fill('1');
await page.waitForTimeout(300);
await page.locator('.btn-confirm').first().click();
await page.waitForTimeout(2500);
await page.locator('.filter-tip-action').click();
await page.waitForTimeout(900);
await page.locator('.summary-btn-solid').click();
await page.waitForTimeout(900);
var panel = await page.evaluate(function(){
  return { hasFilterPanel: !!document.querySelector('.amount-input'), title: document.body.innerText.indexOf('筛选') >= 0 };
});
check('打开了筛选面板', panel.hasFilterPanel, JSON.stringify(panel));

console.log('\n结果：PASS='+pass+' FAIL='+fail);
await browser.close();
