/**
 * 生成「分类图片图标」的静态资源与数据文件。
 *
 *   node scripts/gen-cat-icons.mjs
 *
 * 产物：
 *   frontend/src/static/cat-icons/<拼音>.png   94 张 256×256 透明 PNG（按需 HTTP 加载，不进 bundle）
 *   frontend/src/constants/cat-icons.ts        名字清单 + 名字→文件名映射
 *
 * 源文件：`assets/cat-icons-original/*.svg`（94 个，文件名 = 分类名）
 *
 * ⚠️ 源图有**两批、形态不同**（脚本按四角 alpha 自动判别，无需改代码）：
 *    · 支出 75 个：2048²、**不透明白底** → 泛洪清理成透明；
 *    · 收入 19 个：1024²、**本来就是透明背景**（四角 alpha=0）→ 清理数天然为 0，
 *      此时不报错（旧版"清不到就报错"的断言会把它们全拒掉）。
 *
 * ⚠️ 源文件**不是矢量图**：每个 SVG 是「2048×2048 位图 base64 内嵌」的包装
 *    （单个 ~400KB，合计 39MB），且外层标注的 `data:image/png` 是错的、真实数据是 JPEG
 *    （浏览器按内容嗅探能解码，但体积对移动端不可接受）。所以必须重采样后再进产物，
 *    不能把源文件直接拷进 `static/`。
 *
 * ⚠️ 产物文件名用**拼音**（午餐 → wucan.png），不是中文名 —— 这不是命名偏好：
 *    uni-app H5 dev server 的静态中间件对 URL **不做 `decodeURIComponent`**
 *    （见 uni-h5-vite/dist/plugin/configureServer/middlewares/static.js：
 *      它拿 `url.parse(req.url).pathname` 直接找文件），于是中文名文件在 dev 下必然 404、
 *    回退成 index.html → 图片解码失败 → 图标整片空白（本次实测）。生产 nginx 会解码、
 *    中文名其实能跑，但"开发/验证环境不可用"不可接受，故文件系统层面统一 ASCII。
 *    中文名仍是 **key**（`img:午餐`）与映射表的主键，拼音只存在于文件名。
 *
 * 处理三步：
 *   1. 解析 SVG 内嵌 base64 → 解出位图（格式无关，jimp 自己判）
 *   2. 缩到 256×256（分类图标最大显示 48px，3 倍屏 = 144px；256 留一倍余量）
 *   3. 从**四边泛洪填充**去掉近白背景 → 透明
 *      ⚠️ 不能"把所有白像素变透明"：图标内部的白色高光会被打洞。
 *         泛洪只清理"与画布边框连通"的白，内部白保留。
 *
 * 依赖：jimp、pinyin-pro（都已声明在 frontend/package.json 的 devDependencies）。
 *      缺失时：`cd frontend && npm i -D jimp@0.10.3 pinyin-pro`
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC_DIR = path.join(ROOT, 'assets/cat-icons-original');
const OUT_DIR = path.join(ROOT, 'frontend/src/static/cat-icons');
const META_OUT = path.join(ROOT, 'frontend/src/constants/cat-icons.ts');

/** 输出边长（px）。见文件头"处理三步"第 2 条的推导 */
const SIZE = 256;
/**
 * 近白判定阈值（RGB 三通道都 > 该值才算背景）。
 *
 * 取 242 而不是 255：源图有压缩噪声与边缘羽化，阈值太严会留下一圈白边，
 * 太松（如 230）会开始啃图标本身的浅色高光。
 */
const WHITE = 242;

const require = createRequire(path.join(ROOT, 'frontend/package.json'));
let Jimp;
let pinyin;
try {
  Jimp = require('jimp');
  ({ pinyin } = require('pinyin-pro'));
} catch {
  throw new Error('缺少 jimp / pinyin-pro：请先 `cd frontend && npm i -D jimp@0.10.3 pinyin-pro`');
}

if (!fs.existsSync(SRC_DIR)) {
  throw new Error(`缺少源目录 ${SRC_DIR}（原始 SVG 备份处）`);
}
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

