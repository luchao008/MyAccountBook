/**
 * 「图片」分类图标（`assets/cat-icons-original/*.svg`）的**画风量化**脚本。
 *
 * 用途：重绘图标系统之前，把参考图集的画风变成可复现的数字，而不是目测附和。
 * 每张原图其实是「2048×2048 JPEG base64 内嵌」的 SVG 包装（见 docs/分类图标比对与导入报告.md），
 * 所以先抠出 base64 解码，再逐张统计。
 *
 * 输出指标（每张 + 全集汇总）：
 *   coverage     前景像素占比（前景 = 与四角底色差异 > FG_DIFF 的像素）
 *   bboxPad      前景外接框到画布边缘的留白（左右/上下，占画布比例）
 *   hueTop3      前景中饱和度/明度达标像素的色相直方图前 3 档（30° 一档）
 *   sat/val      前景像素的饱和度、明度分位数 p10/p50/p90
 *   hueSpread    色相覆盖的档数（1 档 ≈ 单色渐变；≥2 档 ≈ 双色/多色）
 *   lightDir     高光方向 —— 最亮 8% 像素的质心相对外接框中心的偏移（归一化到外接框）
 *   glowReach    外部柔光的延伸距离。⚠️ 不能直接用"低阈值前景"，因为白底 JPEG 的底色
 *                本身不匀（255 vs 250 就超过阈值），会把整张画布算成柔光。
 *                所以柔光只认**带色或比底色暗**的像素 —— 柔光是彩色/发暗的，
 *                JPEG 底噪是"亮的且无彩"，两者可分。
 *   roundRatio   前景面积 / 外接框面积（越接近 1 越方；圆角越大越小）
 *   topColors    前景主色（RGB 量化到 16 级后取前 N，含占比）—— 建调色板直接用这个
 *
 * 运行：node scripts/measure-cat-icon-style.mjs
 * 可选：--palette  额外打印每张图的主色表
 *      --ours     再把 `frontend/src/constants/category-icons.ts` 的新图标用**同一套量法**
 *                 测一遍并逐项比对（这是"两个 Tab 风格统一"的验收依据，不是目测）
 *                 ⚠️ 需要写成 `node --experimental-strip-types scripts/measure-cat-icon-style.mjs --ours`
 *                 —— 它要直接 import 应用里的 `.ts` 常量，不另抄一份（抄了必然漂移）。
 *      --json     额外输出机器可读的 JSON 到 stdout 末尾
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'assets', 'cat-icons-original');

// jimp 装在 frontend/ 下（与 scripts/gen-cat-icons.mjs 同一套解析方式）
const require = createRequire(path.join(ROOT, 'frontend/package.json'));
let Jimp;
try {
  Jimp = require('jimp');
} catch {
  throw new Error('缺少 jimp：请先 `cd frontend && npm i -D jimp@0.10.3`');
}

/** 前景判定阈值：与底色的 RGB 距离大于它才算前景（排除极淡的柔光） */
const FG_DIFF = 24;
/** 柔光判定：距离大于它 **且** 带色或比底色暗（排除白底 JPEG 的亮而无彩底噪） */
const GLOW_DIFF = 8;
/** 色相统计只考虑至少这么饱和、这么亮的像素，避免白底/灰边污染 */
const MIN_SAT = 0.18;
const MIN_VAL = 0.25;
/** 主色统计量化到多少级（16 级 = 每通道 16 阶） */
const QUANT = 16;

const pct = (n) => `${(n * 100).toFixed(1)}%`;

function rgb2hsv(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d !== 0) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: mx === 0 ? 0 : d / mx, v: mx };
}

/** 找出内嵌 base64 图片；返回 { buffer, mime } */
function extractEmbedded(svgText) {
  const m = svgText.match(/data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=]+)/i);
  if (!m) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], 'base64') };
}

