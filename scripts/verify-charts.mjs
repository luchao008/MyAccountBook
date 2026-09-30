/**
 * 「图表页」运行时验证（真实浏览器，走完整 UI 链路）。
 *
 *   node scripts/verify-charts.mjs
 *
 * 前置：前端 dev server 在 5173、后端在 7001。
 *
 * 覆盖：
 *   ① 首页右上角图标存在，点击后**跳到图表页**（navigateTo，可返回）
 *   ② 图表页默认：口径「分类支出」、视图「饼图」，环形图有扇区、中心显示「总计」
 *   ③ 切「条形图」→ 出现总支出大字 + 分类排行（图标/名称/占比/进度条/金额）
 *   ④ 切口径「分类收入」→ 排行变成收入分类、总额变「总收入」
 *   ⑤ 点顶部标题 → 弹层有 **4 项**口径（分类支出/分类收入/二级支出/二级收入）
 *   ⑥ 点左下角区间 → 弹层有 **6 个粒度 + 自定义**，切「月」+「完成」→ 区间文案变「本月 …」
 *   ⑦ 二级口径能取到数据（level=2 生效）
 *
 * ⚠️ **只操作自建数据**：先建临时账本、在其中造流水，最后删账本（流水随外键 CASCADE 消失）。
 */
import fs from 'node:fs';
const PW = '/Users/luchao/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js';
const pw = await import(PW);
const { chromium } = pw.default ?? pw;
function findChrome() {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  for (const d of fs.readdirSync(root).filter((x) => x.indexOf('chromium-') === 0).sort().reverse()) {
    for (const arch of ['chrome-mac-arm64', 'chrome-mac-x64']) {
      const p =
        root + '/' + d + '/' + arch + '/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
      if (fs.existsSync(p)) return p;
    }
  }
}
let pass = 0,
  fail = 0;
const check = (n, ok, extra) => {
  if (ok) {
    pass++;
    console.log('  OK ' + n + ' ' + (extra || ''));
  } else {
    fail++;
    console.log('  FAIL ' + n + ' ' + (extra || ''));
  }
};

const OUT = '/tmp/charts-probe';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-proxy-server'] });
const page = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
page.setDefaultTimeout(10000);
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 160)));

await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

const login = await page.evaluate(async function () {
  const r = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'demo', password: '123456' }),
  });
  const j = await r.json();
  if (j && j.code === 0 && j.data && j.data.token) localStorage.setItem('token', j.data.token);
  return { token: (j && j.data && j.data.token) || '' };
});
check('[登录] 已拿到 token', !!login.token);
if (!login.token) {
  await browser.close();
  process.exit(1);
}
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

const api = async (pathName, options) =>
  await page.evaluate(
    async function (a) {
      const res = await fetch(a.pathName, {
        ...a.options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + localStorage.getItem('token'),
          ...(a.options && a.options.headers ? a.options.headers : {}),
        },
      });
      return { status: res.status, body: await res.json() };
    },
    { pathName, options: options || {} }
  );

/* ============ 准备：临时账本 + 8 笔支出 + 1 笔收入 ============ */
const stamp = Date.now();
const accName = '图表验证' + stamp;
const created = await api('/api/accounts', { method: 'POST', body: JSON.stringify({ name: accName }) });
const accId = created.body?.data?.id;
check('[准备] 临时账本已创建', created.status === 200 && !!accId, 'HTTP ' + created.status);

const today = await page.evaluate(function () {
  var d = new Date();
  var p = function (n) {
    return String(n).padStart(2, '0');
  };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
});

const cats = await api('/api/categories?accountId=' + accId + '&visibility=visible');
const allCats = cats.body?.data || [];
const expCats = allCats.filter((c) => c.type === 'expense' && c.parentId);
const incCats = allCats.filter((c) => c.type === 'income' && c.parentId);
check(
  '[准备] 有支出 / 收入二级分类',
  expCats.length >= 15 && incCats.length >= 1,
  `支出 ${expCats.length} / 收入 ${incCats.length}`
);

/*
 * 造 **15 笔**支出：分类数要够多，条形图列表才会长到**真的能滚动**
 * （吸顶/缩小的断言必须先滚得起来 —— 数据太长会点不动，太短则永远测的是"没滚动"的样子，
 *  本轮就因为只有 8 笔、页面没滚起来，`compact` 一条假失败）。
 */
