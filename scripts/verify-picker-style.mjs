/**
 * 「记一笔 · 分类选择器」展示与选中态验证（真实浏览器）。
 *
 *   node scripts/verify-picker-style.mjs
 *
 * 背景（2026-09-19，按 luchao 给的参考图改版）：
 *   · 图标不再套 46px 灰底圆形，直接以 40px 落在卡片上（参考图实测 ≈40px）
 *   · 名称在图标下方居中、允许两行，文字色 #222226（= $v11-text-primary，参考图实测值）
 *   · 选中态 = **整格奶油卡片**：$v11-gold-soft 底 + 1px 暖色发丝描边 + 名称加粗
 *   · 未选中 = 无底无框；窄屏（<360px）图标降一档 36px、侧栏收窄
 *   · 卡片贴合自身内容高度（不随同行两行名格子被 stretch 拉高）
 *
 * 覆盖：
 *   ① 圆背板已移除（无 .icon-box）
 *   ② 图标 40px（375 视口）/ 36px（320 视口）
 *   ③ 未选中格无底无框、名称色 #222226、字号 12px
 *   ④ 选中格：奶油底 #FDF6EF + 1px 暖描边 + 圆角 14 + 名称加粗
 *   ⑤ 卡片高度贴合内容（单行名卡片 < 同行两行名格子的高度）
 *   ⑥ 320px 窄屏：4 字分类名**单行不断行**（参考图同样是"4 字一行"）
 *   ⑦ 交互不回归：点选后记录页分类行更新、重开选择器选中态正确
 *
 * ⚠️ 只读验证：全程不保存任何记录（选择器点选只改表单状态，不落库）。
 * ⚠️ uni-app H5 把 <view> 渲染成 <uni-view>，Playwright 直接 click 常被 hit-test 拦，
 *    点击一律走 evaluate（项目已验证过的做法）。
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
        root +
        '/' +
        d +
        '/' +
        arch +
        '/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-proxy-server'] });
const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
const page = await context.newPage();
page.setDefaultTimeout(8000);
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 160)));

async function login() {
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  if (page.url().indexOf('/pages/login') >= 0) {
    const inputs = page.locator('input');
    await inputs.nth(0).fill('demo');
    await inputs.nth(1).fill('123456');
    await page.evaluate(function () {
      var b = document.querySelector('.submit,uni-button,button');
      if (b) b.click();
    });
    await page.waitForTimeout(2500);
  }
}

/** 打开记一笔 → 点「分类」行 → 选择器展开 */
async function openPicker() {
  await page.evaluate(function () {
    var rows = Array.from(document.querySelectorAll('.row'));
    var row = rows.find(function (r) {
      return r.textContent.indexOf('分类') >= 0;
    });
    if (row) row.click();
  });
  await page.waitForTimeout(1300);
}

await login();

/* ============================================================
 * ① 圆背板移除 + ② 图标 40px + ③ 未选中格样式
 * ============================================================ */
console.log('[1] 375 视口：基本样式');
await page.goto('http://127.0.0.1:5173/#/pages/record/index', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await openPicker();
const basic = await page.evaluate(() => {
  const cells = Array.from(document.querySelectorAll('.grid-item'));
  const plain = cells.find((c) => !c.className.includes('picked'));
  const cs = plain ? getComputedStyle(plain) : null;
  const name = plain ? getComputedStyle(plain.querySelector('.name')) : null;
  const icon = plain ? plain.querySelector('.image-icon') : null;
  return {
    iconBoxCount: document.querySelectorAll('.icon-box').length,
    cellCount: document.querySelectorAll('.grid-item').length,
    iconW: icon ? icon.style.width : '',
    plainBg: cs ? cs.backgroundColor : '',
    plainBorder: cs ? cs.borderColor : '',
    nameColor: name ? name.color : '',
    nameSize: name ? name.fontSize : '',
    nameMarginTop: name ? name.marginTop : '',
  };
});
check('圆背板 .icon-box 已移除', basic.iconBoxCount === 0);
check('网格渲染出格子', basic.cellCount > 0, `${basic.cellCount} 格`);
check('图标尺寸 40px', basic.iconW === '40px', basic.iconW);
check('未选中格无底色', basic.plainBg === 'rgba(0, 0, 0, 0)' || basic.plainBg === '', basic.plainBg);
check('未选中格描边透明（占位不显）', basic.plainBorder === 'rgba(0, 0, 0, 0)', basic.plainBorder);
check('名称色 = #222226', basic.nameColor === 'rgb(34, 34, 38)', basic.nameColor);
check('名称字号 = 12px（中文硬下限）', basic.nameSize === '12px', basic.nameSize);
check('名称无上外边距（紧跟图标，luchao 2026-09-19 定）', basic.nameMarginTop === '0px', basic.nameMarginTop);

/* ============================================================
 * ④ 选中态：奶油卡片 + 暖描边 + 加粗；⑦ 交互不回归
 * ============================================================ */
console.log('[2] 选中态与交互');
const pickedName = '日常用品';
const clicked = await page.evaluate(function (n) {
  var cells = Array.from(document.querySelectorAll('.grid-item'));
  var cell = cells.find(function (c) {
    return c.textContent.trim() === n;
  });
  if (!cell) return false;
  cell.click();
  return true;
}, pickedName);
check('点选了一个分类', clicked, pickedName);
await page.waitForTimeout(1200);
const rowText = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('.row'));
  const row = rows.find((r) => r.textContent.indexOf('分类') >= 0);
  return row ? row.textContent.trim() : '';
});
check('记录页分类行已更新', rowText.indexOf(pickedName) >= 0, rowText);

