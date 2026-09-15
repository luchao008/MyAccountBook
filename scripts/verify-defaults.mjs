/**
 * 「记一笔默认时刻」+「流水页默认展开第一个」运行时验证（真实浏览器）。
 *
 *   node scripts/verify-defaults.mjs
 *
 * 覆盖：
 *   A. 记一笔不主动选时间 → 提交时带上**当前时刻**（±3 分钟），且不是 null
 *   B. 流水页进入后**默认展开第一个分组**，且组内有明细
 *   C. 点组头可正常收起
 *
 * ⚠️ **本脚本会写入数据**（为验证 A 必须真记一笔），结束时会**自动删除**该记录。
 *    这是唯一一个带写操作的验证脚本 —— 其余 verify-*.mjs 均只读。
 *    删除失败时会打印告警（避免留下脏数据而无人知晓）。
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

console.log('[A] 记一笔：不主动选时间 → 提交时带当前时刻');
await page.goto('http://127.0.0.1:5173/#/pages/record/index', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(2500);

// 打开分类选择器并选第一个二级分类
await page.locator('.row', { hasText: '分类' }).first().click();
await page.waitForTimeout(1500);
await page.locator('.grid-item').first().click();
await page.waitForTimeout(1200);
const pickedName = await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll('.row')).find(r => r.textContent.indexOf('分类') >= 0);
  return el ? el.textContent.trim() : null;
});
check('已选中分类', pickedName && pickedName.indexOf('请选择') < 0, pickedName);

// 输入金额（用键盘数字键）
for (const ch of ['1','2','3']) {
  await page.locator('.key-btn, [class*=key]', { hasText: new RegExp('^' + ch + '$') }).first().click().catch(() => {});
  await page.waitForTimeout(200);
}
const amt = await page.evaluate(() => {
  const el = document.querySelector('.amount-text, [class*=amount]');
  return el ? el.textContent.trim() : null;
});
console.log('  金额显示:', amt);

// 提交前记录当前时刻
const before = await page.evaluate(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); });

// 点保存（键盘右下角的保存键）
await page.locator('.key.confirm').first().click().catch(async () => {
  await page.locator('.key.confirm').first().click();
});
await page.waitForTimeout(3000);

// 查最近一笔的 recordTime
const latest = await page.evaluate(async () => {
  const token = localStorage.getItem('token');
  const res = await fetch('/api/transactions?size=1', { headers: { Authorization: 'Bearer ' + token } });
  const body = await res.json();
  const t = body && body.data && body.data.list[0];
  return t ? { id: t.id, amount: t.amount, recordTime: t.recordTime, recordDate: t.recordDate, createdAt: t.createdAt } : null;
});
console.log('  最新记录:', JSON.stringify(latest));

if (latest) {
  check('新记录带了 recordTime（非 null）', !!latest.recordTime, 'recordTime=' + latest.recordTime);
  if (latest.recordTime) {
    const [h, m] = latest.recordTime.split(':').map(Number);
    const diff = Math.abs(h * 60 + m - before);
    check('时刻接近提交时刻（±3 分钟）', diff <= 3, 'diff=' + diff + 'min');
  }
}

/*
 * 清理：本脚本是唯一会写数据的 verify —— 必须把刚记的那笔删掉，
 * 否则每跑一次就污染一次 demo 账本（历史上就因为测试残留导致过"有分类的交易数对不上"）。
 * 删除失败要**明确告警**，不能静默留下脏数据。
 */
const cleanup = await page.evaluate(async (id) => {
  if (!id) return 'skip';
  const token = localStorage.getItem('token');
  const res = await fetch('/api/transactions/' + id, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + token },
  });
  const body = await res.json();
  return body && body.data && body.data.success ? 'ok' : 'fail';
}, latest && latest.id);
console.log('  清理测试记录:', cleanup);
if (cleanup === 'fail') console.log('  ⚠️ 清理失败，请手动删除记录 id=' + (latest && latest.id));

console.log('[B] 流水页默认展开第一个分组');
await page.goto('http://127.0.0.1:5173/#/pages/flow/index', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(4000);
const st = await page.evaluate(() => ({
  groups: document.querySelectorAll('.group').length,
  bodies: document.querySelectorAll('.group-body').length,
  txn: document.querySelectorAll('.txn').length,
}));
check('有分组', st.groups > 0, JSON.stringify(st));
check('默认展开一个分组', st.bodies === 1, 'bodies=' + st.bodies);
check('展开的组内有明细', st.txn > 0, 'txn=' + st.txn);
await page.screenshot({ path: '/tmp/flow-auto-expand.png' });

console.log('[C] 可收起');
await page.locator('.group-head').first().click();
await page.waitForTimeout(1200);
check('收起后无展开体', await page.evaluate(() => document.querySelectorAll('.group-body').length) === 0);

console.log('\n结果：PASS='+pass+' FAIL='+fail);
await browser.close();
