/**
 * 「分类图片图标」运行时验证（真实浏览器，走完整 UI 链路）。
 *
 *   node scripts/verify-cat-icons.mjs
 *
 * 背景（2026-09-19）：分类图片图标（`img:<分类名>`）接入 ——
 *   预置分类默认图标替换 + 存量数据迁移（见 src/migration/*-CategoryImageIcons.ts）。
 *   同日补做收入侧 19 张（原先只有支出 75 张），总数 75 → 94。
 *
 * 覆盖：
 *   ① 静态资源：抽样请求 `/static/cat-icons/*.png` —— 必须 200 **且 Content-Type 是 image/png**
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

/** 记录所有 cat-icons 静态请求的 URL 与响应类型（用于守卫"文件名必须 ASCII"） */
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
 * ① 静态资源：200 + image/png（回归守卫）
 * ============================================================ */
console.log('[1] 静态资源可用性（含"必须是 image/png"守卫）');
const staticProbe = await page.evaluate(async () => {
  const files = ['wucan.png', 'hongbao.png', 'lvyoudujia.png'];
  const out = [];
  for (const f of files) {
    const res = await fetch('/static/cat-icons/' + f);
    out.push({ f, status: res.status, type: res.headers.get('content-type') || '', size: (await res.blob()).size });
  }
  return out;
});
check(
  '抽样 3 个图标均 200 + image/png',
  staticProbe.every((r) => r.status === 200 && r.type.includes('image/png')),
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
  return { total: imgs.length, withBg: withBg.length, loaded: loaded.length };
});
check('页面出现图片图标容器', catPage.total > 0, `uni-image ${catPage.total} 个`);
check('背景图指向 /static/cat-icons/', catPage.withBg > 0, `${catPage.withBg} 个`);
check('图片真实加载完成（uni-image 内部已 append <img>）', catPage.loaded > 0, `${catPage.loaded} 个`);
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
 * 守卫：全程所有 cat-icons 请求都必须是 image/png
 * ============================================================ */
console.log('[6] 静态请求守卫（文件名必须 ASCII 且可服务）');
const bad = iconResponses.filter((r) => r.status !== 200 || !r.type.includes('image/png'));
check(
  `全部 ${iconResponses.length} 个 cat-icons 请求均为 200 + image/png`,
  iconResponses.length > 0 && bad.length === 0,
  bad.length ? '异常样例: ' + JSON.stringify(bad.slice(0, 2)) : ''
);

console.log(
  '\n结果：PASS=' + pass + ' FAIL=' + fail + '（截图：/tmp/verify-cat-icons-category.png、/tmp/verify-cat-icons-picker.png）'
);
await browser.close();
process.exit(fail ? 1 : 0);
