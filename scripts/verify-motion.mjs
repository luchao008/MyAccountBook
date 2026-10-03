/**
 * 交互动效验收（2026-10-03）—— 覆盖「批次① 按下反馈 + tap-highlight」与「批次② 弹层进出场」
 *
 * 为什么不能只靠"看起来动了"：
 *   加了 `-webkit-tap-highlight-color: transparent` 却没配上自绘按下反馈，
 *   会**静默地让反馈消失**（比不改更差）—— 这种"负收益"必须由脚本钉住。
 *   同理，`<transition>` 写了但 `name` 与全局 CSS 对不上（如写成 `sheet-fade`），
 *   Vue 不报错、动画**完全不发生** —— 也只有端到端能发现。
 *
 * 前置：dev server 在 5173（`cd frontend && npm run dev:h5`）+ 后端 7001。
 * 用法：node scripts/verify-motion.mjs
 */
import fs from 'node:fs';

const PW =
  '/Users/luchao/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js';
const pw = await import(PW);
const { chromium } = pw.default ?? pw;

const BASE = 'http://127.0.0.1:5173';
const USER = 'demo';
const PASS = '123456';

function findChrome() {
  const root = `${process.env.HOME}/Library/Caches/ms-playwright`;
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
  throw new Error('找不到 playwright 的 Chromium');
}

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ['--no-proxy-server'],
});
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)));

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await sleep(1500);
if (page.url().includes('/pages/login')) {
  const inputs = page.locator('input');
  await inputs.nth(0).fill(USER);
  await inputs.nth(1).fill(PASS);
  await page.getByText('登录', { exact: true }).last().click();
  await sleep(2500);
}

// ─────────────────────────────────────────────────────────────
// 一、按下反馈的「地基」：tap-highlight 必须已被关掉
//     若它没关，说明这次的按下反馈还没接上；若关了却没有 :active 规则，
//     就是「反馈净减少」（最差情况）—— 下面第二节专门查这个。
// ─────────────────────────────────────────────────────────────
console.log('\n[一 · tap-highlight]');
const tapHighlight = await page.evaluate(() =>
  getComputedStyle(document.body).getPropertyValue('-webkit-tap-highlight-color').trim()
);
check(
  '-webkit-tap-highlight-color 已关闭（否则移动端会露默认灰块）',
  /rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)|transparent/i.test(tapHighlight),
  tapHighlight || '(空)'
);

// ─────────────────────────────────────────────────────────────
// 二、列表行的自绘按下反馈必须存在（与上一条配对）
// ─────────────────────────────────────────────────────────────
console.log('\n[二 · 列表行按下反馈]');
/*
 * ⚠️ 判据是「**真的按下去，背景变没变**」，而不是「扫 styleSheets 找 `.txn:active` 字符串」。
 *
 * 为什么换掉最初那版（扫 CSSOM）：
 *   ① 它会报**假红** —— 这些样式是页面级 scoped 的，Vite dev 按页面按需注入，
 *      停在别的页面读 `document.styleSheets` 根本读不到（第一版就栽在这里）；
 *   ② 更根本的是**规则存在 ≠ 按下时生效**：选择器写错、被更高特异性盖掉、
 *      或 iOS 上 `:active` 因缺 touch 监听而不触发 —— 这些情况下 CSSOM 里照样有这条规则。
 *   所以改成端到端：用 CDP 发一个**真实触摸按下**（按住不放），读计算后的背景色。
 */
await page.goto(`${BASE}/#/pages/flow/index`, { waitUntil: 'domcontentloaded' });
await sleep(3000);

const rowCount = await page.locator('.txn').count();
check('flow 页有流水行可供测试', rowCount > 0, `${rowCount} 行`);

