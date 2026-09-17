/**
 * 320px × 200% 字号 横向重排复验（三桶判据）。
 *
 *   node scripts/reflow-audit.mjs
 *
 * 环境变量：BASE / SEED_USER / SEED_PASS / SHOT_DIR / CHROME / PW_PATH
 *
 * ────────────────────────────────────────────────────────────────────────
 * 为什么要单写一个脚本，而不是"偶尔手跑一下"：
 *   方案文档 §7.4 已经把方法写清楚了，但**当时用的脚本留在 /tmp，早就没了**，
 *   于是"结构改造后要重跑复验"这条待办从 09-12 一直挂到现在 ——
 *   证据消失 ⇒ 结论无法复现 ⇒ 没人再跑。脚本入库才谈得上"定期跑"。
 *
 * 核心判据（三桶）——**只测一种会漏掉另外两种，而漏掉的更严重**：
 *   ① 顶破文档：无裁切祖先、越出视口        → 横向滚动条
 *   ② 被祖先裁掉：祖先 overflow:hidden/clip  → **文字在屏幕上不存在**
 *   ③ 内容宽于自身盒子（overflow:visible）   → 与邻居重叠压字
 * ⚠️ uni-app 给 body 加了全局 overflow-x:hidden，横向滚动条**永远不会出现**，
 *    所以本项目的溢出只表现为 ② 和 ③ —— **这两种 document.scrollWidth 都测不到**。
 *    "scrollWidth 没超标"绝不能作为验收依据，这正是阶段 9 第一版脚本给出
 *    "7 页全绿"却漏掉统计页三个金额压在一起的原因。
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
const OUT = process.env.SHOT_DIR || '/tmp/reflow-audit';

/**
 * 页面 / 交互态清单。
 *
 * ⚠️ 本清单**必须随结构变化同步**，否则会重现"巡检到了错页却全绿"那类假结果 ——
 *    失效的 `?tab=xxx` 不会报错，它会静默加载首页，于是量的是首页却记为那个视图。
 *
 * 🔑 **每一条都可以带 `steps`（先点开）与 `guard`（确认真的到了）**，
 *    这是本脚本 2026-09-16 补的两件东西：
 *      · `steps`：把"需要点开才有"的界面纳入巡检（弹层、页内视图切换）。
 *      · `guard`：一个存在性断言。**没有它，点空 / 路由失效都会静默量到别的屏**，
 *        然后给你一个绿色的谎话 —— 这正是本项目反复栽的那个坑。
 *        有它就会直接抛错（`throw`），宁可红也不要假绿。
 *    `steps` 在**字号放大之前**执行：字号放大是给"当前已存在的元素"写内联 font-size，
 *    先开弹层再放大，弹层里的元素才会被一起放大（否则量的是没放大的弹层）。
 *
 * 覆盖沿革：
 *   · 2026-09-13「明细」下线 → 摘掉 `?tab=detail`；
 *     「统计」改为独立页「报表」→ 按**独立地址**巡检，`?tab=statistics` 失效；
 *   · 2026-09-14「我的」从主容器移除 → 摘掉 `?tab=mine`（容器的 VALID_KEYS 只剩 home，
 *     该 URL 现在会静默落到首页）。**「我的」视图仍存在于账本选择页**（页内视图切换），
 *     本轮补回来了：用 `steps` 点底栏第 2 项。
 *   · **2026-09-16 阶段 5 收口**：补齐此前一直缺的 4 个页面
 *     （`login` / `category-new` / `icon-picker` / `recycle`）+「我的」+ 流水页 4 个弹层。
 *     13 页 → 20 条，39 屏 → 60 屏。
 *
 * ⚠️ **仍然扫不到的（人工验收项，见文末清单）**：
 *     ① 三列时间滚轮**滚动到底部**后的状态；
 *     ② 需要"输入 + 提交"才会出现的状态（表单错误态、保存成功）；
 *     ③ 日历「展开」全屏虚拟列表（需要点日期，展开层 class 不稳定，未纳入）。
 */
