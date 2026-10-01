#!/usr/bin/env node
/**
 * 校验分类图标的**静态资产集**是否完整自洽（不需要起服务，秒级）。
 *
 *   node scripts/verify-cat-icon-assets.mjs
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────
 * 分类图标现在是**双份产物**：每个分类同时有 `<拼音>.png`（小程序/App 用）
 * 与 `<拼音>.webp`（H5 用，省 ~88% 体积）。两者由 `gen-cat-icons.mjs` 一起生成，
 * 但**存在文件系统里、靠文件名约定关联**，包管理器与 TS 编译器都看不见 ——
 * 也就是说：少生成一张、名字拼错、映射表与磁盘对不上，都不会有任何编译期报错，
 * 只会表现为**运行期某几个图标空白**（`<image>` 静默失败）。
 *
 * `scripts/verify-cat-icons.mjs` 那个 Playwright 脚本能在浏览器里发现一部分，
 * 但它需要起 dev server + 下载 Chromium，不适合每次改图标都跑。
 * 本脚本是它的"离线前哨"：**只读磁盘**，把"两套是否一一对应、映射表是否自洽、
 * webp 是否真的更小"这几件事钉死。
 *
 * ⚠️ 本脚本**不断言渲染结果**（那是 Playwright 那份的职责），
 *    也不检查图标内容是否好看 —— 它只管"结构对不对"。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ICON_DIR = path.join(ROOT, 'frontend/src/static/cat-icons');
const META_TS = path.join(ROOT, 'frontend/src/constants/cat-icons.ts');

/** 期望边长（与 gen-cat-icons.mjs 的 SIZE 一致） */
const EXPECT_SIZE = 160;

let pass = 0;
let fail = 0;

function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? '　' + detail : ''}`);
  ok ? pass++ : fail++;
}

// ── 读生成物元数据 ───────────────────────────────────────────────────

const meta = fs.readFileSync(META_TS, 'utf8');

/**
 * 从生成物里抽一个字符串数组常量。
 * ⚠️ 生成物带类型标注（`export const CAT_ICON_NAMES: string[] = [`），
 *    正则必须容忍 `: 类型` 这一段 —— 第一版没容忍，直接解析失败（判据变红是好事，但它红错了原因）。
 */
function readStringArray(name) {
  const m = meta.match(new RegExp(`export const ${name}(?:\\s*:[^=]+)?\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  if (!m) return null;
  return [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
}

/** 从生成物里抽 `Record<string, string>` 映射 */
function readStringMap(name) {
  const m = meta.match(new RegExp(`export const ${name}(?:\\s*:[^=]+)?\\s*=\\s*\\{([\\s\\S]*?)\\};`));
  if (!m) return null;
  const out = new Map();
  for (const kv of m[1].matchAll(/["']([^"']+)["']\s*:\s*["']([^"']+)["']/g)) {
    out.set(kv[1], kv[2]);
  }
  return out;
}

/** 抽一个数字常量（如 CAT_ICON_TOTAL = 94） */
function readNumber(name) {
  const m = meta.match(new RegExp(`export const ${name}(?:\\s*:[^=]+)?\\s*=\\s*(\\d+)`));
  return m ? Number(m[1]) : null;
}

const names = readStringArray('CAT_ICON_NAMES');
const files = readStringMap('CAT_ICON_FILES');
const total = readNumber('CAT_ICON_TOTAL');

console.log('=== 元数据 ===');
if (!names || !files) {
  console.log('✗ 无法从 constants/cat-icons.ts 解析出 CAT_ICON_NAMES / CAT_ICON_FILES');
  process.exit(1);
}
check(`CAT_ICON_NAMES 有 ${names.length} 项`, names.length > 0);
check(`CAT_ICON_FILES 有 ${files.size} 项`, files.size > 0);
check('两者数量一致', names.length === files.size, `${names.length} vs ${files.size}`);
check(
  `CAT_ICON_TOTAL(${total}) 与实际数量一致`,
  total === names.length,
  '图标选择器 Tab 上的数字就取自它，不一致会让界面显示骗人'
);

/** 名字清单里每一项都能在映射里找到 */
const missingInMap = names.filter((n) => !files.has(n));
check('每个名字都在映射表里', missingInMap.length === 0, missingInMap.slice(0, 3).join(', '));

// ── 映射表的值必须是不带扩展名的 ASCII 基名 ──────────────────────────

console.log('\n=== 映射表格式（扩展名由平台决定，值里不该有）===');
const badExt = [...files.entries()].filter(([, v]) => /\.(png|webp)$/i.test(v));
check('值不含扩展名', badExt.length === 0, badExt.slice(0, 3).map(([k, v]) => `${k}→${v}`).join(', '));

const badAscii = [...files.entries()].filter(([, v]) => !/^[a-z0-9_]+$/.test(v));
check(
  '值是 ASCII 拼音（uni-app H5 dev server 不解码 URL，中文名会 404）',
  badAscii.length === 0,
  badAscii.slice(0, 3).map(([k, v]) => `${k}→${v}`).join(', ')
);

const dupBases = [...files.values()].filter((v, i, a) => a.indexOf(v) !== i);
check('基名无重复（重复会让两个分类共用一张图）', dupBases.length === 0, [...new Set(dupBases)].slice(0, 3).join(', '));

// ── 磁盘：两套产物必须一一对应 ───────────────────────────────────────

console.log('\n=== 磁盘资产集 ===');
const onDisk = fs.readdirSync(ICON_DIR);
const pngs = new Set(onDisk.filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)));
const webps = new Set(onDisk.filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5)));

