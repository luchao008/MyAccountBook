#!/usr/bin/env node
/**
 * H5 产物体积 / 关键路径审计。
 *
 *   node scripts/audit-h5-bundle.mjs              # 只报告（永远退出码 0）
 *   node scripts/audit-h5-bundle.mjs --budget     # 按预算断言，超了退出码 1（可接 CI）
 *   node scripts/audit-h5-bundle.mjs --dir=<path> # 换产物目录
 *
 * ── 为什么要有这个脚本 ─────────────────────────────────────────────────
 * 「H5 首屏到底要下多少 KB」这件事，靠肉眼看 dist 列表是看不出来的：
 *   · 产物里有 40+ 个 chunk，体积差 100 倍，谁在关键路径上完全不体现在文件名里；
 *   · `uni_modules/**\/static/` 下的东西（如 echarts.min.js 747 KB）会进产物、
 *     进镜像、进 CDN，但**用户一次都不会请求**——只看"产物多大"会得出错误结论；
 *   · 真正的首屏成本 = index.html + 入口 module chunk + 全局 CSS，
 *     而入口 chunk 是**自包含**的（无静态 import），
 *     所以"哪个页面要下哪些 chunk"只能从 `__vite__mapDeps` 那张表里解出来。
 * 所以这里把三件事都算成数字：
 *   ① 关键路径 gz 总量；
 *   ② 每个 chunk 的 raw / gz；
 *   ③ 「必须保持懒加载」的 chunk 有没有被拉进入口页（回归守卫）。
 *
 * ── gz 口径 ───────────────────────────────────────────────────────────
 * 压缩级别刻意与 `scripts/precompress.mjs` 的 `GZIP_LEVEL = 9` 对齐 ——
 * 线上 nginx 是 `gzip_static on`，用户拿到的就是构建期压好的那份 `.gz`。
 * 用默认级别 6 算会系统性偏高，报出来的数字就对不上用户真实下载量。
 *
 * ── 断言与告警的分工 ──────────────────────────────────────────────────
 * FAIL（--budget 下退出码 1）：体积预算、懒加载回归 —— 这两类是"能力退化"，
 *   出现即说明有人把重资源拉进了首屏，必须拦。
 * WARN（从不影响退出码）：产物里的死重文件、缺 modulepreload —— 这两类有正当
 *   理由可以留着（见各项旁的注释），做成硬门只会训练人忽略它。
 *
 * ── 负向验证（2026-10-02 实测过，不是"应该能报错"）─────────────────────
 *   · 预算：`--budget --entry-budget=1` → 报「入口 chunk 超预算」、退出码 1；
 *     真实产物 `--budget` → 退出码 0。
 *   · 懒加载守卫：用一个**合成产物**跑（不是改源码重建），入口 chunk 里
 *     把 `constants-color-icons` 的下标写进 `pages-login-index` 的依赖表
 *     —— 即 2026-09-16 真发生过的那种回归 —— 报「懒加载回归」、退出码 1。
 *   · 合成产物**第一次没红**：那条 fixture 写成 `import(...),M=__vite__mapDeps(...)`，
 *     与 vite 真实产物（`import(...),__vite__mapDeps(...)`，中间无赋值）不一致 →
 *     正则没匹配上，守卫被"解不出依赖名单"的分支兜住了，报告照样说通过。
 *     两处因此改掉：① fixture 改成与真实产物同形；② 「解不出依赖名单」从 WARN
 *     升级为 FAIL —— 守卫没跑起来必须吵，否则它就是个永远绿的校验器。
 *   没验过"能报错"的校验器等于没有校验器。
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DIR = join(ROOT, 'frontend/dist/build/h5');

/* ── 参数 ── */
const argv = process.argv.slice(2);
const CHECK = argv.includes('--budget');
const dirArg = argv.find((a) => a.startsWith('--dir='));
const DIST = dirArg ? dirArg.slice('--dir='.length) : DEFAULT_DIR;
const numArg = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const v = Number(hit.slice(name.length + 3));
  return Number.isFinite(v) && v > 0 ? v * 1024 : fallback;
};

/**
 * 预算（KB）。
 *
 * ⚠️ 这些不是"理想值"，是**当前实测值 + 一成余量**，功能是"拦住恶化"而不是"追求极致"。
 *    基线（2026-10-02）：入口 103 KB / 关键路径 ~127 KB / 最大单 chunk 209 KB（懒加载）。
 *    一次正常的功能迭代通常在几 KB 量级，所以留一成不会天天红；
 *    而"有人把 600 KB 的常量文件从懒加载改成静态引入"这种事故一定会红。
 */
const BUDGET = {
  entryJsGz: numArg('entry-budget', 120 * 1024),
  criticalPathGz: numArg('critical-budget', 160 * 1024),
  singleChunkGz: numArg('chunk-budget', 140 * 1024),
};

