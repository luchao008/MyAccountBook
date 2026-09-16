/**
 * 「数据导出」页运行时验证（真实浏览器）。
 *
 *   node scripts/verify-export.mjs
 *
 * 覆盖：
 *   ① 「我的」页有「数据导出」入口
 *   ② flow 页「更多 → 流水导出」跳转到导出页
 *   ③ 导出页只有 3 行配置（日期 / 支出分类 / 收入分类）
 *   ④ **不做假控件**：页面不出现「账户 / 成员 / 商家 / 项目 / 导出流水图片」
 *   ⑤ 日期默认「本月」
 *   ⑥ 点日期 → 时间弹层有 6 个预设
 *   ⑦ 点「支出分类」→ 弹层只列支出（标题「选择支出分类」）
 *   ⑧ 点「收入分类」→ 只列收入
 *   ⑨ 点「导出」→ 真的下载到 CSV，且**列头/列数正确**、有数据行
 *
 * ⚠️ **只读不写**：不创建、不修改、不删除任何数据（导出只是读取 + 下载到本地临时目录）。
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
const page = await (await browser.newContext({ viewport:{width:375,height:812}, acceptDownloads:true })).newPage();
page.setDefaultTimeout(6000);
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0,150)));

async function clickByText(sel, text, nth) {
  return await page.evaluate(function(a){
    var list = Array.from(document.querySelectorAll(a.sel)).filter(function(e){ return e.textContent.indexOf(a.text) >= 0; });
    var el = list[a.nth || 0];
    if (!el) return false;
    el.click(); return true;
  }, { sel, text, nth: nth || 0 });
}
async function clickNth(sel, n) {
  return await page.evaluate(function(a){
    var el = document.querySelectorAll(a.sel)[a.n];
    if (!el) return false;
    el.click(); return true;
  }, { sel, n: n || 0 });
}

await page.goto('http://127.0.0.1:5173', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1500);
if (page.url().indexOf('/pages/login') >= 0) {
  const inputs = page.locator('input');
  await inputs.nth(0).fill('demo');
  await inputs.nth(1).fill('123456');
  await page.evaluate(function(){ var b=document.querySelector('.submit,uni-button,button'); if(b)b.click(); });
  await page.waitForTimeout(2500);
}

console.log('[1] 「我的」页有「数据导出」入口');
await page.goto('http://127.0.0.1:5173/#/pages/account-select/index', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(2500);
await clickByText('.tab-text', '我的');
await page.waitForTimeout(1200);
var mine = await page.evaluate(function(){ return document.body.innerText; });
check('有「数据导出」入口', mine.indexOf('数据导出') >= 0);
check('有「流水回收站」入口（回归）', mine.indexOf('流水回收站') >= 0);

console.log('[2] flow 页「更多 → 流水导出」跳转到导出页');
await page.goto('http://127.0.0.1:5173/#/pages/flow/index', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(2800);
await clickNth('.nav-actions .nav-btn', 0);
await page.waitForTimeout(800);
await clickByText('.sheet-item-text', '流水导出');
await page.waitForTimeout(2200);
var hash = await page.evaluate(function(){ return location.hash; });
check('跳到了导出页', hash.indexOf('/pages/export/index') >= 0, hash);

console.log('[3] 只有 3 行配置 + 不做假控件');
var rows = await page.evaluate(function(){
  return Array.from(document.querySelectorAll('.row-label')).map(function(e){ return e.textContent.trim(); });
});
check('3 行：日期 / 支出分类 / 收入分类', JSON.stringify(rows) === '["日期","支出分类","收入分类"]', JSON.stringify(rows));
var body = await page.evaluate(function(){ return document.body.innerText; });
var fakes = ['成员', '商家', '项目', '导出流水图片'];
var found = fakes.filter(function(f){ return body.indexOf(f) >= 0; });
check('不出现假控件（成员/商家/项目/导出流水图片）', found.length === 0, JSON.stringify(found));
check('「账户」不作为配置行出现', rows.indexOf('账户') < 0);

console.log('[4] 日期默认「本月」');
var dateVal = await page.evaluate(function(){
  var labels = Array.from(document.querySelectorAll('.row-label'));
  for (var i=0;i<labels.length;i++) {
    if (labels[i].textContent.trim() === '日期') {
      var row = labels[i].closest('.row');
      var v = row.querySelector('.row-value');
      var s = row.querySelector('.row-sub');
      return { value: v ? v.textContent.trim() : '', sub: s ? s.textContent.trim() : '' };
    }
  }
  return null;
});
check('日期行显示「本月」', !!dateVal && dateVal.value === '本月', JSON.stringify(dateVal));
check('并显示区间（形如 2026.09.01-2026.09.30）', !!dateVal && /^\d{4}\.\d{2}\.\d{2}-\d{4}\.\d{2}\.\d{2}$/.test(dateVal.sub), dateVal && dateVal.sub);

console.log('[5] 点日期 → 时间弹层 6 预设');
await clickByText('.row-label', '日期');
await page.waitForTimeout(900);
var presets = await page.evaluate(function(){
  return Array.from(document.querySelectorAll('.sheet-item-text')).map(function(e){ return e.textContent.trim(); });
});
check('含 6 个预设', ['全部时间','本月','上月','本年','去年','自定义'].every(function(p){ return presets.indexOf(p) >= 0; }), JSON.stringify(presets));
await clickNth('.sheet-header-btn', 0);
await page.waitForTimeout(700);

console.log('[6] 点「支出分类」→ 只列支出');
await clickByText('.row-label', '支出分类');
await page.waitForTimeout(1000);
var expInfo = await page.evaluate(function(){
  var titles = Array.from(document.querySelectorAll('.header-title')).map(function(t){ return t.textContent.trim(); });
  var names = Array.from(document.querySelectorAll('.row-label')).map(function(t){ return t.textContent.trim(); });
  return { titles: titles, names: names };
});
check('标题「选择支出分类」', expInfo.titles.indexOf('选择支出分类') >= 0, JSON.stringify(expInfo.titles));
check('列的是支出大类（含食品酒水）', expInfo.names.indexOf('食品酒水') >= 0, JSON.stringify(expInfo.names.slice(0,5)));
check('不含收入大类（如职业收入）', expInfo.names.indexOf('职业收入') < 0);
await clickNth('.header-btn', 0);
await page.waitForTimeout(700);

console.log('[7] 点「收入分类」→ 只列收入');
await clickByText('.row-label', '收入分类');
await page.waitForTimeout(1000);
var incInfo = await page.evaluate(function(){
  var titles = Array.from(document.querySelectorAll('.header-title')).map(function(t){ return t.textContent.trim(); });
  var names = Array.from(document.querySelectorAll('.row-label')).map(function(t){ return t.textContent.trim(); });
  return { titles: titles, names: names };
});
check('标题「选择收入分类」', incInfo.titles.indexOf('选择收入分类') >= 0, JSON.stringify(incInfo.titles));
check('列的是收入大类（职业收入 / 其他收入）',
  incInfo.names.indexOf('职业收入') >= 0 && incInfo.names.indexOf('其他收入') >= 0, JSON.stringify(incInfo.names.slice(0,5)));
check('不含支出大类（如食品酒水）', incInfo.names.indexOf('食品酒水') < 0);
await clickNth('.header-btn', 0);
await page.waitForTimeout(700);

console.log('[8] 点「导出」→ 真的下载 CSV');
await page.waitForTimeout(500);
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 15000 }),
  page.evaluate(function(){
    var btns = Array.from(document.querySelectorAll('.btn'));
    var el = btns.filter(function(b){ return b.textContent.indexOf('导出') >= 0; })[0];
    if (el) el.click();
  }),
]);
check('触发了下载', !!download);
if (download) {
  const fname = download.suggestedFilename();
  check('文件名形如 流水_YYYY-MM-DD_YYYY-MM-DD_YYYYMMDD.csv',
    /^流水_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}_\d{8}\.csv$/.test(fname), fname);
  const p = await download.path();
  const content = fs.readFileSync(p, 'utf8');
  const lines = content.split('\n').filter(function(l){ return l.length; });
  const header = lines[0].replace(/^\uFEFF/, '');
  check('列头正确（6 列）', header === '交易类型,日期,一级分类,二级分类,金额,备注', header);
  check('有数据行（本月有流水）', lines.length > 1, 'rows=' + (lines.length - 1));
  if (lines.length > 1) {
    const cols = lines[1].split(',');
    check('数据行至少 6 列', cols.length >= 6, JSON.stringify(cols.slice(0, 6)));
    check('第一列是 支出/收入', cols[0] === '支出' || cols[0] === '收入', cols[0]);
  }
  // 清理下载的临时文件由 Playwright 自动处理
}

console.log('\n结果：PASS='+pass+' FAIL='+fail);
await browser.close();
process.exit(fail ? 1 : 0);