check(`PNG ${pngs.size} 个`, pngs.size > 0);
check(`WebP ${webps.size} 个`, webps.size > 0);
check('两套数量一致', pngs.size === webps.size, `${pngs.size} vs ${webps.size}`);

const expectBases = new Set(files.values());
const noPng = [...expectBases].filter((b) => !pngs.has(b));
const noWebp = [...expectBases].filter((b) => !webps.has(b));
check('映射表里的每个基名都有 .png', noPng.length === 0, noPng.slice(0, 3).join(', '));
check('映射表里的每个基名都有 .webp', noWebp.length === 0, noWebp.slice(0, 3).join(', '));

const orphanPng = [...pngs].filter((b) => !expectBases.has(b));
const orphanWebp = [...webps].filter((b) => !expectBases.has(b));
check('磁盘上没有映射表之外的 .png（孤儿）', orphanPng.length === 0, orphanPng.slice(0, 3).join(', '));
check('磁盘上没有映射表之外的 .webp（孤儿）', orphanWebp.length === 0, orphanWebp.slice(0, 3).join(', '));

const other = onDisk.filter((f) => !f.endsWith('.png') && !f.endsWith('.webp'));
check('目录里没有多余文件', other.length === 0, other.slice(0, 3).join(', '));

// ── 文件头与尺寸：判定"真能被解码"，不只看扩展名 ─────────────────────

/** 解析 PNG 尺寸（IHDR） */
function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/**
 * 解析 WebP 尺寸与实际编码格式。
 * ⚠️ WebP 有三种容器，尺寸字段位置各不相同 —— 只按 VP8 解析会在 VP8L/VP8X 上读出错值。
 */
function webpInfo(buf) {
  if (buf.length < 30) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF') return null;
  if (buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const fourcc = buf.toString('ascii', 12, 16);
  if (fourcc === 'VP8 ') {
    return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff, format: 'VP8(lossy)', alpha: false };
  }
  if (fourcc === 'VP8L') {
    const b = buf;
    const w = 1 + (((b[22] & 0x3f) << 8) | b[21]);
    const h = 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6));
    return { w, h, format: 'VP8L(lossless)', alpha: true };
  }
  if (fourcc === 'VP8X') {
    const w = 1 + b_readUInt24LE(buf, 24);
    const h = 1 + b_readUInt24LE(buf, 27);
    return { w, h, format: 'VP8X(extended)', alpha: (buf[20] & 0x10) !== 0 };
  }
  return { w: 0, h: 0, format: `未知(${fourcc})`, alpha: false };
}
function b_readUInt24LE(buf, off) {
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16);
}

