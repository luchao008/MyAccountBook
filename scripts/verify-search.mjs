/**
 * 流水页全屏搜索运行时验证（真实浏览器）。
 *
 *   node scripts/verify-search.mjs
 *
 * 覆盖：点放大镜进入全屏搜索页（覆盖整个视口 + 取消按钮）/ 搜分类名 /
 *       结果概览（「流水」+ 收支合计）/ 结果平铺无分组 / 搜金额 / 空状态 /
 *       取消返回流水页 / 搜索不影响筛选提示条。
 *
 * ⚠️ 只读不写：不创建、不修改、不删除任何数据。
 * ⚠️ 金额搜索的测试值必须从**当前账本**取 —— 搜索带 accountId（数据隔离边界），
 *    写死金额可能落在别的账本里、搜不到。
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

console.log('[1] 点放大镜 → 全屏搜索页');
await page.locator('.nav-actions .nav-btn').nth(2).click();
await page.waitForTimeout(900);
var pg = await page.evaluate(function(){
  var el = document.querySelector('.search-page');
  if (!el) return null;
  var r = el.getBoundingClientRect();
  return {
    top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight,
    hasBox: !!document.querySelector('.search-box-input'),
    hasCancel: !!document.querySelector('.search-cancel-text'),
    cancelText: document.querySelector('.search-cancel-text') && document.querySelector('.search-cancel-text').textContent.trim(),
  };
});
check('全屏搜索页出现', !!pg, JSON.stringify(pg));
check('覆盖整个视口', !!pg && pg.top <= 1 && pg.bottom >= pg.vh - 1, JSON.stringify(pg));
check('有搜索输入框', !!pg && pg.hasBox);
check('有「取消」', !!pg && pg.cancelText === '取消', pg && pg.cancelText);
await page.screenshot({ path: '/tmp/search-page.png' });

console.log('[2] 搜分类名（私家车）');
await page.locator('.search-box-input input').fill('私家车');
await page.locator('.search-box-input input').press('Enter');
await page.waitForTimeout(2500);
var r1 = await page.evaluate(function(){
  return {
    rows: document.querySelectorAll('.search-txn').length,
    hasSummary: !!document.querySelector('.search-summary'),
    title: document.querySelector('.search-summary-title') && document.querySelector('.search-summary-title').textContent.trim(),
    firstMeta: document.querySelector('.search-txn .txn-meta') && document.querySelector('.search-txn .txn-meta').textContent.trim(),
  };
});
check('搜出结果', r1.rows > 0, 'rows=' + r1.rows);
check('有「流水」概览标题', r1.title === '流水', r1.title);
check('结果行副标题含日期', /\d{4}\.\d{2}\.\d{2}/.test(r1.firstMeta||''), r1.firstMeta);
// ⚠️ 判据要限定在**搜索页内部** —— 主列表的 .group 仍在 DOM 里（被搜索页盖住），
//    直接查全局会误判。
check(
  '结果平铺（搜索页内无分组）',
  await page.evaluate(function(){
    var sp = document.querySelector('.search-page');
    return sp ? sp.querySelectorAll('.group').length === 0 : false;
  })
);
await page.screenshot({ path: '/tmp/search-results.png' });

console.log('[3] 搜金额');
/*
 * ⚠️ 金额要用**当前账本里真实存在**的值 —— 搜索带 accountId（数据隔离边界），
 *    所以随便挑一个金额可能落在别的账本里、搜不到（实测 88.00 在账本 136，当前账本 3）。
 *    这里先从接口取当前账本的第一笔金额，再拿它去搜。
 */
var someAmount = await page.evaluate(async function () {
  var token = localStorage.getItem('token');
  var accId = localStorage.getItem('currentAccountId');
  var res = await fetch('/api/transactions?size=1' + (accId ? '&accountId=' + accId : ''), {
    headers: { Authorization: 'Bearer ' + token },
  });
  var body = await res.json();
  return body && body.data && body.data.list[0] ? body.data.list[0].amount : null;
});
console.log('  用当前账本的金额搜索:', someAmount);
await page.locator('.search-box-input input').fill(someAmount || '1');
await page.locator('.search-box-input input').press('Enter');
await page.waitForTimeout(2500);
var r2 = await page.evaluate(function(){ return document.querySelectorAll('.search-txn').length; });
check('金额搜索有结果', r2 > 0, 'rows=' + r2 + ' 金额=' + someAmount);

console.log('[4] 搜不存在的关键词 → 空状态');
await page.locator('.search-box-input input').fill('zzz不存在xyz');
await page.locator('.search-box-input input').press('Enter');
await page.waitForTimeout(2500);
var empty = await page.evaluate(function(){
  return { rows: document.querySelectorAll('.search-txn').length, text: document.body.innerText.indexOf('没有找到相关流水') >= 0 };
});
check('空状态提示', empty.rows === 0 && empty.text, JSON.stringify(empty));

console.log('[5] 取消 → 回到流水页');
await page.locator('.search-cancel').click();
await page.waitForTimeout(900);
var back = await page.evaluate(function(){
  return { gone: !document.querySelector('.search-page'), hasHeader: !!document.querySelector('.header') };
});
check('搜索页关闭', back.gone);
check('回到流水页', back.hasHeader);

console.log('[6] 搜索不影响筛选提示条');
var tip = await page.evaluate(function(){ return !!document.querySelector('.filter-tip'); });
check('关闭搜索后无筛选提示条', !tip);

console.log('\n结果：PASS='+pass+' FAIL='+fail);
await browser.close();