if (rowCount > 0) {
  const box = await page.locator('.txn').first().boundingBox();
  const clip = {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
  /*
   * ⚠️ 判据用**截图比对像素**，而不是读 DOM 计算样式。
   *
   * 为什么换掉前两版（读 styleSheets / 读 computedStyle）：
   *   ① 扫 CSSOM 找 `.txn:active` 会**假红** —— 样式是页面级 scoped 的，
   *      且 Vite dev 按页面注入，停在别的页面根本读不到；
   *   ② 读 computedStyle 这条路在本项目走不通 —— `page.evaluate` 里
   *      `document.querySelector('.txn')` 返回 **null**，而 Playwright 的 locator
   *      能穿透（`count()` 数到 15 行）。内容在自定义元素 / shadow 边界之后，两边解析路径不同。
   *
   * 更要紧的是：**"用户看得到变化"才是这个功能的验收目标**。
   *   读到的 `backgroundColor` 再正确，也不如直接证明"那块像素变了"来得硬 ——
   *   它顺带覆盖了"规则存在但被更高特异性盖掉"这类读样式发现不了的情况。
   */
  const shotBefore = await page.screenshot({ clip });
  const cx = clip.x + clip.width / 2;
  const cy = clip.y + clip.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await sleep(220); // 等 :active 生效（uni 的 hoverStartTime 默认 50ms）
  const shotDuring = await page.screenshot({ clip });
  /*
   * ⚠️ 必须**先把指针移出该元素再抬起**。
   *    `.txn` 上挂着 `@click="editTransaction(...)"` —— 若 down 与 up 落在同一元素上，
   *    浏览器会判定为一次**点击**，页面直接跳到编辑页，
   *    于是"松开后"那张截图拍到的已经不是这一行了（第一版就是这么假红的）。
   *    移到下一行再抬起：down/up 不同元素 ⇒ 不触发 click。
   */
  await page.mouse.move(cx, cy + 120);
  await page.mouse.up();
  await sleep(150);
  const shotAfter = await page.screenshot({ clip });

  check('按下时该行像素发生变化（反馈肉眼可见）', !shotBefore.equals(shotDuring), '');
  check('松开后像素恢复原样', shotAfter.equals(shotBefore), '');
}

// ─────────────────────────────────────────────────────────────
// 三、弹层进出场（批次②）
//     用报表页的 PeriodPicker —— 它是 7 个 `.mask > .sheet` 弹层之一，
//     且有稳定的触发点 `.period-center`。
// ─────────────────────────────────────────────────────────────
console.log('\n[三 · 弹层进出场]');
await page.goto(`${BASE}/#/pages/statistics/index`, { waitUntil: 'domcontentloaded' });
await sleep(3500);

// 记录 class 变化（Vue 的 <transition> 会给根元素加减 *-active / *-from 类）
await page.evaluate(() => {
  window.__motion = { enter: false, enterFrom: false, leave: false, leaveTo: false };
  const want = [
    ['sheet-enter-active', 'enter'],
    ['sheet-enter-from', 'enterFrom'],
    ['sheet-leave-active', 'leave'],
    ['sheet-leave-to', 'leaveTo'],
  ];
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      const cl = m.target.classList;
      if (!cl || !cl.contains('mask')) continue;
      for (const [cls, key] of want) if (cl.contains(cls)) window.__motion[key] = true;
    }
  });
  obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
});

/** 采样面板位置（用来证明"真的在动"，而不只是加了个 class） */
async function snapSheet() {
  return page.evaluate(() => {
    const s = document.querySelector('.sheet');
    if (!s) return null;
    const r = s.getBoundingClientRect();
    return { top: Math.round(r.top), h: Math.round(r.height) };
  });
}

await page.locator('.period-center').first().click({ noWaitAfter: true });
/*
 * ⚠️ 采样必须**带间隔**：过渡是 400ms，而 `page.evaluate` 的往返只有几毫秒 ——
 *    第一版连续采 12 次只覆盖了约 20ms（不到两帧），全部读到起始位置，
 *    于是把「动画正常」误判成「动画没跑」。
 *    间隔 45ms × 10 次 ≈ 450ms，刚好覆盖整个过渡。
 */
const samples = [];
for (let i = 0; i < 10; i++) {
  samples.push(await snapSheet());
  await sleep(45);
}
await sleep(400);
const settled = await snapSheet();

