/**
 * 流水页「分类筛选」运行时验证（真实浏览器）。
 *
 *   node scripts/verify-category-filter.mjs
 *
 * 覆盖：
 *   ① 筛选面板行顺序为 时间 → 分类 → 类型 → 金额 → 备注；分类默认「全部」
 *   ② 点「分类」→ 弹层出现（标题 / 默认全展开 / 默认全选）
 *   ③ 只勾一个二级 → 面板分类行显示「一级 / 二级」
 *   ④ **★ 再点筛选面板的「确定」→ 分类筛选仍生效**（09-15 那个 bug 的同类场景：
 *      叠层子弹层的字段必须受控同步，否则回面板点确定会被旧值覆盖）
 *   ⑤ 「已筛选」提示条出现，条件摘要含「分类」
 *   ⑥ 「查看全部」→ 分类复位为「全部」，提示条消失
 *
 * ⚠️ **「分类维度下时间筛选也生效」（2026-09-15 约定反转）不在这里验** ——
 *    那是后端 `summaryByCategory()` 的行为，由
 *    `test/transaction.service.test.ts` 的三条用例覆盖（比 UI 侧可靠得多）。
 *    这里**不写"永远通过"的占位断言**：报告里写了问题却判定通过，比没有脚本更糟。
 *
 * ⚠️ 只读不写：不创建、不修改、不删除任何数据。
 *
 * ⚠️ uni-app H5 把 <view> 渲染成 <uni-view> 自定义元素，Playwright 直接 click
 *    常被 hit-test 拦（"subtree intercepts pointer events"），所以点击一律走 evaluate。
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

/** 按文本点（evaluate 点击，绕开 uni-view 的 hit-test 问题） */
async function clickByText(sel, text, nth) {
  return await page.evaluate(function(a){
    var list = Array.from(document.querySelectorAll(a.sel)).filter(function(e){ return e.textContent.indexOf(a.text) >= 0; });
    var el = list[a.nth || 0];
    if (!el) return false;
    el.click();
    return true;
  }, { sel, text, nth: nth || 0 });
}
/** 点第 n 个匹配元素 */
async function clickNth(sel, n) {
  return await page.evaluate(function(a){
    var el = document.querySelectorAll(a.sel)[a.n];
    if (!el) return false;
    el.click();
    return true;
  }, { sel, n: n || 0 });
}
/** 读筛选面板里某个标签行的右侧文案 */
async function rowValue(label) {
  return await page.evaluate(function(l){
    var rows = Array.from(document.querySelectorAll('.row'));
    for (var i=0;i<rows.length;i++) {
      var el = rows[i].querySelector('.row-label');
      if (el && el.textContent.trim() === l) {
        var v = rows[i].querySelector('.row-value');
        return v ? v.textContent.trim() : '(no-value)';
      }
    }
    return '(no-row)';
  }, label);
}

