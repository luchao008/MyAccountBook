/**
 * 「分类图片图标」运行时验证（真实浏览器，走完整 UI 链路）。
 *
 *   node scripts/verify-cat-icons.mjs
 *
 * 背景（2026-09-19）：分类图片图标（`img:<分类名>`）接入 ——
 *   预置分类默认图标替换 + 存量数据迁移（见 src/migration/*-CategoryImageIcons.ts）。
 *   同日补做收入侧 19 张（原先只有支出 75 张），总数 75 → 94。
 *
 * 背景（2026-10-01）：**H5 端图标改用 WebP**（省 88.6% 体积）——
 *   `static/cat-icons/` 下每个分类现在是**双份产物**：
 *     · H5 端       → `<拼音>.webp`（本脚本断言的目标，`catIconSrc()` 按平台切扩展名）
 *     · 小程序/App  → `<拼音>.png`（包内本地文件，保持原样，不在本脚本范围内）
 *   ⚠️ 本脚本跑的是 **H5 dev server**，所以期望的是 `.webp`：
 *      请求 `.png` 会因为类型是 image/png 而**判失败** —— 那正是"H5 端没切过去"的信号。
 *      （小程序 / App 那两端不该按 webp 断言，它们本来就该是 PNG。）
 *
 * 覆盖：
 *   ① 静态资源：抽样请求 `/static/cat-icons/*.webp` —— 必须 200 **且 Content-Type 是 image/webp**
 *      （⚠️ 这条是回归守卫：文件名一度用中文，dev server 静态中间件不解码 URL，
 *        请求会回退成 index.html —— HTTP 200 但类型是 text/html，图片整片空白）
 *   ② 分类管理页：二级分类渲染出图片图标（uni-image 的 background-image 指向 cat-icons）
 *   ③ 接口数据：分类 icon 已是 `img:`（迁移生效，数量与预置文件一致）
 *   ④ 图标选择器：默认「图片」Tab、格子数 = 图标总数、图片真实加载、切 Tab 正常
 *   ⑤ 端到端：新建分类页 → 图标选择器 → 选一个图片图标 → 回填到表单
 *      （**全程不保存**，不产生任何数据写入）
 *
 * ⚠️ 只读验证：不进编辑态保存、不建分类、不动任何已有数据。
 * ⚠️ uni-app H5 把 <view> 渲染成 <uni-view>，Playwright 直接 click 常被 hit-test 拦，
 *    点击一律走 evaluate（项目已验证过的做法）。
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * 图标总数从**生成物**里读，不写死 —— 这批图标会随分类增减而变
 * （2026-09-19 就从 75 涨到 94），硬编码会让脚本在每次加图标后假失败。
 */
const META_TS = path.join(import.meta.dirname, '../frontend/src/constants/cat-icons.ts');
const ICON_TOTAL = Number(
  fs.readFileSync(META_TS, 'utf8').match(/CAT_ICON_TOTAL\s*=\s*(\d+)/)[1],
);

/**
 * 预置分类里 icon 已经是 `img:` 的**二级分类**数（迁移后每个账本应达到这个数）。
 * 同样从源文件数出来：2026-09-19 从 54（仅支出）涨到 73（支出 54 + 收入 19）。
 */
const PRESET_IMG_COUNT = (
  fs.readFileSync(path.join(import.meta.dirname, '../src/category/category-preset.ts'), 'utf8')
    .match(/icon: 'img:/g) || []
).length;

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

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-proxy-server'] });
const page = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
page.setDefaultTimeout(8000);
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 160)));

/**
 * 记录所有 cat-icons 静态请求的 URL 与响应类型（末尾两条守卫的数据源）：
 *   ① 每个请求都必须 200 + `image/webp`（H5 端目标态）
 *   ② 文件名必须是 **ASCII**（中文名在 uni-app H5 dev server 会静默 404）
 */
const iconResponses = [];
page.on('response', async (r) => {
  if (r.url().includes('/static/cat-icons/')) {
    iconResponses.push({ url: r.url(), type: r.headers()['content-type'] || '', status: r.status() });
  }
});

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

/* ============================================================
 * ① 静态资源：200 + image/webp（回归守卫）
 * ============================================================ */
console.log('[1] 静态资源可用性（含"必须是 image/webp"守卫）');
const staticProbe = await page.evaluate(async () => {
  // ⚠️ 抽的是 **H5 端的产物**（.webp）。小程序/App 的 .png 同目录并存，但不在这里断言。
  const files = ['wucan.webp', 'hongbao.webp', 'lvyoudujia.webp'];
  const out = [];
  for (const f of files) {
    const res = await fetch('/static/cat-icons/' + f);
    out.push({ f, status: res.status, type: res.headers.get('content-type') || '', size: (await res.blob()).size });
  }
  return out;
});
check(
  '抽样 3 个图标均 200 + image/webp',
  staticProbe.every((r) => r.status === 200 && r.type.includes('image/webp')),
  staticProbe.map((r) => `${r.f}:${r.status}/${r.type}/${r.size}B`).join(' ')
);