const N = 15;
let expTotal = 0;
for (let i = 0; i < N; i++) {
  const amt = (100 - i * 5).toFixed(2);
  expTotal += Number(amt);
  await api('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({
      type: 'expense',
      amount: amt,
      categoryId: expCats[i].id,
      recordDate: today,
      note: '图表验证',
      accountId: accId,
    }),
  });
}
await api('/api/transactions', {
  method: 'POST',
  body: JSON.stringify({
    type: 'income',
    amount: '500.00',
    categoryId: incCats[0].id,
    recordDate: today,
    note: '图表验证',
    accountId: accId,
  }),
});
const EXP_TOTAL = expTotal.toFixed(2);
check('[准备] 流水已造好', true, `${N} 笔支出合计 ${EXP_TOTAL} + 1 笔收入`);

/*
 * ⚠️ 页面默认是**一级口径**（分类支出），15 笔挂在 15 个二级分类上的流水会被
 *    **归并到它们所属的一级分类** → 实际分组数 ≤ 15（实测 13）。
 *    所以扇区数/行数的期望值必须取这个真实分组数，而不是笔数 N。
 */
const sumL1 = await api(
  `/api/transactions/summary?groupBy=category&level=1&type=expense&accountId=${accId}`
);
const GROUPS = (sumL1.body?.data || []).filter((r) => Number(r.expense) > 0).length;
check('[准备] 一级口径的分组数已探明', GROUPS >= 2, `${GROUPS} 组（15 笔归并后）`);

// 把当前账本指到临时账本（整页 reload，否则 pinia store 还拿旧值）
await page.evaluate(function (id) {
  localStorage.setItem('currentAccountId', id);
}, accId);

/* ============ ① 首页 banner 右上角图标 → 图表页 ============ */
console.log('[1] 首页 banner 右上角图标');
await page.goto('http://127.0.0.1:5173/#/pages/main/index', { waitUntil: 'domcontentloaded' });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);

const hasAction = await page.evaluate(() => !!document.querySelector('.banner-action .banner-deco'));
check('① 首页 banner 右上角有图表入口', hasAction);
await page.screenshot({ path: OUT + '/01-home.png' });

await page.evaluate(function () {
  var b = document.querySelector('.banner-action');
  if (b) b.click();
});
await page.waitForTimeout(3000);
const hash = await page.evaluate(() => location.hash);
check('① 已跳到图表页', hash.indexOf('/pages/charts/index') >= 0, hash);

/* ============ ② 默认态：分类支出 + 饼图 ============ */
const title = await page.evaluate(function () {
  var e = document.querySelector('.nav-center-text');
  return e ? e.textContent.trim() : '';
});
check('② 默认口径「分类支出」', title === '分类支出', title);

const centerValue = await page.evaluate(function () {
  var e = document.querySelector('.ring-total-value');
  return e ? e.textContent.trim() : '';
});
check(`② 环形图中心显示总计 = ${EXP_TOTAL}`, centerValue === EXP_TOTAL, centerValue);

const segs = await page.evaluate(function () {
  return Array.from(document.querySelectorAll('.ring-wrap circle')).filter(function (c) {
    return c.getAttribute('stroke-dasharray');
  }).length;
});
check(`② 环形图有 ${GROUPS} 个扇区（一级口径归并后）`, segs === GROUPS, String(segs));

const pointer = await page.evaluate(function () {
  var e = document.querySelector('.ring-pointer');
  return e ? getComputedStyle(e).borderBottomWidth : '';
});
check('② 白色三角指示器已渲染', !!pointer && pointer !== '0px', pointer);

const pickedRatio = await page.evaluate(function () {
  var e = document.querySelector('.picked-ratio-text');
  return e ? e.textContent.trim() : '';
});
check('② 下方显示选中项占比', /%$/.test(pickedRatio), pickedRatio);
await page.screenshot({ path: OUT + '/02-pie.png' });

/* ── 拖拽旋转（用 mouse 事件：H5 浏览器里拖拽就是鼠标，touch 不会被派发）── */
console.log('[1.5] 拖拽旋转环');
/*
 * ⚠️ 旋转现在是**外层容器的 CSS transform**（为了吸附能走 transition），
 *    SVG 扇区自己的 `transform` 恒为 `rotate(-90 …)` ——
 *    读它等于在看一个永远不变的值（本轮踩过：断言过期，功能其实是好的）。
 */
const rotBefore = await page.evaluate(function () {
  var el = document.querySelector('.ring-rotator');
  return el ? el.style.transform : '';
});
const pickedBefore = await page.evaluate(function () {
  var e = document.querySelector('.picked-name');
  return e ? e.textContent.trim() : '';
});

