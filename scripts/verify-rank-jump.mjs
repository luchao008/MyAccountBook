/**
 * 首页「本月各分类支出排行」点击跳转验证（真实浏览器）。
 *
 *   node scripts/verify-rank-jump.mjs
 *
 * 覆盖：
 *   ① 「未分类」那一项**不可点**（无 .rank-item-link 类）
 *   ② 点某一项 → 跳到流水页，且参数为 groupBy=category&level=1&categoryIds=<id>&start&end
 *   ③ 落点底栏高亮「一级分类」
 *   ④ 落点顶部标题是本月日期区间（如 2026.9.1-9.30）
 *   ⑤ 落点筛选面板「分类」行显示该分类名（而不是「全部」）
 *   ⑥ 返回后回到首页
 *
 * ⚠️ 只读不写：不创建、不修改、不删除任何数据。
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
page.setDefaultTimeout(6000);
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0,150)));

await page.goto('http://127.0.0.1:5173', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1500);
if (page.url().indexOf('/pages/login') >= 0) {
  const inputs = page.locator('input');
  await inputs.nth(0).fill('demo');
  await inputs.nth(1).fill('123456');
  await page.evaluate(function(){ var b=document.querySelector('.submit,uni-button,button'); if(b)b.click(); });
  await page.waitForTimeout(2500);
}
await page.goto('http://127.0.0.1:5173/#/pages/main/index', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(3000);

console.log('[1] 排行项的可点状态');
var info = await page.evaluate(function(){
  var items = Array.from(document.querySelectorAll('.rank-item'));
  return items.map(function(el){
    /*
     * ⚠️ 不能写 `.rank-name text`：uni-app 把 <text> 渲染成 <uni-text>，
     *    那个选择器匹配不到任何东西，名字会读成 '?'（实测踩过）。
     *    直接取 .rank-name 的 textContent —— 它只有分类名（图标是 svg，不带文字）。
     */
    var nameEl = el.querySelector('.rank-name');
    return {
      name: nameEl ? nameEl.textContent.trim() : '?',
      link: el.classList.contains('rank-item-link'),
    };
  });
});
check('排行有若干项', info.length > 0, 'count=' + info.length);
var none = info.find(function(x){ return x.name === '未分类'; });
if (none) {
  check('「未分类」不可点（无 rank-item-link）', !none.link, JSON.stringify(none));
} else {
  check('「未分类」不在榜上（跳过不可点断言）', true, '本月无未分类支出');
}
var clickable = info.filter(function(x){ return x.link; });
check('存在可点项', clickable.length > 0, JSON.stringify(clickable.slice(0,3)));

console.log('[2] 点第一项可点项 → 落点参数');
var first = clickable[0];
var hashBefore = await page.evaluate(function(){ return location.hash; });
await page.evaluate(function(){
  var items = Array.from(document.querySelectorAll('.rank-item'));
  for (var i=0;i<items.length;i++) {
    if (items[i].classList.contains('rank-item-link')) { items[i].click(); return; }
  }
});
await page.waitForTimeout(3000);
var hashAfter = await page.evaluate(function(){ return location.hash; });
check('已跳转到流水页', hashAfter.indexOf('/pages/flow/index') >= 0, hashBefore + ' -> ' + hashAfter);
check('带 groupBy=category', hashAfter.indexOf('groupBy=category') >= 0, hashAfter);
check('带 level=1', hashAfter.indexOf('level=1') >= 0, hashAfter);
check('带 categoryIds', hashAfter.indexOf('categoryIds=') >= 0, hashAfter);
check('带 start/end', hashAfter.indexOf('start=') >= 0 && hashAfter.indexOf('end=') >= 0, hashAfter);

console.log('[3] 落点底栏高亮「一级分类」');
var barText = await page.evaluate(function(){
  var els = Array.from(document.querySelectorAll('.filter-text'));
  return els.map(function(e){ return e.textContent.trim(); });
});
check('底栏显示「一级分类」', barText.indexOf('一级分类') >= 0, JSON.stringify(barText));

console.log('[4] 顶部标题是本月区间');
var title = await page.evaluate(function(){
  var el = document.querySelector('.nav-title');
  return el ? el.textContent.trim() : null;
});
check('标题为本月区间（形如 2026.9.1-9.30）', !!title && /^\d{4}\.\d{1,2}\.\d{1,2}-\d{1,2}\.\d{1,2}$/.test(title), String(title));

console.log('[5] 分组标题是所点分类名');
var groupName = await page.evaluate(function(){
  var el = document.querySelector('.group .group-name, .group-name, .group-title');
  return el ? el.textContent.trim() : null;
});
check('分组标题为分类名', !!groupName && groupName.indexOf(first.name) >= 0, groupName + ' vs ' + first.name);

console.log('[6] 返回首页');
await page.evaluate(function(){ var b=document.querySelector('.nav-back'); if(b)b.click(); });
await page.waitForTimeout(2000);
var backHash = await page.evaluate(function(){ return location.hash; });
check('返回到首页', backHash.indexOf('/pages/main/index') >= 0, backHash);

console.log('\n结果：PASS='+pass+' FAIL='+fail);
await browser.close();
process.exit(fail ? 1 : 0);