/* ============================================================
 * ② 分类管理页：二级分类渲染出图片
 * ============================================================ */
console.log('[2] 分类管理页渲染图片图标');
await page.goto('http://127.0.0.1:5173/#/pages/category/index', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
const catPage = await page.evaluate(() => {
  const imgs = Array.from(document.querySelectorAll('.image-icon'));
  const withBg = imgs.filter((el) => {
    const div = el.querySelector('div');
    return div && /cat-icons/.test(getComputedStyle(div).backgroundImage || '');
  });
  const loaded = imgs.filter((el) => el.querySelector('img[src*="/static/cat-icons/"]'));
  /** uni-image 里的 <img>：属性可能是相对路径（带 `?v=` 版本号），取属性优先、属性为空才回落到 absolute */
  const srcOf = (el) => {
    const img = el.querySelector('img');
    return img ? img.getAttribute('src') || img.src || '' : '';
  };
  return {
    total: imgs.length,
    withBg: withBg.length,
    loaded: loaded.length,
    webp: loaded.filter((el) => /\.webp(\?|$)/.test(srcOf(el))).length,
    sample: loaded.slice(0, 2).map(srcOf),
  };
});
check('页面出现图片图标容器', catPage.total > 0, `uni-image ${catPage.total} 个`);
check('背景图指向 /static/cat-icons/', catPage.withBg > 0, `${catPage.withBg} 个`);
check('图片真实加载完成（uni-image 内部已 append <img>）', catPage.loaded > 0, `${catPage.loaded} 个`);
check(
  'H5 端引用的确实是 .webp（不是 .png）',
  catPage.loaded > 0 && catPage.webp === catPage.loaded,
  `${catPage.webp}/${catPage.loaded} 样例: ${catPage.sample.join(' ')}`
);
await page.screenshot({ path: '/tmp/verify-cat-icons-category.png' });

/* ============================================================
 * ③ 接口数据：icon 已是 img:（迁移生效）
 * ============================================================ */
console.log('[3] 接口数据（迁移生效）');
const apiData = await page.evaluate(async () => {
  const tk = { Authorization: 'Bearer ' + localStorage.getItem('token') };
  const acc = await (await fetch('/api/accounts', { headers: tk })).json();
  const first = (acc.data || [])[0];
  const cats = await (await fetch('/api/categories?accountId=' + first.id, { headers: tk })).json();
  const list = cats.data || [];
  return {
    account: first.name,
    total: list.length,
    imgCount: list.filter((c) => String(c.icon).startsWith('img:')).length,
    sample: list.filter((c) => String(c.icon).startsWith('img:')).slice(0, 3).map((c) => c.name + '=' + c.icon),
  };
});
check(
  '当前账本的 img: 图标分类数与预置一致（迁移已生效）',
  apiData.imgCount === PRESET_IMG_COUNT,
  `${apiData.account}: ${apiData.imgCount}/${PRESET_IMG_COUNT}（共 ${apiData.total} 个分类）`,
);
console.log('     样例:', apiData.sample.join(' '));

/* ============================================================
 * ④ 图标选择器：默认「图片」Tab + 全部图标 + 图片可加载
 * ============================================================ */
console.log('[4] 图标选择器（图片 Tab）');
await page.goto('http://127.0.0.1:5173/#/pages/icon-picker/index?current=' + encodeURIComponent('img:午餐'), {
  waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(2000);
const picker = await page.evaluate(() => {
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const active = tabs.find((t) => t.className.indexOf('active') >= 0);
  const cells = Array.from(document.querySelectorAll('.cell'));
  return {
    tabTexts: tabs.map((t) => t.textContent.trim()),
    activeText: active ? active.textContent.trim() : '(无)',
    cellCount: cells.length,
    cellsWithImage: cells.filter((c) => c.querySelector('.image-icon')).length,
  };
});
check('Tab 列表含「图片」', picker.tabTexts.indexOf('图片') >= 0, picker.tabTexts.join('/'));
check('默认选中「图片」Tab（按 current=img:午餐 自动定位）', picker.activeText === '图片', '当前=' + picker.activeText);
check(`图片集共 ${ICON_TOTAL} 个格子`, picker.cellCount === ICON_TOTAL, String(picker.cellCount));
check(
  '格子里用的是图片渲染器',
  picker.cellsWithImage === ICON_TOTAL,
  String(picker.cellsWithImage),
);
await page.waitForTimeout(1200);
const pickerImgs = await page.evaluate(() => {
  const cells = Array.from(document.querySelectorAll('.cell'));
  const visible = cells.slice(0, 12);
  const loaded = visible.filter((c) => c.querySelector('img[src*="/static/cat-icons/"]'));
  return { visible: visible.length, loaded: loaded.length };
});
check('可视区图片均已加载', pickerImgs.loaded === pickerImgs.visible, `${pickerImgs.loaded}/${pickerImgs.visible}`);
await page.screenshot({ path: '/tmp/verify-cat-icons-picker.png' });

/* ============================================================
 * ⑤ 端到端：新建分类页 → 选择器 → 回填（不保存）
 * ============================================================ */
console.log('[5] 端到端：从新建分类页选图标回填（不保存）');
await page.goto('http://127.0.0.1:5173/#/pages/category-new/index?type=expense', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1800);
const opened = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('.field-row'));
  const row = rows.find((r) => r.textContent.indexOf('分类图标') >= 0);
  if (!row) return false;
  row.click();
  return true;
});
check('点「分类图标」行进选择器', opened);
await page.waitForTimeout(1800);
const picked = await page.evaluate(() => {
  const cells = Array.from(document.querySelectorAll('.cell'));
  const target = cells.find((c) => {
    const img = c.querySelector('.image-icon div');
    return img && /huoguo/.test(getComputedStyle(img).backgroundImage || '');
  });
  if (!target) return false;
  target.click();
  return true;
});
check('在「图片」里选中「火锅」图标', picked);
await page.waitForTimeout(1500);
const backFilled = await page.evaluate(() => {
  const slot = document.querySelector('.icon-slot .image-icon div');
  return slot ? getComputedStyle(slot).backgroundImage : '';
});
check('新建分类页图标位回填为所选图片', /huoguo/.test(backFilled), backFilled.slice(0, 80));