const ringBox = await page.evaluate(function () {
  var r = document.querySelector('.ring-holder').getBoundingClientRect();
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, rad: r.width / 2 };
});
// 从「正上方」拖到「正右方」（顺时针约 90°）
await page.mouse.move(ringBox.cx, ringBox.cy - ringBox.rad * 0.8);
await page.mouse.down();
await page.waitForTimeout(200);
await page.mouse.move(ringBox.cx + ringBox.rad * 0.8, ringBox.cy, { steps: 15 });
await page.waitForTimeout(200);
await page.mouse.up();
await page.waitForTimeout(500);

const rotAfter = await page.evaluate(function () {
  var el = document.querySelector('.ring-rotator');
  return el ? el.style.transform : '';
});
check(
  '★ ② 拖拽后环真的转了（旋转角变化）',
  rotBefore !== '' && rotBefore !== rotAfter,
  rotBefore + ' → ' + rotAfter
);

const pickedAfter = await page.evaluate(function () {
  var e = document.querySelector('.picked-name');
  return e ? e.textContent.trim() : '';
});
check('★ ② 拖拽后选中项跟着变', pickedBefore !== pickedAfter, pickedBefore + ' → ' + pickedAfter);
await page.screenshot({ path: OUT + '/02b-pie-rotated.png' });

/* ── 吸附：松手后，选中扇区的**中心**必须对齐三角正下方 ── */
await page.waitForTimeout(700); // 等吸附动画走完（transition 0.28s）
const rotText = await page.evaluate(function () {
  var el = document.querySelector('.ring-rotator');
  return el ? el.style.transform : '';
});
const actualRot = Number((rotText.match(/rotate\(([-\d.]+)deg\)/) || [])[1]);

// 用接口数据独立算一遍"选中扇区中心落在正下方"应有的角度
const year = today.slice(0, 4);
const sumRes = await api(
  `/api/transactions/summary?groupBy=category&level=1&type=expense&accountId=${accId}` +
    `&start=${year}-01-01&end=${year}-12-31`
);
const sumRows = (sumRes.body?.data || []).filter((r) => Number(r.expense) > 0);
const sumTotal = sumRows.reduce((s, r) => s + Number(r.expense), 0);
const pickIdx = sumRows.findIndex((r) => (r.name || '未分类') === pickedAfter);
let accDeg = 0;
for (let i = 0; i < pickIdx; i++) accDeg += (Number(sumRows[i].expense) / sumTotal) * 360;
const spanDeg = pickIdx >= 0 ? (Number(sumRows[pickIdx].expense) / sumTotal) * 360 : 0;
const expectedRot = 180 - accDeg - spanDeg / 2;
const mod360 = (x) => ((x % 360) + 360) % 360;
const rawDiff = Math.abs(mod360(actualRot) - mod360(expectedRot));
const rotDiff = Math.min(rawDiff, 360 - rawDiff);
check(
  '★ ② 吸附：选中扇区中心已对齐三角正下方',
  Number.isFinite(actualRot) && pickIdx >= 0 && rotDiff < 1,
  `rotator=${actualRot}° 期望≈${mod360(expectedRot).toFixed(2)}°（「${pickedAfter}」第 ${pickIdx + 1} 项）`
);

/* ============ ③ 切条形图 ============ */
console.log('[2] 切「条形图」');
await page.evaluate(function () {
  var tabs = Array.from(document.querySelectorAll('.bar-tab'));
  for (var i = 0; i < tabs.length; i++) {
    if (tabs[i].textContent.indexOf('条形图') >= 0) {
      tabs[i].click();
      return true;
    }
  }
  return false;
});
await page.waitForTimeout(1200);
const barCount = await page.evaluate(() => document.querySelectorAll('.rank-item').length);
check(`③ 条形图列出 ${GROUPS} 个分类`, barCount === GROUPS, String(barCount));
const totalVal = await page.evaluate(function () {
  var e = document.querySelector('.total-value');
  return e ? e.textContent.trim() : '';
});
check(`③ 总支出大字 = ${EXP_TOTAL}`, totalVal === EXP_TOTAL, totalVal);
const hasBar = await page.evaluate(() => document.querySelectorAll('.bar-fill').length);
check("③ 每行都有占比进度条", hasBar === GROUPS, String(hasBar));