const PAGES = [
  ['home', '#/pages/main/index', { guard: '.rank-card' }],
  ['flow', '#/pages/flow/index', { guard: '.filter-bar' }],
  ['calendar', '#/pages/calendar/index'],
  ['report', '#/pages/statistics/index'],
  ['account-select', '#/pages/account-select/index'],
  ['category-expense', '#/pages/category/index?type=expense'],
  ['category-income', '#/pages/category/index?type=income'],
  ['account', '#/pages/account/index'],
  ['record', '#/pages/record/index'],
  ['export', '#/pages/export/index'],
  ['account-new', '#/pages/account-new/index'],
  ['account-category', '#/pages/account-category/index'],
  ['account-import', '#/pages/account-import/index'],
  // —— 2026-09-16 新增：此前一直是覆盖缺口 ——
  ['login', '#/pages/login/index', { guard: '.submit' }],
  ['category-new', '#/pages/category-new/index', { guard: '.form' }],
  ['icon-picker', '#/pages/icon-picker/index', { guard: '.grid-inner' }],
  ['recycle', '#/pages/recycle/index', { guard: '.nav-inner' }],
  // 「我的」：账本选择页的页内视图，URL 不可寻址 → 点底栏第 2 项切过去
  ['mine', '#/pages/account-select/index', {
    steps: [{ sel: '.tab-item', nth: 1 }],
    guard: '.mine-slot',
  }],
];

/**
 * 流水页的弹层交互态。
 *
 * ⚠️ 弹层必须点开才能测 —— 数字键盘、时间滚轮、各类 sheet 都不在"页面加载完"的 DOM 里。
 *    这些恰好是视觉改动最密集的地方（本项目已记录：「点不开就扫不到」是验证脚本的通用盲区）。
 *
 * ⚠️ 触发器用 **`.nav-btn:not(.nav-back)` 的序号**定位。
 *    必须排掉返回键：顶栏里它是**第一个** `.nav-btn`，不排掉的话 nth(0) 会点到"返回"，
 *    直接跳回首页 —— 首轮实测就是这样：URL 变成了 `#/pages/main/index`，守卫立刻报错。
 *    `guard` 让这种错误**会响**，而不是静默量出一屏首页数据还报绿。
 *    序号对应：0 更多 / 1 日历 / 2 搜索 / 3 记一笔。
 */
const NAV = '.nav-btn:not(.nav-back)';
const FLOW_OVERLAYS = [
  ['flow-more-sheet', [{ sel: NAV, nth: 0 }], '.sheet', '批量操作'],
  ['flow-unit-sheet', [{ sel: '.filter-item', nth: 0 }], '.sheet', '月'],
  ['flow-level-sheet', [{ sel: '.filter-item', nth: 1 }], '.sheet', '分类'],
  ['flow-search-page', [{ sel: NAV, nth: 2 }], '.search-page', ''],
  ['flow-filter-panel', [{ sel: NAV, nth: 0 }, { sel: '.sheet-item', text: '筛选' }], '.sheet', '筛选'],
  // ⚠️ 排序弹层里**没有**「排序」二字，只有三个排序选项（按时间 / 按金额…）。
  //    守卫文本必须取自实际会渲染出来的文案 —— 用标题去守卫会一直失败。
  ['flow-sort-sheet', [{ sel: NAV, nth: 0 }, { sel: '.sheet-item', text: '排序' }], '.sheet', '按金额'],
].map(([name, steps, guard, guardText]) => [
  name,
  '#/pages/flow/index',
  { steps, guard, guardText },
]);

/** 三档视口：320 窄屏 / 375 常态（回归对照）/ 320 + 字号 ×2 */
const VIEWPORTS = [
  { w: 320, h: 640, scale: 1, tag: '320' },
  { w: 375, h: 812, scale: 1, tag: '375' },
  { w: 320, h: 640, scale: 2, tag: '320-x2' },
];

/**
 * 已知接受项。每条必须写清：为什么修不了、为什么可以接受。
 * 列在这里是为了让它们单独成行输出，不污染失败清单 —— 否则每次跑都要重新讨论一遍。
 *
 * ⚠️ **本判据有一个已知盲区，别把"没报"当成"已修好"**：
 *   三桶比的都是"元素 vs 自己的盒子 / 祖先的盒子"，而有一类问题是
 *   **文字压在同盒子内的装饰图形上** —— 最典型的就是环形图中心注解：
 *   约束是圆环的**内孔**（132px），不是 `.ring-wrap` 的盒子（180px）。
 *   实测：金额 `¥13918.05`（198px）会撑破盒子、被正常报出；
 *   而金额 `¥147.20`（154px）没撑破 180px 的盒子 → **判据沉默**，
 *   但它在视觉上仍然压在环带上。所以这一项是**数据相关**的：
 *   报了要当已知接受处理，没报也不代表没问题。
 *   要真正测它，得引入"装饰性内孔"这一层信息 —— 属独立任务。
 */
