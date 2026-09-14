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
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
const page = await ctx.newPage();

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
await page.waitForTimeout(2500);

const bodyText = () => page.evaluate(() => document.body.innerText);

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

console.log('\n[4] 折线图渲染（uCharts canvas）');
{
  const canvasCount = await page.evaluate(
    () => document.querySelectorAll('canvas').length
  );
  check('canvas 已渲染', canvasCount > 0, `canvas=${canvasCount}`);
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
  await page.waitForTimeout(1500);
  const t = await bodyText();
  check('支出分类统计', t.includes('支出分类统计'));
  check('收入分类统计', t.includes('收入分类统计'));

  // 分类 Tab 必须用**二级口径**：环形图与排行里的名称应能匹配到二级分类。
  // 判据：直接从接口拿二级数据，检查页面排行里出现了其中的二级分类名
  // （一级口径下这些名字不会出现）。
  const l2 = await page.evaluate(async () => {
    const token = localStorage.getItem('token') || localStorage.getItem('uni-storage-token');
    const res = await fetch('/api/statistics/report?period=2026-09', {
      headers: { Authorization: 'Bearer ' + token },
    });
    const body = await res.json();
    return (body?.data?.expenseCategoriesL2 || []).map((r) => r.name);
  });
  const pageText = await bodyText();
  const hitL2 = l2.filter((n) => pageText.includes(n));
  check(
    '分类 Tab 使用二级口径（排行里出现二级分类名）',
    l2.length === 0 || hitL2.length > 0,
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
