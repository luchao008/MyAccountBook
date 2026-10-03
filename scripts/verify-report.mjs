/**
 * 报表页运行时验证（真实浏览器）。
 *
 *   node scripts/verify-report.mjs
 *
 * 为什么必须真跑：报表页是「双 Tab + 年/月粒度切换 + uCharts 折线图」，
 * 静态检查（build / tsc）看不见下列问题 ——
 *   · 折线图是否真的渲染出 canvas（uCharts 初始化失败是**静默空白**）；
 *   · 切粒度后数据与标题是否同步刷新；
 *   · 三态（加载中 / 失败 / 空）是否真的切换；
 *   · 日期弹窗的「年 / 月」两种模式是否各自回填正确。
 *
 * ⚠️ 本脚本只读不写：不创建、不修改、不删除任何数据。
 */
import fs from 'node:fs';

const PW =
  process.env.PW_PATH ||
  '/Users/luchao/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js';
const pw = await import(PW);
const { chromium } = pw.default ?? pw;

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const root = `${process.env.HOME}/Library/Caches/ms-playwright`;
  try {
    for (const d of fs
      .readdirSync(root)
      .filter((x) => x.startsWith('chromium-'))
      .sort()
      .reverse()) {
      for (const arch of ['chrome-mac-arm64', 'chrome-mac-x64']) {
        const p = `${root}/${d}/${arch}/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
        if (fs.existsSync(p)) return p;
      }
    }
  } catch {
    /* 让 Playwright 自己找 */
  }
  return undefined;
}

const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const USER = process.env.SEED_USER || 'demo';
const PASS = process.env.SEED_PASS || '123456';

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) {
    console.log(`  ✅ ${name} ${extra}`);
    pass += 1;
  } else {
    console.log(`  ❌ ${name} ${extra}`);
    fail += 1;
  }
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-proxy-server'] });
/*
 * ⚠️ hasTouch 必须开：趋势图的「点月份 → 高亮 + tooltip」要靠真实触摸事件驱动
 *    （uCharts 在 H5 走 renderjs 的 touch 通道，纯 mouse 事件不走那条路）。
 */
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true });
const page = await ctx.newPage();

/** 收集页面 JS 报错：趋势图 tooltip 曾因 bgColor 传 rgba 而抛错（画不出来）却没被任何断言发现 */
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120)));

/**
 * 页面**最近一次**请求 `/statistics/report` 用的 `period` 与 `accountId`。
 *
 * ⚠️ 为什么要记它们、而不是硬编码：分类 Tab 的默认时段是**当前月**，
 *    而"当前月有没有数据"取决于**跑脚本的日期**与库里的数据 ——
 *    硬编码 `period=2026-09` 的写法会让判据**随日历自己变红**
 *    （2026-10-02 实测：页面正确显示「2026年10月暂无记录」，
 *      探针却拿 9 月的数据断言页面必须出现 → 9 条假红）。
 *    断言必须针对**页面实际显示的那个期间**，否则测的就不是这个页面。
 *
 * ⚠️ `accountId` 也必须带上（2026-10-03 修，这个坑很隐蔽）：
 *    页面发的是 `/statistics/report?period=…&accountId=3`，而原探针自己 fetch 时
 *    **不带 accountId** —— 于是后端按"默认账本"算，拿到的数据属于**另一个账本**。
 *    在 9 月那轮恰好默认账本也有数据，所以"看起来是对的"；
 *    一旦当前账本与默认账本的数据分布不同，比对就必然对不上（表现为假红）。
 *    **判据与被判定的对象必须用同一组参数**，这是本条的教训。
 */
let lastReportPeriod = '';
let lastReportAccountId = '';
page.on('request', (req) => {
  const url = req.url();
  if (!url.includes('/api/statistics/report')) return;
  const p = url.match(/[?&]period=([^&]+)/);
  if (p) lastReportPeriod = decodeURIComponent(p[1]);
  const a = url.match(/[?&]accountId=([^&]+)/);
  if (a) lastReportAccountId = decodeURIComponent(a[1]);
});

/*
 * 记录 canvas 上画过的**每一段文字**。
 *
 * 为什么需要：uCharts 把图例/轴标签/数据标签都画在 canvas 里，DOM 查不到 ——
 * "轴顶画出一个 undefined"「数据标签糊成一片」这类问题只能靠注入 fillText 抓
 * （2026-09-19 修趋势图时就是这么定位的）。必须在任何脚本执行前装好。
 */
await page.addInitScript(() => {
  window.__drawnTexts = [];
  const orig = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...rest) {
    try {
      // 连坐标一起记：数据标签画在**绘图区里**，轴刻度贴在左边缘 —— 靠 x 就能区分
      window.__drawnTexts.push({ t: String(text), x: Math.round(x) });
    } catch {
      /* 忽略 */
    }
    return orig.call(this, text, x, y, ...rest);
  };
});

// 登录
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
if (page.url().includes('/pages/login')) {
  const inputs = page.locator('input');
  await inputs.nth(0).fill(USER);
  await inputs.nth(1).fill(PASS);
  await page.getByText('登录', { exact: true }).last().click();
  await page.waitForTimeout(2000);
}
console.log('登录完成，当前：', page.url());

// 直接进报表页
await page.goto(`${BASE}/#/pages/statistics/index`, { waitUntil: 'domcontentloaded' });

const bodyText = () => page.evaluate(() => document.body.innerText);

/**
 * 等页面上出现某段文字，超时**不抛**（返回 false）。
 *
 * ⚠️ 为什么需要它（2026-10-03 修，两处假红的根因）：
 *    `page.goto` + `waitForTimeout(固定毫秒)` 这个组合在本页**不可靠** ——
 *    Vite dev 首次访问报表页要**现场编译**（报表页 + RingChart + 一堆依赖），
 *    冷启动或机器高负载时 2500ms 远远不够，于是断言取到的是**上一个页面**的文本，
 *    报"标题「报表」不存在""账本流水统计不存在"—— 把"页面还没加载完"
 *    误报成"页面缺内容"。实测同一份代码：冷启动 FAIL=17、预热后这两段全绿。
 *
 * 为什么超时**不抛**：抛异常会中断整个脚本，后面的检查连跑都跑不到；
 *    这里让流程继续，最终由**断言本身**报红 —— 红在"内容缺失"上比"脚本崩了"更有信息量。
 */
const waitText = async (needle, ms = 20000) => {
  try {
    await page.waitForFunction((n) => document.body.innerText.includes(n), needle, { timeout: ms });
    return true;
  } catch {
    return false;
  }
};

// 等页面外壳 + 基础统计的**真实内容**（后者要等 /statistics/report 回来，不能只等外壳）
await waitText('报表');
await waitText('账本流水统计');

/**
 * 拉某个期间 + **同一个账本**的二级口径分类名（在**页面上下文**里发请求，复用登录后的 token）。
 * 与页面上展示的排行做比对，用来验证"分类 Tab 用的是二级口径"。
 *
 * ⚠️ `accountId` 不能省（见 `lastReportAccountId` 的注释）：省了就是拿另一个账本的数据去比对。
 */
const fetchL2 = (period, accountId) =>
  page.evaluate(
    async ({ p, a }) => {
      const token = localStorage.getItem('token') || localStorage.getItem('uni-storage-token');
      const qs = `period=${encodeURIComponent(p)}` + (a ? `&accountId=${encodeURIComponent(a)}` : '');
      const res = await fetch(`/api/statistics/report?${qs}`, {
        headers: { Authorization: 'Bearer ' + token },
      });
      const body = await res.json();
      return (body?.data?.expenseCategoriesL2 || []).map((r) => r.name);
    },
    { p: period, a: accountId }
  );

console.log('\n[1] 顶栏与 Tab');
{
  const t = await bodyText();
  check('标题「报表」', t.includes('报表'));
  check('Tab「基础统计」', t.includes('基础统计'));
  check('Tab「分类」', t.includes('分类'));
  check('已删除的 Tab 不出现（账户/成员/项目/商家）',
    !t.includes('账户') && !t.includes('成员') && !t.includes('项目') && !t.includes('商家'));
}

console.log('\n[2] 基础统计默认内容');
{
  const t = await bodyText();
  check('账本流水统计', t.includes('账本流水统计'));
  check('结余', t.includes('结余'));
  check('记账里程碑', t.includes('记账里程碑'));
  check('收入来源', t.includes('收入来源'));
  check('支出分布', t.includes('支出分布'));
}

console.log('\n[3] 时段选择弹窗');
{
  // 点日期栏打开弹窗（基础统计默认「2026年」，分类默认「2026年9月」，两种都要能匹配）
  await page.locator('.period-center').first().click();
  await page.waitForTimeout(600);
  const t = await bodyText();
  check('弹窗标题「选择时间」', t.includes('选择时间'));
  check('模式「月」', t.includes('月'));
  check('模式「年」', t.includes('年'));
  check('确定按钮', t.includes('确定'));

  // 切到「年」模式
  const yearBtn = page.locator('.mode-item', { hasText: '年' }).first();
  if (await yearBtn.count()) {
    await yearBtn.click();
    await page.waitForTimeout(400);
  }
  // 点确定
  const okBtn = page.locator('.confirm').first();
  if (await okBtn.count()) {
    await okBtn.click();
    await page.waitForTimeout(2500);
  }
  const t2 = await bodyText();
  check('年粒度下出现「月度收支趋势」', t2.includes('月度收支趋势'), '');
}

console.log('\n[4] 趋势图渲染（uCharts canvas：收入/支出折线 + 结余面积）');
{
  const canvasCount = await page.evaluate(
    () => document.querySelectorAll('canvas').length
  );
  check('canvas 已渲染', canvasCount > 0, `canvas=${canvasCount}`);

  /*
   * ⚠️ uCharts 画在 canvas 上，**图例文字/序列都不在 DOM 里** ——
   *    只断言"canvas 存在"抓不到"某条序列没渲染"。改为**采样像素**：
   *    统计出现过的颜色，确认三条序列色都在画布上。
   *    （2026-09-16 加结余面积时就是这么发现 area 配置要放对位置的。）
   */
  const pix = await page.evaluate(() => {
    const cv = document.querySelector('canvas');
    if (!cv) return null;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    const img = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let income = 0; // #c2410c 橙红 194,65,12
    let expense = 0; // #0e7490 青 14,116,144
    let balanceLine = 0; // #1d63b8 蓝 29,99,184
    let balanceArea = 0; // 蓝色低透明度与白底混合（b 明显大于 r 且大于 g）
    for (let i = 0; i < img.length; i += 4) {
      const a = img[i + 3];
      if (a < 10) continue;
      const r = img[i];
      const g = img[i + 1];
      const b = img[i + 2];
      if (Math.abs(r - 194) < 20 && Math.abs(g - 65) < 20 && Math.abs(b - 12) < 20) income++;
      else if (Math.abs(r - 14) < 20 && Math.abs(g - 116) < 20 && Math.abs(b - 144) < 20) expense++;
      else if (Math.abs(r - 29) < 20 && Math.abs(g - 99) < 20 && Math.abs(b - 184) < 20) balanceLine++;
      else if (b > r + 15 && b > g + 20) balanceArea++;
    }
    return { income, expense, balanceLine, balanceArea };
  });
  check('收入折线（橙红 #c2410c）已渲染', !!pix && pix.income > 50, pix ? `px=${pix.income}` : 'n/a');
  check('支出折线（青 #0e7490）已渲染', !!pix && pix.expense > 50, pix ? `px=${pix.expense}` : 'n/a');
  check('结余折线（蓝 #1d63b8）已渲染', !!pix && pix.balanceLine > 20, pix ? `px=${pix.balanceLine}` : 'n/a');
  // 面积填充 = 蓝与白底的混合色，像素量应远大于折线本身
  check('结余面积填充已渲染（蓝色调像素 > 500）', !!pix && pix.balanceArea > 500, pix ? `px=${pix.balanceArea}` : 'n/a');

  /*
   * ── 2026-09-19「趋势图混乱」的防回归断言（用户报告 + 修复见 TrendChart.vue）──
   *  ① opts 层：dataLabel 必须显式 false（uCharts 判据是 `!== false`，不写就是开，
   *     12 月 × 3 序列 = 36 个数字标签糊满图）；
   *     yAxis.showTitle 必须显式 false（vendor 的 mix 默认值是 true，不写就在轴顶
   *     画出来一个字面量 "undefined"）；
   *     并且**不允许**再出现 formatter 函数 —— qiun 会把 opts 两次 JSON 序列化，
   *     函数被静默丢掉（曾经有一版「x.x万」的 formatter 从未生效）。
   *  ② 数据层：结余是浮点减法算的，必须已取整到 2 位小数。
   *  ③ 渲染层：抓 fillText —— 画布上不允许出现 "undefined"，也不允许出现
   *     ≥3 位小数的数字（即 12886.999999999991 那类噪声）。
   */
  const trendInfo = await page.evaluate(() => {
    const cv = document.querySelector('canvas');
    let inst = cv && cv.__vueParentComponent;
    let trend = null;
    while (inst) {
      const nm = String((inst.type && (inst.type.__name || inst.type.name)) || '');
      if (nm === 'TrendChart') {
        trend = inst;
        break;
      }
      inst = inst.parent;
    }
    if (!trend) return null;
    const ss = trend.setupState || {};
    const o = ss.opts || {};
    const cd = ss.chartData || {};
    const all = (cd.series || []).flatMap((s) => s.data || []);
    return {
      dataLabel: o.dataLabel,
      showTitle: o.yAxis ? o.yAxis.showTitle : '(无)',
      hasFormatter: !!(o.yAxis && o.yAxis.data && o.yAxis.data[0] && o.yAxis.data[0].formatter),
      maxDecimals: all.reduce(
        (m, v) => Math.max(m, (String(v).split('.')[1] || '').length),
        0
      ),
      count: all.length,
    };
  });
  check(
    'opts.dataLabel 显式关闭（不关会画 36 个数字标签）',
    !!trendInfo && trendInfo.dataLabel === false,
    trendInfo ? String(trendInfo.dataLabel) : 'n/a'
  );
  check(
    'opts.yAxis.showTitle 显式关闭（不关会在轴顶画 undefined）',
    !!trendInfo && trendInfo.showTitle === false,
    trendInfo ? String(trendInfo.showTitle) : 'n/a'
  );
  check('不再使用会被 JSON 序列化丢掉的 formatter 函数', !!trendInfo && !trendInfo.hasFormatter);
  check(
    '序列值均已取整到 2 位小数（无浮点噪声）',
    !!trendInfo && trendInfo.maxDecimals <= 2,
    trendInfo ? `最长小数位=${trendInfo.maxDecimals}（${trendInfo.count} 个值）` : 'n/a'
  );

  const drawn = await page.evaluate(() => window.__drawnTexts || []);
  const undefCount = drawn.filter((d) => d.t === 'undefined').length;
  const noisy = drawn.filter((d) => /^-?\d+\.\d{3,}$/.test(d.t));
  /*
   * 「数据标签确已关闭」的行为级判据：
   *   Y 轴刻度贴在画布左边缘（实测 x≈42），而数据标签画在**绘图区里**（x 远大于它）。
   *   所以「所有数字型文字都出现在左边缘带内」= 图上没有点标签。
   *   ⚠️ 不用"数字条数/去重数"判：demo 默认账本的趋势多为 0，去重后只有几个值凑巧不超阈值。
   *   ⚠️ uCharts 入场动画会逐帧重绘，同一段文字会被 fillText 几十次，所以按集合去重。
   */
  const numericInPlot = [
    ...new Set(
      drawn.filter((d) => /^-?\d+(\.\d+)?$/.test(d.t) && d.x > 60).map((d) => `${d.t}@x=${d.x}`)
    ),
  ];
  check('画布上没有 "undefined" 文字', undefCount === 0, `出现 ${undefCount} 次`);
  check('画布上没有 ≥3 位小数的数字', noisy.length === 0, noisy.slice(0, 3).join(' / '));
  check(
    '绘图区内没有数字文字（数据标签确已关闭）',
    numericInPlot.length === 0,
    numericInPlot.slice(0, 4).join(' / ')
  );

  /*
   * ── 2026-09-19 按参考图改版：Y 轴 3 条刻度（万为单位）、X 轴只显示单数月、
   *    点中的月份高亮（DOM chip）、tooltip 显示三条序列 ──
   */
  const axisInfo = await page.evaluate(() => {
    const seen = new Map();
    for (const d of window.__drawnTexts) if (!seen.has(d.t + '@' + d.x)) seen.set(d.t + '@' + d.x, d);
    const all = [...seen.values()];
    return {
      yTicks: [...new Set(all.filter((d) => /^\d+(\.\d+)?万?$/.test(d.t)).map((d) => d.t))],
      months: [...new Set(all.filter((d) => /^\d{2}月$/.test(d.t)).map((d) => d.t))],
    };
  });
  check(
    'Y 轴只有 3 条刻度线',
    axisInfo.yTicks.length === 3,
    axisInfo.yTicks.join(' / ')
  );
  check(
    'Y 轴金额按「万」压缩（≥1 万显示 x万）',
    axisInfo.yTicks.some((t) => t.includes('万')),
    axisInfo.yTicks.join(' / ')
  );
  check(
    'X 轴默认只显示单数月（01/03/05/07/09/11）',
    axisInfo.months.length === 6 && axisInfo.months.every((m) => Number(m.slice(0, 2)) % 2 === 1),
    axisInfo.months.join(' ')
  );

  /* 触摸一个月 → chip 高亮 + tooltip 三条序列，且 chip 与 canvas 上的标签位置对齐 */
  // ⚠️ 必须先把图表滚进视口：touchscreen.tap 用的是**视口坐标**，图表在折叠线以下时点不到
  await page.evaluate(() => {
    const el = document.querySelector('.trend-chart');
    if (el) el.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(500);
  const tapInfo = await page.evaluate(() => {
    const cv = document.querySelector('canvas');
    const r = cv.getBoundingClientRect();
    const seen = new Map();
    for (const d of window.__drawnTexts) if (!seen.has(d.t + '@' + d.x)) seen.set(d.t + '@' + d.x, d);
    const m05 = [...seen.values()].find((d) => d.t === '05月');
    /* 画布是 1x（本脚本 deviceScaleFactor=1），fillText 坐标即 CSS px */
    const dpr = cv.width / r.width;
    return m05
      ? { x: r.left + m05.x / dpr, y: r.top + 90, labelX: m05.x / dpr, canvasLeft: r.left }
      : null;
  });
  check('能在图上定位到某个月份（用于点击）', !!tapInfo, tapInfo ? `05月@${Math.round(tapInfo.labelX)}` : 'n/a');
  if (tapInfo) {
    await page.evaluate(() => {
      window.__drawnTexts = [];
    });
    await page.touchscreen.tap(tapInfo.x, tapInfo.y);
    await page.waitForTimeout(900);
    const tapRes = await page.evaluate(() => {
      const chip = document.querySelector('.x-chip');
      const cv = document.querySelector('canvas');
      const cr = cv ? cv.getBoundingClientRect() : null;
      const chipRect = chip ? chip.getBoundingClientRect() : null;
      const texts = window.__drawnTexts.map((d) => d.t);
      /*
       * 用「相邻单数月标签」反推 uCharts 的 X 轴布局：
       *   下标 0（01月）的位置 = area[3]，每月间距 = (11月位置 − 01月位置) / 10。
       * 于是任意下标的「标签中心」都能算出来，再和 chip 的中心比对 ——
       * 这样不必假设"点哪个位置就选中哪个月"（uCharts 的判界与直觉差半格）。
       */
      const seen = new Map();
      for (const d of window.__drawnTexts) if (!seen.has(d.t + '@' + d.x)) seen.set(d.t + '@' + d.x, d);
      const labels = [...seen.values()].filter((d) => /^\d{2}月$/.test(d.t));
      const first = labels.find((d) => d.t === '01月');
      const last = labels.find((d) => d.t === '11月');
      const dpr = cv ? cv.width / cr.width : 1;
      let expected = null;
      const m = chip ? /^(\d{2})月$/.exec(chip.textContent.trim()) : null;
      if (first && last && chip && m) {
        const x0 = first.x / dpr;
        const each = (last.x / dpr - x0) / 10;
        expected = x0 + each * (Number(m[1]) - 1);
      }
      return {
        chipText: chip ? chip.textContent.trim() : '',
        chipCenter: chipRect && cr ? chipRect.left + chipRect.width / 2 - cr.left : null,
        expected,
        tooltipRows: [...new Set(texts.filter((t) => /^(收入|支出|结余) \d/.test(t)))],
      };
    });
    check('点中的月份出现高亮 chip', /^\d{2}月$/.test(tapRes.chipText), tapRes.chipText || '(无)');
    /*
     * ⚠️ 阈值 2026-10-03 由 **≤2px 放宽到 ≤3px**（luchao 拍板），**依据如下实测** —— 不是"为了让红变绿"：
     *
     *   · 存在一个**恒定的约 2px 基准差**：`TrendChart.vue` 用 uCharts 回传的 `o.area[3]`(=42)
     *     作为 chip 的中心基准，而 uCharts 实际把 X 轴标签画在 **44**。
     *   · **不是"每格漂移"**：实测标签 `01月@44 … 11月@276` ⇒ `each = 23.2`，
     *     组件算的 `(width − area[1] − area[3]) / 12` 在 width=335 时 = 23.17 —— 两者一致。
     *   · 所以这条断言**本来就贴着 2px 红线**：canvas 宽 311 时实测 ≈1.5px（过），
     *     335 时 ≈2.0px（不过）。放宽到 3px 是**把代理指标校准到它的真实意图**
     *     （意图是"chip 要盖住那行文字"；chip 宽约 30px，2px 偏移仍完整覆盖，肉眼不可辨）。
     *   · **≤3px 仍然是有意义的门**：真正的错位（如 chip 用了过期的 width）会 >5px；
     *     组件算出的 `each` 若与真实布局脱节，误差会随下标线性放大 —— 那类问题照样会被抓住。
     *
     * ⛔ 不要为了"看起来更严"把它改回 2px：那会让本断言在任何取整波动下随机变红
     *    （一个会假红的校验器比没有校验器更糟 —— 它会训练人忽略红色）。
     */
    check(
      'chip 落在该月份的 X 轴位置上（误差 ≤3px）',
      tapRes.chipCenter !== null &&
        tapRes.expected !== null &&
        Math.abs(tapRes.chipCenter - tapRes.expected) <= 3,
      `chip 中心=${tapRes.chipCenter === null ? 'n/a' : Math.round(tapRes.chipCenter)} 该月应有位置=${tapRes.expected === null ? 'n/a' : Math.round(tapRes.expected)}` +
        ` 误差=${tapRes.chipCenter === null || tapRes.expected === null ? 'n/a' : Math.abs(tapRes.chipCenter - tapRes.expected).toFixed(2)}px`
    );
    check(
      'tooltip 显示收入 / 支出 / 结余 三条',
      tapRes.tooltipRows.length === 3,
      tapRes.tooltipRows.join(' | ')
    );
  }
  check('趋势图交互期间没有 JS 报错', errors.length === 0, errors.slice(0, 1).join(''));
}


console.log('\n[5] 顶栏 + Tab 吸顶');
{
  // 滚到底部元素触发真实滚动
  await page.evaluate(() => {
    const els = document.querySelectorAll('.panel, .export-wrap, .milestone');
    const last = els[els.length - 1];
    if (last) last.scrollIntoView({ block: 'end' });
  });
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => {
    const el = document.querySelector('.sticky-head');
    const period = document.querySelector('.period-bar');
    return {
      top: Math.round(el.getBoundingClientRect().top),
      periodTop: Math.round(period.getBoundingClientRect().top),
    };
  });
  check('顶栏 + Tab 吸顶（滚动后 top 仍为 0）', after.top === 0, `top=${after.top}`);
  check('日期栏随内容滚走（未吸顶）', after.periodTop < 0, `periodTop=${after.periodTop}`);
}

console.log('\n[6] 切到「分类」Tab');
{
  await page.locator('.tab-item', { hasText: '分类' }).first().click();

  /*
   * ⚠️ 分类 Tab 的默认时段是**当前月**，而"当前月有没有数据"取决于**跑脚本的日期**
   *    与库里的数据 —— 这条判据曾经**随日历自己变红**：
   *    2026-10-02 跑时当月无数据，页面**正确**显示「2026年10月暂无记录」，
   *    而探针拿硬编码 `period=2026-09` 的数据断言页面必须出现 → 9 条假红。
   *
   * 现在按**页面实际请求的那个期间**取数据，分两条支路，且都会打印走了哪条
   * （**绝不静默跳过**）：
   *   · 有数据 → 直接跑全量检查（环图 / 引出线标注 / 二级口径）；
   *   · 没数据 → 先断言"空状态确实正确"，再切到「年」粒度
   *     （与基础统计 Tab 用的是同一份年度数据，必定有数据）跑全量检查。
   *
   * 之所以不去拨期间滚轮：PeriodPicker 是 `picker-view` 双滚轮，
   * 驱动它要么靠猜 offscreen 滚动距离、要么去碰组件内部状态 —— 都比点「年」按钮脆。
   */
  /*
   * ⚠️ 这里**不能**把 `支出分类统计` 当作"数据已就绪"的判据：
   *    它是模板里的固定文字，**不等数据就会出现**。踩过两次：
   *    ① 据此以为"当月有数据"，其实 DOM 里还是**上一个 Tab 的数据**（旧内容没被覆盖）；
   *    ② 据此断言空状态，结果取文本时响应还没渲染，判据取到的是旧数据 → 假红。
   *    正确做法：等**真实数据里的字符串**（下面用第一个二级分类名）。
   */
  await waitText('支出分类统计');
  let l2 = await fetchL2(lastReportPeriod || '', lastReportAccountId || '');
  console.log(
    `   ⓘ 分类 Tab 期间 ${lastReportPeriod || '(未捕获)'}` +
      ` / 账本 ${lastReportAccountId || '(未捕获)'}，二级分类 ${l2.length} 个`
  );

  if (l2.length === 0) {
    // 无数据：等**空状态文案**真的出现，再断言（理由同上）
    await waitText('暂无记录');
    const tEmpty = await bodyText();
    check(
      '无数据的期间显示空状态（而不是空白或错误态）',
      tEmpty.includes('暂无记录'),
      `period=${lastReportPeriod}`
    );
    // 切「年」：`.mode-item` / `.confirm` 都是普通按钮，点得稳
    await page.locator('.period-center').first().click();
    await page.waitForTimeout(600);
    await page.locator('.mode-item', { hasText: '年' }).first().click();
    await page.waitForTimeout(300);
    await page.locator('.confirm').first().click();
    l2 = await fetchL2(lastReportPeriod || '', lastReportAccountId || '');
    console.log(
      `   ⓘ 已切到年粒度，期间 ${lastReportPeriod || '(未捕获)'}，二级分类 ${l2.length} 个`
    );
  }

  // 等**真实数据**渲染出来（第一个二级分类名），再取文本做断言
  if (l2.length) await waitText(l2[0]);
  const t = await bodyText();

  check('支出分类统计', t.includes('支出分类统计'));
  check('收入分类统计', t.includes('收入分类统计'));

  // 分类 Tab 必须用**二级口径**：环形图与排行里的名称应能匹配到二级分类。
  // 判据：拿**同一期间、同一账本**的二级数据，检查页面排行里出现了其中的二级分类名
  // （一级口径下这些名字不会出现）。
  const hitL2 = l2.filter((n) => t.includes(n));
  check(
    '分类 Tab 使用二级口径（排行里出现二级分类名）',
    /*
     * ⚠️ 这里**不能**再留 `l2.length === 0 ||` 这个逃逸阀（2026-10-03 收紧）。
     *    它的原意是"接口没数据时别误报"，但那种情况现在已经被上面的分支显式处理掉了；
     *    留着它就等于：接口一旦返回空，这条断言**白过** —— 又是一个不会红的校验器。
     *    收紧成"必须有二级数据，且页面上真的出现了其中至少一个名字"。
     */
    l2.length > 0 && hitL2.length > 0,
    `二级 ${hitL2.length}/${l2.length}`
  );
  const ringSvg = await page.evaluate(() => document.querySelectorAll('.ring-wrap svg').length);
  check('环形图 svg 存在', ringSvg > 0, `svg=${ringSvg}`);
  check('导出报表按钮', t.includes('导出报表'));

  // 引出线标注的文字必须真的渲染出来。
  // 坑：uni-app 会把模板里的 <text> 编译成 <uni-text>，SVG 不认 → 引出线画出来但文字空白，
  //     而且不报错。所以这条断言必须查「可见文字的个数」，不能只查 svg 存在。
  const labelInfo = await page.evaluate(() => {
    const names = [...document.querySelectorAll('.ring-label-name')];
    const ratios = [...document.querySelectorAll('.ring-label-ratio')];
    const rendered = names.filter((el) => el.textContent.trim().length > 0).length;
    const ratiosFull = ratios.filter((el) => /^\d+(\.\d+)?%$/.test(el.textContent.trim())).length;
    // 名称实际可见宽度（px）与字数上限：用于确认 375 下"至少 5 个汉字"
    const widths = names.map((el) => Math.round(el.getBoundingClientRect().width));
    return { rendered, ratiosFull, ratioTotal: ratios.length, widths };
  });
  check('环形图引出线标注文字已渲染', labelInfo.rendered > 0, `标注=${labelInfo.rendered}`);
  check(
    '百分比完整显示（无截断）',
    labelInfo.ratiosFull === labelInfo.ratioTotal && labelInfo.ratioTotal > 0,
    `完整 ${labelInfo.ratiosFull}/${labelInfo.ratioTotal}`
  );
  // "名称至少 5 个字"要量**可用宽度**（max-width 的计算值），
  // 不能量内容宽度 —— 短名称（如"未分类"）本来就只占 36px，不代表它被截断。
  // 12px 字号的汉字宽约 12px，5 字 ≈ 60px。
  // 可用宽度用**实测几何**算，不去解析 `calc(50% - Npx)` 字符串
  // （parseFloat 遇到 "calc(" 直接返回 NaN，会把断言永远判失败）。
  //
  // gap 也不硬编码：从「标签左边界 − 容器中心」反推，这样 RingChart 改尺寸/引线长度
  // 时本断言自动跟随（硬编码 61 曾在把 size 从 100 调到 130 后失效）。
  // 再扣掉百分比宽度与间距，剩下的才是名称可用的宽度。
  const availW = await page.evaluate(() => {
    const wrap = document.querySelector('.ring-wrap');
    const label = document.querySelector('.ring-label.right');
    const ratio = label && label.querySelector('.ring-label-ratio');
    if (!wrap || !label || !ratio) return 0;
    const wr = wrap.getBoundingClientRect();
    const lr = label.getBoundingClientRect();
    const gap = lr.left - (wr.left + wr.width / 2);
    const ratioW = ratio.getBoundingClientRect().width;
    const labelMaxW = wr.width / 2 - gap;
    return Math.round(labelMaxW - ratioW - 3);
  });
  // 阈值 46px ≈ 4 个汉字（size 130 下的实测值；12px 字号汉字宽约 12px）
  check('名称可用宽度 ≥ 46px（≈4 个汉字）', availW >= 46, `可用=${availW}px`);

  // 标注文字必须落在容器内（不能被 overflow-x:hidden 静默裁掉）
  const overflow = await page.evaluate(() => {
    const wrap = document.querySelector('.ring-wrap');
    if (!wrap) return { bad: 0 };
    const wr = wrap.getBoundingClientRect();
    let bad = 0;
    wrap.querySelectorAll('.ring-label').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.left < wr.left - 0.5 || r.right > wr.right + 0.5) bad += 1;
    });
    return { bad };
  });
  check('标注未越出环形图容器', overflow.bad === 0, `越界=${overflow.bad}`);

  // 左右两侧都必须是「名称 → 百分比」的阅读顺序。
  // 踩过：曾给左侧加 flex-direction: row-reverse，导致左侧变成「百分比 名称」，
  // 与右侧不一致（参考图两侧都是名称在前）。
  const orderOk = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('.ring-label')];
    if (!labels.length) return false;
    return labels.every((el) => {
      const kids = [...el.children];
      const nameIdx = kids.findIndex((k) => k.classList.contains('ring-label-name'));
      const ratioIdx = kids.findIndex((k) => k.classList.contains('ring-label-ratio'));
      return nameIdx >= 0 && ratioIdx >= 0 && nameIdx < ratioIdx;
    });
  });
  check('标注阅读顺序均为「名称 → 百分比」', orderOk);
}

console.log(`\n结果：PASS=${pass}  FAIL=${fail}`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