// 总额块要**撑满屏幕宽**（背景与底部阴影通栏）
const blockWidth = await page.evaluate(function () {
  var el = document.querySelector('.total-block');
  return el ? Math.round(el.getBoundingClientRect().width) : 0;
});
const viewportWidth = await page.evaluate(() => window.innerWidth);
check(
  '★ ③ 总额块撑满屏幕宽',
  Math.abs(blockWidth - viewportWidth) <= 1,
  `block=${blockWidth} viewport=${viewportWidth}`
);

// 每行上下内边距 20px（luchao 指定）
const itemPadding = await page.evaluate(function () {
  var el = document.querySelector('.rank-item');
  if (!el) return null;
  var cs = getComputedStyle(el);
  return { top: cs.paddingTop, bottom: cs.paddingBottom };
});
check(
  '③ 条形图每行上下 padding = 20px',
  !!itemPadding && itemPadding.top === '20px' && itemPadding.bottom === '20px',
  JSON.stringify(itemPadding)
);
await page.screenshot({ path: OUT + '/03-bar.png' });

/* ── 滚动：顶栏固定 + 总额块缩小吸顶 + 底部阴影 ── */
console.log('[2.5] 滚动 → 总额块缩小吸顶');
await page.mouse.move(200, 500);
await page.mouse.wheel(0, 640);
await page.waitForTimeout(800);

/*
 * ⚠️ 这里**只打印诊断、不做断言**：uni-app H5 的滚动容器不一定是 `uni-page-body`
 *    （实测它的 scrollTop 一直读 0，但页面确实滚了 —— 证据就是下面 compact 由 false 变 true）。
 *    把"我找没找对容器"写成断言，只会在环境差异上误报；
 *    真正的判据是「吸顶有没有发生」。
 */
const scrollDiag = await page.evaluate(function () {
  var cands = [
    document.scrollingElement,
    document.querySelector('uni-page-body'),
    document.querySelector('uni-page-wrapper'),
    document.querySelector('#app'),
  ];
  return cands
    .filter(Boolean)
    .map(function (el) {
      return (el.tagName + '.' + (el.className || '')).slice(0, 36) + '=' + el.scrollTop;
    })
    .join(' | ');
});
console.log('   [诊断] 各候选容器 scrollTop：' + scrollDiag);

const compactInfo = await page.evaluate(function () {
  var el = document.querySelector('.total-block');
  if (!el) return null;
  var cs = getComputedStyle(el);
  var r = el.getBoundingClientRect();
  var nav = document.querySelector('.nav');
  return {
    compact: el.classList.contains('compact'),
    position: cs.position,
    shadow: cs.boxShadow,
    topPx: Math.round(r.top),
    navBottom: nav ? Math.round(nav.getBoundingClientRect().bottom) : 0,
  };
});
check('★ ③ 滚动后总额块进入 compact（缩小吸顶）', !!compactInfo && compactInfo.compact, JSON.stringify(compactInfo));
check(
  '★ ③ 吸顶位置在**顶栏下方**（不与顶栏重叠）',
  !!compactInfo && compactInfo.topPx >= compactInfo.navBottom - 2,
  compactInfo ? `top=${compactInfo.topPx} navBottom=${compactInfo.navBottom}` : ''
);
check('③ 总额块有底部阴影', !!compactInfo && compactInfo.shadow !== 'none', compactInfo ? compactInfo.shadow : '');
await page.screenshot({ path: OUT + '/03b-bar-sticky.png' });

/* ============ ④~⑤ 口径弹层 ============ */
console.log('[3] 顶部标题 → 口径下拉（从上往下展开）');
const t2 = await page.evaluate(function () {
  var e = document.querySelector('.nav-center');
  if (e) e.click();
  return true;
});
check('   已点顶部标题', t2);
await page.waitForTimeout(700);

const dimItems = await page.evaluate(function () {
  return Array.from(document.querySelectorAll('.dropdown-text')).map(function (e) {
    return e.textContent.trim();
  });
});
check(
  '⑤ 口径下拉 4 项正确',
  JSON.stringify(dimItems) === JSON.stringify(['分类支出', '分类收入', '二级支出', '二级收入']),
  JSON.stringify(dimItems)
);