/**
 * 必须保持「懒加载」的 chunk 名称片段。
 *
 * 判据是"是否出现在登录页 / 主页面的 `__vite__mapDeps` 里"，而不是"产物里有没有"——
 * 它们本来就该在产物里，只是不该在**进 App 就必须下**的那一组里。
 *
 * ⚠️ 这两条都是真发生过的回归：2026-09-16 之前 `color-icons` 被 15 个文件引用
 *    （含首页），首屏白下 212 KB；`TrendChart` 则是把 u-charts 拖进报表页首帧。
 */
const MUST_STAY_LAZY = ['constants-color-icons', 'components-TrendChart'];

/**
 * 被守卫的入口页 chunk 片段 —— 登录页与主页面是全 App 的前两个屏，
 * 它们下什么，用户第一眼就要等什么。
 */
const ENTRY_PAGES = ['pages-login-index', 'pages-main-index'];

/** WARN 用的死重阈值：超过它、又不在任何依赖表里，就值得看一眼 */
const DEAD_WEIGHT_BYTES = 300 * 1024;

/* ── 工具 ── */
const kb = (n) => (n / 1024).toFixed(1);
const gzSize = (buf) => gzipSync(buf, { level: 9, mtime: 0 }).length;
const read = (p) => readFileSync(p);
const gzOf = (buf) => gzSize(buf);

const fails = [];
const warns = [];
const fail = (msg) => fails.push(msg);
const warn = (msg) => warns.push(msg);

if (!existsSync(DIST)) {
  console.error(`✗ 产物目录不存在：${DIST}`);
  console.error('  先跑：cd frontend && CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build:h5');
  process.exit(1);
}

/* ==========================================================================
 * 1. 关键路径：index.html + 入口 module chunk + 全局 CSS
 * ========================================================================== */

const indexPath = join(DIST, 'index.html');
if (!existsSync(indexPath)) {
  console.error(`✗ 找不到 ${indexPath}`);
  process.exit(1);
}
const indexHtml = read(indexPath);

/**
 * 入口 chunk：`<script type="module" src="/assets/xxx.js">`。
 *
 * ⚠️ 只能取 `type="module"` 那个 —— index.html 里还有 2 个内联 `<script>`
 *    （viewport 探针、启动图移除），它们不是关键路径上的"下载"项。
 */
const entryMatch = indexHtml
  .toString()
  .match(/<script[^>]+type="module"[^>]+src="([^"]+)"/);
if (!entryMatch) {
  console.error('✗ index.html 里找不到入口 module script —— 构建形状变了，本脚本的判据要跟着改');
  process.exit(1);
}
const entryRel = entryMatch[1].replace(/^\//, '');
const entryPath = join(DIST, entryRel);
const entryBuf = read(entryPath);
const entryGz = gzOf(entryBuf);

/** index.html 里同步阻塞的样式表（`<link rel="stylesheet">`）：不下载完不渲染 */
const cssHrefs = [...indexHtml.toString().matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(
  (m) => m[1].replace(/^\//, '')
);

const critical = [
  { name: 'index.html', rel: 'index.html', buf: indexHtml },
  { name: `入口 ${entryRel.split('/').pop()}`, rel: entryRel, buf: entryBuf },
  ...cssHrefs.map((rel) => ({
    name: `全局 CSS ${rel.split('/').pop()}`,
    rel,
    buf: read(join(DIST, rel)),
  })),
];
const criticalRaw = critical.reduce((s, x) => s + x.buf.length, 0);
const criticalGz = critical.reduce((s, x) => s + gzOf(x.buf), 0);

/* ==========================================================================
 * 2. 解 `__vite__mapDeps`：Vite 把「每个懒加载 chunk + 它的静态依赖」都登记在这张表里
 *
 * 为什么必须解它：入口 chunk 是自包含的（0 条静态 import），页面靠
 * `import("./pages-X.js"), __vite__mapDeps([...])` 拉 —— 也就是说
 * "某个页面会下载哪些 chunk" 只存在于这张表的**下标数组**里，扫文件名字看不出来。
 * ========================================================================== */

const depsStr = entryBuf
  .toString()
  .match(/__vite__mapDeps\.viteFileDeps\s*=\s*(\[[\s\S]*?\])/);
if (!depsStr) {
  console.error('✗ 入口 chunk 里找不到 __vite__mapDeps.viteFileDeps —— 构建形状变了，判据要跟着改');
  process.exit(1);
}
let viteFileDeps = [];
try {
  viteFileDeps = JSON.parse(depsStr[1]);
} catch (e) {
  console.error(`✗ __vite__mapDeps.viteFileDeps 不是合法 JSON：${e.message}`);
  process.exit(1);
}

/** 解出某个页面 chunk 的依赖名单（含它自己） */
function depsOfPage(pageFragment) {
  const re = new RegExp(
    `import\\("\\./(${pageFragment}[^"]*\\.js)"\\),\\s*__vite__mapDeps\\(\\[([^\\]]*)\\]\\)`
  );
  const m = entryBuf.toString().match(re);
  if (!m) return null;
  const idx = m[2]
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n));
  return { self: m[1], deps: idx.map((i) => viteFileDeps[i]).filter(Boolean) };
}

/* ==========================================================================
 * 3. 全部 chunk 的体积表
 * ========================================================================== */

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push({ rel: p.slice(DIST.length + 1), size: st.size, path: p });
  }
  return out;
}
const allFiles = walk(DIST);
const jsChunks = allFiles.filter((f) => extname(f.rel) === '.js');

