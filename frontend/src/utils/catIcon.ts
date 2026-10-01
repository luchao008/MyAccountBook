/**
 * 分类图片图标（`img:<分类名>`）的 key 解析与路径生成。
 *
 * 与 `utils/colorIcon.ts` 并列——两套图标集的取数方式不同：
 *   · 彩色图标（`colorful:` / `life:`）：正文 600 KB+，动态 import 分包，**异步**就绪；
 *   · 图片图标（`img:`）：静态 PNG 走 `static/` 目录按需 HTTP 加载，名字清单（75 个）
 *     是同步可用的，所以这里可以**精确校验**名字是否存在。
 *
 * ⚠️ 判定必须精确（查名字表），不能像彩色图标那样"只认前缀"：
 *    彩色 key 取不到数据时会退回单色渲染（有兜底），而图片 key 拼错时
 *    `<image>` 只会安静地 404 显示空白。宁可判为"不是图片图标"→ 退回单色渲染。
 *
 * ⚠️ key 与文件名是**两套**：key 用中文分类名（`img:午餐`，存库、可读），
 *    文件名用拼音（`wucan.png`）—— uni-app H5 dev server 不解码 URL，中文名文件
 *    在开发环境 404（详见 `scripts/gen-cat-icons.mjs` 头部）。映射在生成物里。
 */
import { CAT_ICON_FILES, CAT_ICON_NAMES } from '@/constants/cat-icons';

/** 集合名（key 前缀），与彩色图标的 `colorful` / `life` 同构 */
export const CAT_ICON_SET = 'img';

const NAME_SET = new Set(CAT_ICON_NAMES);

/** 是不是图片图标 key（`img:<分类名>`，且分类名在清单里） */
export function isCatIconKey(name?: string | null): boolean {
  if (typeof name !== 'string' || !name.startsWith(`${CAT_ICON_SET}:`)) return false;
  return NAME_SET.has(name.slice(CAT_ICON_SET.length + 1));
}

/** 从 key 里取分类名（不校验存在性，调用方负责先过 isCatIconKey） */
export function catIconName(name: string): string {
  return name.slice(CAT_ICON_SET.length + 1);
}

/** 分类名 → 图片图标 key（`img:<分类名>`） */
export function catIconKey(name: string): string {
  return `${CAT_ICON_SET}:${name}`;
}

/** 图片图标 key 的静态资源路径；名字不在清单里时返回空串（调用方先过 isCatIconKey 就不会走到） */
export function catIconSrc(name: string): string {
  const file = CAT_ICON_FILES[catIconName(name)];
  if (!file) return '';

  let suffix = '';

  // #ifdef H5
  /*
   * H5 端加构建版本号：`/static/cat-icons/wucan.png?v=1a2b3c4d`。
   *
   * 为什么只有 H5 要加：部署侧给 `/static/cat-icons/` 加了一年长缓存
   *   （`immutable`），而这些 PNG 文件名是拼音、**不带内容 hash** ——
   *   文件名不变，浏览器/CDN 就永远拿老图。带上随目录内容变化的版本号后，
   *   换图标 → 版本号变 → URL 变 → 长缓存自动失效，不用手动刷 CDN。
   *   版本号怎么算见 `vite.config.ts` 的 `catIconVersion()`，类型声明在 `src/env.d.ts`。
   *
   * ⚠️ 为什么**其它端绝对不能加**（微信小程序 / App / 支付宝…）：
   *   这些端把 `/static/xxx.png` 当作**包内本地文件路径**解析，query 不是合法路径的
   *   一部分，带上去很可能直接加载失败（`<image>` 安静地显示空白，很难查）。
   *   所以用 uni-app 条件编译按平台切分：小程序/App 那条分支里**根本不出现** query。
   *   （小程序的图标随代码包一起发版，本来也不存在长缓存问题，无需版本号。）
   *
   * ⚠️ 写法上为什么是「`let suffix` + 条件编译赋值」，而不是把两段 `return` 各包一层
   *   `#ifdef`：`vue-tsc` 跑的是**没经过 uni-app 预处理的源码**，两个 `return` 它都看得见，
   *   会报"return 之后还有代码"（不可达代码）；赋值写法预处理前后都是合法语句，
   *   类型检查与小程序的产物都干净。条件编译注释在普通 `.ts`（非模板）里同样由
   *   uni-app 编译器处理（`.ts` 在 preJs 的处理范围 `EXTNAME_JS` 内）。
   */
  suffix = `?v=${__CAT_ICON_VERSION__}`;
  // #endif

  return `/static/cat-icons/${file}${suffix}`;
}
