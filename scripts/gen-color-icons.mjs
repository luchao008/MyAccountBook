/**
 * 生成彩色图标数据（`frontend/src/constants/color-icons.ts`）。
 *
 *   node scripts/gen-color-icons.mjs
 *
 * 数据来源是三个可离线安装的图标集包（devDependency，不进产物）：
 *   @iconify-json/flat-color-icons   329 个扁平彩色图标（48 网格）
 *   @iconify-json/logos              品牌 logo（256 网格）
 *   @iconify-json/noto               emoji 风格彩色图标（128 网格）
 *
 * 为什么要"生成"而不是运行时依赖图标库：
 *   1. 项目已有「图标数据内置 + 自绘组件」的模式（`constants/icons.ts` + `SvgIcon.vue`），
 *      运行时再引一个图标库等于引入第二套体系，且会给 H5 增加一个网络/体积依赖。
 *   2. 只有**被选中的图标**会进产物，体积可控（全量 noto 是 3800 个，我们只要百来个）。
 *   3. 生成脚本留在项目里 ⇒ 这份数据是**可复现**的，不是一次性粘贴的。
 *
 * ⚠️ 生成时必须给每个 SVG 的 `id` 加唯一前缀（详见 rewriteIds 的注释）——
 *    否则多个图标同时渲染时渐变/裁剪会互相串（同页 id 必须唯一）。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const NM = path.join(ROOT, 'frontend/node_modules/@iconify-json');
const OUT = path.join(ROOT, 'frontend/src/constants/color-icons.ts');
/** 元数据另出一个文件 —— 理由见 buildMetaTs 的注释（首屏体积） */
const META_OUT = path.join(ROOT, 'frontend/src/constants/color-icon-meta.ts');

function loadSet(pkg) {
  const file = path.join(NM, pkg, 'icons.json');
  if (!fs.existsSync(file)) {
    throw new Error(`缺少图标集 ${pkg}，请先在 frontend/ 下 npm i -D @iconify-json/${pkg}`);
  }
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { width: j.width, height: j.height, icons: j.icons || {}, aliases: j.aliases || {} };
}

/**
 * 给 SVG body 里的 id 加唯一前缀。
 *
 * noto 的图标大量使用 `<linearGradient id="svgIDa">` + `fill="url(#svgIDa)"`。
 * 这些 id 在各自文件里是唯一的，但**放到同一个页面里就撞了** ——
 * 浏览器解析 `url(#svgIDa)` 时取的是文档中第一个同 id 元素，
 * 于是第 2 个及之后的图标会拿到第 1 个图标的渐变，颜色整体错乱。
 * 这不是理论风险：图标选择器一屏就要渲染几十个。
 */