console.log('\n=== 文件头 / 尺寸 / 透明通道 ===');
let badPng = [];
let badWebp = [];
let wrongSize = [];
const formats = new Map();

for (const base of expectBases) {
  const p = path.join(ICON_DIR, `${base}.png`);
  const w = path.join(ICON_DIR, `${base}.webp`);
  if (fs.existsSync(p)) {
    const s = pngSize(fs.readFileSync(p));
    if (!s) badPng.push(base);
    else if (s.w !== EXPECT_SIZE || s.h !== EXPECT_SIZE) wrongSize.push(`${base}.png=${s.w}x${s.h}`);
  }
  if (fs.existsSync(w)) {
    const info = webpInfo(fs.readFileSync(w));
    if (!info) badWebp.push(base);
    else {
      formats.set(info.format, (formats.get(info.format) ?? 0) + 1);
      if (info.w !== EXPECT_SIZE || info.h !== EXPECT_SIZE) wrongSize.push(`${base}.webp=${info.w}x${info.h}`);
    }
  }
}

// ⚠️ 以下每条都显式要求"样本数 > 0"：否则文件为空时断言会**空洞通过**，
// 变成"永远绿的校验器"—— 比没有校验器更危险（见 docs/工程约定与踩坑.md §五）。
check('所有 PNG 文件头合法', pngs.size > 0 && badPng.length === 0, badPng.slice(0, 3).join(', '));
check('所有 WebP 文件头合法（RIFF/WEBP）', webps.size > 0 && badWebp.length === 0, badWebp.slice(0, 3).join(', '));
check(
  `所有图标尺寸均为 ${EXPECT_SIZE}×${EXPECT_SIZE}`,
  (pngs.size > 0 && webps.size > 0) && wrongSize.length === 0,
  wrongSize.slice(0, 3).join(', ')
);
console.log(`    WebP 编码格式分布：${[...formats].map(([k, v]) => `${k}×${v}`).join('，') || '(无)'}`);
// 图标是带透明背景的插画：必须是带 alpha 的格式，否则边缘会出现黑/白底
const alphaOk = formats.size > 0 && [...formats.keys()].every((k) => k.startsWith('VP8L') || k.startsWith('VP8X'));
check('WebP 全部使用支持透明的编码（VP8L 或 VP8X）', alphaOk);

// ── 体积：WebP 必须真的比 PNG 小 ─────────────────────────────────────

console.log('\n=== 体积 ===');
let pngTotal = 0;
let webpTotal = 0;
const bigger = [];
for (const base of expectBases) {
  const p = path.join(ICON_DIR, `${base}.png`);
  const w = path.join(ICON_DIR, `${base}.webp`);
  if (!fs.existsSync(p) || !fs.existsSync(w)) continue;
  const ps = fs.statSync(p).size;
  const ws = fs.statSync(w).size;
  pngTotal += ps;
  webpTotal += ws;
  // 反向失败：某个 webp 反而更大，说明编码参数有问题，H5 端是负优化
  if (ws >= ps) bigger.push(`${base} (${ps}→${ws})`);
}
const mb = (n) => (n / 1024 / 1024).toFixed(3) + ' MB';
const compared = [...expectBases].filter(
  (b) => fs.existsSync(path.join(ICON_DIR, `${b}.png`)) && fs.existsSync(path.join(ICON_DIR, `${b}.webp`))
).length;
console.log(`    PNG 合计 ${mb(pngTotal)} / WebP 合计 ${mb(webpTotal)}（对比了 ${compared} 组）`);
if (pngTotal > 0) {
  console.log(`    省 ${(100 - (webpTotal / pngTotal) * 100).toFixed(1)}%`);
}
// ⚠️ 同样要求 compared > 0：一组都没比到时，"没有更大的文件"是空洞成立的
check(
  '没有"WebP 反而比 PNG 更大"的文件',
  compared > 0 && bigger.length === 0,
  bigger.slice(0, 3).join(', ')
);
// 期望量级：实测约 -88%。给宽松阈值，避免参数微调就误报
check(
  'WebP 总体积至少比 PNG 小 50%',
  compared > 0 && pngTotal > 0 && webpTotal < pngTotal * 0.5,
  pngTotal > 0 ? `实际省 ${(100 - (webpTotal / pngTotal) * 100).toFixed(1)}%` : '无可比数据'
);