await page.goto('http://127.0.0.1:5173', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1500);
if (page.url().indexOf('/pages/login') >= 0) {
  const inputs = page.locator('input');
  await inputs.nth(0).fill('demo');
  await inputs.nth(1).fill('123456');
  await clickByText('.submit, uni-button, button', '登录');
  await page.waitForTimeout(2500);
}
await page.goto('http://127.0.0.1:5173/#/pages/flow/index', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(3000);

async function openFilterPanel() {
  // 顶栏第一个图标 = 更多 → 弹层里点「筛选」
  await page.evaluate(function(){
    var b = document.querySelector('.nav-actions .nav-btn');
    if (b) b.click();
  });
  await page.waitForTimeout(800);
  await clickByText('.sheet-item-text', '筛选');
  await page.waitForTimeout(1000);
}

console.log('[1] 筛选面板行顺序 + 分类默认「全部」');
await openFilterPanel();
var order = await page.evaluate(function(){
  return Array.from(document.querySelectorAll('.row .row-label')).map(function(e){return e.textContent.trim();});
});
check('行顺序 时间 → 分类 → 类型 → 金额 → 备注',
  JSON.stringify(order) === '["时间","分类","类型","金额","备注"]', JSON.stringify(order));
var v0 = await rowValue('分类');
check('分类行默认「全部」', v0 === '全部', v0);

console.log('[2] 点「分类」→ 弹层出现');
await clickByText('.row .row-label', '分类');
await page.waitForTimeout(1000);
var info = await page.evaluate(function(){
  var titles = Array.from(document.querySelectorAll('.header-title')).map(function(t){return t.textContent.trim();});
  return {
    titles: titles,
    boxes: document.querySelectorAll('.checkbox').length,
    checked: document.querySelectorAll('.checkbox.checked').length,
    children: document.querySelectorAll('.row-child').length,
  };
});
check('弹层标题「选择分类」', info.titles.indexOf('选择分类') >= 0, JSON.stringify(info.titles));
check('默认全展开（有二级行）', info.children > 10, 'childRows=' + info.children);
check('默认全选', info.boxes > 0 && info.checked === info.boxes, info.checked + '/' + info.boxes);
await page.screenshot({ path: '/tmp/cat-picker.png' });

console.log('[3] 只勾一个二级 → 面板分类行显示「一级 / 二级」');
await clickByText('.header-action-text', '取消全选');
await page.waitForTimeout(500);
var childName = await page.evaluate(function(){
  var el = document.querySelector('.row-child .row-label');
  return el ? el.textContent.trim() : null;
});
check('存在二级行', !!childName, String(childName));
await clickNth('.row-child', 0);
await page.waitForTimeout(400);
// 弹层「确定」（最后一个 .btn-confirm）
var confirmCount = await page.evaluate(function(){ return document.querySelectorAll('.btn-confirm').length; });
await clickNth('.btn-confirm', confirmCount - 1);
await page.waitForTimeout(2500);
var labelAfter = await rowValue('分类');
check('分类行显示「一级 / 二级」', labelAfter.indexOf(' / ') >= 0, labelAfter);

console.log('[4] ★ 再点筛选面板「确定」→ 分类筛选仍生效');
var confirmCount2 = await page.evaluate(function(){ return document.querySelectorAll('.btn-confirm').length; });
await clickNth('.btn-confirm', confirmCount2 - 1);
await page.waitForTimeout(2500);
await openFilterPanel();
var labelReopen = await rowValue('分类');
check('重新打开面板后分类筛选仍在', labelReopen.indexOf(' / ') >= 0, labelReopen);

console.log('[5] 提示条 + 条件摘要含「分类」');
await clickNth('.header-close', 0);
await page.waitForTimeout(900);
var tip = await page.evaluate(function(){ var el=document.querySelector('.filter-tip'); return el?el.textContent.trim():null; });
check('提示条出现', !!tip, String(tip));
if (tip) {
  await page.evaluate(function(){ var el=document.querySelector('.filter-tip-action'); if(el) el.click(); });
  await page.waitForTimeout(900);
  var rows2 = await page.evaluate(function(){ return Array.from(document.querySelectorAll('.summary-row')).map(function(r){return r.textContent.replace(/\s+/g,' ').trim();}); });
  check('摘要含「分类」行', rows2.some(function(r){return r.indexOf('分类')>=0;}), JSON.stringify(rows2));

  console.log('[6] 「查看全部流水」→ 分类复位为「全部」，提示条消失');
  await clickByText('.summary-btn-text', '查看全部流水');
  await page.waitForTimeout(2500);
  var gone = await page.evaluate(function(){ return !document.querySelector('.filter-tip'); });
  check('提示条消失', gone);
  await openFilterPanel();
  var vBack = await rowValue('分类');
  check('分类行回到「全部」', vBack === '全部', vBack);
} else {
  check('摘要含「分类」行（跳过：提示条不存在）', false);
  check('提示条消失（跳过）', false);
  check('分类行回到「全部」（跳过）', false);
}

console.log('\n结果：PASS='+pass+' FAIL='+fail);
await browser.close();
process.exit(fail ? 1 : 0);
