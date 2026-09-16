/**
 * 由 `frontend/src/static/logo.svg` 生成 favicon / 登录页用的 PNG。
 *
 *   node scripts/gen-logo.mjs
 *
 * 产出：
 *   frontend/src/static/logo.png      192×192  （favicon + 登录页共用）
 *   frontend/src/static/logo-512.png  512×512
 *
 * ⚠️ **改完 logo.svg 必须重跑本脚本。**
 *    只改 SVG 不重跑，页面显示的还是旧颜色 PNG，而源文件已经是新的 ——
 *    下一个人排查时会怀疑是自己看错了。2026-09-16 v1.1 把品牌橙 #CF4A12
 *    改成主色金 #A85F12 时，本仓库里原本**没有**生成脚本（PNG 是一次性产物），
 *    所以补了这一支，让「改源 → 出图」变成可复现的两步。
 *
 * ⚠️ 只写 `src/static/` 下这两个文件，不碰 dist（那是构建产物）。
 * ⚠️ 用 omitBackground 输出**透明背景** —— SVG 里那个圆角方块的四个圆角之外
 *    必须是透明的，否则 favicon 会变成一块方形的白底。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PW = '/Users/luchao/.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js';
const pw = await import(PW);
const { chromium } = pw.default ?? pw;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = path.join(ROOT, 'frontend/src/static');
const SVG = path.join(STATIC, 'logo.svg');

const TARGETS = [
  { file: 'logo.png', size: 192 },
  { file: 'logo-512.png', size: 512 },
];

/** 与 scripts/verify-logo.mjs 同一套 Chrome 发现逻辑（复用，别另写一份） */
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

const svg = fs.readFileSync(SVG, 'utf8');

// 颜色自检：源文件里的品牌色必须与 v1.1 主色金一致，避免「改了注释忘了改 fill」
const BRAND = '#A85F12';
if (svg.indexOf(BRAND) < 0) {
  console.error(`✗ logo.svg 里没有找到 v1.1 主色金 ${BRAND} —— 请先改 fill 再重跑`);
  process.exit(1);
}
if (/fill="#CF4A12"/i.test(svg)) {
  console.error('✗ logo.svg 里仍残留旧品牌橙 #CF4A12 —— 只改了注释没改 fill');
  process.exit(1);
}

const browser = await chromium.launch({ executablePath: findChrome() });
try {
  for (const { file, size } of TARGETS) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<style>html,body{margin:0;padding:0;background:transparent}
       svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
      { waitUntil: 'load' }
    );
    const out = path.join(STATIC, file);
    await page.screenshot({ path: out, omitBackground: true });
    await page.close();
    const quote = (n) => Math.round((n / 1024) * 10) / 10;
    console.log(`✓ ${file}  ${size}×${size}  ${quote(fs.statSync(out).size)} KB`);
  }
} finally {
  await browser.close();
}

console.log('\n完成。favicon（index.html）与登录页共用 logo.png，无需额外改动。');
