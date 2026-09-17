/**
 * 自绘顶栏几何与可点性验证（真实浏览器）。
 *
 *   node scripts/verify-topbar.mjs
 *   BASE=http://127.0.0.1:5173 node scripts/verify-topbar.mjs
 *
 * 复现 `docs/工程约定与踩坑.md` §1.7 / §1.8 里的每一个数 —— 文档里的实测值必须有一个
 * 可执行脚本能复现它，否则下一个人只能选择「相信」或「重来一遍」。
 *
 * 断言的 6 件事（前 4 条在每页都跑，后 2 条只在报表页）：
 *   ① 返回键触摸区左边缘 = 8（5 个自绘顶栏页统一）
 *   ② 箭头**墨迹**左边缘 ≈ 17.94 —— 用 `getBBox()` 量墨迹，不是 `getBoundingClientRect()` 量包围盒
 *      （后者给出 12 这个假信号，据此去改会把本来对齐的东西推歪）
 *   ③ 三点命中测试：触摸区左上 / 中心 / 右下都落在返回键内 —— **量"能不能点到"，不是量"在哪"**
 *   ④ 文档宽度 ≤ 视口宽（横向不溢出）
 *   ⑤ 报表页吸顶区 = 89（44 顶栏 + 45 Tab）；标题墨迹中心 = 视口中心（≤ 1px）
 *   ⑥ 报表页标题竖向居中（墨迹中心 = 返回行中心）
 *
 * ⚠️ ③ 是这套脚本存在的核心理由：绝对定位的覆盖层会整块吃掉下面的触摸区，
 *    而**所有几何量都完全正常** —— `getBoundingClientRect` / 视觉截图都看不出来，
 *    只有点下去没反应。所以只量位置是查不出这个 bug 的。
 *
 * ⚠️ 本脚本只读：不创建、不修改、不删除任何数据。
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

/**
 * 5 个自绘顶栏页。`title: true` = 返回行里有标题（用于居中判定）。
 *
 * ⚠️ `ink` = 箭头**墨迹**左边缘的当前实测值。**两档不统一是已知的、且理由已失效**：
 *    · 报表页 **17.94** —— 按钮内部补了 4px（`flex-start` + `padding-left: 4px`），
 *      目的是对齐参考图 `IMG_4201`（iPhone 16 Pro @3x）实测的 **17.0pt**；
 *    · 其余 4 页 **25.94** —— 按钮内居中（`justify-content: center`）。
 *    这 8px 差异原本由「与报表页那 28px 左对齐大标题同轴（16px）」解释；
 *    **大标题已于 2026-09-17 收进顶栏 → 该理由消失**。是否统一见 `memo/2026-09-17.md` §十。
 *    在此之前**按现状断言**：谁改了就让这里报错，逼他把这件事显式决定一次。
 */
const PAGES = [
  ['流水', '#/pages/flow/index', { title: true, ink: 25.94 }],
  ['日历', '#/pages/calendar/index', { title: true, ink: 25.94 }],
  ['回收站', '#/pages/recycle/index', { ink: 25.94 }],
  ['数据导出', '#/pages/export/index', { ink: 25.94 }],
  ['报表', '#/pages/statistics/index', { title: true, stickyHead: true, ink: 17.94 }],
];

const failures = [];
const rows = [];
let pass = 0;
function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` —— ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`);
  }
}

