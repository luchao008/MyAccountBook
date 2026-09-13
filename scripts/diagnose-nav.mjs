/**
 * 导航行为诊断：点击底栏「我的」到底是「视图切换」还是「页面跳转」。
 *
 *   node scripts/diagnose-nav.mjs
 *
 * 环境变量：BASE / SEED_USER / SEED_PASS / PW_PATH / CHROME
 *
 * 判据（比"看起来像"可靠）：
 *   - hash 变化 + 页面栈 +1  → 发生了页面跳转（navigateTo）
 *   - hash 不变 + 页面栈不变 → 就地切换视图
 *
 * ⚠️ 底栏的格子有**两种语义**（2026-09-13 起），诊断时必须分开断言：
 *   · 无 url 的格子（记账 / 我的）→ 必须**就地切视图**：hash 不变、页面栈不变；
 *   · 有 url 的格子（报表）        → 必须**跳转**：hash 变、页面栈 +1、且目标页有返回按钮。
 *   把跨页项错当成视图，或者反过来（每次都压栈），都会让底栏行为退化成"死按钮"或
 *   "栈无限增长" —— 这两种失败都不报错，只能靠这里量出来。
 */
import fs from 'node:fs';

const PW =
  process.env.PW_PATH ||
  '/Users/luchao/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js';
const pw = await import(PW);
const { chromium } = pw.default ?? pw;

/** playwright-core 版本常与缓存里实际下载的浏览器对不上，自己挑一个现成的 */
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const root = `${process.env.HOME}/Library/Caches/ms-playwright`;
  try {
    const dirs = fs
      .readdirSync(root)
      .filter((d) => d.startsWith('chromium-'))
      .sort()
      .reverse();
    for (const d of dirs) {
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

const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ['--no-proxy-server', '--disable-features=IsolateOrigins,site-per-process'],
});
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
const page = await ctx.newPage();

const errors = [];
const notFound = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') {
    const loc = m.location();
    errors.push(`[console] ${m.text()} @ ${loc?.url || '(无 url)'}`);
  }
});
// 404 的具体资源地址（"Failed to load resource" 本身不说是哪个）
page.on('response', (res) => {
  if (res.status() >= 400) notFound.push(`${res.status()} ${res.url()}`);
});

/** 采集一次现场状态 */
async function snap(tag) {
  const info = await page.evaluate(() => {
    const stack = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    const text = (sel) => {
      const el = document.querySelector(sel);
      return el ? el.textContent.trim() : '';
    };
    const visible = (sel) =>
      [...document.querySelectorAll(sel)].filter((el) => el.offsetParent !== null).length;

    return {
      hash: location.hash || '(空)',
      historyLen: history.length,
      stackLen: stack.length,
      routes: stack.map((p) => (p && (p.route || (p.$page && p.$page.route))) || '?'),
      navTitle: text('.uni-page-head-title'),
      /*
       * 左上角返回按钮：navigateTo 进来才会出现。
       * 不能只看 `.uni-page-head-hd` 是否存在 —— 那个容器恒在（哪怕是空的），
       * 上一版探针就因此一直误报"有"。要数它里面真正的按钮元素。
       */
      backBtn:
        document.querySelectorAll('.uni-page-head-hd .uni-page-head-btn').length +
        document.querySelectorAll('.uni-page-head-hd uni-page-head-btn').length,
      headHdHtml: (document.querySelector('.uni-page-head-hd')?.innerHTML || '')
        .replace(/\s+/g, ' ')
        .slice(0, 120),
      tabItems: [...document.querySelectorAll('.tabbar .tab-item')].map((el) =>
        el.textContent.trim(),
      ),
      activeTab: text('.tabbar .tab-item.active') || '(无)',
      // 各视图的特征元素，判断"哪个视图正显示"
      viewHits: {
        home: visible('.banner') + visible('.rank-card'),
        // 「明细」已下线；「统计」改为独立页「报表」（pages/statistics）
        report: visible('.chart-area') + visible('.legend'),
        mine: visible('.user-card') + visible('.logout'),
        账本选择: visible('.account-item') + visible('.manage-entry'),
        记账页: visible('.keyboard'),
      },
    };
  });

  const shown = Object.entries(info.viewHits)
    .filter(([, v]) => v > 0)
    .map(([k]) => k);
  console.log(`\n===== ${tag} =====`);
  console.log(`hash       : ${info.hash}`);
  console.log(`history    : ${info.historyLen}`);
  console.log(`页面栈     : ${info.stackLen}  ${JSON.stringify(info.routes)}`);
  console.log(`导航栏标题 : ${info.navTitle}`);
  console.log(`返回按钮   : ${info.backBtn} 个   head-hd=[${info.headHdHtml}]`);
  console.log(`底栏项     : [${info.tabItems.join(' | ')}]  激活=${info.activeTab}`);
  console.log(`可见视图   : ${shown.length ? shown.join(', ') : '(未识别)'}`);
  return info;
}

