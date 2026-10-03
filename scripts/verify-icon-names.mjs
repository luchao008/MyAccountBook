/**
 * 功能图标名守卫 —— 静态断言：**所有被引用的 `icon-*` 名字都真的存在于 `UI_ICONS`**。
 *
 *   node scripts/verify-icon-names.mjs            # 校验
 *   node scripts/verify-icon-names.mjs --self-test # 负向验证（注入假名字，必须报错）
 *
 * ────────────────────────────────────────────────────────────────────────
 * 为什么需要这个脚本（2026-10-03 实测事故）
 *
 * 「我的 → 收入分类管理」用了 `icon-income`，底栏「首页」用了 `icon-home` ——
 * 这两个名字**在 `UI_ICONS` 里根本不存在**。而 `resolveIconName()` 是"万能兜底"，
 * 查不到就返回 `FALLBACK_ICON = 'cat-misc'` ——
 * 于是这两处**不报错、不警告**，静静地渲染成了彩色软胶的 `cat-misc`。
 * 表现是"图标是彩色的、跟旁边不一样"，而不是"图片裂了"，
 * 所以肉眼很难归因到"名字写错了"，也没有任何校验器会红。
 *
 * ⚠️ 更坏的分支：`EMOJI_TO_UI` / `EMOJI_TO_ICON` 的**值**如果写错，
 *    `resolveIconName` 会把错值直接返回（它只查表、不校验结果），
 *    调用点再取不到 `d` → 渲染出**空 path** —— 连彩色兜底都没有，是完全看不见。
 *    所以这两张表的值也一起校验。
 *
 * 判据只有一条：**引用到的名字 ∈ UI_ICONS**。不在就 FAIL 并打印出处。
 */
import fs from 'node:fs';
import path from 'node:path';

const HERE = import.meta.dirname;
const SRC = path.join(HERE, '../frontend/src');
const ICONS_TS = path.join(SRC, 'constants/icons.ts');

const read = (p) => fs.readFileSync(p, 'utf8');

/** 从 `icons.ts` 里抽出 UI_ICONS 的 key 集合（只在 `export const UI_ICONS = {` 之后、`} as const;` 之前取） */
function collectUiIconKeys(text) {
  const start = text.indexOf('export const UI_ICONS = {');
  if (start < 0) throw new Error('icons.ts 里找不到 UI_ICONS 定义 —— 结构变了，请同步本脚本');
  const end = text.indexOf('} as const;', start);
  if (end < 0) throw new Error('UI_ICONS 的收尾 `} as const;` 找不到 —— 结构变了，请同步本脚本');
  const block = text.slice(start, end);
  const keys = new Set();
  for (const m of block.matchAll(/'((?:icon|cat)-[a-z0-9-]+)'\s*:/g)) keys.add(m[1]);
  return keys;
}

/** 抽出一张 Record 字面量的**值**（用于 EMOJI_TO_UI / EMOJI_TO_ICON 的值校验） */
function collectRecordValues(text, declName) {
  const start = text.indexOf(`export const ${declName}`);
  if (start < 0) throw new Error(`icons.ts 里找不到 ${declName} —— 结构变了，请同步本脚本`);
  const end = text.indexOf('\n};', start);
  const block = text.slice(start, end);
  const vals = [];
  for (const m of block.matchAll(/:\s*'([^']+)'/g)) vals.push(m[1]);
  return vals;
}

/**
 * 剥掉注释再扫 —— 本文件/本项目的注释里大量举例提到图标名
 * （`// 图标沿用原「统计」的 icon-chart-bar`），不剥会把"讲解"当成"引用"误报。
 * ⚠️ 行注释用 `(?<!:)` 避开 `https://` 这类 URL。
 * ⚠️ 块注释**必须用空格逐字符替换、只保留换行** —— 直接删成 '' 会把注释里的换行
 *    一起吃掉，后面所有行号整体前移，报出来的位置是错的（实测差 1 行）。
 *    行号不准 = 定位靠猜，等于把这个守卫废掉一半。
 */
function stripComments(src) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  return src
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(?<!:)\/\/[^\n]*/g, '');
}

/** 所有 *.vue / *.ts（跳过 uni_modules 与构建产物） */
function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'uni_modules' || name === 'node_modules') continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(vue|ts)$/.test(name)) out.push(p);
  }
  return out;
}

/**
 * 两处引用形态（本项目全部引用都落在这两类，实测枚举自 frontend/src）：
 *   ① 模板属性  `name="icon-x"` / `name='icon-x'` / `:name="'icon-x'"`
 *   ② 对象字面量 `icon: 'icon-x'` / `icon: "icon-x"` / `` icon: `icon-x` ``
 */
