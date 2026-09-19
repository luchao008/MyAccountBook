/**
 * 由 `assets/app-icon-source.png`（AI 生成的 App 图标原图）生成：
 *
 *   frontend/src/static/app-icon.png        192×192  登录页 logo（圆角卡片，四角透明）
 *   frontend/src/static/apple-touch-icon.png 180×180  iOS「添加到主屏幕」图标（米色铺满方形）
 *
 *   node scripts/gen-app-icon.mjs
 *
 * ⚠️ **改了原图必须重跑本脚本。**
 *
 * 为什么单独一支、不复用 gen-logo.mjs：那个脚本的源是**矢量** logo.svg（渲染即可），
 * 这里的源是**位图**，需要「自动找卡片边界 → 裁切 → 圆角遮罩」三步，方法完全不同。
 *
 * 设计要点（都是实测出来的）：
 *  · **卡片边界自动探测**：原图是白底 + 米色圆角卡片。用「暖色判据」R−B ≥ 18 找出
 *    卡片像素（白底 R−B≤5、投影 R−B≤10、右下角水印 R−B≈0 全被排除），并要求
 *    **连续 3 个像素**命中才算边界 —— 单点命中多是卡片外圈的微弱光晕（实测：
 *    不要求连续时，顶部会被光晕抬低 40px，导致裁切出的卡片不是正方形）。
 *  · **圆角遮罩而不是抠白底**：卡片内部有接近白色的「笔记本纸张」，按白色抠图会在
 *    卡片上打出洞。改用几何圆角矩形遮罩，半径取卡片边长的 RADIUS_FRAC。
 *  · **apple-touch-icon 不透明**：iOS 不处理 alpha，透明区会被填成黑。且卡片自身
 *    已带圆角，若再叠 iOS 的圆角会「圆角套圆角」—— 所以把卡片四角用**卡片底色**
 *    铺满成方形，交给 iOS 自己加圆角（标准 App 图标观感）。
 *
 * ⚠️ 只写 frontend/src/static/ 下的产物，不碰 dist（构建产物）。
 * ⚠️ favicon（logo.png）**不在本脚本职责内** —— 它仍是 logo.svg 生成的金色方块，
 *    因为这张图细节多，缩到 16px 会糊成一团。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PW = '/Users/luchao/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js';
const pw = await import(PW);
const { chromium } = pw.default ?? pw;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets/app-icon-source.png');
const STATIC = path.join(ROOT, 'frontend/src/static');

/** 圆角半径 = 卡片边长 × 此系数（实测原图 ≈ 300/1464 = 0.205，取 0.2） */
const RADIUS_FRAC = 0.2;
/**
 * 暖色阈值：R−B。白底 ≤5、投影 ≤10、水印 ≈0。
 *
 * ⚠️ 取 16 是**扫出来的**：对 10/12/14/16/18/20 逐档试，只有 16 得到的
 *    外接矩形最接近正方形（1462×1464，方形度 1.001）。偏小会把卡片外圈的
 *    投影吃进来（TH=10 时 bh 虚高到 1580），偏大则漏掉卡片顶部的浅米色
 *    （TH=20 时 T 从 316 抬到 336，裁切后卡片上边被削掉一条）。
 */
const WARM = 16;