const tops = samples.filter(Boolean).map((s) => s.top);
const movedDuringEnter = tops.length >= 2 && Math.min(...tops) !== Math.max(...tops);
check(
  '打开弹层时面板位置在变化（动画真的在跑，不只是加了 class）',
  movedDuringEnter,
  `采样 top: ${tops.slice(0, 6).join(' → ')}`
);
check(
  '打开结束后面板停在最终位置',
  !!settled,
  settled ? `top=${settled.top} 高=${settled.h}` : '(未找到 .sheet)'
);

const motionAfterOpen = await page.evaluate(() => window.__motion);
check(
  '出现过 `sheet-enter-active`（<transition> 的 name 与全局 CSS 对得上）',
  motionAfterOpen.enter,
  JSON.stringify(motionAfterOpen)
);

// 关闭：点遮罩
await page.evaluate(() => document.querySelector('.mask')?.click());
await sleep(400);
const motionAfterClose = await page.evaluate(() => window.__motion);
check('关闭时出现过 `sheet-leave-active`（出场动画已接上）', motionAfterClose.leave, '');

// ─────────────────────────────────────────────────────────────
// 四、无障碍：prefers-reduced-motion 下动画被压平，但**弹层仍能正常关闭**
//
//     第二条判据才是重点：如果压平用 `transition-duration: none`，
//     `transitionend` 永远不会触发，而弹层的卸载依赖 Vue 的 transition 生命周期
//     ⇒ **弹层会关不掉**。这个坑只有端到端能发现。
// ─────────────────────────────────────────────────────────────
console.log('\n[四 · reduced-motion]');
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(3500);

await page.locator('.period-center').first().click({ noWaitAfter: true });
await sleep(150);

const durRaw = await page.evaluate(() => {
  const el = document.querySelector('.sheet');
  return el ? getComputedStyle(el).transitionDuration : null;
});
/*
 * 把样式里的时长换算成毫秒。
 *
 * ⚠️ 不能用 `/^([\d.]+)(ms|s)$/` 这种正则：**Chrome 对极小的秒值会输出科学计数法**。
 *    实测 `transition-duration: 0.01ms` 的计算值是 **`1e-05s`**（不是 `0.00001s`），
 *    而 `[\d.]+` 匹配不了 `e-05` ⇒ 解析返回 null ⇒ 判据假红（第一版就是这么栽的）。
 *    改用 parseFloat（它认科学计数法），只靠后缀区分单位。
 */
function toMs(v) {
  const s = String(v || '').trim();
  const num = parseFloat(s);
  if (Number.isNaN(num)) return null;
  return s.endsWith('ms') ? num : num * 1000;
}
const durMs = toMs(durRaw);
check(
  'reduced-motion 下面板过渡被压平（时长 < 1ms）',
  durMs !== null && durMs < 1,
  `computed transitionDuration = ${durRaw}`
);

await page.evaluate(() => document.querySelector('.mask')?.click());
await sleep(500);
const maskGone = await page.evaluate(() => !document.querySelector('.mask'));
check(
  'reduced-motion 下弹层仍能正常关闭（关键：证明压平没用 `none`，transitionend 没丢）',
  maskGone,
  ''
);

// 还原媒体设置，避免影响后续
await page.emulateMedia({ reducedMotion: 'no-preference' });

// ─────────────────────────────────────────────────────────────
// 五、分组展开 / 收起（D1）
//
//     判据是「收起过程中**采到中间高度**」—— 如果高度是瞬变的，
//     采样要么全是初始高度、要么直接跳到 0，永远采不到中间值。
//     这比"断言有 transition 属性"硬得多（规则存在 ≠ 动画真的在跑）。
// ─────────────────────────────────────────────────────────────
console.log('\n[五 · 分组展开/收起]');
await page.goto(`${BASE}/#/pages/flow/index`, { waitUntil: 'domcontentloaded' });
await sleep(3500);

const readBodyH = () =>
  page.evaluate(() => {
    const el = document.querySelector('.group-body');
    return el ? Math.round(el.getBoundingClientRect().height) : null;
  });

const hOpen = await readBodyH();
check('进流水页时第一个分组已展开（高度 > 0）', hOpen !== null && hOpen > 0, `高度 ${hOpen}`);

