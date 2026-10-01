#!/usr/bin/env node
/**
 * 预压缩静态产物：为 nginx 的 `gzip_static on` 生成同目录的 `.gz`。
 *
 *   node scripts/precompress.mjs
 *
 * ── 为什么要有这个脚本 ───────────────────────────────────────────────
 * nginx 的 `gzip on` 是**每次请求现场压**：CPU 换带宽。产物是静态的、构建一次
 * 部署多次，所以更划算的做法是构建时压一次、请求时直接吐 `.gz`
 * （`gzip_static on`）。运行时 CPU 归零，压缩级别还能拉满（离线压不怕慢）。
 *
 * 两者是**叠加**关系，不是二选一：`gzip_static on` 找不到对应 `.gz` 时
 * 会自动回落到 `gzip on` 现场压。所以这份脚本漏压了某个文件也不会出事，
 * 只是那个文件走动态压缩。见 `deploy/nginx.conf` 里两个指令并存的原因。
 *
 * ── 设计决定 ────────────────────────────────────────────────────────
 * 1. **只压文本类扩展名**（白名单，不是黑名单）。
 *    PNG / WebP / WOFF2 / ICO 这些本身已是压缩格式，再 gzip 纯属浪费
 *    CPU 和时间，产物还几乎不缩。
 *
 *    `static/cat-icons/` 下的图标就是典型：**两套都不压**，各有各的原因 ——
 *      · `.png`（小程序 / App 用）：160×160 插画，单张约 25 KB，gzip 压不动；
 *      · `.webp`（H5 用）：本身已经是压缩格式，gzip 更压不动。
 *    这类"图太大"的问题**不是靠压缩解决的**：H5 端已改成加载 WebP
 *    （94 张 1.884 MB → 0.186 MB，省 90%；见 scripts/gen-cat-icons.mjs 与
 *    frontend/src/utils/catIcon.ts 的平台分支），而这份脚本只负责把
 *    **能压的文本**压掉。别指望它去动图片。
 *
 * 2. **小于 MIN_SIZE 的文件不压**。
 *    几百字节的文件 gzip 后往往只小几十字节，而 HTTP 头 + .gz 的额外
 *    文件系统开销基本把这几十字节吃回去。阈值与 nginx 的 gzip_min_length 对齐。
 *
 * 3. **保留原始文件**。`.gz` 是额外产物，不是替换品：
 *    nginx 只在客户端声明 `Accept-Encoding: gzip` 时用 `.gz`，
 *    否则回落到原文件。所以两个文件必须都在。
 *
 * 4. **增量**：`.gz` 比源文件新就跳过。重复跑这个脚本只扫描、不重压，
 *    在 `build-and-export.sh` 里每次都调也不会拖慢构建。
 *
 * 5. **Dockerfile 不用改**。两个 Dockerfile 都是整目录 `COPY`，
 *    `.gz` 会被一起带进镜像。
 */

import { gzipSync } from 'node:zlib';
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 要处理的产物目录（与 deploy/build-and-export.sh 的构建顺序对应） */
const TARGETS = [
  { name: 'App 前端', dir: join(ROOT, 'frontend/dist/build/h5') },
  { name: '中台前端', dir: join(ROOT, 'admin-web/apps/web-antd/dist') },
];

/**
 * 值得 gzip 的扩展名（白名单）。
 *
 * 刻意**不含** .png / .jpg / .webp / .ico / .woff2 —— 见文件头「设计决定 1」。
 * `.map` 也收：sourcemap 体积大且压缩率极高，出错排查时才拉，压了不亏。
 */
const COMPRESSIBLE = new Set([
  '.js',
  '.mjs',
  '.css',
  '.html',
  '.json',
  '.svg',
  '.txt',
  '.xml',
  '.map',
  '.webmanifest',
]);

/** 小于这个字节数不压（与 nginx `gzip_min_length 1024` 对齐） */
const MIN_SIZE = 1024;

/** 压缩级别：9 = 最高。离线压，慢一点无所谓 */
const GZIP_LEVEL = 9;

