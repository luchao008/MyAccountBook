/**
 * 端到端验证：新建二级分类 → 选图标 → 保存。
 *
 *   node scripts/verify-icon-picker.mjs
 *
 * 覆盖的链路：
 *   分类管理页 →（新建二级分类）→ 新建页 →（点分类图标）→ 图标选择页
 *   →（切 Tab、选图标）→ 自动返回新建页（图标已回传）→ 保存 → 分类管理页出现新分类
 *
 * ⚠️ 本脚本会**真的创建一个分类**，最后用接口把它删掉（不留测试数据）。
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
const API = process.env.API || 'http://127.0.0.1:7001';
const USER = process.env.SEED_USER || 'demo';
const PASS = process.env.SEED_PASS || '123456';
const SHOT = process.env.SHOT_DIR || '/tmp';

/** 每次跑用一个唯一名字，避免与历史数据撞唯一键 */
const NEW_NAME = `图标测试${Date.now() % 100000}`;

const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ['--no-proxy-server'],
});
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('[console] ' + m.text());
});

const shot = (name) => page.screenshot({ path: `${SHOT}/${name}.png` });

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
if (await page.locator('.submit').count()) {
  await page.locator('.uni-input-input').nth(0).fill(USER);
  await page.locator('.uni-input-input').nth(1).fill(PASS);
  await page.locator('.submit').first().click();
  await page.waitForTimeout(2500);
}

// token 供最后的清理用（uni-app H5 的 storage 落在 localStorage）
const token = await page.evaluate(() => {
  const keys = Object.keys(localStorage);
  const hit = keys.find((k) => k === 'token' || k.endsWith('token'));
  return hit ? localStorage.getItem(hit) : '';
});

const step = (s) => console.log(`\n── ${s}`);

/* ① 分类管理页 → 新建二级分类 */
step('打开分类管理页');
await page.goto(BASE + '#/pages/category/index', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2200);
await shot('01-category-list');

// 展开第一个分组，才会出现「新建二级分类」入口
await page.locator('.group-header').first().click();
await page.waitForTimeout(700);
const addChild = page.locator('.add-child').first();
console.log('找到「新建二级分类」入口:', (await addChild.count()) > 0);
await addChild.click();
await page.waitForTimeout(1500);

/* ② 新建页 */
step('新建二级分类页');
const title = await page.evaluate(() => document.title || '(未取到)');
console.log('导航栏标题:', title);
console.log('有名称输入框:', (await page.locator('.input').count()) > 0);
console.log('有保存按钮  :', (await page.locator('.submit').count()) > 0);
// uni-app H5 把 <input> 渲染成 <uni-input> 外壳 + 内部真 input，必须穿透一层
await page.locator('.input input, .input .uni-input-input').first().fill(NEW_NAME);
await page.waitForTimeout(200);
await shot('02-category-new');

/* ③ 图标选择页 */
step('进入图标选择页');
await page.locator('.field-row').first().click();
await page.waitForTimeout(1600);
await shot('03-picker-colorful');

const countColorful = await page.locator('.cell').count();
const tabLabels = await page.locator('.tabs .tab').allTextContents();
console.log('多彩 Tab 图标数:', countColorful);
console.log('底部 Tab:', tabLabels.map((t) => t.trim()).join(' / '));

// 切到「生活」
await page.locator('.tabs .tab').nth(1).click();
await page.waitForTimeout(800);
await shot('04-picker-life');
const countLife = await page.locator('.cell').count();
console.log('生活 Tab 图标数:', countLife);

// 切到「标准」
await page.locator('.tabs .tab').nth(2).click();
await page.waitForTimeout(800);
await shot('05-picker-standard');
const countStd = await page.locator('.cell').count();
console.log('标准 Tab 图标数:', countStd);

// 回到「多彩」并选第一个图标
await page.locator('.tabs .tab').nth(0).click();
await page.waitForTimeout(600);
const pickedKey = await page.locator('.cell').first().getAttribute('class');
console.log('第一个格子的 class:', pickedKey);
await page.locator('.cell').first().click();
await page.waitForTimeout(1600);

/* ④ 回到新建页：图标应已回传 */
step('返回新建页，检查图标是否回传');
const back = await page.evaluate(() => ({
  hash: location.hash,
  hasColorIcon: !!document.querySelector('.icon-slot svg.color-icon'),
  iconSlotChildren: document.querySelector('.icon-slot svg')?.children.length ?? 0,
  viewBox: document.querySelector('.icon-slot svg')?.getAttribute('viewBox') || '',
}));
console.log(JSON.stringify(back, null, 1));
await shot('06-category-new-with-icon');

/* ④b 再次进入图标页：当前选中的图标应被高亮（验证 query 回填） */
step('再次进入图标页，检查高亮回填');
await page.locator('.field-row').first().click();
await page.waitForTimeout(1500);
const refill = await page.evaluate(() => ({
  activeTab: document.querySelector('.tabs .tab.active')?.textContent?.trim() || '(无)',
  pickedCount: document.querySelectorAll('.cell.picked').length,
}));
console.log(JSON.stringify(refill, null, 1));
await shot('06b-picker-refill');
// 换一个图标，确认能改
await page.locator('.cell').nth(3).click();
await page.waitForTimeout(1500);

/* ⑤ 保存 */
step('保存');
await page.locator('.submit').first().click();
await page.waitForTimeout(2200);
await shot('07-after-save');
const afterSave = await page.evaluate(() => ({ hash: location.hash }));
console.log('保存后所在页:', afterSave.hash);

/* ⑥ 列表里应出现新分类 */
const appeared = await page.evaluate((n) => document.body.innerText.includes(n), NEW_NAME);
console.log('列表中出现新分类:', appeared);
await shot('08-category-list-after');

/* ⑦ 清理：删掉刚创建的分类 */
step('清理测试数据');
let cleaned = '(未清理，请手动删除)';
if (token) {
  const res = await fetch(`${API}/api/categories?type=expense`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  const target = (json.data || []).find((c) => c.name === NEW_NAME);
  console.log('后端实际保存的 icon =', target?.icon ?? '(未找到该分类)');
  if (target) {
    const del = await fetch(`${API}/api/categories/${target.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    cleaned = del.ok ? `已删除 id=${target.id}` : `删除失败 HTTP ${del.status}`;
  } else {
    cleaned = '没找到刚创建的分类（可能保存未成功）';
  }
}
console.log(cleaned);

console.log('\n===== 汇总 =====');
const checks = [
  ['导航栏标题为「新建二级支出分类」', title.includes('新建二级支出分类')],
  ['多彩 Tab 有图标', countColorful > 0],
  ['底部有 3 个图标集 Tab', tabLabels.length === 3],
  ['生活 Tab 有图标', countLife > 0],
  ['标准 Tab 有图标', countStd > 0],
  ['选完图标后回到新建页', back.hash.includes('category-new')],
  ['图标已回传（渲染出彩色图标）', back.hasColorIcon && back.iconSlotChildren > 0],
  ['再次进入时高亮回填当前图标', refill.pickedCount === 1],
  ['保存后回到分类管理页', afterSave.hash.includes('category/index')],
  ['列表里出现新分类', appeared],
];
for (const [n, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${n}`);

console.log('\n截图目录:', SHOT);
console.log('控制台错误:', errors.length ? errors.slice(0, 5).join('\n') : '(无)');

await browser.close();