const KNOWN_ACCEPTED = [
  {
    page: 'statistics',
    tag: '320-x2',
    sel: 'uni-view.ring-wrap',
    why:
      '环形图中心注解。几何上无解：内孔直径 = size 180 − 2×thickness 24 = 132px，' +
      '而「¥13918.05」在 ×2 字号（40px）下实测需要 198px。' +
      '同一金额在结余行已完整可读，属重复标注、非唯一信息源，故不按内容丢失处理。' +
      '彻底解决属设计决策（大字号时把总额移出圆环），记为未决。',
  },
];
const isAccepted = (page, tag, sel) =>
  KNOWN_ACCEPTED.some((k) => k.page === page && k.tag === tag && k.sel === sel);

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-proxy-server'] });
const ctx = await browser.newContext({
  viewport: { width: 320, height: 640 },
  deviceScaleFactor: 2,
  locale: 'zh-CN',
});
const page = await ctx.newPage();

const measure = () =>
  page.evaluate(() => {
    const de = document.documentElement;
    const cw = de.clientWidth;

    const clipAncestor = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === 'hidden' || ox === 'clip' || ox === 'auto' || ox === 'scroll') return p;
      }
      return null;
    };
    const holdsOwnText = (el) =>
      [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    /** 按设计就该在视口外的内容（左滑操作按钮）不算丢失 */
    const offcanvas = (el) => !!el.closest('[class*="uni-swipe"]');
    /** 定位浮层内部（祖先链找，走到页面壳层就停） */
    const inOverlay = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const t = p.tagName.toLowerCase();
        if (t === 'uni-page' || t === 'body' || t === 'html') return false;
        const pos = getComputedStyle(p).position;
        if (pos === 'fixed' || pos === 'absolute') return true;
      }
      return false;
    };
    const desc = (el) => {
      const cls = String(el.className || '').split(' ').filter(Boolean).slice(0, 2).join('.');
      const r = el.getBoundingClientRect();
      return {
        sel: `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`,
        l: Math.round(r.left),
        r: Math.round(r.right),
        fs: getComputedStyle(el).fontSize,
        txt: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 16),
      };
    };

    const overflow = [];
    const clipped = [];
    const overlapped = [];

    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (offcanvas(el)) continue;

      const ca = clipAncestor(el);
      if (!ca) {
        if (r.right > cw + 1 || r.left < -1) overflow.push(desc(el));
      } else if (holdsOwnText(el)) {
        const cr = ca.getBoundingClientRect();
        if (r.right > cr.right + 1 || r.left < cr.left - 1) clipped.push(desc(el));
      }

      const cs = getComputedStyle(el);
      if (
        el.scrollWidth > el.clientWidth + 1 &&
        cs.overflowX === 'visible' &&
        cs.textOverflow !== 'ellipsis' &&
        !inOverlay(el) &&
        (el.textContent || '').trim()
      ) {
        let childWorse = false;
        for (const c of el.children) {
          if (c.scrollWidth > c.clientWidth + 1 && c.clientWidth > 0) {
            childWorse = true;
            break;
          }
        }
        if (!childWorse) overlapped.push(desc(el));
      }
    }

    return {
      scrollW: de.scrollWidth,
      bodyScrollW: document.body.scrollWidth,
      clientW: cw,
      overflow,
      clipped,
      overlapped,
    };
  });

const rows = [];