/**
 * 清掉旧产物（含改名前的历史文件）。
 *
 * ⚠️ 必须有这一步：文件名从「中文」改「拼音」后，老文件不会被覆盖，
 *    目录里新旧混放会让人不知道哪套在用、也会白白进构建产物。
 */
for (const f of fs.readdirSync(OUT_DIR)) {
  if (/\.(png|svg)$/i.test(f)) fs.rmSync(path.join(OUT_DIR, f));
}

/** 分类名 → 拼音文件名（ASCII，无音调）；如 午餐 → `wucan`、旅游度假 → `lvyoudujia` */
function slugOf(name) {
  return pinyin(name, { toneType: 'none', type: 'array' })
    .join('')
    /* ü 不是 ASCII（旅游 → lüyou），按拼音输入法通行写法转成 v —— 文件名必须全 ASCII */
    .replace(/ü/g, 'v')
    /*
     * 拼音库对**拉丁字母原样保留**（如「AA还款」→ `AAhaikuan`），而文件名要求全小写
     * （下面正则只放行 [a-z0-9]）。转小写即可 —— 不会与别的名字撞车
     * （中文转写本身不会产出连续相同的 slug）。
     */
    .toLowerCase();
}

/**
 * 从 jimp 位图里删掉"与四边连通的近白背景"。
 *
 * 用显式栈而不是递归：2048² 的图（即使缩到 256² 也有 6.5 万像素）递归会爆栈。
 */
function clearWhiteBackground(image) {
  const { width: w, height: h } = image.bitmap;
  const data = image.bitmap.data;
  const visited = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    if (x >= 0 && y >= 0 && x < w && y < h) stack.push(y * w + x);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  /*
   * ⚠️ 同时要求**不透明**：透明像素的 RGB 可能是任意值（本批收入图四角是 0,0,0,0，
   *    但也可能有 255,255,255,0 的实现）——不判 alpha 会把"本来就透明的区域"
   *    当成白底去清理，虽然结果无害，但"cleared"计数会失真。
   */
  const nearWhite = (i) => {
    const p = i * 4;
    return data[p + 3] > 250 && data[p] > WHITE && data[p + 1] > WHITE && data[p + 2] > WHITE;
  };
  while (stack.length) {
    const i = stack.pop();
    if (visited[i]) continue;
    visited[i] = 1;
    if (!nearWhite(i)) continue;
    const x = i % w;
    const y = (i / w) | 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  let cleared = 0;
  for (let i = 0; i < w * h; i++) {
    if (visited[i] && nearWhite(i)) {
      data[i * 4 + 3] = 0;
      cleared++;
    }
  }
  return cleared;
}

const files = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.svg'));
if (!files.length) throw new Error(`${SRC_DIR} 里没有 .svg 文件`);

/** 名字 → 文件名（写进 constants，供 `catIconSrc` 解析） */
const mapping = {};
const usedSlug = new Map();
let totalBytes = 0;
for (const file of files) {
  const name = path.basename(file, '.svg');
  const slug = slugOf(name);
  if (!/^[a-z0-9]+$/.test(slug)) throw new Error(`${name}: 拼音转写结果非法（${slug}）`);
  if (usedSlug.has(slug)) throw new Error(`${name} 与 ${usedSlug.get(slug)} 的拼音重名（${slug}）`);
  usedSlug.set(slug, name);

  const raw = fs.readFileSync(path.join(SRC_DIR, file), 'utf8');
  const m = raw.match(/base64,([A-Za-z0-9+/=]+)/);
  if (!m) throw new Error(`${file}: 没有找到内嵌 base64 数据`);
  const image = await Jimp.read(Buffer.from(m[1], 'base64'));
  image.resize(SIZE, SIZE);

  /*
   * 两批源图的背景形态不同，断言要分开看：
   *   · 支出图（2048²）：**不透明白底** —— 必须清掉，清不到说明阈值失效；
   *   · 收入图（1024²）：**已经是透明背景**（四角 alpha=0）—— 清理数天然是 0。
   * 判据用"四角是否已经透明"，而不是"清到多少像素"。
   */
  const cornerAlpha = () => {
    const { width: w, height: h, data } = image.bitmap;
    const at = (x, y) => data[(y * w + x) * 4 + 3];
    return at(0, 0) + at(w - 1, 0) + at(0, h - 1) + at(w - 1, h - 1);
  };
  const alreadyTransparent = cornerAlpha() < 40; // 四个角几乎全透明
  const cleared = clearWhiteBackground(image);
  if (!cleared && !alreadyTransparent) {
    throw new Error(`${file}: 去白底没有清理到任何像素，阈值 ${WHITE} 可能失效`);
  }
  await image.writeAsync(path.join(OUT_DIR, `${slug}.png`));
  totalBytes += fs.statSync(path.join(OUT_DIR, `${slug}.png`)).size;
  mapping[name] = `${slug}.png`;
}

const names = Object.keys(mapping).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));