/** 一次采集：几何 + 命中测试。全部在页面里同步算完再返回。 */
const PROBE = () => {
  const inner = document.querySelector('.nav-inner');
  // 返回键 = 返回行的第一个控件。日历 / 回收站 / 数据导出用 .nav-btn，流水 / 报表用 .nav-back。
  const back = inner?.querySelector('.nav-back, .nav-btn') || null;
  const title = document.querySelector('.nav-title');
  const out = {
    viewportW: window.innerWidth,
    docW: document.documentElement.scrollWidth,
    innerPadL: inner ? getComputedStyle(inner).paddingLeft : null,
    innerTop: inner ? +inner.getBoundingClientRect().top.toFixed(2) : null,
    innerH: inner ? +inner.getBoundingClientRect().height.toFixed(2) : null,
  };

  const sticky = document.querySelector('.sticky-head');
  out.stickyH = sticky ? +sticky.getBoundingClientRect().height.toFixed(2) : null;
  const tabs = document.querySelector('.tabs');
  out.tabsH = tabs ? +tabs.getBoundingClientRect().height.toFixed(2) : null;

  if (back) {
    const b = back.getBoundingClientRect();
    out.backLeft = +b.left.toFixed(2);
    out.backW = +b.width.toFixed(2);
    // ① 触摸区九宫格命中测试（左上 / 中心 / 右下）
    const pts = [
      [b.left + 2, b.top + 2],
      [b.left + b.width / 2, b.top + b.height / 2],
      [b.right - 2, b.bottom - 2],
    ];
    out.hits = pts.map(([x, y]) => {
      const e = document.elementFromPoint(x, y);
      if (!e) return 'null';
      return e.closest('.nav-back, .nav-btn') === back ? 'back' : `MISS(${e.tagName.toLowerCase()})`;
    });
    // ② 墨迹：svg 的 getBBox（viewBox 单位）→ 像素
    const svg = back.querySelector('svg');
    if (svg) {
      const sb = svg.getBoundingClientRect();
      const vb = (svg.getAttribute('viewBox') || '0 0 24 24').split(/\s+/).map(Number);
      const scale = sb.width / vb[2];
      let minX = Infinity;
      for (const el of svg.querySelectorAll('path, circle, rect, line, polyline')) {
        const bb = el.getBBox();
        const sw = parseFloat(getComputedStyle(el).strokeWidth) || 0;
        minX = Math.min(minX, bb.x - sw / 2);
      }
      if (Number.isFinite(minX)) out.inkLeft = +(sb.left + minX * scale).toFixed(2);
    }
  }

  if (title) {
    const cs = getComputedStyle(title);
    const range = document.createRange();
    range.selectNodeContents(title);
    const rb = range.getBoundingClientRect();
    out.title = {
      text: title.textContent.trim(),
      position: cs.position,
      pointerEvents: cs.pointerEvents,
      fontSize: cs.fontSize,
      color: cs.color,
      inkLeft: +rb.left.toFixed(2),
      inkWidth: +rb.width.toFixed(2),
      inkCenterX: +(rb.left + rb.width / 2).toFixed(2),
      inkCenterY: +((rb.top + rb.bottom) / 2).toFixed(2),
    };
    out.viewportCenterX = +(window.innerWidth / 2).toFixed(2);
    if (inner) {
      const ib = inner.getBoundingClientRect();
      out.rowCenterY = +(ib.top + ib.height / 2).toFixed(2);
    }
    // 标题不该拦截点击（覆盖层必须穿透）
    const tb = title.getBoundingClientRect();
    const hit = document.elementFromPoint(tb.left + tb.width / 2, tb.top + tb.height / 2);
    out.titleHit = hit ? (hit.closest('.nav-title') ? 'title' : 'pass-through') : 'null';
  }
  return out;
};

const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ['--no-proxy-server', '--disable-features=IsolateOrigins,site-per-process'],
});
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
const page = await ctx.newPage();

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2400);
if (await page.locator('.submit').count()) {
  await page.locator('.uni-input-input').nth(0).fill(USER);
  await page.locator('.uni-input-input').nth(1).fill(PASS);
  await page.locator('.submit').first().click();
  await page.waitForTimeout(2600);
}

