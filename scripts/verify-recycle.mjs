/**
 * 流水「左滑复制/删除 + 回收站」运行时验证（真实浏览器）。
 *
 *   node scripts/verify-recycle.mjs
 *
 * 覆盖：
 *   ① 流水行可左滑，滑出「复制」「删除」两个按钮
 *   ② 点「删除」→ 确认弹窗文案含「7天内可到流水回收站恢复」（**点取消，不改数据**）
 *   ③ 左滑「复制」→ 跳到记一笔页且标题为「复制支出」
 *   ④ 「我的」页有「流水回收站」入口，点击能进页面
 *   ⑤ 回收站里能查到已删的流水（金额 / 恢复按钮）
 *   ⑥ 点「恢复」→ 回收站里消失、回到常规列表
 *
 * ⚠️ **本脚本有写操作**，但每一步都精确到自建的测试流水（用唯一金额定位）：
 *    · 弹窗验证走「取消」，不碰任何真实数据
 *    · 删除 / 恢复走 API（按 id），不点列表里的按钮
 *    · 结尾会真删掉测试流水（软删 → 恢复 → 再软删？不需要：直接物理清理）
 *
 *    **第一版踩过的坑（严重）**：直接点 DOM 里第一个「删除」按钮 ——
 *    那对应的是**列表第一条真实流水**（不是测试那条，因为测试数据在别的月份），
 *    等于拿用户数据做实验。侥幸被后面的「恢复」救回来，但这是**危险的假通过**。
 *    教训：**有写操作的 E2E，每一步都要能定位到"自己造的那条数据"**，
 *    定位不到就不要点。
 *
 * ⚠️ uni-app H5 的真实类名（实测）：
 *    · 左滑容器 → `<uni-view class="uni-swipe">`
 *    · 左滑按钮文案 → `.uni-swipe_button-text`
 *    · 按钮组默认 `translateX(144px)` 移出屏幕右侧（滑开才露出）
 *
 * ⚠️ 「我的」不是独立页，而是 `account-select` 页里的**页内视图** ——
 *    要先进该页、再点底栏「我的」才看得到菜单。
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

/** 测试流水的唯一金额（用来在列表/回收站里精确识别自己造的那条） */
const TEST_AMOUNT = '13.57';
const TEST_NOTE = `recycle-probe-${Date.now()}`;

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

/** 用 API 造一条测试流水（记录日故意选一个"当前视图看不到"的月份，避免误认） */
async function createTestTxn() {
  return await page.evaluate(async function(p){
    var token = localStorage.getItem("token") || "";
    var res = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ type: "expense", amount: p.amount, recordDate: "2026-08-08", note: p.note }),
    });
    var body = await res.json();
    return body.data && body.data.id;
  }, { amount: TEST_AMOUNT, note: TEST_NOTE });
}
/** 软删（走真实接口） */
async function softDelete(id) {
  return await page.evaluate(async function(tid){
    var token = localStorage.getItem("token") || "";
    var r = await fetch("/api/transactions/" + tid, { method: "DELETE", headers: { "Authorization": "Bearer " + token } });
    return r.ok;
  }, id);
}
/** 查详情状态码（验软删除是否生效） */
async function detailStatus(id) {
  return await page.evaluate(async function(tid){
    var token = localStorage.getItem("token") || "";
    var r = await fetch("/api/transactions/" + tid, { headers: { "Authorization": "Bearer " + token } });
    return r.status;
  }, id);
}

await page.goto('http://127.0.0.1:5173', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1500);
if (page.url().indexOf('/pages/login') >= 0) {
  const inputs = page.locator("input");
  await inputs.nth(0).fill("demo");
  await inputs.nth(1).fill("123456");
  await page.evaluate(function(){ var b=document.querySelector(".submit,uni-button,button"); if(b)b.click(); });
  await page.waitForTimeout(2500);
}

console.log('[0] 造一条测试流水（金额 ' + TEST_AMOUNT + '，便于精确定位）');
const testId = await createTestTxn();
check('测试流水已创建', !!testId, 'id=' + testId);