// ── 平台契约：用 uni 自己的预处理器验两端产出的 URL ───────────────────
//
// 这一节守的是一个**会静默失效**的失败模式：`catIconSrc()` 靠
// `#ifdef H5` / `#ifndef H5` 两段条件编译给 `src` 赋值，靠「H5 一条 + 其余一条」
// 互补互斥来保证**每个平台都必被赋值**。一旦有人把它改成平台白名单
// （如 `#ifdef MP-WEIXIN`），App / 支付宝端就会落进初始空串 →
// URL 为空 → 图标整片空白，且**不报任何错**。
//
// 用真实预处理器（与 vite-plugin-uni 同一条路径）跑真实源码，
// 断言"每个平台恰好留下 1 条赋值"，比读代码推断可靠得多。

console.log('\n=== 平台契约（用 uni 预处理器实测，非静态推断）===');
try {
  const { createRequire } = await import('node:module');
  const frontendRequire = createRequire(path.join(ROOT, 'frontend/package.json'));
  const pre = frontendRequire('@dcloudio/uni-cli-shared/dist/preprocess/index.js');

  const catIconSrcPath = path.join(ROOT, 'frontend/src/utils/catIcon.ts');
  const srcCode = fs.readFileSync(catIconSrcPath, 'utf8');

  /** 剥注释：注释里大段讨论 `.png` / `#ifdef`，直接全文匹配会被污染（实测踩过） */
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  /**
   * 预处理出某平台的代码，返回 { asg, code }：
   *   asg  —— catIconSrc 里**可执行**的 `src = ...` 赋值语句
   *   code —— 该函数的源码**剥掉注释后**的结果（用于判断有没有引用某个标识符）
   */
  function processedFor(platform) {
    process.env.UNI_PLATFORM = platform;
    pre.initPreContext(platform);
    const out = pre.preJs(srcCode, 'src/utils/catIcon.ts');
    const i = out.indexOf('function catIconSrc');
    if (i < 0) return null;
    const code = stripComments(out.slice(i));
    return { code, asg: code.match(/src\s*=\s*`[^`]*`/g) || [] };
  }

  const h5p = processedFor('h5');
  const mpp = processedFor('mp-weixin');

  if (!h5p || !mpp) {
    check('能从 catIcon.ts 里找到 catIconSrc()', false, '预处理后未找到该函数');
  } else {
    check('H5 恰好留下 1 条 src 赋值', h5p.asg.length === 1, `实际 ${h5p.asg.length} 条`);
    check('H5 用 .webp', h5p.asg.length === 1 && /\.webp/.test(h5p.asg[0]));
    check('H5 带 ?v= 版本号', h5p.asg.length === 1 && /\?v=/.test(h5p.asg[0]));
    check('H5 没有 .png 回落', !h5p.asg.some((a) => /\.png/.test(a)));

    check('小程序恰好留下 1 条 src 赋值', mpp.asg.length === 1, `实际 ${mpp.asg.length} 条`);
    check('小程序用 .png', mpp.asg.length === 1 && /\.png/.test(mpp.asg[0]));
    check('小程序不带 query（包内本地路径带 query 会安静失败）', !mpp.asg.some((a) => /\?v=/.test(a)));
    check('小程序不引用 __CAT_ICON_VERSION__', !/__CAT_ICON_VERSION__/.test(mpp.code));
  }
} catch (err) {
  console.log(`  ⚠️ 跳过：无法加载 uni 预处理器（${err.message}）`);
  console.log('     需要先 npm i（frontend 依赖）。这一节不参与判定，但它很重要，别长期跳过。');
}

console.log(`\n结果：PASS=${pass} FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);