/** 四角取样求底色（中位数，抗单角噪点） */
function backgroundOf(img) {
  const w = img.bitmap.width;
  const h = img.bitmap.height;
  const pts = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
    [Math.floor(w * 0.5), 0],
  ];
  const rs = pts.map(([x, y]) => Jimp.intToRGBA(img.getPixelColor(x, y)).r).sort((a, b) => a - b);
  const gs = pts.map(([x, y]) => Jimp.intToRGBA(img.getPixelColor(x, y)).g).sort((a, b) => a - b);
  const bs = pts.map(([x, y]) => Jimp.intToRGBA(img.getPixelColor(x, y)).b).sort((a, b) => a - b);
  const mid = Math.floor(pts.length / 2);
  return { r: rs[mid], g: gs[mid], b: bs[mid], lum: (rs[mid] + gs[mid] + bs[mid]) / 3 / 255 };
}

function measure(img) {
  const W = img.bitmap.width;
  const H = img.bitmap.height;
  const bg = backgroundOf(img);

  let fgCount = 0;
  let glowCount = 0;
  let minX = W;
  let minY = H;
  let maxX = -1;
  let maxY = -1;
  let gMinX = W;
  let gMinY = H;
  let gMaxX = -1;
  let gMaxY = -1;

  const satVals = [];
  const valVals = [];
  const hues = new Array(12).fill(0); // 30° 一档
  const colorBuckets = new Map(); // 量化后的主色
  // 最亮像素的质心（按亮度加权，只取阈值以上）
  let lumSum = 0;
  let lumWX = 0;
  let lumWY = 0;
  const lumSamples = [];
  /*
   * 「本体高光方向」用的样本：只收**有彩**像素（s ≥ MIN_SAT_BODY）。
   *
   * 为什么不复用上面那份全前景样本：参考图集在物体外有一圈很亮的柔光晕，
   * 它同样越过 FG_DIFF 被判成前景 —— 于是"最亮 8%"里混进大量晕像素，
   * 量出来的其实是"晕怎么分布"，不是"物体朝哪受光"。
   * 而本项目的图标刻意不用外扩柔光（见 category-icons.ts 第 4 条约定），
   * 两边口径不一致，直接比就是拿苹果比橘子（实测差 41%，全是这个口径差）。
   * 只取有彩部分，两边的读数才是同一件事。
   */
  let bodySum = 0;
  let bodyWX = 0;
  let bodyWY = 0;
  const bodySamples = [];
  const bgLum = (bg.r + bg.g + bg.b) / 765;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const { r, g, b } = Jimp.intToRGBA(img.getPixelColor(x, y));
      const dist = Math.abs(r - bg.r) + Math.abs(g - bg.g) + Math.abs(b - bg.b);
      const { h, s, v } = rgb2hsv(r / 255, g / 255, b / 255);

      // 柔光：带色，或比底色暗。白底 JPEG 的"亮而无彩"底噪会被这条挡掉。
      if (dist > GLOW_DIFF && (s > 0.06 || v < bgLum - 0.02)) {
        glowCount++;
        if (x < gMinX) gMinX = x;
        if (y < gMinY) gMinY = y;
        if (x > gMaxX) gMaxX = x;
        if (y > gMaxY) gMaxY = y;
      }

      if (dist <= FG_DIFF) continue;
      fgCount++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      satVals.push(s);
      valVals.push(v);
      /*
       * ⚠️ 高光质心用**亮度（luminance）**，不能用 HSV 的 V。
       *    V = max(R,G,B)/255，浅色图标里大量像素 V 恒等于 1.0 —— 一片平局，
       *    排序退化后由扫描顺序决定，"最亮 8%" 实际取到的是**画面上半部分**。
       *    实测：用 V 算出来新图标 −0.394、参考 −0.190，看着像"光太靠上"，
       *    其实一半是平局伪影。亮度不会顶格，两边的读数才是同一件事。
       */
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (s >= MIN_SAT && v >= MIN_VAL) {
        hues[Math.floor(h / 30) % 12]++;
        bodySamples.push({ x, y, l: lum });
      }
      lumSamples.push({ x, y, l: lum });

      const qr = Math.round(r / QUANT) * QUANT;
      const qg = Math.round(g / QUANT) * QUANT;
      const qb = Math.round(b / QUANT) * QUANT;
      const key = (Math.min(255, qr) << 16) | (Math.min(255, qg) << 8) | Math.min(255, qb);
      colorBuckets.set(key, (colorBuckets.get(key) || 0) + 1);
    }
  }

  if (fgCount === 0) return null;

  // 最亮 8% 像素 → 高光质心
  lumSamples.sort((a, b) => b.l - a.l);
  const topN = Math.max(1, Math.floor(lumSamples.length * 0.08));
  for (let i = 0; i < topN; i++) {
    const p = lumSamples[i];
    lumWX += p.x;
    lumWY += p.y;
  }
  lumSum = topN;

  // 本体（有彩部分）最亮 8% → 本体高光质心
  bodySamples.sort((a, b) => b.l - a.l);
  const bodyTopN = Math.max(1, Math.floor(bodySamples.length * 0.08));
  for (let i = 0; i < bodyTopN; i++) {
    bodyWX += bodySamples[i].x;
    bodyWY += bodySamples[i].y;
  }
  bodySum = bodyTopN;

  const q = (arr, p) => {
    const a = [...arr].sort((x, y) => x - y);
    return a[Math.min(a.length - 1, Math.max(0, Math.floor(a.length * p)))];
  };

  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const bboxArea = bw * bh;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const hueTotal = hues.reduce((a, b) => a + b, 0) || 1;
  const hueRank = hues
    .map((c, i) => ({ deg: i * 30, share: c / hueTotal }))
    .sort((a, b) => b.share - a.share);

  const topColors = [...colorBuckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, c]) => ({
      hex: `#${k.toString(16).padStart(6, '0').toUpperCase()}`,
      share: c / fgCount,
    }));

  return {
    W,
    H,
    hueTop3: hueRank
      .slice(0, 3)
      .map((x) => `${x.deg}°:${pct(x.share)}`)
      .join('  '),
    hueSpread: hues.filter((c) => c / hueTotal >= 0.05).length,
    coverage: fgCount / (W * H),
    roundRatio: fgCount / bboxArea,
    bboxPadX: minX / W,
    bboxPadY: minY / H,
    bboxW: bw / W,
    bboxH: bh / H,
    sat: [q(satVals, 0.1), q(satVals, 0.5), q(satVals, 0.9)],
    val: [q(valVals, 0.1), q(valVals, 0.5), q(valVals, 0.9)],
    lightDirX: (lumWX / lumSum - cx) / bw,
    lightDirY: (lumWY / lumSum - cy) / bh,
    // 「本体高光方向」：只在有彩像素里算，跨图集可比（见上面的口径说明）
    lightDirBodyX: bodySum ? (bodyWX / bodySum - cx) / bw : 0,
    lightDirBodyY: bodySum ? (bodyWY / bodySum - cy) / bh : 0,
    /*
     * 「受光坡度」= 本体顶部 25% 的亮度中位 − 底部 25% 的亮度中位（0~255）。
     *
     * 为什么不用"最亮 N% 像素的质心"当受光判据：对**任何**自上而下的线性亮度坡，
     * 最亮的那批像素都集中在最上面几行，质心机械地落在 −0.45 附近 ——
     * 它量的是"亮像素的分布"，不是"光从哪来"。参考集读数 −0.102 偏低，
     * 是因为它们物体中部有大量近白细节（车窗、屏、¥），不是因为受光不同。
     * 直接量顶部与底部的亮度差，才是"顶部受光、底部压深"这件事本身。
     */
    lumRamp: (() => {
      const inBody = (p) => p.l;
      const top = bodySamples.filter((p) => p.y <= minY + bh * 0.25).map(inBody);
      const bot = bodySamples.filter((p) => p.y >= maxY - bh * 0.25).map(inBody);
      if (!top.length || !bot.length) return 0;
      return q(top, 0.5) - q(bot, 0.5);
    })(),
    // 正值 = 柔光朝画布外侧延伸的比例（取四边最大）
    glowReach:
      glowCount > 0 ? Math.max(gMaxX - maxX, gMaxY - maxY, minX - gMinX, minY - gMinY) / W : 0,
    topColors,
  };
}