/** 点击底栏某一项（限定在 .tabbar 内，避免命中同名文字） */
async function clickTab(name) {
  const item = page.locator('.tabbar .tab-item', { hasText: name }).first();
  await item.waitFor({ state: 'visible', timeout: 8000 });
  await item.click();
  await page.waitForTimeout(1200);
}

/**
 * 底栏几何：中间凸起项是否真的越出底栏顶边、文字是否与其它项同处一行。
 * 这几项都是"只能渲染后才知道"的值，写死在注释里不算数。
 */
async function measureTabbar(tag) {
  const m = await page.evaluate(() => {
    const bar = document.querySelector('.tabbar');
    const btn = document.querySelector('.tabbar .raised-btn');
    if (!bar || !btn) return null;
    const b = bar.getBoundingClientRect();
    const r = btn.getBoundingClientRect();
    const raisedText = btn.nextElementSibling?.getBoundingClientRect();
    const normalText = document
      .querySelector('.tabbar .tab-item:not(.raised) .tab-text')
      ?.getBoundingClientRect();
    return {
      barTop: Math.round(b.top),
      barBottom: Math.round(b.bottom),
      barHeight: Math.round(b.height),
      btnTop: Math.round(r.top),
      btnW: Math.round(r.width),
      btnH: Math.round(r.height),
      overhang: Math.round(b.top - r.top),
      raisedTextTop: raisedText ? Math.round(raisedText.top) : null,
      normalTextTop: normalText ? Math.round(normalText.top) : null,
    };
  });

  console.log(`\n===== 底栏几何 · ${tag} =====`);
  console.log(JSON.stringify(m, null, 1));
  return m;
}

