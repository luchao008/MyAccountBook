/**
 * 生成「分类图片图标」的静态资源与数据文件。
 *
 *   node scripts/gen-cat-icons.mjs
 *
 * 产物：
 *   frontend/src/static/cat-icons/<拼音>.png   94 张 160×160 透明 PNG（小程序 / App 用）
 *   frontend/src/static/cat-icons/<拼音>.webp  94 张**同图** WebP（H5 用，省约 88% 体积）
 *   frontend/src/constants/cat-icons.ts        名字清单 + 名字→基名映射（**不带扩展名**）
 *
 * ⚠️ 为什么要生成**两份**（2026-10-01 定）：
 *    · WebP 比 PNG 小得多（本批实测 1.884 MB → 0.215 MB，省 88.6%）—— H5 端请求这些图标的
 *      总量直接降一个数量级，没有理由不用；
 *    · 但**无法离线确认微信小程序对"包内本地 webp"的支持**：`<image>` 加载包内文件走的是
 *      各端原生实现、不是浏览器内核，一旦不支持就是**安静地显示空白**（不是报错，极难定位）。
 *    · 于是只在**能确认的 H5** 上用 WebP，小程序 / App 继续用 PNG。两套并存、
 *      像素完全一致，由 `frontend/src/utils/catIcon.ts` 按平台拼扩展名 ——
 *      正因为扩展名由消费方决定，映射表里只存**不带扩展名的基名**（`wucan`，不是 `wucan.png`）。
 *    · 代价：构建产物里会带上"本端不用"的那一套 —— uni-app 把 `static/` 原样拷进 dist、
 *      不按平台裁剪（**H5 产物已实测**：94 张 PNG 一张不少地进了 `dist/build/h5/static/`；
 *      小程序端本机没构建过，但同一套拷贝逻辑，多半同样会带上一份用不到的 WebP）。
 *      多出的 WebP 实测仅 0.215 MB；若日后在意，应在构建期按平台剔除
 *      （见 `vite.config.ts` 的 `catIconVersion()`，那是唯一同时看得见两套产物的地方）。
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
 *   2. 缩到 160×160（最大渲染场景 icon-picker 的 28×2=56px，3 倍屏 = 168px；
 *      160 在 2 倍屏富余、3 倍屏轻微软化，换来体积从 4.8MB 降到约 1.9MB —— 2026-10-01 定）
 *   3. 从**四边泛洪填充**去掉近白背景 → 透明
 *      ⚠️ 不能"把所有白像素变透明"：图标内部的白色高光会被打洞。
 *         泛洪只清理"与画布边框连通"的白，内部白保留。
 *   4. 把第 3 步的结果编码成 PNG（小程序 / App）**和** WebP（H5）—— 同一张图、两种容器
 *
 * 依赖：jimp、pinyin-pro（PNG + 拼音）、sharp（**只有它**能写 WebP）
 *      三者都声明在 frontend/package.json 的 devDependencies
 *      —— 脚本在仓库根、依赖在 frontend/ 下，靠下面的 createRequire(frontend/package.json) 解析。
 *      缺失时：`cd frontend && npm i -D jimp@0.10.3 pinyin-pro sharp`
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC_DIR = path.join(ROOT, 'assets/cat-icons-original');
const OUT_DIR = path.join(ROOT, 'frontend/src/static/cat-icons');
const META_OUT = path.join(ROOT, 'frontend/src/constants/cat-icons.ts');

/** 输出边长（px）。见文件头"处理三步"第 2 条的推导（2026-10-01 由 256 降到 160） */
const SIZE = 160;
/**
 * 近白判定阈值（RGB 三通道都 > 该值才算背景）。
 *
 * 取 242 而不是 255：源图有压缩噪声与边缘羽化，阈值太严会留下一圈白边，
 * 太松（如 230）会开始啃图标本身的浅色高光。
 */
const WHITE = 242;