/** 与 scripts/gen-logo.mjs / verify-logo.mjs 同一套 Chrome 发现逻辑（复用，别另写一份） */
function findChrome() {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  if (!fs.existsSync(root)) throw new Error('未找到 ms-playwright 缓存目录：' + root);
  for (const d of fs.readdirSync(root).filter((x) => x.indexOf('chromium-') === 0).sort().reverse()) {
    for (const arch of ['chrome-mac-arm64', 'chrome-mac-x64']) {
      const p = `${root}/${d}/${arch}/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
      if (fs.existsSync(p)) return p;
    }
  }
  throw new Error('未找到 chromium 可执行文件');
}

if (!fs.existsSync(SRC)) {
  console.error('✗ 找不到原图：' + SRC);
  console.error('  （这是设计源文件，须入库；不是生成产物）');
  process.exit(1);
}

const b64 = fs.readFileSync(SRC).toString('base64');
const browser = await chromium.launch({ executablePath: findChrome() });
try {
  const page = await browser.newPage({ viewport: { width: 100, height: 100 } });
  await page.setContent('<img id="src" src="data:image/png;base64,' + b64 + '">');
  await page.waitForFunction(() => document.getElementById('src').complete);

  const out = await page.evaluate(
    ({ LOGIN_SIZE, APPLE_SIZE, RADIUS_FRAC, WARM }) => {
      const src = document.getElementById('src');
      const W = src.naturalWidth;
      const H = src.naturalHeight;
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const ctx = c.getContext('2d');
      ctx.drawImage(src, 0, 0);
      const d = ctx.getImageData(0, 0, W, H).data;

      /** 暖色度 R−B */
      const rb = (x, y) => {
        const p = (y * W + x) * 4;
        return d[p] - d[p + 2];
      };
      /**
       * 从 (x,y) 沿 (dx,dy) 方向找第一个「连续 3 个暖像素」的起点。
       * 要求连续是为了排除卡片外圈的微弱光晕（单点 R−B 可能偶然 ≥ 阈值）。
       */
      const firstEdge = (x0, y0, dx, dy) => {
        let x = x0;
        let y = y0;
        while (x >= 0 && y >= 0 && x < W && y < H) {
          if (rb(x, y) >= WARM && rb(x + dx, y + dy) >= WARM && rb(x + 2 * dx, y + 2 * dy) >= WARM) {
            return { x, y };
          }
          x += dx;
          y += dy;
        }
        return null;
      };
      const med = (a) => {
        const s = a.slice().sort((p, q) => p - q);
        return s[Math.floor(s.length / 2)];
      };

      // 在多条线上探测四边，取中位数
      const rows = [];
      for (let y = Math.round(H * 0.25); y <= H * 0.75; y += 40) rows.push(y);
      const cols = [];
      for (let x = Math.round(W * 0.25); x <= W * 0.75; x += 40) cols.push(x);

      const Ls = [];
      const Rs = [];
      const Ts = [];
      const Bs = [];
      for (const y of rows) {
        const l = firstEdge(0, y, 1, 0);
        const r = firstEdge(W - 1, y, -1, 0);
        if (l) Ls.push(l.x);
        if (r) Rs.push(r.x);
      }
      for (const x of cols) {
        const t = firstEdge(x, 0, 0, 1);
        const b = firstEdge(x, H - 1, 0, -1);
        if (t) Ts.push(t.y);
        if (b) Bs.push(b.y);
      }
      const L = med(Ls);
      const R = med(Rs);
      const T = med(Ts);
      const B = med(Bs);
      const bw = R - L + 1;
      const bh = B - T + 1;

      // 卡片底色：四边内缩 8% 处取平均（用于 apple 图标铺满四角）
      const at = (x, y) => {
        const p = (y * W + x) * 4;
        return [d[p], d[p + 1], d[p + 2]];
      };
      const picks = [
        [Math.round(L + bw * 0.5), Math.round(T + bh * 0.08)],
        [Math.round(L + bw * 0.5), Math.round(B - bh * 0.08)],
        [Math.round(L + bw * 0.08), Math.round(T + bh * 0.5)],
        [Math.round(R - bw * 0.08), Math.round(T + bh * 0.5)],
      ];
      const cols2 = picks.map(([x, y]) => at(x, y));
      const beige = [0, 1, 2].map((k) => Math.round(cols2.reduce((a, c2) => a + c2[k], 0) / cols2.length));

      // 裁到卡片外接矩形
      const base = document.createElement('canvas');
      base.width = bw;
      base.height = bh;
      const bctx = base.getContext('2d');
      bctx.drawImage(src, L, T, bw, bh, 0, 0, bw, bh);

      // 几何圆角遮罩：只在四角切，不动卡片内部（内部有近白纸张，抠白会打洞）
      const r = Math.min(bw, bh) * RADIUS_FRAC;
      bctx.globalCompositeOperation = 'destination-in';
      bctx.beginPath();
      bctx.moveTo(r, 0);
      bctx.lineTo(bw - r, 0);
      bctx.arcTo(bw, 0, bw, r, r);
      bctx.lineTo(bw, bh - r);
      bctx.arcTo(bw, bh, bw - r, bh, r);
      bctx.lineTo(r, bh);
      bctx.arcTo(0, bh, 0, bh - r, r);
      bctx.lineTo(0, r);
      bctx.arcTo(0, 0, r, 0, r);
      bctx.closePath();
      bctx.fill();
      bctx.globalCompositeOperation = 'source-over';

      /** 出图。fill=null → 四角透明；fill=[r,g,b] → 四角铺卡片底色 */
      const render = (size, fill) => {
        const cv = document.createElement('canvas');
        cv.width = size;
        cv.height = size;
        const cx2 = cv.getContext('2d');
        cx2.imageSmoothingQuality = 'high';
        if (fill) {
          cx2.fillStyle = 'rgb(' + fill[0] + ',' + fill[1] + ',' + fill[2] + ')';
          cx2.fillRect(0, 0, size, size);
        }
        cx2.drawImage(base, 0, 0, bw, bh, 0, 0, size, size);
        return cv.toDataURL('image/png');
      };

      return {
        bbox: { L, T, R, B, bw, bh },
        squareness: Math.round((Math.max(bw, bh) / Math.min(bw, bh)) * 1000) / 1000,
        radius: Math.round(r),
        beige,
        probes: { rows: rows.length, cols: cols.length },
        login: render(LOGIN_SIZE, null),
        apple: render(APPLE_SIZE, beige),
      };
    },
    { LOGIN_SIZE: 192, APPLE_SIZE: 180, RADIUS_FRAC, WARM }
  );

  const save = (file, dataUrl) => {
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    fs.writeFileSync(path.join(STATIC, file), buf);
    console.log('✓ ' + file + '  ' + Math.round((buf.length / 1024) * 10) / 10 + ' KB');
  };
  save('app-icon.png', out.login);
  save('apple-touch-icon.png', out.apple);

  console.log(
    '\n卡片 ' +
      out.bbox.bw +
      '×' +
      out.bbox.bh +
      ' @(' +
      out.bbox.L +
      ',' +
      out.bbox.T +
      ')  方形度 ' +
      out.squareness +
      '  圆角 ' +
      out.radius +
      'px  底色 rgb(' +
      out.beige.join(',') +
      ')'
  );
  console.log('完成。登录页用 app-icon.png；favicon（logo.png）不受影响。');
} finally {
  await browser.close();
}