/**
 * 递归收集目录下所有文件。
 *
 * ⚠️ 跳过 `node_modules`：中台是 pnpm workspace，万一产物目录被误配成上层目录，
 *    递归下去会压掉整棵依赖树、几万个文件 —— 宁可少压也不要这种意外。
 */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/** 人类可读体积 */
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

/**
 * 处理一个产物目录，返回统计。
 *
 * 返回 { compressed, skippedFresh, skippedType, skippedSmall, rawBytes, gzBytes }
 */
function compressTarget(dir) {
  const stat = { compressed: 0, skippedFresh: 0, skippedType: 0, skippedSmall: 0, rawBytes: 0, gzBytes: 0 };

  if (!existsSync(dir)) {
    return { ...stat, missing: true };
  }

  for (const file of walk(dir)) {
    const ext = extname(file).toLowerCase();

    // 已经是压缩格式，或不是我们要管的类型
    if (!COMPRESSIBLE.has(ext)) {
      stat.skippedType++;
      continue;
    }

    const srcStat = statSync(file);
    if (srcStat.size < MIN_SIZE) {
      stat.skippedSmall++;
      continue;
    }

    const gzPath = `${file}.gz`;

    // 增量：.gz 存在且不比源文件旧 → 跳过（重复调用几乎零成本）
    if (existsSync(gzPath) && statSync(gzPath).mtimeMs >= srcStat.mtimeMs) {
      stat.skippedFresh++;
      continue;
    }

    // mtime 归零：同样内容压出来的 .gz 字节完全一致，
    // 便于比对两次构建的产物差异（否则光是时间戳不同就会让文件看起来变了）。
    const gz = gzipSync(readFileSync(file), { level: GZIP_LEVEL, mtime: 0 });
    writeFileSync(gzPath, gz);

    stat.compressed++;
    stat.rawBytes += srcStat.size;
    stat.gzBytes += gz.length;
  }

  return stat;
}

// ── 主流程 ──────────────────────────────────────────────────────────

let totalRaw = 0;
let totalGz = 0;
let totalFiles = 0;
let anyMissing = false;

for (const target of TARGETS) {
  const stat = compressTarget(target.dir);

  if (stat.missing) {
    anyMissing = true;
    console.log(`⚠️  ${target.name}：产物目录不存在，跳过 → ${relative(ROOT, target.dir)}`);
    continue;
  }

  totalRaw += stat.rawBytes;
  totalGz += stat.gzBytes;
  totalFiles += stat.compressed;

  const ratio = stat.rawBytes > 0 ? (1 - stat.gzBytes / stat.rawBytes) * 100 : 0;
  const parts = [`新压 ${stat.compressed} 个`];
  if (stat.skippedFresh) parts.push(`已是最新 ${stat.skippedFresh} 个`);
  if (stat.skippedSmall) parts.push(`过小跳过 ${stat.skippedSmall} 个`);
  if (stat.skippedType) parts.push(`非文本跳过 ${stat.skippedType} 个`);

  console.log(
    `✓ ${target.name}：${parts.join('，')}` +
      // ⚠️ 分隔符用普通空格 + 竖线，不要用全角空格（U+3000）：
      //    仓库的 eslint 开了 no-irregular-whitespace，全角空格会直接报错。
      (stat.compressed > 0 ? ` | ${kb(stat.rawBytes)} → ${kb(stat.gzBytes)}（省 ${ratio.toFixed(0)}%）` : '')
  );
}

console.log('');
if (totalFiles > 0) {
  const ratio = (1 - totalGz / totalRaw) * 100;
  console.log(`预压缩完成：新增 ${totalFiles} 个 .gz，${kb(totalRaw)} → ${kb(totalGz)}（省 ${ratio.toFixed(0)}%）`);
} else {
  console.log('预压缩完成：没有需要新压的文件（产物未变，全部命中增量跳过）。');
}

if (anyMissing) {
  console.log('');
  console.log('提示：有产物目录不存在。首次请先在对应子项目里构建（见 deploy/build-and-export.sh）。');
}

// 缺产物不算失败：本脚本可能被单独调用（例如只重建了其中一个前端）。
