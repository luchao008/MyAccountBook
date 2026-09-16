/**
 * 流水页 + 日历页运行时验证（真实浏览器）。
 *
 *   node scripts/verify-flow.mjs
 *
 * 覆盖：分组展开（含按日分组）、更多弹窗（导出/筛选/排序）、
 *       分组粒度切换（年/季/月/周/天）、分类多选、搜索框、日历页（格子/金额/FAB）。
 *
 * ⚠️ 只读不写：不创建、不修改、不删除任何数据。
 */
import fs from 'node:fs';
const PW = '/Users/luchao/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js';
const pw = await import(PW);
const { chromium } = pw.default ?? pw;
function findChrome() {
  const root = `${process.env.HOME}/Library/Caches/ms-playwright`;
  for (const d of fs.readdirSync(root).filter(x=>x.startsWith('chromium-')).sort().reverse())
    for (const arch of ['chrome-mac-arm64','chrome-mac-x64']) {
      const p = `${root}/${d}/${arch}/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
      if (fs.existsSync(p)) return p;
    }
}
let pass=0, fail=0;
const check = (n, ok, extra = '') => {
  if (ok) {
    pass += 1;
    console.log('  ✅ ' + n + ' ' + extra);
  } else {
    fail += 1;
    console.log('  ❌ ' + n + ' ' + extra);
  }
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-proxy-server'] });
const page = await (await browser.newContext({ viewport:{width:375,height:812} })).newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0,150)));

await page.goto('http://127.0.0.1:5173', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1500);
if (page.url().includes('/pages/login')) {
  const inputs = page.locator('input');
  await inputs.nth(0).fill('demo'); await inputs.nth(1).fill('123456');
  await page.getByText('登录',{exact:true}).last().click();
  await page.waitForTimeout(2500);
}
await page.goto('http://127.0.0.1:5173/#/pages/flow/index', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(3000);

console.log('[1] 展开分组');
{
  /*
   * ⚠️ **不能盲目点一下 `.group-head`**：流水页在 2026-09-14 起
   *    `loadGroups()` 末尾会自动展开第一个分组（`toggleGroup(groups[0])`），
   *    再点一次是**收起** —— 于是断言拿到 txn=0，
   *    且连带 [1.5] 也失效（分组收起后页面高度不足，`window.scrollTo` 滚不动）。
   *    这里改成**幂等**：只在未展开时才点。
   */
  const before = await page.evaluate(() => document.querySelectorAll('.txn').length);
  if (before === 0) {
    await page.locator('.group-head').first().click();
    await page.waitForTimeout(2500);
  }
  const txnCount = await page.evaluate(() => document.querySelectorAll('.txn').length);
  check('展开后出现明细行', txnCount > 0, 'txn=' + txnCount);
  const dayHeads = await page.evaluate(() => document.querySelectorAll('.day-head').length);
  check('明细按日分组', dayHeads > 0, 'day=' + dayHeads);
}

console.log('[1.5] 吸顶与变色');
{
  /*
   * 判据三条（缺一不可）：
   *   ① 滚过渐变头后顶栏变白（`.nav.solid`）；
   *   ② 顶栏始终贴顶（fixed，top=0）；
   *   ③ 组头吸在顶栏下方（sticky，top == 顶栏高）。
   *
   * ⚠️ 不能用 `el.scrollTop = N` 设滚动位置（uni-app 会回写），
   *    这里用 `window.scrollTo` —— 实测它能生效且不被重置。
   */
  const navH = await page.evaluate(() => Math.round(document.querySelector('.nav').getBoundingClientRect().height));

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  const atTop = await page.evaluate(() => ({
    solid: document.querySelector('.nav').classList.contains('solid'),
    navTop: Math.round(document.querySelector('.nav').getBoundingClientRect().top),
  }));
  check('顶部时顶栏透明（渐变透出）', !atTop.solid);
  check('顶栏始终 fixed 贴顶', atTop.navTop === 0, 'top=' + atTop.navTop);

  // 滚过渐变头（用足够大的值，页面会 clamp 到最大可滚位置）
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.waitForTimeout(500);
  const scrolled = await page.evaluate((nh) => {
    const nav = document.querySelector('.nav');
    const gh = document.querySelector('.group-head');
    return {
      y: Math.round(window.scrollY),
      solid: nav.classList.contains('solid'),
      navBg: getComputedStyle(nav).backgroundColor,
      navTop: Math.round(nav.getBoundingClientRect().top),
      ghTop: gh ? Math.round(gh.getBoundingClientRect().top) : null,
      ghSticky: gh ? getComputedStyle(gh).position : null,
      navH: nh,
    };
  }, navH);

  check('滚动后顶栏变白', scrolled.solid, 'bg=' + scrolled.navBg);
  check('滚动后顶栏仍贴顶', scrolled.navTop === 0, 'top=' + scrolled.navTop);
  check(
    '组头吸在顶栏下方',
    scrolled.ghTop === navH && scrolled.ghSticky === 'sticky',
    'ghTop=' + scrolled.ghTop + ' navH=' + navH + ' pos=' + scrolled.ghSticky
  );
  await page.screenshot({ path: '/tmp/flow-sticky.png' });
}

console.log('[2] 更多弹窗');
{
  await page.locator('.nav-actions .nav-btn').first().click();
  await page.waitForTimeout(700);
  const t = await page.evaluate(() => document.body.innerText);
  check('批量操作标题', t.includes('批量操作'));
  check('流水导出', t.includes('流水导出'));
  check('筛选', t.includes('筛选'));
  check('排序', t.includes('排序'));
  check('取消', t.includes('取消'));
  // 关闭
  await page.locator('.sheet-cancel').click();
  await page.waitForTimeout(500);
}

console.log('[3] 分组粒度弹层');
{
  await page.locator('.filter-item').first().click();
  await page.waitForTimeout(700);
  const t = await page.evaluate(() => document.body.innerText);
  for (const u of ['年','季','月','周','天']) check('粒度选项 ' + u, t.includes(u));
  // 选「天」
  await page.locator('.sheet-item-text', { hasText: '天' }).first().click();
  await page.waitForTimeout(2500);
  const key = await page.evaluate(() => document.querySelector('.group-title')?.textContent.trim());
  check('切到「天」后分组标题变化', /\d+月\d+日/.test(key || ''), 'title=' + key);
}

console.log('[4] 分类维度弹层（一级 / 二级）');
{
  await page.locator('.filter-item').nth(1).click();
  await page.waitForTimeout(900);

  const sheet = await page.evaluate(() => ({
    items: [...document.querySelectorAll('.sheet-item-text')].map((e) => e.textContent.trim()),
    confirm: document.querySelectorAll('.btn-confirm').length,
  }));
  check(
    '弹层只有「一级分类 / 二级分类」两行',
    JSON.stringify(sheet.items) === '["一级分类","二级分类"]',
    JSON.stringify(sheet.items)
  );
  // 参考图里这个弹层没有「确定」—— 它选的是分组维度，点即生效
  check('无「确定」按钮（点即生效）', sheet.confirm === 0, 'confirm=' + sheet.confirm);

  // 弹层不能压住底栏
  /*
   * 所有弹层都**贴屏幕底边升起、不留底栏高度**（底栏被盖住是有意为之：
   * 弹层是模态的，此时底栏不可操作；留白反而在下方露出一条无意义的缝）。
   * 所以判据是 sheetBottom ≈ 视口高，而**不是**"不压住底栏"。
   */
  const lay = await page.evaluate(() => {
    const s = document.querySelector('.sheet').getBoundingClientRect();
    return { sheetBottom: Math.round(s.bottom), vh: window.innerHeight };
  });
  check('分类层级弹层贴屏幕底边（不留底栏高度）', lay.sheetBottom >= lay.vh - 1, JSON.stringify(lay));

  // ⚠️ 先关掉分类层级弹层（它没有 header，点遮罩关闭），检查完再重新打开
  await page.mouse.click(187, 60);
  await page.waitForTimeout(600);
  await page.locator('.nav-actions .nav-btn').first().click();
  await page.waitForTimeout(700);
  const flush = await page.evaluate(() => {
    const s = document.querySelector('.mask-flush .sheet')?.getBoundingClientRect();
    return s ? { bottom: Math.round(s.bottom), vh: window.innerHeight } : null;
  });
  check(
    '「更多操作」弹层贴屏幕底边',
    !!flush && flush.bottom >= flush.vh - 1,
    JSON.stringify(flush)
  );
  await page.locator('.sheet-cancel').click();
  await page.waitForTimeout(500);

  // 重新打开分类层级弹层（前面为了做对照检查把它关了）
  await page.locator('.filter-item').nth(1).click();
  await page.waitForTimeout(900);

  // 选「二级分类」→ 列表按分类分组
  await page.locator('.sheet-item-text', { hasText: '二级分类' }).first().click();
  await page.waitForTimeout(3000);
  const g = await page.evaluate(() => ({
    titles: [...document.querySelectorAll('.group-title')].slice(0, 3).map((e) => e.textContent.trim()),
    subs: [...document.querySelectorAll('.group-sub')].slice(0, 3).map((e) => e.textContent.trim()),
    bar: document.querySelector('.filter-bar').textContent.trim(),
  }));
  check('分组标题是分类名（非时间段）', g.titles.length > 0 && !/^\d+月$/.test(g.titles[0]), JSON.stringify(g.titles));
  check('底栏显示「二级分类」', g.bar.includes('二级分类'), g.bar);

  // 切回时间维度
  await page.locator('.filter-item').first().click();
  await page.waitForTimeout(700);
  await page.locator('.sheet-item-text', { hasText: '月' }).first().click();
  await page.waitForTimeout(3000);
  const back = await page.evaluate(() => ({
    title: document.querySelector('.group-title')?.textContent.trim(),
    bar: document.querySelector('.filter-bar').textContent.trim(),
  }));
  check('切回时间维度后按时间分组', /月/.test(back.title || ''), 'title=' + back.title);
  check('底栏回到「月 / 分类」', back.bar.includes('月') && back.bar.includes('分类'), back.bar);
}

console.log('[5] 搜索');
{
  await page.locator('.nav-actions .nav-btn').nth(2).click();
  await page.waitForTimeout(700);
  const hasBar = await page.evaluate(() => !!document.querySelector('.search-page'));
  check('搜索框展开', hasBar);
  await page.locator('.search-box-input input').fill('午饭');
  await page.locator('.search-box-input input').press('Enter');
  await page.waitForTimeout(2500);
  /*
   * ⚠️ 这里不能写成 `groups >= 0` —— 那永远为真，等于没校验（"报告里写了断言但判定通过"
   *    比没有断言更糟）。正确的判据是"搜索后进入了某种确定的结果态"：
   *    要么有分组、要么显示空状态，**但不能是错误态或加载态**。
   */
  const state = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      groups: document.querySelectorAll('.group').length,
      empty: t.includes('该条件下暂无流水'),
      err: t.includes('加载失败'),
      loading: t.includes('加载中'),
    };
  });
  check(
    '搜索后进入确定结果态（分组 / 空 / 非错误）',
    !state.err && !state.loading && (state.groups > 0 || state.empty),
    JSON.stringify(state)
  );
}

console.log('[6] 日历页');
{
  await page.goto('http://127.0.0.1:5173/#/pages/calendar/index', { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(3000);
  const cells = await page.evaluate(() => document.querySelectorAll('.day').length);
  check('日历格子渲染', cells >= 28, 'cells=' + cells);
  const fab = await page.evaluate(() => !!document.querySelector('.fab'));
  check('FAB 存在', fab);
  const amounts = await page.evaluate(() => document.querySelectorAll('.day-amount').length);
  check('格子显示金额', amounts > 0, 'amounts=' + amounts);
  await page.screenshot({ path: '/tmp/calendar.png', fullPage: true });
}

console.log(`\n结果：PASS=${pass} FAIL=${fail}`);
await browser.close();
process.exit(fail>0?1:0);