function buildMetaTs() {
  const lines = [];
  lines.push('/**');
  lines.push(' * 分类图片图标（`img:` 集）· 由 `scripts/gen-cat-icons.mjs` 生成，**请勿手改**。');
  lines.push(' *');
  lines.push(' * 重新生成：`node scripts/gen-cat-icons.mjs`');
  lines.push(' *');
  lines.push(' * 与其它图标集的分工（三套并存，别混用）：');
  lines.push(' *   · `icons.ts`       —— 单色界面/分类图标（`icon-*` / `cat-*`），内联 path、跟随 currentColor');
  lines.push(' *   · `color-icons.ts` —— 彩色图标（`colorful:` / `life:`），内联 SVG body、动态分包');
  lines.push(' *   · 本文件           —— 分类图片图标（`img:<分类名>`），静态 PNG、按需 HTTP 加载');
  lines.push(' *');
  lines.push(' * ⚠️ 文件名是**拼音**不是中文名 —— uni-app H5 dev server 的静态中间件不解码 URL，');
  lines.push(' *    中文名文件在开发环境 404（详见 gen 脚本头部）。key 仍是中文的分类名。');
  lines.push(' *');
  lines.push(' * ⚠️ 本集**不进 JS bundle**：PNG 放在 `static/cat-icons/`，');
  lines.push(' *    由 `<image src="/static/cat-icons/<拼音>.png">` 按需加载。');
  lines.push(' *    原始 2048px 源图（39MB）备份在 `assets/cat-icons-original/`，不参与构建。');
  lines.push(' */');
  lines.push('');
  lines.push('/** 全部图片图标的名字（= 分类名）。key 形态为 `img:<名字>` */');
  lines.push('export const CAT_ICON_NAMES: string[] = [');
  for (const n of names) {
    lines.push(`  ${JSON.stringify(n)},`);
  }
  lines.push('];');
  lines.push('');
  lines.push('/** 名字 → 文件名（`static/cat-icons/` 下的 PNG，文件名为拼音） */');
  lines.push('export const CAT_ICON_FILES: Record<string, string> = {');
  for (const n of names) {
    lines.push(`  ${JSON.stringify(n)}: ${JSON.stringify(mapping[n])},`);
  }
  lines.push('};');
  lines.push('');
  lines.push('/** 图标总数（图标选择器 Tab 上显示，也用于自检） */');
  lines.push(`export const CAT_ICON_TOTAL = ${names.length};`);
  lines.push('');
  return lines.join('\n');
}

fs.writeFileSync(META_OUT, buildMetaTs(), 'utf8');

console.log(`已生成 ${path.relative(ROOT, OUT_DIR)}/ 共 ${names.length} 张 PNG`);
console.log(`  边长 ${SIZE}×${SIZE}，合计 ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
console.log(`  （源文件 39 MB；按需加载，单张约 ${(totalBytes / names.length / 1024).toFixed(0)} KB）`);
console.log(`已生成 ${path.relative(ROOT, META_OUT)}（元数据：名字清单 + 名字→文件名映射）`);
