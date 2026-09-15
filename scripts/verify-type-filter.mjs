/**
 * 流水页「流水类型」筛选运行时验证（真实浏览器）。
 *
 *   node scripts/verify-type-filter.mjs
 *
 * 覆盖（重点盯用户报过的 bug）：
 *   ① 筛选面板有「类型」行，默认显示「全部」
 *   ② 点「类型」→ 弹层出现，标题 / 两个选项 / 「取消全选」按钮
 *   ③ 只选「支出」→ 点弹层「确定」→ 筛选面板的类型行显示「支出」
 *   ④ **再点筛选面板的「确定」→ 类型仍是「支出」**（← 这就是用户报的 bug：
 *      类型弹层叠在面板之上，面板 visible 全程为 true，watch(visible) 不触发，
 *      draft.types 还是旧值，把已选类型覆盖回全选）
 *   ⑤ 出现「已筛选」提示条，条件摘要里有「流水类型 支出」
 *   ⑥ 「取消全选」后确定 → 类型行回到「全部」，提示条消失
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
/**
 * ⚠️ 默认超时缩短到 6s：**这是为了让"验证失败"能报出来，而不是卡死**。
 *    实测过：把修复回退后，第 [4] 步判 FAIL，脚本继续跑到第 [5] 步的
 *    `.filter-tip-action`（此时不存在）→ Playwright 默认等 30s → 整个脚本被 SIGTERM，
 *    连统计都打不出来。**"跑不出结论"和"跑出结论说失败"是两回事。**
 */
page.setDefaultTimeout(6000);
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

// 打开筛选面板
async function openFilterPanel() {
  await page.locator('.nav-actions .nav-btn').first().click();
  await page.waitForTimeout(700);
  await page.locator('.sheet-item-text', { hasText: '筛选' }).first().click();
  await page.waitForTimeout(900);
}

/** 元素是否存在（不等待）—— 给"失败后仍要继续"的路径用 */
async function exists(sel) {
  return await page.evaluate(function(s){ return !!document.querySelector(s); }, sel);
}
// 读筛选面板里「类型」行的右侧文案
async function typeRowText() {
  return await page.evaluate(function(){
    var rows = Array.from(document.querySelectorAll('.row'));
    for (var i=0;i<rows.length;i++) {
      var label = rows[i].querySelector('.row-label');
      if (label && label.textContent.trim() === '类型') {
        var v = rows[i].querySelector('.row-value');
        return v ? v.textContent.trim() : '(no-value)';
      }
    }
    return '(no-row)';
  });
}

console.log('[1] 筛选面板有「类型」行，默认「全部」');
await openFilterPanel();
check('类型行默认显示「全部」', (await typeRowText()) === '全部', await typeRowText());

console.log('[2] 点「类型」→ 弹层出现');
await page.locator('.row-label', { hasText: '类型' }).click();
await page.waitForTimeout(800);
var sheetInfo = await page.evaluate(function(){
  var titles = Array.from(document.querySelectorAll('.header-title')).map(function(t){return t.textContent.trim();});
  var rows = Array.from(document.querySelectorAll('.row-label')).map(function(t){return t.textContent.trim();});
  var action = document.querySelector('.header-action-text');
  return { titles: titles, rows: rows, action: action && action.textContent.trim(), checkboxes: document.querySelectorAll('.checkbox').length };
});
check('弹层标题「选择流水类型」', sheetInfo.titles.indexOf('选择流水类型') >= 0, JSON.stringify(sheetInfo.titles));
check('两个选项：支出 / 收入', sheetInfo.rows.indexOf('支出')>=0 && sheetInfo.rows.indexOf('收入')>=0, JSON.stringify(sheetInfo.rows));
check('默认全选（2 个已勾选）', sheetInfo.checkboxes === 2, String(sheetInfo.checkboxes));
check('右上角「取消全选」', sheetInfo.action === '取消全选', String(sheetInfo.action));

console.log('[3] 只选「支出」→ 弹层确定 → 面板类型行显示「支出」');
// 先「取消全选」清空，再只点「支出」
await page.locator('.header-action-text').click();
await page.waitForTimeout(400);
await page.locator('.checkbox').first().click();   // 第一项 = 支出
await page.waitForTimeout(300);
await page.locator('.btn-confirm').last().click(); // 弹层的确定
await page.waitForTimeout(2500);
check('类型行显示「支出」', (await typeRowText()) === '支出', await typeRowText());

console.log('[4] ★ 再点筛选面板的「确定」→ 类型仍是「支出」（用户报的 bug）');
await page.locator('.btn-confirm').last().click();
await page.waitForTimeout(2500);
// 重新打开面板看类型行
await openFilterPanel();
var afterPanel = await typeRowText();
check('重新打开面板后类型仍为「支出」', afterPanel === '支出', afterPanel);
// 关闭面板
await page.locator('.header-close').first().click();
await page.waitForTimeout(800);

console.log('[5] 出现「已筛选」提示条，摘要含「流水类型 支出」');
var tip = await page.evaluate(function(){ var el=document.querySelector('.filter-tip'); return el?el.textContent.trim():null; });
check('提示条出现', !!tip, String(tip));
// ⚠️ 提示条不存在时（= 前面的断言已经失败）不能直接点 —— 会等超时把统计卡掉
if (tip) {
  await page.locator('.filter-tip-action').click();
  await page.waitForTimeout(900);
  var summaryRows = await page.evaluate(function(){ return Array.from(document.querySelectorAll('.summary-row')).map(function(r){return r.textContent.replace(/\s+/g,' ').trim();}); });
  check('摘要含「流水类型 支出」', summaryRows.some(function(r){return r.indexOf('流水类型')>=0 && r.indexOf('支出')>=0;}), JSON.stringify(summaryRows));
  await page.screenshot({ path: '/tmp/type-filter-summary.png' });

  console.log('[6] 「查看全部流水」→ 类型复位为「全部」，提示条消失');
  await page.locator('.summary-btn-ghost').click();
  await page.waitForTimeout(2500);
  var tipGone = await page.evaluate(function(){ return !document.querySelector('.filter-tip'); });
  check('提示条消失', tipGone);
  await openFilterPanel();
  check('类型行回到「全部」', (await typeRowText()) === '全部', await typeRowText());
} else {
  check('摘要含「流水类型 支出」（跳过：提示条不存在）', false);
  check('提示条消失（跳过：提示条不存在）', false);
  check('类型行回到「全部」（跳过：提示条不存在）', false);
}

console.log('\n结果：PASS='+pass+' FAIL='+fail);
await browser.close();
process.exit(fail ? 1 : 0);