await openPicker();
const pickedStyle = await page.evaluate(() => {
  const el = document.querySelector('.grid-item.picked');
  if (!el) return null;
  const cs = getComputedStyle(el);
  const name = getComputedStyle(el.querySelector('.name'));
  return {
    text: el.textContent.trim(),
    bg: cs.backgroundColor,
    border: cs.borderColor,
    borderW: cs.borderWidth,
    radius: cs.borderRadius,
    nameWeight: name.fontWeight,
    height: Math.round(el.getBoundingClientRect().height),
  };
});
check('存在选中格', !!pickedStyle, pickedStyle ? pickedStyle.text : '(无)');
check('选中格奶油底 #FDF6EF', !!pickedStyle && pickedStyle.bg === 'rgb(253, 246, 239)', pickedStyle && pickedStyle.bg);
check(
  '选中格 1px 暖色发丝描边',
  !!pickedStyle && pickedStyle.border === 'rgba(143, 83, 18, 0.18)' && pickedStyle.borderW === '1px',
  pickedStyle && `${pickedStyle.border} / ${pickedStyle.borderW}`
);
check('选中格圆角 14px', !!pickedStyle && pickedStyle.radius === '14px', pickedStyle && pickedStyle.radius);
check('选中格名称加粗（500）', !!pickedStyle && pickedStyle.nameWeight === '500', pickedStyle && pickedStyle.nameWeight);

/* ============================================================
 * ⑤ 卡片高度贴合内容（不被同行两行名格子拉高）
 * ============================================================ */
console.log('[3] 卡片高度贴合内容');
const heights = await page.evaluate(() => {
  const cells = Array.from(document.querySelectorAll('.grid-item'));
  const one = cells.find((c) => c.textContent.trim() === '日常用品'); // 4 字 → 单行
  const two = cells.find((c) => c.textContent.trim() === '水电煤气宽带'); // 6 字 → 两行
  return {
    one: one ? Math.round(one.getBoundingClientRect().height) : 0,
    two: two ? Math.round(two.getBoundingClientRect().height) : 0,
  };
});
check(
  '单行名格子明显矮于两行名格子（未被 stretch 拉齐）',
  heights.one > 0 && heights.two > 0 && heights.two - heights.one >= 16,
  `单行 ${heights.one}px / 两行 ${heights.two}px`
);
await page.screenshot({ path: '/tmp/verify-picker-style-375.png' });

/* ============================================================
 * ⑥ 320px 窄屏：图标降档 + 4 字名单行
 * ============================================================ */
console.log('[4] 320 视口：窄屏适配');
await page.setViewportSize({ width: 320, height: 568 });
/*
 * ⚠️ 必须**整页重载**：图标档位是组件 setup 时读 `uni.getSystemInfoSync()` 定下的，
 *    只改视口不重载的话组件还持有 375 时的值（实测踩过）。
 */
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await openPicker();
const narrow = await page.evaluate(() => {
  const cell = Array.from(document.querySelectorAll('.grid-item')).find(
    (c) => c.textContent.trim() === '日常用品'
  );
  const icon = cell ? cell.querySelector('.image-icon') : null;
  const name = cell ? cell.querySelector('.name') : null;
  return {
    iconW: icon ? icon.style.width : '',
    nameH: name ? Math.round(name.getBoundingClientRect().height) : 0,
    cellW: cell ? Math.round(cell.getBoundingClientRect().width) : 0,
  };
});
check('320px 下图标降档到 36px', narrow.iconW === '36px', narrow.iconW);
check(
  '320px 下 4 字名单行不断行（高度 = 18px）',
  narrow.nameH === 18,
  `名称高 ${narrow.nameH}px / 格子宽 ${narrow.cellW}px`
);
await page.screenshot({ path: '/tmp/verify-picker-style-320.png' });

console.log(
  '\n结果：PASS=' +
    pass +
    ' FAIL=' +
    fail +
    '（截图：/tmp/verify-picker-style-375.png、/tmp/verify-picker-style-320.png）'
);
await browser.close();
process.exit(fail ? 1 : 0);
