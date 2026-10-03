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
  for (const d of fs
    .readdirSync(root)
    .filter((x) => x.startsWith('chromium-'))
    .sort()
    .reverse())
    for (const arch of ['chrome-mac-arm64', 'chrome-mac-x64']) {
      const p = `${root}/${d}/${arch}/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
      if (fs.existsSync(p)) return p;
    }
}
let pass = 0,
  fail = 0;
const check = (n, ok, extra = '') => {
  if (ok) {
    pass += 1;
    console.log('  ✅ ' + n + ' ' + extra);
  } else {
    fail += 1;
    console.log('  ❌ ' + n + ' ' + extra);
  }
};

const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ['--no-proxy-server'],
});
const page = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 150)));

await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
if (page.url().includes('/pages/login')) {
  const inputs = page.locator('input');
  await inputs.nth(0).fill('demo');
  await inputs.nth(1).fill('123456');
  await page.getByText('登录', { exact: true }).last().click();
  await page.waitForTimeout(2500);
}
await page.goto('http://127.0.0.1:5173/#/pages/flow/index', { waitUntil: 'domcontentloaded' });
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
  const navH = await page.evaluate(() =>
    Math.round(document.querySelector('.nav').getBoundingClientRect().height),
  );

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
    'ghTop=' + scrolled.ghTop + ' navH=' + navH + ' pos=' + scrolled.ghSticky,
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
  for (const u of ['年', '季', '月', '周', '天']) check('粒度选项 ' + u, t.includes(u));
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
    JSON.stringify(sheet.items),
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
  check(
    '分类层级弹层贴屏幕底边（不留底栏高度）',
    lay.sheetBottom >= lay.vh - 1,
    JSON.stringify(lay),
  );

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
    JSON.stringify(flush),
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
    titles: [...document.querySelectorAll('.group-title')]
      .slice(0, 3)
      .map((e) => e.textContent.trim()),
    subs: [...document.querySelectorAll('.group-sub')].slice(0, 3).map((e) => e.textContent.trim()),
    bar: document.querySelector('.filter-bar').textContent.trim(),
  }));
  check(
    '分组标题是分类名（非时间段）',
    g.titles.length > 0 && !/^\d+月$/.test(g.titles[0]),
    JSON.stringify(g.titles),
  );
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
    JSON.stringify(state),
  );
}

console.log('[6] 日历页');
{
  await page.goto('http://127.0.0.1:5173/#/pages/calendar/index', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(3000);
  const cells = await page.evaluate(() => document.querySelectorAll('.day').length);
  check('日历格子渲染', cells >= 28, 'cells=' + cells);
  const fab = await page.evaluate(() => !!document.querySelector('.fab'));
  check('FAB 存在', fab);
  const amounts = await page.evaluate(() => document.querySelectorAll('.day-amount').length);
  check('格子显示金额', amounts > 0, 'amounts=' + amounts);
  await page.screenshot({ path: '/tmp/calendar.png', fullPage: true });
}

/*
 * [7] 滚到底自动加载下一批
 *
 * ⚠️ 这段**必须伪造 total**，否则测不到 —— demo 账号最多的分组只有 15 条，
 *    不到 `PAGE_SIZE`(100)，真实情况下永远不会出现「还有更多」。
 *    这是"探针得能造出目标状态"的一个例子。
 *
 * ⚠️ **page=2 必须返回非空，且数据要取自 page=1**（page=2 的真实响应是空数组，
 *    demo 的 15 条全在 page=1 —— 从它 slice 出来只会得到空数组，等于没伪造）。
 *    否则 `loadMoreDetail` 会把 total 收窄成实际条数、按钮随之消失，
 *    之后几次触底都找不到目标 —— 那么"只发了 1 次请求"的真正原因就成了
 *    **按钮没了**，而**不是节流生效**。**归因错误会让人以为测到了节流。**
 *
 * ⚠️ 压测节流的方式是**在底部反复抖动**（`scrollBy(0,1)` 每次都会再触发
 *    `onReachBottom`）。只滚一次的话"只发 1 个请求"是必然的，什么都测不到。
 *
 * pattern 刻意**不含 `/summary`** —— 分组聚合走 `/api/transactions/summary?…`，
 * 不会被拦到，所以组头的笔数/金额仍是真实值（伪造 total 不会污染它）。
 */
/*
 * [7] 预加载：接近底部就自动补下一批（而不是等触底）
 *
 * 核心判据是「**未触底就已发出 page=2**」—— 这正是预加载与"触底加载"的唯一区别。
 *
 * ⚠️ 这段**必须伪造 total**，否则测不到 —— demo 账号最多的分组只有 15 条，
 *    不到 `PAGE_SIZE`(100)，真实情况下永远不会出现「还有更多」。
 *
 * ⚠️ **page=2 的真实响应里 `list` 是空数组**（demo 的 15 条全在 page=1），
 *    从它 slice 出来只会得到空数组 = 等于没伪造 ⇒ 必须**缓存 page=1 的 list** 再回喂。
 *    而且要覆盖**所有** page>=2：page=3 返回空会让 total 被收窄、按钮消失，
 *    后续滚动就找不到目标，判据会**因为按钮没了而假通过**。
 *
 * ⚠️ page>=3 时刻意把 `total` 收到「实际累计条数」来**制造末页**，
 *    好验证"已到末页后不再发无效请求"。
 *
 * pattern 刻意**不含 `/summary`** —— 分组聚合走 `/api/transactions/summary?…`，
 * 不会被拦到，所以组头的笔数/金额仍是真实值（伪造 total 不会污染它）。
 */
console.log('[7] 预加载（接近底部就自动补下一批）');
{
  const detailReqs = [];
  let cachedFirstPage = null;
  const handler = async (route) => {
    const res = await route.fetch();
    const url = decodeURIComponent(route.request().url());
    detailReqs.push(url);
    try {
      const body = await res.json();
      if (body?.data && typeof body.data.total === 'number') {
        if (Array.isArray(body.data.list)) {
          if (cachedFirstPage === null && body.data.list.length) cachedFirstPage = body.data.list;
          const pm = /[?&]page=(\d+)(&|$)/.exec(url);
          const p = pm ? Number(pm[1]) : 1;
          if (p >= 2) {
            // 每页回喂 5 条；第 3 页起把 total 收到"实际累计条数"⇒ 制造末页
            body.data.total = p >= 3 ? 15 + 5 * (p - 1) : 200;
            body.data.list = (cachedFirstPage || [])
              .slice(0, 5)
              .map((t, i) => ({ ...t, id: 'auto' + p + '-' + i }));
          } else {
            body.data.total = 200; // 首屏：伪造"还有 185 条"
          }
        }
        await route.fulfill({ response: res, body: JSON.stringify(body) });
        return;
      }
      await route.fulfill({ response: res });
    } catch {
      await route.fulfill({ response: res });
    }
  };
  await page.route('**/api/transactions?*', handler);

  /*
   * ⚠️ **必须 reload**：上一段停在日历页，而这里只是把 hash 换成 flow ——
   *    浏览器对"同文档、仅 hash 不同"的 goto **不会重新加载文档**，
   *    于是页面没真正切过去（实测：明细行数 0、按钮不出现）。
   *    与登录后那次 goto 的区别正在于此：那次 hash 是从别的路径变成 flow，等于换页。
   */
  await page.goto('http://127.0.0.1:5173/#/pages/flow/index', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const btnText = () =>
    page.evaluate(() => {
      const el = document.querySelector('.detail-more');
      return el ? el.innerText.replace(/\s+/g, ' ').trim() : null;
    });

  const before = await btnText();
  check(
    '伪造 total 后出现「加载更多」并写明已显示 / 总数',
    !!before && /已显示 \d+ \/ 200 条/.test(before),
    before || '(无)',
  );

  const countPage = (n) =>
    detailReqs.filter((u) => new RegExp(`[?&]page=${n}(&|$)`).test(u)).length;

  /*
   * ⚠️ 滚动目标算错过一次，务必注意：
   *   我原来写「滚到距底部 0.8 屏」—— 但 **0.8 屏 < 1 屏**，那个位置落在**最大滚动位置之外**，
   *   浏览器只能滚到 maxScrollTop（= 触底）⇒ 触发的是 `onReachBottom` 兜底，
   *   而"未触底就预取"那条判据**照样是绿的**（负向验证把阈值设成 0 也没红）。
   *   ⇒ **负向验证救了一次假绿。**
   *
   * 正确做法：滚到「距底部 0.9 **屏**」—— 0.9vh 这个位置在 maxScrollTop **之内**
   *   （maxScrollTop 距底部只有 1 屏），所以可达、且**确实还没触底**；
   *   阈值是 1.5 屏 ⇒ 0.9 屏 < 1.5 屏，仍在预取范围内。
   */
  await page.evaluate(() => {
    const el = document.documentElement;
    const gap = window.innerHeight * 0.9;
    window.scrollTo(0, Math.max(0, el.scrollHeight - window.innerHeight - gap));
  });
  await page.waitForTimeout(1500);

  /*
   * "未触底"的判据用「**还能继续往下滚**」（`scrollY < maxScrollTop`）。
   * ⚠️ **不要**用"预取完成后的距底部距离"—— 预取会追加内容、抬高 maxScrollTop，
   *    那个数字会被"内容变长"掩盖（我第一次就是这么被骗的：距离只剩 138px，看着像没触底）。
   *    `scrollY` 不会因为下方追加内容而改变，所以这个判据是稳的。
   */
  const pos = await page.evaluate(() => {
    const el = document.documentElement;
    return { y: Math.round(window.scrollY), max: Math.round(el.scrollHeight - window.innerHeight) };
  });
  const p2 = countPage(2);
  check(
    '**未触底**就已预取第 2 页（这正是预加载与"触底加载"的唯一区别）',
    p2 >= 1,
    `page=2 请求 ${p2} 次`,
  );
  check(
    '发请求时**还能继续往下滚**（证明确实"提前"了，不是滑到底才发）',
    pos.y < pos.max,
    `scrollY=${pos.y} / maxScrollTop=${pos.max}（还有 ${pos.max - pos.y}px 可滚）`,
  );
  const rowAfterPrefetch = await page.locator('.txn').count();
  check(
    '预取的数据已追加进列表（到达底部时无需等待）',
    rowAfterPrefetch >= 20,
    `明细行数 ${rowAfterPrefetch}`,
  );

  // ② 继续滚动（> PREFETCH_CASCADE_GUARD_PX = 24px）⇒ 触发条件应重置，接着预取第 3 页
  await page.evaluate(() => window.scrollBy(0, 40));
  await page.waitForTimeout(1500);
  const p3 = countPage(3);
  check('继续滚动后接着预取第 3 页（触发条件已重置，可持续预取）', p3 >= 1, `page=3 请求 ${p3} 次`);

  // ③ 末页：page=3 已把 total 收到实际条数 ⇒ 之后不该再有 page=4
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
  await page.waitForTimeout(1000);
  const p4 = countPage(4);
  check('已到末页后不再发无效请求', p4 === 0, `page=4 请求 ${p4} 次`);

  const after = await btnText();
  /*
   * 末页时按钮**应该消失**（`v-if="hasMoreDetail(g.key)"` 为 false）——
   * 这本身就是"末页判断正确"的一部分：既不发无效请求，也不留一个点不动的按钮。
   * ⚠️ 我先前把判据写成「文案更新为『已显示 25 / 25 条』」，那是**想反了**：
   *     `loaded(25) >= total(25)` ⇒ 按钮整个不渲染，文案根本不会出现。
   */
  check('到末页后按钮消失（不留一个点不动的入口）', after === null, after || '(已消失 ✅)');

  await page.unroute('**/api/transactions?*', handler);
}

console.log(`\n结果：PASS=${pass} FAIL=${fail}`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