const REF_PATTERNS = [
  /:?name\s*=\s*["']icon-[a-z0-9-]+["']/g,
  /name\s*=\s*["']icon-[a-z0-9-]+["']/g,
  /icon\s*:\s*['"`]icon-[a-z0-9-]+['"`]/g,
];
const NAME_IN_REF = /['"`]((?:icon|cat)-[a-z0-9-]+)['"`]/;

function collectRefs(files) {
  const refs = [];
  for (const file of files) {
    const lines = stripComments(read(file)).split('\n');
    lines.forEach((line, i) => {
      for (const re of REF_PATTERNS) {
        re.lastIndex = 0;
        const hits = line.match(re);
        if (!hits) continue;
        for (const h of hits) {
          const m = h.match(NAME_IN_REF);
          if (m) refs.push({ file: path.relative(HERE, file), line: i + 1, name: m[1] });
        }
        break; // 一行命中一种形态即可，避免同一处被两条正则重复计
      }
    });
  }
  return refs;
}

// ── 收数据 ────────────────────────────────────────────────────────────────
const iconsText = read(ICONS_TS);
const uiKeys = collectUiIconKeys(iconsText);
const files = walk(SRC);
const refs = collectRefs(files);

const emojiUiVals = collectRecordValues(iconsText, 'EMOJI_TO_UI');
const emojiCatVals = collectRecordValues(iconsText, 'EMOJI_TO_ICON');

// 分类图标名从 category-icons.ts 读（形态：`'cat-housing': art({`）
const catArt = read(path.join(SRC, 'constants/category-icons.ts'));
const catKeys = new Set(
  [...catArt.matchAll(/^\s*'(cat-[a-z0-9-]+)':\s*art\(/gm)].map((m) => m[1]),
);
if (catKeys.size === 0) throw new Error('category-icons.ts 里一个 cat-* 都没抽到 —— 结构变了，请同步本脚本');

// ── 自检（负向验证）────────────────────────────────────────────────────────
if (process.argv.includes('--self-test')) {
  const ghost = 'icon-__ghost__';
  const fake = { file: '(self-test)', line: 0, name: ghost };
  const missed = [fake, ...refs].filter((r) => !uiKeys.has(r.name) && !catKeys.has(r.name));
  if (missed.length === 0) {
    console.error('❌ 负向验证失败：注入了一个不存在的图标名，脚本却没报错 —— 判据失效');
    process.exit(1);
  }
  console.log(`✅ 负向验证通过：注入 ${ghost} 后脚本能报错（判据确实会红）`);
  process.exit(0);
}

// ── 判据 ──────────────────────────────────────────────────────────────────
const bad = refs.filter((r) => !uiKeys.has(r.name) && !catKeys.has(r.name));
const badEmojiUi = emojiUiVals.filter((v) => !uiKeys.has(v) && !catKeys.has(v));
const badEmojiCat = emojiCatVals.filter((v) => !catKeys.has(v));

const uniq = new Set(refs.map((r) => r.name));
const usedUi = [...uniq].filter((n) => uiKeys.has(n)).length;

console.log('功能图标名守卫');
console.log(`  扫描文件        ${files.length}`);
console.log(`  引用处          ${refs.length}（唯一名字 ${uniq.size}，其中命中 UI_ICONS ${usedUi}）`);
console.log(`  UI_ICONS 数量   ${uiKeys.size}`);
console.log(`  CATEGORY 数量   ${catKeys.size}`);
console.log(`  表值校验        EMOJI_TO_UI ${emojiUiVals.length} 项 / EMOJI_TO_ICON ${emojiCatVals.length} 项`);

let failed = 0;
if (bad.length) {
  failed++;
  console.error(`\n❌ ${bad.length} 处引用了不存在的图标名（会静默回退成彩色兜底 cat-misc）：`);
  for (const b of bad) console.error(`   ${b.file}:${b.line}  ${b.name}`);
}
if (badEmojiUi.length) {
  failed++;
  console.error(`\n❌ EMOJI_TO_UI 的值不在 UI_ICONS 里（会渲染成空 path，完全看不见）：`);
  for (const v of [...new Set(badEmojiUi)]) console.error(`   ${v}`);
}
if (badEmojiCat.length) {
  failed++;
  console.error(`\n❌ EMOJI_TO_ICON 的值不是分类图标名：`);
  for (const v of [...new Set(badEmojiCat)]) console.error(`   ${v}`);
}

if (failed) {
  console.error('\nFAIL —— 把上面这些名字补进 frontend/src/constants/icons.ts 的 UI_ICONS，或改正引用处。');
  process.exit(1);
}
console.log('\n✅ 全部引用都能解析到真实图标，无静默兜底。');