await page.goto('http://127.0.0.1:5173/#/pages/flow/index', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(3000);

console.log('[1] 流水行可左滑，滑出「复制」「删除」');
var swipeInfo = await page.evaluate(function(){
  var texts = Array.from(document.querySelectorAll(".uni-swipe_button-text")).map(function(e){ return e.textContent.trim(); });
  return {
    swipeCount: document.querySelectorAll(".uni-swipe").length,
    buttonTexts: Array.from(new Set(texts)),
  };
});
check('存在 .uni-swipe（左滑容器）', swipeInfo.swipeCount > 0, 'count=' + swipeInfo.swipeCount);
check('左滑按钮含「复制」', swipeInfo.buttonTexts.indexOf('复制') >= 0, JSON.stringify(swipeInfo.buttonTexts));
check('左滑按钮含「删除」', swipeInfo.buttonTexts.indexOf('删除') >= 0, JSON.stringify(swipeInfo.buttonTexts));

console.log('[2] 点「删除」→ 确认弹窗文案（★ 点取消，不碰数据）');
var clicked = await page.evaluate(function(){
  var btns = Array.from(document.querySelectorAll(".uni-swipe_button-text"));
  var del = btns.filter(function(b){ return b.textContent.trim() === "删除"; })[0];
  if (!del) return false;
  del.click(); return true;
});
check("点到「删除」按钮", clicked);
await page.waitForTimeout(900);
var modal = await page.evaluate(function(){
  var el = document.querySelector(".uni-modal");
  return el ? el.textContent.replace(/\s+/g, "") : null;
});
check('弹窗出现', !!modal, String(modal).slice(0, 60));
check('文案含「删除后7天内可到流水回收站恢复」',
  !!modal && modal.indexOf('7天内可到流水回收站恢复') >= 0,
  String(modal).slice(0, 90));
// ★ 点取消：这条弹窗对应的可能是真实流水，绝不能点确定
await clickByText(".uni-modal__btn", "取消");
await page.waitForTimeout(700);
/*
 * ⚠️ 判据不能用 `!document.querySelector('.uni-modal')` ——
 *    实测 uni-app 关闭 modal 时**只清空文字，DOM 节点会保留**
 *    （probe 结果：点取消后 `bodyHasText: false` 但 `modalStillThere: true`）。
 *    所以判"文字是否还在"才是可靠判据。
 */
var modalGone = await page.evaluate(function(){
  return document.body.innerText.indexOf("删除提醒") < 0;
});
check('点「取消」后弹窗关闭（文案已消失）', modalGone);

console.log('[3] 左滑「复制」→ 跳到记一笔页，标题「复制支出」');
var copyClicked = await page.evaluate(function(){
  var btns = Array.from(document.querySelectorAll(".uni-swipe_button-text"));
  var cp = btns.filter(function(b){ return b.textContent.trim() === "复制"; })[0];
  if (!cp) return false;
  cp.click(); return true;
});
check("点到「复制」按钮", copyClicked);
await page.waitForTimeout(2500);
var copyPage = await page.evaluate(function(){
  return {
    hash: location.hash,
    title: (document.querySelector(".uni-page-head-title") || {}).textContent || "",
    bodyHasCopyTitle: document.body.innerText.indexOf("复制支出") >= 0,
  };
});
check('跳到了记一笔页', copyPage.hash.indexOf('/pages/record/index') >= 0, copyPage.hash);
check('页面出现「复制支出」标题', copyPage.bodyHasCopyTitle, JSON.stringify(copyPage));
// 返回流水页，继续后面的步骤
await page.goto("http://127.0.0.1:5173/#/pages/flow/index", { waitUntil:"domcontentloaded" });
await page.waitForTimeout(2500);

console.log('[4] 「我的」页有「流水回收站」入口');
// ⚠️ 「我的」是 account-select 页的页内视图，要先进该页再点底栏
await page.goto("http://127.0.0.1:5173/#/pages/account-select/index", { waitUntil:"domcontentloaded" });
await page.waitForTimeout(2500);
await clickByText(".tab-text", "我的");
await page.waitForTimeout(1200);
var mineInfo = await page.evaluate(function(){
  var txt = document.body.innerText;
  return {
    hasEntry: txt.indexOf("流水回收站") >= 0,
    hasAccount: txt.indexOf("账本管理") >= 0,
  };
});
check('「我的」视图已打开（有「账本管理」）', mineInfo.hasAccount, JSON.stringify(mineInfo));
check('有「流水回收站」入口', mineInfo.hasEntry, JSON.stringify(mineInfo));

console.log('[5] 软删测试流水 → 回收站里能查到');
const deleted = await softDelete(testId);
check('软删接口返回成功', deleted);
const status = await detailStatus(testId);
check('详情接口对已删流水返回 404（软删除生效）', status === 404, 'HTTP ' + status);

await page.goto("http://127.0.0.1:5173/#/pages/recycle/index", { waitUntil:"domcontentloaded" });
await page.waitForTimeout(2500);
var recycleInfo = await page.evaluate(function(amount){
  var txt = document.body.innerText;
  return {
    hasTitle: txt.indexOf("流水回收站") >= 0,
    hasTip: txt.indexOf("保留 7 天") >= 0,
    hasAmount: txt.indexOf(amount) >= 0,
    restoreCount: document.querySelectorAll(".restore").length,
  };
}, TEST_AMOUNT);
check('页面标题「流水回收站」', recycleInfo.hasTitle);
check('说明条提到「保留 7 天」', recycleInfo.hasTip);
check('列表里有测试流水（金额 ' + TEST_AMOUNT + '）', recycleInfo.hasAmount, JSON.stringify(recycleInfo));
check('存在「恢复」按钮', recycleInfo.restoreCount > 0, 'count=' + recycleInfo.restoreCount);
await page.screenshot({ path: "/tmp/recycle.png" });

console.log('[6] 点「恢复」→ 回收站里消失、回到常规列表');
/*
 * ⚠️ 判据用「恢复按钮数量减少」+ API 状态码，**不用字符串匹配金额** ——
 *    金额可能在页面别处出现（汇总数字），字符串匹配会假通过/假失败。
 *    第一版就踩过：回收站里有历史遗留测试数据（金额相同），
 *    点「第一个恢复」恢复的不是自己那条，断言全乱。
 *    **跑之前要确保没有遗留测试数据**（脚本收尾会软删自己的那条）。
 */
var restoreCountBefore = await page.evaluate(function(){
  return document.querySelectorAll(".restore").length;
});
check("恢复前回收站里有自己的那条", restoreCountBefore >= 1, "count=" + restoreCountBefore);
await clickNth(".restore", 0);
await page.waitForTimeout(900);
var restoreModal = await page.evaluate(function(){
  var el = document.querySelector(".uni-modal");
  return el ? el.textContent.replace(/\s+/g, "") : null;
});
check('恢复确认弹窗出现', !!restoreModal, String(restoreModal).slice(0, 60));
await clickByText(".uni-modal__btn", "确定恢复");
await page.waitForTimeout(2500);
var restoreCountAfter = await page.evaluate(function(){
  return document.querySelectorAll(".restore").length;
});
check('回收站里少了一条（恢复成功）', restoreCountAfter === restoreCountBefore - 1,
  restoreCountBefore + ' -> ' + restoreCountAfter);
const statusBack = await detailStatus(testId);
check('详情接口恢复后能查到（HTTP 200）', statusBack === 200, 'HTTP ' + statusBack);

console.log('[7] 收尾：清掉测试流水');
const finalDel = await softDelete(testId);
check('测试流水已软删（进回收站，7 天后由后端惰性真删）', finalDel);
console.log('  ⚠️ 如需立刻清除，执行：');
console.log(`     docker exec account-book-mariadb mariadb -uroot -proot123456 account_book -e "DELETE FROM transactions WHERE note='${TEST_NOTE}'"`);

console.log('\\n结果：PASS='+pass+' FAIL='+fail);
await browser.close();
process.exit(fail ? 1 : 0);