for (const [name, hash, opt] of PAGES) {
  await page.goto(`${BASE}/${hash}`, { waitUntil: 'load' });
  // hash 变更不重新挂载组件 —— 不 reload 会量到上一页的 DOM（静默量错页）
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(PROBE);

  console.log(`\n===== ${name} =====`);
  console.log(
    `  触摸区 left=${r.backLeft} 宽=${r.backW} · 墨迹 left=${r.inkLeft ?? '(无 svg)'} · ` +
      `行高=${r.innerH} 内边距=${r.innerPadL}${r.stickyH ? ` · 吸顶区=${r.stickyH}（Tab ${r.tabsH}）` : ''}`,
  );
  if (r.title) {
    console.log(
      `  标题「${r.title.text}」${r.title.fontSize} ${r.title.color} ${r.title.position} ` +
        `墨迹中心 x=${r.title.inkCenterX}（视口中心 ${r.viewportCenterX}） y=${r.title.inkCenterY}（行中心 ${r.rowCenterY}）`,
    );
  }

  check(`${name}：返回键触摸区左边缘 = 8`, r.backLeft === 8, `实测 ${r.backLeft}`);
  check(
    `${name}：墨迹左边缘 = ${opt.ink}（当前约定，见脚本头注释）`,
    r.inkLeft !== undefined && Math.abs(r.inkLeft - opt.ink) <= 0.5,
    `实测 ${r.inkLeft}`,
  );
  check(
    `${name}：触摸区左上 / 中心 / 右下三点都命中返回键`,
    r.hits && r.hits.every((h) => h === 'back'),
    `实测 ${JSON.stringify(r.hits)}`,
  );
  check(`${name}：无横向溢出`, r.docW <= r.viewportW, `docW ${r.docW} > 视口 ${r.viewportW}`);

  if (r.title) {
    if (r.title.position === 'absolute') {
      // 只有绝对定位的标题才该与屏幕中心重合；flex:1 居中是在"剩余空间"里居中，会偏。
      check(
        `${name}：绝对定位标题的墨迹中心 = 视口中心（≤1px）`,
        Math.abs(r.title.inkCenterX - r.viewportCenterX) <= 1,
        `偏差 ${(r.title.inkCenterX - r.viewportCenterX).toFixed(2)}px`,
      );
      check(
        `${name}：标题竖向居中于返回行（≤1px）`,
        Math.abs(r.title.inkCenterY - r.rowCenterY) <= 1,
        `偏差 ${(r.title.inkCenterY - r.rowCenterY).toFixed(2)}px`,
      );
      check(
        `${name}：标题不拦截点击（覆盖层可穿透）`,
        r.titleHit === 'pass-through',
        `中心命中 ${r.titleHit}`,
      );
    } else {
      console.log(
        `  · 标题非绝对定位，不判居中（在"剩余空间"里居中，中心 ${r.title.inkCenterX} vs 视口中心 ${r.viewportCenterX}）`,
      );
    }
  }

  if (opt.stickyHead) {
    check(`${name}：吸顶区 = 89（44 顶栏 + 45 Tab）`, r.stickyH === 89, `实测 ${r.stickyH}`);
  }

  rows.push({ name, touch: r.backLeft, ink: r.inkLeft, title: r.title?.inkCenterX });
}

// 横向对比表：8px 那处不一致要一直看得见，别让它沉进单页日志里
console.log('\n===== 五个页面的返回键几何（横向对比）=====');
for (const r of rows) {
  console.log(
    `  ${r.name.padEnd(5)} 触摸区 left=${String(r.touch).padStart(4)}  墨迹 left=${String(r.ink).padStart(6)}` +
      `   标题中心=${r.title !== undefined ? r.title : '(无标题)'}`,
  );
}
const inks = rows.map((r) => r.ink);
check(
  '五个页面触摸区左边缘一致（= 8）',
  new Set(rows.map((r) => r.touch)).size === 1 && rows[0].touch === 8,
  `实测 ${JSON.stringify(inks)} 对应的触摸区 ${JSON.stringify(rows.map((r) => r.touch))}`,
);
console.log(
  `  ⚠️ 墨迹未统一：报表 ${rows.find((r) => r.name === '报表')?.ink}，其余 ${inks[0]} —— ` +
    `差 ${Math.abs((rows.find((r) => r.name === '报表')?.ink ?? 0) - inks[0]).toFixed(2)}px，` +
    `理由（与大标题同轴）已于 2026-09-17 失效，待决定。`,
);

await browser.close();

console.log('\n' + '─'.repeat(72));
if (failures.length === 0) {
  console.log(`全部通过：${pass} 项断言`);
  console.log('顶栏几何与可点性一致。\n');
  process.exit(0);
} else {
  console.log(`通过 ${pass} 项，未通过 ${failures.length} 项：\n`);
  for (const f of failures) console.log('  · ' + f);
  console.log('\n⚠️ 若是「三点命中」失败：多半是覆盖层吃掉了触摸区（漏 pointer-events: none）。\n');
  process.exit(1);
}