function reportTabbar(geo) {
  console.log('\n===== 凸起项判定 =====');
  if (!geo) {
    console.log('✗ 底栏里没有找到 .raised-btn');
    return;
  }
  const checks = [
    ['圆按钮直径 48', geo.btnW === 48 && geo.btnH === 48],
    ['越出底栏顶边', geo.overhang > 0],
    [`凸出量 ≈ 23px（实测 ${geo.overhang}）`, Math.abs(geo.overhang - 23) <= 2],
    [
      '凸起项文字与其它项同一行（≤2px）',
      geo.raisedTextTop !== null &&
        geo.normalTextTop !== null &&
        Math.abs(geo.raisedTextTop - geo.normalTextTop) <= 2,
    ],
  ];
  for (const [name, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${name}`);
}

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await snap('① 启动落点');

// 登录（若在登录页）
if (await page.locator('.submit').count()) {
  const inputs = page.locator('.uni-input-input');
  await inputs.nth(0).fill(USER);
  await inputs.nth(1).fill(PASS);
  await page.locator('.submit').first().click();
  await page.waitForTimeout(2500);
  await snap('② 登录后落点');
}

// 若在账本选择页 → 选第一个账本进主容器
if (await page.locator('.account-item').count()) {
  await page.locator('.account-item').first().click();
  await page.waitForTimeout(1800);
  await snap('③ 选账本后落点');
}

const before = await snap('④ 点击「我的」之前');
await clickTab('我的');
const after = await snap('⑤ 点击「我的」之后');

console.log('\n========== 结论 ==========');
if (after.hash !== before.hash) {
  console.log(`✗ 发生了页面跳转：hash ${before.hash} → ${after.hash}`);
} else if (after.stackLen !== before.stackLen) {
  console.log(`✗ 页面栈变化：${before.stackLen} → ${after.stackLen}`);
} else {
  console.log('✓ 就地切换视图，未发生页面跳转');
}

// 再验证切回「记账」
await clickTab('记账');
await snap('⑥ 再点「记账」');

// 容器内反复切换，确认不会累积跳转（容器现在只有 记账 / 我的 两个视图）
for (const name of ['我的', '记账', '我的', '记账', '我的']) {
  await clickTab(name);
}
await snap('⑦ 容器内连续切换 5 次后');

/*
 * ⑧ 「报表」必须**跳转**而不是切视图（2026-09-13 的明确要求）。
 *
 * 判据用 hash + 页面栈，"看起来变了"不算数。三项都要过：
 *   ① 跳转：hash → #/pages/statistics/index 且页面栈 +1
 *   ② 目标页有返回按钮 —— 这才是"跳转"相对"切视图"的意义所在
 *   ③ 内容真的渲染了（chart-area / legend 命中）—— 防"跳到一个白页也算通过"
 */
const beforeReport = await snap('⑧ 点击「报表」之前');
await clickTab('报表');
const afterReport = await snap('⑨ 点击「报表」之后');
await page.screenshot({ path: process.env.SHOT_REPORT || '/tmp/tabbar-report.png' });

console.log('\n===== 「报表」跳转判定 =====');
console.log(
  `${afterReport.hash !== beforeReport.hash && afterReport.stackLen > beforeReport.stackLen ? '✓' : '✗'} ` +
    `发生了页面跳转：hash ${beforeReport.hash} → ${afterReport.hash}，` +
    `栈 ${beforeReport.stackLen} → ${afterReport.stackLen}`,
);
console.log(
  `${afterReport.backBtn > 0 ? '✓' : '✗'} 目标页有返回按钮（${afterReport.backBtn} 个）—— 能原路返回才有"跳转"的意义`,
);
console.log(
  `${afterReport.viewHits.report > 0 ? '✓' : '✗'} 目标页内容已渲染（命中 ${afterReport.viewHits.report}）`,
);

// 原路返回：点导航栏返回按钮（真实用法），并确认页面栈复原
const backLoc = page.locator('.uni-page-head-hd .uni-page-head-btn').first();
if ((await backLoc.count()) > 0) {
  await backLoc.click();
} else {
  await page.goBack();
}
await page.waitForTimeout(1400);
const backFromReport = await snap('⑩ 从报表页返回');
console.log(
  `${backFromReport.stackLen === beforeReport.stackLen ? '✓' : '✗'} ` +
    `返回后页面栈复原：${afterReport.stackLen} → ${backFromReport.stackLen}（期望 ${beforeReport.stackLen}）`,
);
console.log(
  `${backFromReport.viewHits.home + backFromReport.viewHits.mine > 0 ? '✓' : '✗'} 回到了容器视图`,
);

/*
 * 核心验收点：**账本选择页**点底栏「我的」必须就地切换 —— 不压栈、hash 不变。
 * （该页底栏是「首页 / 我的」两项，跨页面跳转在这里是不允许的）
 */
await page.goto(BASE + '#/pages/account-select/index', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
const atSelect = await snap('⑧ 直达账本选择页');
await page.screenshot({ path: process.env.SHOT_SELECT || '/tmp/tabbar-select.png' });
if (atSelect.viewHits['账本选择'] > 0) {
  await clickTab('我的');
  const mineB = await snap('⑨ 账本选择页点「我的」之后');
  await clickTab('首页');
  const backB = await snap('⑩ 再点「首页」切回');

  console.log('\n===== 账本选择页底栏切换判定 =====');
  for (const [tag, before, after] of [
    ['点「我的」', atSelect, mineB],
    ['点「首页」', mineB, backB],
  ]) {
    const jump = after.hash !== before.hash || after.stackLen !== before.stackLen;
    console.log(
      `${jump ? '✗ 发生了跳转' : '✓ 就地切换'}  ${tag}：` +
        `hash ${before.hash} → ${after.hash}，栈 ${before.stackLen} → ${after.stackLen}`,
    );
  }
}

/*
 * 回归检查：点账本进首页**仍必须是 navigateTo** ——
 * 上一轮明确要求首页左上角出现返回按钮，这次改动不能把它一起改掉。
 */
await page.goto(BASE + '#/pages/account-select/index', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1800);
if (await page.locator('.account-item').count()) {
  await page.locator('.account-item').first().click();
  await page.waitForTimeout(1600);
  await snap('⑪ 账本选择页点账本之后（应压栈 + 有返回按钮）');
}

// 底栏几何 + 截图（截图仅供人眼核对，数值才是可复现的判据）
const geo = await measureTabbar('记账页底栏');
reportTabbar(geo);
await page.screenshot({ path: process.env.SHOT || '/tmp/tabbar-check.png' });
console.log(`\n截图已存：${process.env.SHOT || '/tmp/tabbar-check.png'}`);

console.log('\n========== 控制台错误 ==========');
console.log(errors.length ? errors.slice(0, 10).join('\n') : '(无)');
console.log('\n========== 4xx/5xx 资源 ==========');
console.log(notFound.length ? [...new Set(notFound)].join('\n') : '(无)');

await browser.close();