// 下拉面板必须出现在**顶栏下方**，并且带"往下展开"的动画
const dropInfo = await page.evaluate(function () {
  var el = document.querySelector('.dropdown');
  var nav = document.querySelector('.nav');
  if (!el) return null;
  var r = el.getBoundingClientRect();
  var cs = getComputedStyle(el);
  return {
    top: Math.round(r.top),
    navBottom: nav ? Math.round(nav.getBoundingClientRect().bottom) : 0,
    anim: cs.animationName,
    origin: cs.transformOrigin,
  };
});
check(
  '★ ⑤ 下拉面板紧贴顶栏下方（不是从屏幕底部升起）',
  !!dropInfo && dropInfo.top >= dropInfo.navBottom - 2,
  dropInfo ? `panelTop=${dropInfo.top} navBottom=${dropInfo.navBottom}` : ''
);
check(
  '★ ⑤ 展开动画以顶边为原点（从上往下展开）',
  !!dropInfo && dropInfo.anim !== 'none' && /^[-\d.]+px 0px|top/.test(dropInfo.origin),
  dropInfo ? `animation=${dropInfo.anim} origin=${dropInfo.origin}` : ''
);
await page.screenshot({ path: OUT + '/04-dim-dropdown.png' });

// 选「分类收入」
await page.evaluate(function () {
  var items = Array.from(document.querySelectorAll('.dropdown-item'));
  for (var i = 0; i < items.length; i++) {
    if (items[i].textContent.indexOf('分类收入') >= 0) {
      items[i].click();
      return true;
    }
  }
  return false;
});
await page.waitForTimeout(2500);
const incTotal = await page.evaluate(function () {
  var e = document.querySelector('.total-value');
  return e ? e.textContent.trim() : '';
});
const incLabel = await page.evaluate(function () {
  var e = document.querySelector('.total-label');
  return e ? e.textContent.trim() : '';
});
check('④ 切「分类收入」后总额变 500.00', incTotal === '500.00', incTotal);
check('④ 标签变「总收入」', incLabel === '总收入', incLabel);
const incRows = await page.evaluate(() => document.querySelectorAll('.rank-item').length);
check('④ 只列 1 个收入分类', incRows === 1, String(incRows));

/* ============ ⑥ 时间粒度弹层 ============ */
console.log('[4] 左下角区间 → 时间粒度弹层');
await page.evaluate(function () {
  var e = document.querySelector('.bar-text');
  if (e) e.click();
});
await page.waitForTimeout(700);
const granItems = await page.evaluate(function () {
  return Array.from(document.querySelectorAll('.sheet-item-text')).map(function (e) {
    return e.textContent.trim();
  });
});
check(
  '⑥ 粒度弹层含 全部/天/周/月/季/年/自定义',
  JSON.stringify(granItems) === JSON.stringify(['全部', '天', '周', '月', '季', '年', '自定义']),
  JSON.stringify(granItems)
);
const hasDone = await page.evaluate(function () {
  var e = document.querySelector('.sheet-foot-text');
  return e ? e.textContent.trim() : '';
});
check('⑥ 有「完成」按钮', hasDone === '完成', hasDone);
await page.screenshot({ path: OUT + '/05-gran-sheet.png' });

// 选「月」→ 完成
await page.evaluate(function () {
  var items = Array.from(document.querySelectorAll('.sheet-item-row'));
  for (var i = 0; i < items.length; i++) {
    var t = items[i].querySelector('.sheet-item-text');
    if (t && t.textContent.trim() === '月') {
      items[i].click();
      return true;
    }
  }
  return false;
});
await page.waitForTimeout(400);
await page.evaluate(function () {
  var e = document.querySelector('.sheet-foot');
  if (e) e.click();
});
await page.waitForTimeout(2500);
const rangeText = await page.evaluate(function () {
  var e = document.querySelector('.bar-text');
  return e ? e.textContent.trim() : '';
});
check('⑥ 点「完成」后区间变「本月 …」', /^本月 /.test(rangeText), rangeText);

/* ============ ⑥.5 自定义时间的原生 picker 层级 ============ */
console.log('[4.5] 自定义时间 → 日期 picker 层级（用户报过被遮罩盖住）');
await page.evaluate(function () {
  var e = document.querySelector('.bar-text');
  if (e) e.click();
});
await page.waitForTimeout(800);
await page.evaluate(function () {
  var sw = document.querySelector('.sheet-switch');
  if (sw) sw.click();
});
await page.waitForTimeout(700);
check(
  '   「自定义」展开出起止时间',
  await page.evaluate(() => !!document.querySelector('uni-picker'))
);

await page.evaluate(function () {
  var el = document.querySelector('uni-picker');
  if (el) el.click();
});
await page.waitForTimeout(1000);