function rewriteIds(body, prefix) {
  const ids = [...body.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  let out = body;
  for (const id of ids) {
    const safe = `${prefix}-${id}`;
    out = out.split(`id="${id}"`).join(`id="${safe}"`);
    out = out.split(`url(#${id})`).join(`url(#${safe})`);
    out = out.split(`href="#${id}"`).join(`href="#${safe}"`);
  }
  return out;
}

/** 折叠空白，减小生成物体积 */
const tidy = (s) => s.replace(/\s{2,}/g, ' ').replace(/>\s+</g, '><').trim();

/* ── 多彩：flat-color-icons 全量 ───────────────────────────────── */
const fci = loadSet('flat-color-icons');

/* ── 生活：noto 精选（白名单，逐个别名可核） ──────────────────── */
const noto = loadSet('noto');
const NOTO_PICK = [
  // 餐饮
  'cooked-rice', 'curry-rice', 'rice-ball', 'dumpling', 'bread', 'baguette-bread', 'hamburger',
  'pizza', 'sushi', 'bento-box', 'egg', 'green-apple', 'banana', 'birthday-cake', 'ice-cream',
  'soft-ice-cream', 'shaved-ice', 'candy', 'lollipop', 'chocolate-bar', 'bubble-tea', 'beer-mug',
  'glass-of-milk', 'hot-beverage', 'teacup-without-handle', 'fish', 'cut-of-meat', 'carrot',
  'broccoli', 'avocado', 'tomato', 'ear-of-corn', 'honey-pot', 'fortune-cookie', 'canned-food',
  // 出行
  'automobile', 'taxi', 'police-car', 'delivery-truck', 'oncoming-automobile', 'bus',
  'bullet-train', 'high-speed-train', 'tram', 'metro', 'railway-car', 'bicycle', 'kick-scooter',
  'motor-scooter', 'airplane', 'ship', 'fuel-pump', 'ambulance', 'fire-engine', 'bus-stop',
  // 居家
  'house', 'house-with-garden', 'bed', 'chair', 'couch-and-lamp', 'door', 'window', 'light-bulb',
  'broom', 'soap', 'shower', 'toilet', 'electric-plug', 'key', 'mirror',
  // 购物 / 服饰
  'shopping-bags', 'clutch-bag', 'handbag', 'dress', 'mans-shoe', 'high-heeled-shoe', 'glasses',
  'ring', 'lipstick', 'watch', 'coat', 't-shirt', 'jeans', 'thong-sandal',
  // 医疗
  'pill', 'syringe', 'hospital', 'stethoscope', 'thermometer', 'adhesive-bandage',
  // 金融 / 办公
  'money-bag', 'coin', 'bank', 'credit-card', 'dollar-banknote', 'yen-banknote', 'receipt',
  'chart-increasing', 'gem-stone', 'briefcase', 'graduation-cap', 'open-book', 'closed-book',
  'blue-book', 'books', 'paperclip', 'memo',
  // 娱乐 / 电子
  'gift', 'party-popper', 'admission-tickets', 'camera', 'headphone', 'musical-notes', 'guitar',
  'game-die', 'crystal-ball', 'television', 'mobile-phone', 'video-game', 'movie-camera',
  'balloon', 'sparkles',
  // 自然 / 宠物
  'cat', 'dog', 'deciduous-tree', 'evergreen-tree', 'sun', 'crescent-moon', 'star', 'cloud',
  'fire', 'fallen-leaf', 'snowflake', 'four-leaf-clover', 'rose', 'tulip', 'cactus',
  // 人 / 家庭
  'baby', 'child', 'student', 'person-in-bed', 'family',
];

const notoHits = [];
const notoMiss = [];
for (const name of NOTO_PICK) {
  const icon = noto.icons[name] || noto.aliases[name];
  const parent = icon?.parent ? noto.icons[icon.parent] : icon;
  if (parent?.body) notoHits.push([name, parent.body]);
  else notoMiss.push(name);
}

/* ── 组装 ──────────────────────────────────────────────────────── */
const sets = [
  {
    key: 'colorful',
    label: '多彩',
    size: fci.width,
    icons: Object.entries(fci.icons).map(([name, v]) => [name, v.body]),
  },
  {
    key: 'life',
    label: '生活',
    size: noto.width,
    icons: notoHits,
  },
];

function buildTs() {
  const lines = [];
  lines.push('/**');
  lines.push(' * 彩色图标数据 · 由 `scripts/gen-color-icons.mjs` 生成，**请勿手改**。');
  lines.push(' *');
  lines.push(' * 重新生成：`node scripts/gen-color-icons.mjs`');
  lines.push(' *');
  lines.push(' * 与 `icons.ts`（单色界面/分类图标）的分工：');
  lines.push(' *   本文件是**分类图标选择器里可选的多色图标**，供用户挑一个当分类图标；');
  lines.push(' *   `icons.ts` 仍是界面图标（箭头、按钮等）与单色分类图标的真源。');
  lines.push(' *');
  lines.push(' * ⚠️ 所有 `id` 已加集合前缀 —— noto 的 `<linearGradient id="svgIDa">` 不改名的话，');
  lines.push(' *    同页渲染多个图标会互相取到对方的渐变（`url(#id)` 取文档中第一个同 id 元素）。');
  lines.push(' */');
  lines.push('');
  lines.push('export interface ColorIconSet {');
  lines.push('  /** 集合标识，也是图标 key 的前缀 */');
  lines.push('  key: string;');
  lines.push('  /** Tab 上显示的名字 */');
  lines.push('  label: string;');
  lines.push('  /** 该集合的 viewBox 边长（各集合不同，渲染时必须用它） */');
  lines.push('  size: number;');
  lines.push('  /** 图标 key（`<集合>:<名字>`）→ SVG body */');
  lines.push('  icons: Record<string, string>;');
  lines.push('}');
  lines.push('');
  lines.push('export const COLOR_ICON_SETS: ColorIconSet[] = [');
  for (const s of sets) {
    lines.push('  {');
    lines.push(`    key: ${JSON.stringify(s.key)},`);
    lines.push(`    label: ${JSON.stringify(s.label)},`);
    lines.push(`    size: ${s.size},`);
    lines.push('    icons: {');
    for (const [name, body] of s.icons) {
      lines.push(`      ${JSON.stringify(`${s.key}:${name}`)}: ${JSON.stringify(tidy(rewriteIds(body, s.key)))} ,`);
    }
    lines.push('    },');
    lines.push('  },');
  }
  lines.push('];');
  lines.push('');
  return lines.join('\n');
}

fs.writeFileSync(OUT, buildTs(), 'utf8');

/**
 * 彩色图标的**元数据**（集合 key / Tab 名 / 网格边长 / 数量）。
 *
 * ⚠️ 为什么必须和 color-icons.ts 分成两个文件（2026-09-16 阶段 5）：
 *   `color-icons.ts` 是 600 KB+ 的图标正文（gzip 约 212 KB），只在**真的要画一个
 *   彩色图标**时才需要。但下面两件事必须在**同步**路径上答得出来，否则组件得挂起：
 *     · `isColorIconKey()` —— 判定「这个 key 该用彩色渲染器还是单色渲染器」
 *       （它被 `CategoryIcon.vue` 用在渲染分支上，异步会让首帧判不出来）
 *     · 图标选择器的 Tab 名与数量
 *   拆出这份 ~0.3 KB 的元数据后，正文就能走动态 import 分包 → **首屏不再下载那 212 KB**。
 */
function buildMetaTs() {
  const lines = [];
  lines.push('/**');
  lines.push(' * 彩色图标**元数据** · 由 `scripts/gen-color-icons.mjs` 生成，**请勿手改**。');
  lines.push(' *');
  lines.push(' * 重新生成：`node scripts/gen-color-icons.mjs`');
  lines.push(' *');
  lines.push(' * ⚠️ 与 `color-icons.ts` 分成两个文件是刻意的，不要合并：');
  lines.push(' *   那个文件是 600 KB+ 的图标正文，只在真的画图标时才需要（动态 import 分包）；');
  lines.push(' *   这个文件要**同步可用** —— `isColorIconKey()` 在渲染分支上被调用，');
  lines.push(' *   异步会让首帧判不出该用彩色还是单色渲染器。');
  lines.push(' */');
  lines.push('export interface ColorIconSetMeta {');
  lines.push('  /** 集合标识，也是图标 key 的前缀 */');
  lines.push('  key: string;');
  lines.push('  /** Tab 上显示的名字 */');
  lines.push('  label: string;');
  lines.push('  /** 该集合的 viewBox 边长（各集合不同，渲染时必须用它） */');
  lines.push('  size: number;');
  lines.push('  /** 该集合的图标数量（Tab 上显示，也用于自检） */');
  lines.push('  count: number;');
  lines.push('}');
  lines.push('');
  lines.push('export const COLOR_ICON_SET_META: ColorIconSetMeta[] = [');
  for (const s of sets) {
    lines.push(
      `  { key: ${JSON.stringify(s.key)}, label: ${JSON.stringify(s.label)}, size: ${s.size}, count: ${s.icons.length} },`,
    );
  }
  lines.push('];');
  lines.push('');
  lines.push('/** 全部彩色图标数量（Tab 名旁边与自检用） */');
  lines.push(`export const COLOR_ICON_TOTAL = ${sets.reduce((n, s) => n + s.icons.length, 0)};`);
  lines.push('');
  return lines.join('\n');
}

fs.writeFileSync(META_OUT, buildMetaTs(), 'utf8');

const total = sets.reduce((n, s) => n + s.icons.length, 0);
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
const metaKb = (fs.statSync(META_OUT).size / 1024).toFixed(2);
console.log(`已生成 ${path.relative(ROOT, OUT)}`);
console.log(`  多彩(flat-color-icons) ${sets[0].icons.length} 个 / ${sets[0].size} 网格`);
console.log(`  生活(noto)              ${sets[1].icons.length} 个 / ${sets[1].size} 网格`);
console.log(`  合计 ${total} 个图标，文件 ${kb} KB`);
console.log(`已生成 ${path.relative(ROOT, META_OUT)}（元数据，${metaKb} KB —— 首屏只加载它）`);
if (notoMiss.length) {
  console.log(`\n⚠️ noto 清单里未找到（${notoMiss.length} 个，已跳过）：`);
  console.log('  ' + notoMiss.join(' '));
}