/* 离开页面（不保存） */
await page.evaluate(() => history.back());
await page.waitForTimeout(1200);

/* ============================================================
 * 守卫：全程所有 cat-icons 请求都必须是 200 + image/webp，
 *       且文件名必须 ASCII（uni-app H5 dev server 不解码 URL）
 * ============================================================ */
console.log('[6] 静态请求守卫（200 + image/webp；文件名必须 ASCII）');

/** H5 端期望类型。小程序 / App 仍是 image/png —— 但本脚本只跑 H5，这里就是 webp。 */
const EXPECTED_TYPE = 'image/webp';

/** 取请求里的文件名（`/static/cat-icons/<拼音>.webp?v=xxxx` → `<拼音>.webp`） */
function iconFileName(url) {
  const m = String(url).match(/\/static\/cat-icons\/([^/?#]+)/);
  return m ? m[1] : '';
}

/**
 * 文件名是否是纯 ASCII。
 *
 * ⚠️ 这条守卫的由来（**不能删**）：文件名一度用中文，而 uni-app H5 dev server 的
 *    静态中间件**不解码 URL** —— 中文名会 404 / 回退成 index.html
 *    （HTTP 200，但 Content-Type 是 text/html，图片整片空白，很难查）。
 *    所以文件名用拼音；这里显式断言"取到的文件名解码后是 ASCII"。
 *    浏览器会把中文名百分号编码（`%E5%8D%88%E9%A4%90.webp`），
 *    `decodeURIComponent` 回来就能看出它不是 ASCII —— 光看原始 URL 会漏判。
 */
function isAsciiFileName(url) {
  const raw = iconFileName(url);
  if (!raw) return false;
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return false; // 编码畸形：同样不是合法的 ASCII 文件名
  }
  return /^[\x21-\x7e]+$/.test(decoded);
}

const bad = iconResponses.filter((r) => r.status !== 200 || !r.type.includes(EXPECTED_TYPE));
check(
  `全部 ${iconResponses.length} 个 cat-icons 请求均为 200 + ${EXPECTED_TYPE}`,
  iconResponses.length > 0 && bad.length === 0,
  bad.length ? '异常样例: ' + JSON.stringify(bad.slice(0, 2)) : ''
);

const badName = iconResponses.filter((r) => !isAsciiFileName(r.url));
check(
  'cat-icons 文件名全为 ASCII（中文名在 H5 dev server 会 404 / 变成 text/html）',
  iconResponses.length > 0 && badName.length === 0,
  badName.length
    ? '异常样例: ' + badName.slice(0, 2).map((r) => `${r.status}/${r.type} ${iconFileName(r.url)}`).join(' | ')
    : ''
);

// 排错用：万一上面判红，先看这里 —— 类型不统一往往一眼就能看出是"PNG 没切到 webp"
console.log('     实测类型分布:', [...new Set(iconResponses.map((r) => r.type))].sort().join(' | ') || '(无请求)');

console.log(
  '\n结果：PASS=' + pass + ' FAIL=' + fail + '（截图：/tmp/verify-cat-icons-category.png、/tmp/verify-cat-icons-picker.png）'
);
await browser.close();
process.exit(fail ? 1 : 0);