/*
 * ⚠️ 判据必须落在**最里层的 `.uni-picker-container`** 上：
 *    真正画日历面板的就是它，第一次修复时只把外层 `.uni-picker-custom` 抬到 3000，
 *    里层仍是 999 → 依旧被图表页的遮罩（1000）盖住。**只断言外层会漏掉这个 bug。**
 */
const levels = await page.evaluate(function () {
  /*
   * ⚠️ 页面里有**两个** `<picker>`（开始时间 + 结束时间），每个都会渲染一份
   *    `.uni-picker-container` —— 其中一份是 display:none、高度 0。
   *    直接 `querySelector` 会拿到那个隐藏的，判据就成了"面板高度 0"的假失败。
   */
  var panels = Array.from(document.querySelectorAll('.uni-picker-container'));
  var panel = null;
  for (var i = 0; i < panels.length; i++) {
    if (panels[i].getBoundingClientRect().height > 0) {
      panel = panels[i];
      break;
    }
  }
  var mask = document.querySelector('.mask');
  var outer = document.querySelector('.uni-picker-custom');
  return {
    panel: panel ? getComputedStyle(panel).zIndex : null,
    outer: outer ? getComputedStyle(outer).zIndex : null,
    mask: mask ? getComputedStyle(mask).zIndex : null,
    panelHeight: panel ? Math.round(panel.getBoundingClientRect().height) : 0,
  };
});
check(
  '★ ⑥ 日期面板（最里层 .uni-picker-container）z-index 高于页面遮罩',
  !!levels.panel && !!levels.mask && Number(levels.panel) > Number(levels.mask),
  `panel=${levels.panel} outer=${levels.outer} mask=${levels.mask}`
);
check('   日期面板真的可见（有高度）', levels.panelHeight > 100, `h=${levels.panelHeight}`);
await page.screenshot({ path: OUT + '/06-custom-picker.png' });

// 关掉 picker（点「取消」），别把状态带到后面的步骤
await page.evaluate(function () {
  var cancel = document.querySelector('.uni-picker-action-cancel');
  if (cancel) cancel.click();
});
await page.waitForTimeout(500);
await page.evaluate(function () {
  var mask = document.querySelector('.mask');
  if (mask) mask.click();
});
await page.waitForTimeout(500);

/* ============ ⑦ 二级口径 ============ */
console.log('[5] 二级口径');
/*
 * ⚠️ 前面第 ③ 步把视图切成了「条形图」，饼图分支下 `.ring-wrap` **根本不渲染** ——
 *    直接断扇区数会得到 0（本轮踩过）。所以这里先切回饼图再断言。
 */
await page.evaluate(function () {
  var tabs = Array.from(document.querySelectorAll('.bar-tab'));
  for (var i = 0; i < tabs.length; i++) {
    if (tabs[i].textContent.indexOf('饼图') >= 0) {
      tabs[i].click();
      return true;
    }
  }
  return false;
});
await page.waitForTimeout(900);

await page.evaluate(function () {
  var e = document.querySelector('.nav-center');
  if (e) e.click();
});
await page.waitForTimeout(600);
await page.evaluate(function () {
  var items = Array.from(document.querySelectorAll('.dropdown-item'));
  for (var i = 0; i < items.length; i++) {
    if (items[i].textContent.indexOf('二级支出') >= 0) {
      items[i].click();
      return true;
    }
  }
  return false;
});
await page.waitForTimeout(2500);
const t3 = await page.evaluate(function () {
  var e = document.querySelector('.nav-center-text');
  return e ? e.textContent.trim() : '';
});
const segs3 = await page.evaluate(function () {
  return Array.from(document.querySelectorAll('.ring-wrap circle')).filter(function (c) {
    return c.getAttribute('stroke-dasharray');
  }).length;
});
check('⑦ 已切到「二级支出」', t3 === '二级支出', t3);
check(`⑦ 二级口径仍有 ${N} 个支出分类`, segs3 === N, String(segs3));

/* ============ 清理 ============ */
console.log('[6] 清理临时账本');
const del = await api('/api/accounts/' + accId + '?confirmName=' + encodeURIComponent(accName), {
  method: 'DELETE',
});
check('临时账本已删除', del.status === 200, 'HTTP ' + del.status);

console.log('\n结果：PASS=' + pass + ' FAIL=' + fail);
console.log('截图：' + OUT);
await browser.close();
process.exit(fail ? 1 : 0);