if (hOpen !== null && hOpen > 0) {
  await page.locator('.group-head').first().click();
  const samples = [];
  for (let i = 0; i < 8; i++) {
    samples.push(await readBodyH());
    await sleep(25); // 带间隔采样（同弹层那条教训：连续采只覆盖不到两帧）
  }
  await sleep(350);
  const hClosed = await readBodyH();

  const hasMiddle = samples.some((h) => h !== null && h > 0 && h < hOpen);
  check(
    '收起过程中采到中间高度（是过渡，不是瞬变）',
    hasMiddle,
    `${hOpen} → [${samples.join(', ')}] → ${hClosed}`
  );
  check('收起后高度归零（0fr 生效，且 min-height:0 没漏）', hClosed !== null && hClosed <= 1, `结束高度 ${hClosed}`);
}

// ─────────────────────────────────────────────────────────────
// 六、骨架 ⇄ 内容：交叉淡入（C3）
//
//     核心判据是「**两个分支同时在场**」—— 那正是"交叉"的定义：
//       · 若只做"内容淡入"（骨架瞬时撤掉），任一帧都只有一个分支 ⇒ 红；
//       · 若写了 `mode="out-in"`（串行），中途会出现两边都不在场的空档 ⇒ 红。
//     另外必须验证「离开的那一块脱流」—— 两分支同时占位时容器高度会变成
//     两者之和，页面会突然长高一大截。这条只有量高度才看得出来。
//
//     ⚠️ 采样器必须在**导航之前**注入：骨架只在首屏出现（`!loaded`），
//        等导航完再注入就晚了 —— 那时过渡早就结束了。
// ─────────────────────────────────────────────────────────────
console.log('\n[六 · 骨架⇄内容交叉淡入]');