/**
 * WebP 编码参数（H5 端产物）。
 *
 *   · `quality: 90` —— 这批图是扁平色块 + 细线条的小插画（160²），q90 与 PNG 肉眼无差；
 *     再往上（q100）体积会明显回涨，而这类图的收益本来就来自"颜色少、压缩友好"。
 *   · `effort: 6` —— libvips 的最高档（0~6）。**离线生成，不怕慢**：
 *     只影响编码耗时、不影响解码，所以拉满换更小体积。
 *     实测全量 94 张 ≈ 80 秒（整脚本 1 分 21 秒，几乎全花在这里）——
 *     这是**构建期一次性成本**，不进产物、不影响用户，值得用时间换体积。
 *     （真要提速：降到 effort 4 约省一半时间，但产物会大一截。别为此改成并行/跳过。）
 *
 * ⚠️ 透明通道：sharp 的 `webp()` 默认 `alphaQuality: 100`（alpha 走无损通道），
 *    正好保住图标边缘；有 alpha 的 lossy WebP 会编码成 **VP8X** 容器（VP8 + ALPH），
 *    而不是 VP8L —— 这是正常现象，校验脚本按 VP8X 判定"支持透明"。
 */
const WEBP = { quality: 90, effort: 6 };

const require = createRequire(path.join(ROOT, 'frontend/package.json'));
let Jimp;
let pinyin;
let sharp;
try {
  Jimp = require('jimp');
  ({ pinyin } = require('pinyin-pro'));
} catch {
  throw new Error('缺少 jimp / pinyin-pro：请先 `cd frontend && npm i -D jimp@0.10.3 pinyin-pro`');
}

/*
 * ⚠️ WebP 为什么要多一个依赖：**jimp 写不出 WebP**。
 *    jimp 0.10.3（本项目锁的版本）里 `Jimp.MIME_WEBP` 是 `undefined`
 *    —— 它的编码器只注册了 PNG/JPEG/BMP/TIFF/GIF，"写 webp"根本没有实现（实测）。
 *    sharp 走 libvips，本地有预编译包（darwin-x64 / Node 24 实测直接可用），
 *    所以 PNG 继续由 jimp 出（**不搅动已确定性的既有产物**），WebP 交给 sharp。
 */