const sizes = new Map();
for (const f of jsChunks) {
  const buf = read(f.path);
  sizes.set(f.rel, { raw: buf.length, gz: gzOf(buf), buf });
}

/**
 * 被引用过的产物（用于死重判定）。
 *
 * ⚠️ **不能只看 `__vite__mapDeps`** —— 那张表只登记**入口页顶层**的 `import()`。
 *    嵌套的动态 import（`color-icons` 由 `utils/colorIcon.ts` 里 import、
 *    `TrendChart` 由 ReportView 里 import）走的是**裸 `import()`**，
 *    压根不进那张表。只按它判定的话，这两个 200 KB+ 的懒加载块会被
 *    误报成"死重" —— 而它们恰恰是"按需下载"做得最对的地方。
 *
 * 所以判据改成**产物里找不找得到这个名字**：文件名带内容 hash，全局唯一，
 * 因此"任一个文本产物里出现过它的 basename"就等价于"它被某处引用"。
 * （`static/` 下的图片是按运行时拼名字请求的，basename 不会出现在任何文本里 ——
 *   但它们单张都 < 30 KB，够不到死重阈值，不会因此误报。）
 */
const referenced = new Set([entryRel, ...cssHrefs]);
const textFiles = allFiles.filter((f) => ['.js', '.css', '.html'].includes(extname(f.rel)));
const texts = textFiles.map((f) => ({ rel: f.rel, text: read(f.path).toString() }));
for (const f of allFiles) {
  if (extname(f.rel) !== '.js') continue;
  const base = f.rel.split('/').pop();
  const hit = texts.some((t) => t.rel !== f.rel && t.text.includes(base));
  if (hit) referenced.add(f.rel);
}
/* 入口页的依赖表也显式登记一份（避免"只有 CSS 里提到"这类边界漏判） */
for (const page of ENTRY_PAGES) {
  const d = depsOfPage(page);
  if (!d) continue;
  referenced.add(`assets/${d.self}`);
  d.deps.forEach((x) => referenced.add(x));
}

/* ==========================================================================
 * 4. 断言
 * ========================================================================== */

if (entryGz > BUDGET.entryJsGz) {
  fail(
    `入口 chunk gz ${kb(entryGz)} KB 超预算 ${kb(BUDGET.entryJsGz)} KB —— ` +
      `首屏第一跳变重了（Vue + uni-h5 runtime 都在这里，正常情况下不该涨）`
  );
}
if (criticalGz > BUDGET.criticalPathGz) {
  fail(
    `关键路径 gz ${kb(criticalGz)} KB 超预算 ${kb(BUDGET.criticalPathGz)} KB ` +
      `（= index.html + 入口 chunk + ${cssHrefs.length} 个全局 CSS）`
  );
}

const heavyEager = [];
for (const page of ENTRY_PAGES) {
  const d = depsOfPage(page);
  if (!d) {
    /*
     * ⚠️ 这里必须是 FAIL 而不是 WARN。
     *
     * 判据依赖 vite 的产物形状（`import("..."),__vite__mapDeps([...])`）。
     * 一旦 vite 升级后换了写法，正则就匹配不到 —— 若此时只是打个 WARN，
     * 守卫就**静默变成一个永远绿的校验器**：报告照样说"通过"，
     * 而它其实一次都没跑。这正是本项目反复踩到的"不会红的校验器"。
     * 所以解不出来就吵：宁可让人来改判据，也不能让守卫悄悄失效。
     */
    fail(
      `解不出 ${page} 的依赖名单 —— 懒加载守卫本次**没有生效**。` +
        `大概率是 vite 产物形状变了（判据看的是 import("..."),__vite__mapDeps([...])），请更新本脚本的正则`
    );
    continue;
  }
  for (const dep of d.deps) {
    const s = sizes.get(dep);
    if (!s) continue;
    if (MUST_STAY_LAZY.some((k) => dep.includes(k))) {
      fail(
        `懒加载回归：${dep} 被 ${page} 拉进了依赖表（gz ${kb(s.gz)} KB）—— ` +
          `它必须只在用到时按需下载。检查是否有页面/组件对它们写了静态 import。`
      );
    }
    if (s.gz > BUDGET.singleChunkGz) {
      heavyEager.push({ page, dep, gz: s.gz, raw: s.raw });
    }
  }
}
for (const h of heavyEager) {
  fail(
    `首屏重块：${h.page} 依赖 ${h.dep}（gz ${kb(h.gz)} KB / raw ${kb(h.raw)} KB）` +
      `超单 chunk 预算 ${kb(BUDGET.singleChunkGz)} KB`
  );
}