async function visit(name, hash, vp, opts = {}) {
  await page.setViewportSize({ width: vp.w, height: vp.h });
  await page.goto(`${BASE}/${hash}`, { waitUntil: 'load' });
  /**
   * ⚠️ 必须 reload，两个理由，都实测踩过：
   *
   * ① **hash 变更不会重新挂载组件**。单页容器的视图是由 `onLoad(options)` 里读 `?tab=`
   *    决定的，而 `onLoad` 只在挂载时触发一次。不 reload 的话，第一页之后所有
   *    `?tab=xxx` 都是同一个文档内的 hash 变化 → **视图一直停在第一个页面**。
   *    症状极具迷惑性：`detail` / `mine` 的巡检结果里出现的是首页的 `.banner-expense`，
   *    看起来像"这些页面溢出严重"，实际是根本没切过去。
   *
   * ② **内联样式会跨"导航"残留**，让 ×2 逐次累乘。字号放大是写内联 `font-size` 实现的，
   *    不 reload 时上一次的内联值还在，下一次再乘一遍 —— 实测同一个元素
   *    从 60px → 120px → 240px 翻上去，量出的是 2^(访问次数) 倍而不是 200%。
   *
   * 另一个更省事的等价写法：先 goto 一个中立地址（如 about:blank）再 goto 目标页。
   * 但 reload 更直白。**同一个坑本项目在一小时内踩了两次**（页面级 E2E 脚本也踩过），
   * 所以这里写清楚。
   */
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(700);

  /**
   * ① 交互态：先点开，再量。
   *
   * ⚠️ 必须放在字号放大**之前** —— 放大是"给此刻已存在的元素写内联 font-size"，
   *    后开的弹层会逃过放大，于是 ×2 档量到的是**没放大的弹层**（一种新的假绿）。
   *
   * ⚠️ 点空必须抛错，不能沉默：`.first().click()` 在命中 0 个时会等超时后失败，
   *    但如果原地还有别的元素可点（例如整页可点区），就会点出意料之外的结果。
   *    所以先显式断言"命中数 > 0"。
   */
  for (const s of opts.steps || []) {
    let loc = page.locator(s.sel);
    if (s.text) loc = loc.filter({ hasText: s.text });
    if (s.nth !== undefined) loc = loc.nth(s.nth);
    const hit = await loc.count();
    if (!hit) {
      throw new Error(
        `[${name}] 交互步骤点空：${JSON.stringify(s)} 命中 0 个元素（URL = ${page.url()}）`,
      );
    }
    await loc.first().click();
    await page.waitForTimeout(450);
  }

  /**
   * ② 守卫：确认这一屏**真的**加载 / 点开了。
   *
   * 这是本轮补的关键机制。此前清单里失效的地址不会报错，只会静默落到首页 ——
   * 于是"量的是首页、记的是那个视图"，跑出一片绿。守卫把它变成硬失败。
   * 宁可红一次，也不要一个没人敢信的绿。
   */
  if (opts.guard) {
    let g = page.locator(opts.guard);
    if (opts.guardText) g = g.filter({ hasText: opts.guardText });
    const hit = await g.count();
    if (!hit) {
      throw new Error(
        `[${name}] 守卫失败：期望 ${opts.guard}` +
          `${opts.guardText ? `（且含「${opts.guardText}」）` : ''} 至少 1 个，实际 0 个。` +
          `\n  URL = ${page.url()}` +
          `\n  即：这一屏没加载 / 没打开，此刻量到的数据属于别的屏 —— 不报错就是假绿。`,
      );
    }
  }

  if (vp.scale > 1) {
    // ⚠️ 必须**先全部读原文、再统一写回**：getComputedStyle 反映"此刻"样式，
    //    边遍历边写内联 font-size 会逐层复利（给 html 写 32 → body 读到 32 写 64…），
    //    量出的是 2^深度 倍字号。阶段 9 第一版就是这么量出 791px 这种假数字的。
    await page.evaluate((s) => {
      const els = [...document.querySelectorAll('*')];
      const orig = els.map((el) => {
        const cs = getComputedStyle(el);
        return { fs: parseFloat(cs.fontSize), lh: parseFloat(cs.lineHeight) };
      });
      els.forEach((el, i) => {
        if (orig[i].fs > 0) el.style.fontSize = (orig[i].fs * s).toFixed(1) + 'px';
        if (orig[i].lh > 0) el.style.lineHeight = (orig[i].lh * s).toFixed(1) + 'px';
      });
    }, vp.scale);
    await page.waitForTimeout(400);
  }

  const m = await measure();
  const accepted = m.overlapped.filter((o) => isAccepted(name, vp.tag, o.sel));
  const real = m.overlapped.filter((o) => !isAccepted(name, vp.tag, o.sel));
  /**
   * ⚠️ `clipped`（桶②）**必须计入失败**。它是最严重的一类 —— 文字在屏幕上根本不存在。
   * 第一版漏了它，结果 detail / category 两屏「被裁 1 处」却仍显示 ✅；
   * 这类"报告写了问题但判定通过"的脚本比没有脚本更糟：它会让人放心地忽略真问题。
   */
  const bad =
    m.scrollW > m.clientW + 1 ||
    m.bodyScrollW > m.clientW + 1 ||
    real.length > 0 ||
    m.clipped.length > 0;
  rows.push({ name, tag: vp.tag, bad, clipped: m.clipped.length, overlap: real.length, m });

  await page.screenshot({ path: `${OUT}/${name}-${vp.tag}.png` });

  console.log(
    `${bad ? '❌' : '✅'}  ${name.padEnd(16)} ${vp.tag.padEnd(9)} 文档宽=${String(m.scrollW).padStart(4)}` +
      ` body宽=${String(m.bodyScrollW).padStart(4)} 视口=${m.clientW}` +
      ` 顶破=${m.overflow.length} 被裁=${m.clipped.length} 压邻居=${real.length}` +
      (accepted.length ? ` 已知接受=${accepted.length}` : '')
  );
  for (const o of [...m.overflow, ...real, ...m.clipped].slice(0, 8)) {
    console.log(
      `         · ${o.sel.padEnd(30)} L=${String(o.l).padStart(5)} R=${String(o.r).padStart(4)} fs=${o.fs.padStart(7)}  「${o.txt}」`
    );
  }
}