try {
  sharp = require('sharp');
} catch {
  throw new Error('缺少 sharp（唯一的 WebP 编码器）：请先 `cd frontend && npm i -D sharp`');
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
 * ⚠️ `.webp` 也要一起清：两套是**按基名成对**消费的（见校验脚本
 *    `scripts/verify-cat-icon-assets.mjs`），只清 PNG 会留下"改了名/删了图标后"
 *    无人引用的孤儿 WebP —— 它会静静躺在 dist 里占体积，且没有任何报错。
 */
for (const f of fs.readdirSync(OUT_DIR)) {
  if (/\.(png|svg|webp)$/i.test(f)) fs.rmSync(path.join(OUT_DIR, f));
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

/** 名字 → **基名**（不含扩展名；扩展名由 `utils/catIcon.ts` 按平台拼） */
const mapping = {};
const usedSlug = new Map();
let pngBytes = 0;
let webpBytes = 0;
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
  pngBytes += fs.statSync(path.join(OUT_DIR, `${slug}.png`)).size;

  /*
   * ── WebP：把**刚写到磁盘的那张 PNG** 再编码一份 ─────────────────────────
   *
   * ⚠️ 为什么输入是"磁盘上那张 PNG"、而不是手上 jimp 的位图：
   *    这样"两套产物像素完全一致"是**结构上成立**的 —— 同一个字节流解码两次、
   *    只换容器，不依赖"jimp 的 PNG 是有损还是无损""sharp 怎么解释裸 RGBA 的
   *    预乘 alpha"这类外部假设。PNG 是无损直存，读回来就是第 3 步的结果。
   *
   * ⚠️ 为什么**先写 PNG 再写 WebP**：PNG 是基线产物（小程序/App 依赖它），
   *    万一 sharp 出问题，至少已经落盘的 PNG 是完整的 —— 顺序即优先级。
   *    也正因如此，这段代码**不碰 PNG 一个字节**（只读不写），既有产物不会被搅动。
   */
  const webp = await sharp(fs.readFileSync(path.join(OUT_DIR, `${slug}.png`)))
    .webp(WEBP)
    .toBuffer();
  fs.writeFileSync(path.join(OUT_DIR, `${slug}.webp`), webp);
  webpBytes += webp.length;

  /* 值只存基名：扩展名是**消费方按平台**决定的（H5 → .webp，其它端 → .png） */
  mapping[name] = slug;
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
  lines.push(' *   · 本文件           —— 分类图片图标（`img:<分类名>`），静态 PNG + WebP、按需 HTTP 加载');
  lines.push(' *');
  lines.push(' * ⚠️ 文件名是**拼音**不是中文名 —— uni-app H5 dev server 的静态中间件不解码 URL，');
  lines.push(' *    中文名文件在开发环境 404（详见 gen 脚本头部）。key 仍是中文的分类名。');
  lines.push(' *');
  lines.push(' * ⚠️ 每个图标有**两份等价产物**：`<基名>.png`（小程序 / App）与 `<基名>.webp`（H5，省 ~88% 体积）。');
  lines.push(' *    正文**不带扩展名**，由 `utils/catIcon.ts` 按平台拼（`#ifdef H5` → .webp，否则 .png）——');
  lines.push(' *    因为"哪端能用 WebP"是平台知识，属于取数逻辑，不该固化进生成物。');
  lines.push(' *    为什么不能统一用 WebP：无法离线确认微信小程序对"包内本地 webp"的支持，');
  lines.push(' *    一旦不支持就是 `<image>` 安静地显示空白。详见 gen 脚本头部"为什么要生成两份"。');
  lines.push(' *');
  lines.push(' * ⚠️ 本集**不进 JS bundle**：两套图都放在 `static/cat-icons/`，');
  lines.push(' *    由 `<image src="/static/cat-icons/<拼音>.<扩展名>">` 按需加载。');
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
  lines.push('/**');
  lines.push(' * 名字 → **基名**：`static/cat-icons/` 下的文件名**去掉扩展名**（`"wucan"`，不是 `"wucan.png"`）。');
  lines.push(' *');
  lines.push(' * ⚠️ 为什么不带扩展名：同名的两份产物（`.png` 给小程序/App、`.webp` 给 H5）都合法，');
  lines.push(' *    扩展名取决于**消费端的平台**，不是图标本身的属性 —— 让消费方拼，这里只存公共前缀。');
  lines.push(' *    具体拼法见 `utils/catIcon.ts` 的 `catIconSrc()`。');
  lines.push(' */');
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

const kb = (n) => (n / 1024).toFixed(0);
const mb = (n) => (n / 1024 / 1024).toFixed(3);

console.log(`已生成 ${path.relative(ROOT, OUT_DIR)}/ 共 ${names.length} 组（每组 PNG + WebP 各一张）`);
console.log(`  边长 ${SIZE}×${SIZE}，按需 HTTP 加载，源文件 39 MB`);
/*
 * 两套产物的体积对比直接打出来：这是"为什么要维护两份"的唯一论据，
 * 也是回归信号 —— 哪天 WebP 不再明显更小（参数写错、输出成了别的东西），
 * 看这一行就能立刻发现，而不必去跑校验脚本。
 */
console.log(`  · PNG  （小程序/App）合计 ${mb(pngBytes)} MB，单张约 ${kb(pngBytes / names.length)} KB`);
console.log(`  · WebP （H5）        合计 ${mb(webpBytes)} MB，单张约 ${kb(webpBytes / names.length)} KB`);
console.log(`  → WebP 省 ${(100 - (webpBytes / pngBytes) * 100).toFixed(1)}%（quality ${WEBP.quality} / effort ${WEBP.effort}）`);
console.log(`已生成 ${path.relative(ROOT, META_OUT)}（元数据：名字清单 + 名字→基名映射，值不含扩展名）`);