/**
 * 渲染「标准」Tab 的新图标，再用**与参考图完全相同的 `measure()`** 量一遍。
 *
 * 这是"两个 Tab 风格统一"这个结论的验收依据 —— 目测像不算数，
 * 得让 coverage / 圆角比 / 饱和度 / 明度 / 色相档数 / 高光方向这些指标对得上。
 *
 * ⚠️ 需要 `--experimental-strip-types`：要直接 import 应用里的 `.ts` 常量，
 *    而不是在这里另抄一份（抄一份必然漂移，量出来的就不是线上那套了）。
 */
async function measureOurs() {
  const PW =
    process.env.PW_PATH ||
    '/Users/luchao/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js';
  const pw = await import(PW);
  const { chromium } = pw.default ?? pw;

  const { CATEGORY_ICONS_ART } = await import(
    path.join(ROOT, 'frontend/src/constants/category-icons.ts')
  );

  const chromeRoot = `${process.env.HOME}/Library/Caches/ms-playwright`;
  let exe = process.env.CHROME;
  try {
    for (const d of fs
      .readdirSync(chromeRoot)
      .filter((x) => x.startsWith('chromium-'))
      .sort()
      .reverse()) {
      for (const arch of ['chrome-mac-arm64', 'chrome-mac-x64']) {
        const p = `${chromeRoot}/${d}/${arch}/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
        if (fs.existsSync(p)) {
          exe = exe || p;
          break;
        }
      }
      if (exe) break;
    }
  } catch {
    /* 交给 Playwright */
  }

  // 与参考图那 75 张一致的**白底**，量出来的口径才可比
  const cells = Object.entries(CATEGORY_ICONS_ART)
    .map(
      ([k, a], i) =>
        `<div class="cell" id="c${i}" style="width:512px;height:512px;background:#FFFFFF">` +
        `<svg width="512" height="512" viewBox="0 0 ${a.box} ${a.box}">${a.body}</svg></div>`,
    )
    .join('');
  const doc =
    `<!doctype html><meta charset="utf-8"><style>` +
    `*{margin:0;padding:0}body{background:#fff;display:flex;flex-wrap:wrap;width:${512 * 4}px}` +
    `.cell{display:block;line-height:0}</style>${cells}`;

  const browser = await chromium.launch({ executablePath: exe, args: ['--no-proxy-server'] });
  const page = await (await browser.newContext()).newPage();
  await page.setContent(doc, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  const out = [];
  const keys = Object.keys(CATEGORY_ICONS_ART);
  for (let i = 0; i < keys.length; i++) {
    const buf = await page.locator(`#c${i}`).screenshot();
    const img = await Jimp.read(buf);
    const m = measure(img);
    if (m) out.push({ file: keys[i], ...m });
  }
  await browser.close();
  return out;
}

async function main() {
  const files = fs
    .readdirSync(SRC_DIR)
    .filter((f) => f.toLowerCase().endsWith('.svg'))
    .sort();
  const rows = [];
  const skipped = [];

  for (const f of files) {
    const svg = fs.readFileSync(path.join(SRC_DIR, f), 'utf-8');
    const emb = extractEmbedded(svg);
    if (!emb) {
      skipped.push({ f, why: 'no embedded base64' });
      continue;
    }
    let img;
    try {
      img = await Jimp.read(emb.buffer);
    } catch (e) {
      skipped.push({ f, why: `decode fail: ${e.message}` });
      continue;
    }
    // 统一缩到 512 采样，够精度也不慢
    if (img.bitmap.width > 512) img.resize(512, Jimp.AUTO);
    const m = measure(img);
    if (!m) {
      skipped.push({ f, why: 'no foreground' });
      continue;
    }
    rows.push({ file: f.replace(/\.svg$/, ''), ...m });
  }

  const avg = (fn) => rows.reduce((s, r) => s + fn(r), 0) / rows.length;
  const med = (fn) => {
    const a = rows.map(fn).sort((x, y) => x - y);
    return a[Math.floor(a.length / 2)];
  };

  console.log(`\n样本：${rows.length} 张（跳过 ${skipped.length} 张）`);
  if (skipped.length) console.log('跳过：', skipped.map((s) => `${s.f}(${s.why})`).join(', '));

  console.log('\n===== 全集汇总 =====');
  console.log(`采样画布              ${rows[0].W}×${rows[0].H}`);
  console.log(
    `前景占比 coverage     中位 ${pct(med((r) => r.coverage))}  均值 ${pct(avg((r) => r.coverage))}`,
  );
  console.log(
    `圆角比 roundRatio     中位 ${med((r) => r.roundRatio).toFixed(3)}  均值 ${avg((r) => r.roundRatio).toFixed(3)}`,
  );
  console.log(
    `外接框占画布          宽 ${pct(med((r) => r.bboxW))}  高 ${pct(med((r) => r.bboxH))}`,
  );
  console.log(
    `边缘留白              左 ${pct(med((r) => r.bboxPadX))}  上 ${pct(med((r) => r.bboxPadY))}`,
  );
  console.log(
    `饱和度 p10/p50/p90    ${avg((r) => r.sat[0]).toFixed(3)} / ${avg((r) => r.sat[1]).toFixed(3)} / ${avg((r) => r.sat[2]).toFixed(3)}`,
  );
  console.log(
    `明度   p10/p50/p90    ${avg((r) => r.val[0]).toFixed(3)} / ${avg((r) => r.val[1]).toFixed(3)} / ${avg((r) => r.val[2]).toFixed(3)}`,
  );
  console.log(
    `色相档数 hueSpread    中位 ${med((r) => r.hueSpread)}  均值 ${avg((r) => r.hueSpread).toFixed(2)}`,
  );
  console.log(
    `高光方向 lightDir     中位 (${med((r) => r.lightDirX).toFixed(3)}, ${med((r) => r.lightDirY).toFixed(3)})  均值 (${avg((r) => r.lightDirX).toFixed(3)}, ${avg((r) => r.lightDirY).toFixed(3)})`,
  );
  console.log(
    `柔光延伸 glowReach    中位 ${pct(med((r) => r.glowReach))}  均值 ${pct(avg((r) => r.glowReach))}`,
  );

  const spreadDist = {};
  rows.forEach((r) => (spreadDist[r.hueSpread] = (spreadDist[r.hueSpread] || 0) + 1));
  console.log(
    `色相档数分布          ${Object.entries(spreadDist)
      .sort()
      .map(([k, v]) => `${k}档:${v}张`)
      .join('  ')}`,
  );

  const byHue = new Map();
  rows.forEach((r, i) => byHue.set(r.file, r));
  const bestIllus = rows
    .filter((r) => r.hueTop3.includes(':'))
    .sort((a, b) => b.hueSpread - a.hueSpread);
  console.log('\n===== 分色相最多的 12 张（多色样本）=====');
  console.log('名称'.padEnd(22) + '色相前3' + '  '.padEnd(20) + ' 饱和度中位  明度中位  圆角比');
  for (const r of bestIllus.slice(0, 12)) {
    console.log(
      r.file.padEnd(20) +
        r.hueTop3.padEnd(40) +
        r.sat[1].toFixed(3).padStart(8) +
        r.val[1].toFixed(3).padStart(10) +
        r.roundRatio.toFixed(3).padStart(9),
    );
  }

  if (process.argv.includes('--palette')) {
    console.log('\n===== 每张图主色（前 5，含占比）=====');
    for (const r of rows) {
      console.log(
        r.file.padEnd(22) + r.topColors.map((c) => `${c.hex}(${pct(c.share)})`).join('  '),
      );
    }
    const all = new Map();
    for (const r of rows)
      for (const c of r.topColors) all.set(c.hex, (all.get(c.hex) || 0) + c.share);
    const pal = [...all.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
    console.log('\n===== 全集最常出现的 40 个色（权重合计）=====');
    console.log(pal.map(([h, s]) => `${h}:${s.toFixed(1)}`).join('  '));
  }

  /*
   * ── --ours：把「标准」Tab 的新图标用同一套量法测一遍，与参考集逐项对照 ──
   *
   * 判定口径（写死在这里，避免"看着差不多"）：下面每一项的差值都要在容差内。
   * 容差不是拍脑袋 —— 参考集自身就是 94 张风格有差异的图，
   * 所以量级差 ≤15%（相对）即可认为"同一套"。
   */
  if (process.argv.includes('--ours')) {
    const ours = await measureOurs();
    if (!ours.length) throw new Error('新图标渲染失败，未取到任何样本');

    const M = (rs, fn) => {
      const a = rs.map(fn).sort((x, y) => x - y);
      return a[Math.floor(a.length / 2)];
    };
    const rowsOf = [
      ['coverage 前景占比', (r) => r.coverage, 'pct'],
      ['roundRatio 圆角比', (r) => r.roundRatio, 'num'],
      ['bbox 宽', (r) => r.bboxW, 'pct'],
      ['bbox 高', (r) => r.bboxH, 'pct'],
      ['饱和度 p50', (r) => r.sat[1], 'num'],
      ['明度 p50', (r) => r.val[1], 'num'],
      // 色相档数是**离散**的（1/2/3…），用相对差会得出"−50%"这种没意义的数，故按绝对差 ±1
      ['色相档数', (r) => r.hueSpread, 'discrete'],
      ['受光坡度 顶−底', (r) => r.lumRamp, 'num'],
    ];

    console.log('\n===== 新「标准」图标 vs「图片」参考集（同口径实测）=====');
    console.log(
      '指标'.padEnd(26) +
        '参考集'.padStart(10) +
        '新图标'.padStart(10) +
        '差异'.padStart(10) +
        '  判定',
    );
    let bad = 0;
    for (const [name, fn, kind] of rowsOf) {
      const a = M(rows, fn);
      const b = M(ours, fn);
      /*
       * 判据按指标性质分三种，不是一套容差套到底：
       *   pct/num —— 相对差 ≤15%（参考集自身就是 94 张风格有差异的图，量级一致即可）
       *   近零    —— |基线| < 0.02 时改看绝对差 ≤0.02（两个接近 0 的数一比就是拿 0 当分母）
       *   离散    —— 绝对差 ≤1（色相档数只有 1/2/3，没有"百分比"可言）
       */
      let ok;
      let diff;
      if (kind === 'discrete') {
        ok = Math.abs(b - a) <= 1;
        diff = `Δ${Math.abs(b - a)}`;
      } else if (Math.abs(a) < 0.02) {
        ok = Math.abs(b - a) <= 0.02;
        diff = `Δ${Math.abs(b - a).toFixed(3)}`;
      } else {
        const rel = (b - a) / Math.abs(a);
        ok = Math.abs(rel) <= 0.15;
        diff = pct(rel);
      }
      if (!ok) bad++;
      const f = (v) => (kind === 'pct' ? pct(v) : kind === 'discrete' ? String(v) : v.toFixed(3));
      console.log(
        name.padEnd(24) +
          f(a).padStart(10) +
          f(b).padStart(10) +
          diff.padStart(10) +
          '  ' +
          (ok ? '✓' : '✗ 超差'),
      );
    }
    console.log(
      `\n判定：${bad === 0 ? '全部在 15% 容差内 → 与参考集同一套' : `${bad} 项超出容差，需调整`}`,
    );
    console.log('新图标逐个样本：');
    for (const r of ours) {
      console.log(
        '  ' +
          r.file.padEnd(18) +
          `coverage ${pct(r.coverage).padStart(6)}  圆角比 ${r.roundRatio.toFixed(3)}  ` +
          `S ${r.sat[1].toFixed(2)}  V ${r.val[1].toFixed(2)}  色相档 ${r.hueSpread}  本体高光y ${r.lightDirBodyY.toFixed(2)}`,
      );
    }
  }

  if (process.argv.includes('--json')) {
    console.log('\n===== JSON =====');
    console.log(JSON.stringify(rows));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