await page.addInitScript(() => {
  window.__cross = [];
  const tick = () => {
    const host = document.querySelector('.cross-host');
    if (host && window.__cross.length < 1500) {
      let absCount = 0; // 这一帧有几块脱流（正常交叠时 ≥1，见下方判据）
      let skOpacity = null; // 骨架那一层的实时 opacity
      const kids = [];
      for (const el of host.children) {
        const cs = getComputedStyle(el);
        if (cs.position === 'absolute') absCount += 1;
        if (el.querySelector('.sk')) skOpacity = parseFloat(cs.opacity);
        kids.push(`${el.className || '(无class)'}[${cs.position}]`);
      }
      window.__cross.push({
        t: Math.round(performance.now()),
        sk: host.querySelectorAll('.sk').length, // 骨架块数量
        real: host.querySelectorAll('.group-title').length, // 真实内容数量（骨架里没有它）
        abs: absCount,
        kids: kids.join(' + '),
        h: host.offsetHeight,
        op: skOpacity,
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

// 重新加载流水页：skeleton 是"首屏且从未成功过"才铺，所以必须让组件重新挂载
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(5000);

const cross = await page.evaluate(() => window.__cross || []);
const overlap = cross.filter((s) => s.sk > 0 && s.real > 0);
const last = cross[cross.length - 1] || {};

check('首屏铺出了骨架块', cross.some((s) => s.sk > 0), `采样 ${cross.length} 帧`);

/*
 * ⚠️ 这条是 C3 的**配套守卫**，防的是一类很容易漏掉的回归：
 *    `skeleton` 初值若是 `false`，首帧会落到 v-if 链的最后一个分支
 *    （空态 / 错误态 / 内容），即先渲染一次「该条件下暂无流水」或「¥0.00」，
 *    再被骨架顶掉。
 *    没有动画时它只闪 1 帧（约 16ms）、基本看不见；**有了交叉淡入，那个错误分支
 *    会淡出 150ms** —— 一闪就变成肉眼可见的错值。实测就是这么发现的：
 *    交叠帧里同时采到了 `empty[leave] + 骨架[leave] + 内容[enter]` 三块。
 *    所以这条断言是"C3 没有把首屏变差"的唯一守卫，别删。
 */
const emptyFrames = cross.filter((s) => s.kids.includes('empty'));
check(
  '首屏不会先渲染一次空态/错误态（否则淡出会把它放大成可见错值）',
  emptyFrames.length === 0,
  emptyFrames.length ? `${emptyFrames.length} 帧，示例：${emptyFrames[0].kids}` : '未出现'
);

check(
  '过渡期间骨架与真实内容**同时在场**（"交叉"的定义；串行 out-in 或只做内容淡入都会红）',
  overlap.length > 0,
  `交叠帧 ${overlap.length}`
);

check(
  '交叠期间离开的那一块已脱流（position: absolute，否则高度会变成两份之和）',
  overlap.length > 0 && overlap.every((s) => s.abs >= 1),
  `abs 取值 ${[...new Set(overlap.map((s) => s.abs))].join('/') || 'n/a'}`
);

const midOp = overlap.filter((s) => s.op !== null && s.op > 0.02 && s.op < 0.98);
if (overlap.length) console.log(`   ⓘ 交叠帧的 .cross-host 结构：${overlap[0].kids}`);
check(
  '骨架被采到**中间透明度**（是渐变，不是瞬变）',
  midOp.length > 0,
  midOp.map((s) => s.op.toFixed(2)).slice(0, 6).join(', ') || '未采到中间值'
);

const maxH = overlap.length ? Math.max(...overlap.map((s) => s.h)) : 0;
const finalH = last.h || 0;
check(
  '交叠期间容器高度没有变成两份之和',
  finalH > 0 && maxH <= finalH * 1.2,
  `交叠最大 ${maxH} / 最终 ${finalH}`
);

check(
  '过渡结束后骨架已卸载、只剩真实内容',
  last.sk === 0 && (last.real || 0) > 0,
  `末帧 sk=${last.sk} real=${last.real}`
);

// ─────────────────────────────────────────────────────────────
// 七、首次展开分组时的高度渐变（守卫 D1 的一个副作用）
//
//     背景：明细是**异步**到达的 —— `toggleGroup` 先展开（正文只有一行
//     「加载中…」= 56px），明细到达后整块在**一帧内**长高。
//     2026-10-03 实测：突变版序列是 `0 → 56 → 1395`，**单帧 +1339px**。
//     CSS 救不了它：`height: auto→auto` 不知道中间值，而 D1 的
//     `grid-template-rows: 1fr → 1fr` **指定值根本没变**（变的只是解析出的像素）。
//
//     ⚠️ 判据刻意**不用阈值**（如「单帧增长 < 400px」）——
//        而看「**有没有中间高度**」：突变序列里取不到任何中间值，
//        真实缓动则会经过一串中间值（实测 404 → 562 → 710 → …）。
//        这样阈值怎么定都不会误报，也不会因为换个数据集就假红。
//
//     复现：切分组粒度 ⇒ `reloadAll` 清空 `details` ⇒ 首屏自动展开的分组
//     走「首次加载」路径（与手点展开同一条）。
// ─────────────────────────────────────────────────────────────
console.log('\n[七 · 首次展开的高度渐变]');

await page.evaluate(() => {
  window.__gh = [];
  let n = 0;
  const tick = () => {
    // 每次**重新查询**：切粒度时 `.group-body` 会被重建，
    // 缓存引用会拿到已脱离文档的旧节点、量到 0。
    const el = document.querySelector('.group-body');
    window.__gh.push(el ? Math.round(el.getBoundingClientRect().height) : null);
    if (++n < 400) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

await page.locator('.filter-item').first().click();
await sleep(700);
// ⚠️ 用正则精确匹配「月」：直接 hasText:'月' 会命中「每月」这类文案
await page.locator('.sheet-item-text').filter({ hasText: /^\s*月\s*$/ }).first().click();
await sleep(4000);

const gh = (await page.evaluate(() => window.__gh)).filter((v) => v !== null);
const ghFinal = gh[gh.length - 1] || 0;
const ghMid = gh.filter((v) => v > 80 && v < ghFinal - 50);
check(
  '首次展开时高度是**渐变**的（异步明细到达不产生单帧突变）',
  ghMid.length >= 3,
  `最终 ${ghFinal}px，取到 ${ghMid.length} 个中间高度：${ghMid.slice(0, 6).join(' → ')}`
);

check('页面运行期无未捕获异常', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | ') || '无');

await browser.close();

console.log('\n' + '─'.repeat(52));
console.log(`合计 通过 ${pass} 失败 ${fail}`);
process.exit(fail ? 1 : 0);