// ── 登录
await page.goto(`${BASE}/#/pages/login/index`, { waitUntil: 'load' });
await page.waitForTimeout(900);
const inputs = page.locator('input');
await inputs.nth(0).fill(USER);
await inputs.nth(1).fill(PASS);
if (!(await inputs.nth(0).inputValue())) throw new Error('用户名没填进去，登录流程无效');
// 不要按文字定位：顶部导航标题也叫「登录」，会静默点空（阶段 9 踩过）
await page.locator('.submit').first().click();
await page.waitForTimeout(2500);
if (!(await page.locator('.banner, .rank-card, .account-switch').count())) {
  throw new Error(`登录失败（没看到首页元素），URL = ${page.url()}`);
}
console.log('登录成功\n');

const SCREENS = [...PAGES, ...FLOW_OVERLAYS];

for (const vp of VIEWPORTS) {
  console.log(`===== ${vp.w}×${vp.h}，字号${vp.scale === 1 ? '正常' : ` ×${vp.scale}`} =====`);
  for (const [name, hash, opts] of SCREENS) await visit(name, hash, vp, opts);
  console.log('');
}

await ctx.close();
await browser.close();

const bad = rows.filter((r) => r.bad);
console.log('─'.repeat(72));
console.log(
  `共巡检 ${rows.length} 屏（${SCREENS.length} 条 × ${VIEWPORTS.length} 档；` +
    `其中 ${PAGES.length} 个页面 + ${FLOW_OVERLAYS.length} 个流水页交互态）`
);
for (const b of bad) {
  const why = [];
  if (b.m.scrollW > b.m.clientW + 1 || b.m.bodyScrollW > b.m.clientW + 1) why.push('横向溢出');
  if (b.clipped) why.push(`被裁 ${b.clipped} 处`);
  if (b.overlap) why.push(`压邻居 ${b.overlap} 处`);
  console.log(`  ❌ ${b.name} (${b.tag}) —— ${why.join('、')}`);
}
if (!bad.length) console.log('  ✅ 全部通过（三桶判据均为 0）');

/**
 * 人工验收清单 —— 机器扫不到的部分，写在这里，别假装已覆盖。
 *
 * 「点不开就扫不到」是验证脚本的通用盲区：本脚本按 URL 扫 DOM，页面里已有的元素
 * 都会被自动扫到，但**必须先点开 / 输入的界面不在 DOM 里**。
 * 本轮已把能点开的那批补进来了（`steps`），剩下的这几类只能人工：
 */
console.log(`
──── 人工验收清单（脚本覆盖不到，每次大改后手工过一遍）────
  1. 三列时间滚轮的**滚动到底部**后状态（弹层能点开，但内部滚动条要手势驱动）
  2. 日历页「展开」后的全屏虚拟列表（前缀和 + 二分，需点某个日期才出现）
  3. 所有「输入 + 提交」类状态：表单校验错误、保存成功 toast、删除二次确认
  4. 键盘 Tab 遍历（uni-app 的 <view> 默认不可聚焦，本身是未决项）
  5. 真机 safe-area（脚本不模拟刘海/手势条，那类 bug 靠 verify-safe-area.mjs）
`);
console.log(`截图：${OUT}`);
process.exitCode = bad.length ? 1 : 0;
