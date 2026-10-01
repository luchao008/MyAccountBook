/**
 * 「标准」Tab 新图标的**视觉对照表**（截图取证，不是"看一眼"）。
 *
 *   node --experimental-strip-types scripts/preview-category-icons.mjs
 *
 * 产出：`docs/screenshots/cat-icon-style-compare.png`
 *   · 上半：15 组**一一对照**（左 = 新的「标准」图标，右 = 语义最接近的「图片」图标）
 *   · 下半：两组各自排成一排，看"整排放在一起像不像一套"
 *   两组都按**同一尺寸（56px）同一底色**渲染 —— 尺寸本身就是待验收项之一。
 *
 * 为什么要落成脚本而不是手动开个页面看一眼：
 *   项目铁律「文档里的数字必须实测后再写，且必须有一个可执行脚本能复现它」。
 *   "两个 Tab 风格统一"是结论，就得有能复现它的图。
 *
 * ⚠️ 用 `--experimental-strip-types` 直接 import 应用里的 `.ts` 常量，
 *    而不是在这里另抄一份图标数据 —— 抄一份就会漂移，对照表也就失去意义。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

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
    /* 交给 Playwright 自己找 */
  }
  return undefined;
}

const { CATEGORY_ICONS_ART } = await import(`${ROOT}/frontend/src/constants/category-icons.ts`);
const { CAT_ICON_FILES } = await import(`${ROOT}/frontend/src/constants/cat-icons.ts`);

/** 「标准」key ↔ 语义最接近的「图片」图标中文名（做一一对照用） */
const PAIRS = [
  ['cat-housing', '房租'],
  ['cat-transport', '公共交通'],
  ['cat-telecom', '手机'],
  ['cat-leisure', '电影娱乐'],
  ['cat-finance', '投资收入'],
  ['cat-misc', '其他'],
  ['cat-device', '电脑'],
  ['cat-farm', '花草类'],
  ['cat-medical', '药品费'],
  ['cat-social', '红包'],
  ['cat-apparel', '衣服裤子'],
  ['cat-food', '午餐'],
  ['cat-study', '书报杂志'],
  ['cat-salary', '工资收入'],
  ['cat-income', '礼金收入'],
];

const ICON_PX = Number(process.env.ICON_PX || 56);
const BG = '#F8F8F8';

/** 图片图标读成 data URI，避免 file:// 下的路径问题 */
function imgDataUri(cnName) {
  const base = CAT_ICON_FILES[cnName];
  if (!base) return null;
  for (const ext of ['webp', 'png']) {
    const p = path.join(ROOT, 'frontend/src/static/cat-icons', `${base}.${ext}`);
    if (fs.existsSync(p)) {
      const mime = ext === 'webp' ? 'image/webp' : 'image/png';
      return `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
    }
  }
  return null;
}

const cell = (inner, label) =>
  `<div class="cell"><div class="art">${inner}</div><div class="lab">${label}</div></div>`;

const svgOf = (key) => {
  const a = CATEGORY_ICONS_ART[key];
  if (!a) throw new Error(`缺少图标 ${key}`);
  return `<svg width="${ICON_PX}" height="${ICON_PX}" viewBox="0 0 ${a.box} ${a.box}">${a.body}</svg>`;
};

const pairRows = PAIRS.map(([key, cn]) => {
  const ref = imgDataUri(cn);
  const refHtml = ref
    ? `<img src="${ref}" width="${ICON_PX}" height="${ICON_PX}" alt="">`
    : `<span class="miss">缺图</span>`;
  return `<tr>
    <td class="name">${cn}<code>${key}</code></td>
    <td class="art">${svgOf(key)}</td>
    <td class="art">${refHtml}</td>
  </tr>`;
}).join('');

const stripNew = PAIRS.map(([key, cn]) => cell(svgOf(key), key.replace('cat-', ''))).join('');
const stripRef = PAIRS.map(([key, cn]) =>
  cell(
    imgDataUri(cn)
      ? `<img src="${imgDataUri(cn)}" width="${ICON_PX}" height="${ICON_PX}" alt="">`
      : '缺图',
    cn,
  ),
).join('');

const html = `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box} body{margin:0;padding:28px 32px;background:${BG};
    font:13px/1.5 -apple-system,"PingFang SC",Helvetica,Arial,sans-serif;color:#222226}
  h2{font-size:15px;margin:0 0 6px;font-weight:600}
  p.note{margin:0 0 18px;color:#6b6b73;font-size:12px}
  table{border-collapse:collapse;margin-bottom:34px}
  td{vertical-align:middle;padding:2px 10px}
  td.name{width:${ICON_PX > 60 ? 190 : 150}px;font-size:${ICON_PX > 60 ? 14 : 12}px;color:#44444a;padding-right:22px;white-space:nowrap}
  td.name code{display:block;color:#9a9aa2;font-size:${ICON_PX > 60 ? 12 : 11}px}
  td.art{width:${ICON_PX + 28}px;text-align:center}
  .strip{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:34px}
  .cell{width:${ICON_PX + 26}px;text-align:center}
  .cell .art{height:${ICON_PX + 10}px;display:flex;align-items:center;justify-content:center}
  .cell .lab{font-size:10px;color:#8a8a92;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  img,svg{display:block}
  .head{font-size:12px;color:#6b6b73;margin:0 0 10px;font-weight:600}
  tr.hdr td{font-size:11px;color:#8a8a92;padding-bottom:8px}
</style>
<h2>「标准」Tab 新图标 vs「图片」Tab 图标 · 同尺寸（${ICON_PX}px）同底色（${BG}）对照</h2>
<p class="note">左列 = 重绘后的「标准」矢量图标；右列 = 该分类语义最接近的「图片」位图图标。两者应在圆角、体量感、光泽、饱和度上属同一套。</p>
<table>
  <tr class="hdr"><td></td><td class="art">新 · 标准</td><td class="art">图片（参考）</td></tr>
  ${pairRows}
</table>
<div class="head">新「标准」15 个排成一排</div>
<div class="strip">${stripNew}</div>
<div class="head">「图片」15 个排成一排（对照用）</div>
<div class="strip">${stripRef}</div>`;

const outDir = path.join(ROOT, 'docs', 'screenshots');
fs.mkdirSync(outDir, { recursive: true });
const suffix = ICON_PX === 56 ? '' : `-${ICON_PX}px`;
const htmlPath = path.join(outDir, `cat-icon-style-compare${suffix}.html`);
fs.writeFileSync(htmlPath, html, 'utf-8');

const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ['--no-proxy-server'],
});
const ctx = await browser.newContext({
  viewport: { width: Math.max(900, ICON_PX * 6), height: 1200 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.goto('file://' + htmlPath, { waitUntil: 'load' });
await page.waitForTimeout(600);
const png = path.join(outDir, `cat-icon-style-compare${suffix}.png`);
await page.screenshot({ path: png, fullPage: true });
await browser.close();

console.log('对照表:', png);
console.log('HTML  :', htmlPath);
console.log('图标数:', Object.keys(CATEGORY_ICONS_ART).length);