/**
 * WARN：孤儿 chunk —— `assets/` 里**没有任何文本产物提到过它**的 JS。
 *
 * 判据刻意只覆盖 `assets/`（vite 产出、文件名带内容 hash）。`uni_modules/**\/static/`
 * 那种"随包发布的第三方静态资源"**不在这里判** —— 它们的引用是**运行时拼接的字符串**
 * （qiun-data-charts 就是运行时注入 `echarts.min.js`），字符串里找得到不等于真会加载，
 * 找不到也不等于没用。自动检测分不清"有路径无调用"，硬判只会制造噪音或假绿。
 * 这类文件单独在下面按体积列出来，让 luchao 每次都能看到它们的存在。
 */
const orphanChunks = allFiles
  .filter((f) => f.rel.startsWith('assets/') && extname(f.rel) === '.js' && !referenced.has(f.rel))
  .sort((a, b) => b.size - a.size);
for (const o of orphanChunks) {
  warn(`孤儿 chunk：${o.rel} ${kb(o.size)} KB —— assets/ 里没有任何产物引用它，可能是构建残留`);
}

/** INFO（不是告警）：静态资源目录里的大文件 —— 会进镜像/CDN，是否真被请求需另行确认 */
const bigStatics = allFiles
  .filter((f) => /^static\/|^uni_modules\//.test(f.rel) && f.size > DEAD_WEIGHT_BYTES)
  .sort((a, b) => b.size - a.size);

/* WARN：index.html 缺 modulepreload（建议项，不是错误） */
if (!/rel="modulepreload"/.test(indexHtml.toString())) {
  warn(
    'index.html 里没有任何 modulepreload —— 首页 chunk 只能等入口 chunk 解析完才发现并去下，' +
      '高延迟网络下多一个 RTT。属于优化项，不是缺陷（HTTP/2 下收益有限）'
  );
}

/* ==========================================================================
 * 5. 报告
 * ========================================================================== */

console.log('');
console.log('══════ H5 产物体积审计 ══════');
console.log(`产物目录：${DIST}`);
console.log('');

console.log('── 关键路径（用户首屏必须下完的）──');
for (const c of critical) {
  console.log(`  ${kb(gzOf(c.buf)).padStart(8)} KB gz  ${kb(c.buf.length).padStart(8)} KB raw   ${c.name}`);
}
console.log(`  ${'─'.repeat(46)}`);
console.log(
  `  ${kb(criticalGz).padStart(8)} KB gz  ${kb(criticalRaw).padStart(8)} KB raw   合计` +
    `（预算 ${kb(BUDGET.criticalPathGz)} KB）`
);
console.log('');

console.log('── JS chunk（按 gz 降序，前 15）──');
const ranked = [...sizes.entries()].sort((a, b) => b[1].gz - a[1].gz).slice(0, 15);
for (const [rel, s] of ranked) {
  const lazy = rel.startsWith('assets/') && !referenced.has(rel) ? '  [孤儿 chunk]' : '';
  console.log(`  ${kb(s.gz).padStart(8)} KB gz  ${kb(s.raw).padStart(8)} KB raw   ${rel}${lazy}`);
}
console.log(`  … 共 ${jsChunks.length} 个 JS chunk`);
console.log('');

if (bigStatics.length) {
  console.log('── 静态资源里的大文件（会进镜像/CDN，是否被请求需单独确认）──');
  for (const s of bigStatics) console.log(`  ${kb(s.size).padStart(8)} KB   ${s.rel}`);
  console.log('');
}

for (const w of warns) console.log(`  ⚠ WARN  ${w}`);
if (warns.length) console.log('');

if (fails.length) {
  for (const f of fails) console.log(`  ✗ FAIL  ${f}`);
  console.log('');
  console.log(`✗ ${fails.length} 项预算/守卫不通过`);
  process.exit(CHECK ? 1 : 0);
}

console.log(CHECK ? '✓ 全部预算与守卫通过' : '✓ 无 FAIL（WARN 见上）');
process.exit(0);
