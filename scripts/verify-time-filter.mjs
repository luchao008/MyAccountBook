import fs from 'node:fs';
const PW = '/Users/luchao/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js';
const pw = await import(PW);
const { chromium } = pw.default ?? pw;
function findChrome() {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  for (const d of fs.readdirSync(root).filter(function(x){return x.indexOf('chromium-')===0;}).sort().reverse()) {
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
page.on('pageerror', function(e){ console.log('[pageerror]', e.message.slice(0,150)); });
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

console.log('[1] 打开筛选面板');
await page.locator('.nav-actions .nav-btn').first().click();
await page.waitForTimeout(700);
await page.locator('.sheet-item-text', { hasText: '筛选' }).first().click();
await page.waitForTimeout(900);
var t = await page.evaluate(function(){ return document.body.innerText; });
check('筛选面板打开', t.indexOf('筛选') >= 0 && t.indexOf('时间') >= 0);
await page.screenshot({ path: '/tmp/filter-panel.png' });

console.log('[2] 打开时间弹层');
await page.locator('.row', { hasText: '时间' }).first().click();
await page.waitForTimeout(900);
var opts = await page.evaluate(function(){
  return Array.from(document.querySelectorAll('.sheet-item-text')).map(function(e){return e.textContent.trim();});
});
check('预设含全部时间', opts.indexOf('全部时间') >= 0, JSON.stringify(opts));
check('预设含去年', opts.indexOf('去年') >= 0);
check('预设含自定义', opts.indexOf('自定义') >= 0);
check('有确定按钮', (await page.locator('.sheet-footer .btn-confirm').count()) > 0);
await page.screenshot({ path: '/tmp/time-presets.png' });

console.log('[3] 选自定义 → 展开滚轮');
await page.locator('.sheet-item-text', { hasText: '自定义' }).first().click();
await page.waitForTimeout(800);
var rp = await page.evaluate(function(){
  var p = document.querySelector('.range-panel');
  if (!p) return null;
  return {
    labels: Array.from(p.querySelectorAll('.range-tab-label')).map(function(e){return e.textContent.trim();}),
    values: Array.from(p.querySelectorAll('.range-tab-value')).map(function(e){return e.textContent.trim();}),
    /*
     * ⚠️ 不查 `picker-view-column` —— uni-app 会把它渲染进内部的 DIV，
     *    不是 `uni-picker-view` 的直系子元素（实测子元素是 UNI-RESIZE-SENSOR + DIV）。
     *    改查渲染出来的选项节点（.wheel-item），这层是稳定的。
     */
    wheels: p.querySelectorAll('uni-picker-view').length,
    wheelItems: p.querySelectorAll('.wheel-item').length,
    activeLine: p.querySelectorAll('.range-tab-line').length,
  };
});
check('自定义面板展开', !!rp, JSON.stringify(rp));
check('两端标签为 开始时间/结束时间', !!rp && JSON.stringify(rp.labels)==='["开始时间","结束时间"]', rp&&JSON.stringify(rp.labels));
check('日期格式为 X年X月X日', !!rp && /^\d{4}年\d{2}月\d{2}日$/.test(rp.values[0]), rp&&rp.values[0]);
check('滚轮存在且渲染出选项', !!rp && rp.wheels>=1 && rp.wheelItems>0, rp&&('picker='+rp.wheels+' items='+rp.wheelItems));
check('有选中端下划线', !!rp && rp.activeLine===1);

// 「确定」必须可见可点（回归：内容超长时曾被挤出屏幕）
var footerVisible = await page.evaluate(function(){
  var f = document.querySelector('.sheet-footer');
  if (!f) return null;
  var r = f.getBoundingClientRect();
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight };
});
check(
  '「确定」按钮在视口内（未被挤出屏幕）',
  !!footerVisible && footerVisible.bottom <= footerVisible.vh,
  JSON.stringify(footerVisible)
);
await page.screenshot({ path: '/tmp/time-custom.png' });

console.log('[4] 切到结束端');
await page.locator('.range-tab').nth(1).click();
await page.waitForTimeout(500);
var active = await page.evaluate(function(){
  return Array.from(document.querySelectorAll('.range-tab-value')).map(function(e){return e.classList.contains('active');});
});
check('结束端变为激活', JSON.stringify(active)==='[false,true]', JSON.stringify(active));

console.log('[5] 确定 → 筛选面板显示两行');
await page.locator('.sheet-footer .btn-confirm').first().click();
await page.waitForTimeout(1200);
var row = await page.evaluate(function(){
  var el = Array.from(document.querySelectorAll('.row')).find(function(r){ return r.textContent.indexOf('时间') >= 0; });
  if (!el) return null;
  return {
    value: el.querySelector('.row-value') && el.querySelector('.row-value').textContent.trim(),
    sub: el.querySelector('.row-sub') && el.querySelector('.row-sub').textContent.trim(),
  };
});
check('第一行显示「自定义」', !!row && row.value==='自定义', JSON.stringify(row));
check('第二行显示日期区间', !!row && /\d{4}年\d{2}月\d{2}日 - \d{4}年\d{2}月\d{2}日/.test(row.sub||''), row&&row.sub);
await page.screenshot({ path: '/tmp/filter-two-row.png' });

console.log('[6] 筛选面板「确定」后才真正应用');
await page.locator('.btn-confirm').first().click();
await page.waitForTimeout(2500);
var applied = await page.evaluate(function(){
  return { panelGone: !document.querySelector('.sheet') };
});
check('点确定后筛选面板关闭', applied.panelGone, JSON.stringify(applied));

console.log('\n结果：PASS='+pass+' FAIL='+fail);
await browser.close();
