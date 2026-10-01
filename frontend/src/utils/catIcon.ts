/**
 * 分类图片图标（`img:<分类名>`）的 key 解析与路径生成。
 *
 * 与 `utils/colorIcon.ts` 并列——两套图标集的取数方式不同：
 *   · 彩色图标（`colorful:` / `life:`）：正文 600 KB+，动态 import 分包，**异步**就绪；
 *   · 图片图标（`img:`）：静态图片走 `static/` 目录按需 HTTP 加载
 *     （H5 用 `.webp`、小程序/App 用 `.png`，切法见 `catIconSrc()`），
 *     名字清单（94 个）是同步可用的，所以这里可以**精确校验**名字是否存在。
 *
 * ⚠️ 判定必须精确（查名字表），不能像彩色图标那样"只认前缀"：
 *    彩色 key 取不到数据时会退回单色渲染（有兜底），而图片 key 拼错时
 *    `<image>` 只会安静地 404 显示空白。宁可判为"不是图片图标"→ 退回单色渲染。
 *
 * ⚠️ key 与文件基名是**两套**：key 用中文分类名（`img:午餐`，存库、可读），
 *    文件基名用拼音（`wucan`，扩展名按平台拼，见 `catIconSrc()`）—— uni-app H5
 *    dev server 不解码 URL，中文名文件在开发环境 404（详见 `scripts/gen-cat-icons.mjs`
 *    头部）。映射（分类名 → 不带扩展名的基名）在生成物里。
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

/** 图片图标 key 的静态资源路径（扩展名按平台拼）；名字不在清单里时返回空串（调用方先过 isCatIconKey 就不会走到） */
export function catIconSrc(name: string): string {
  const file = CAT_ICON_FILES[catIconName(name)];
  if (!file) return '';

  /*
   * ⚠️ `CAT_ICON_FILES` 的值是**不带扩展名的基名**（`"wucan"`，不是 `"wucan.png"`）——
   *   因为扩展名要按平台拼，由这里决定。
   *
   * 为什么扩展名也分平台：两套资源是**等价**的（`static/cat-icons/` 下每组图标
   *   同时有 `<基名>.png` 与 `<基名>.webp`），H5 用 WebP 能省 ~88.6% 体积；
   *   但**无法离线确认微信小程序对"包内本地 webp"的支持**（`<image>` 加载包内文件
   *   走的是各端原生实现，不是浏览器内核），一旦不支持就是安静地显示空白。
   *   所以只在能确认的 H5 上用 WebP，小程序/App 继续用 PNG。
   */
  let src = '';

  // #ifdef H5
  /*
   * H5：`/static/cat-icons/wucan.webp?v=1a2b3c4d`
   *
   * 为什么加版本号：部署侧给 `/static/cat-icons/` 加了一年长缓存（`immutable`），
   *   而这些图标的**基名是拼音、不带内容 hash** —— 文件名不变，浏览器/CDN 就永远
   *   拿老图。带上随目录内容变化的版本号后，换图标 → 版本号变 → URL 变 → 长缓存
   *   自动失效，不用手动刷 CDN。版本号怎么算见 `vite.config.ts` 的 `catIconVersion()`，
   *   类型声明在 `src/env.d.ts`。（算法覆盖目录下**全部**文件，PNG 与 WebP 都在内。）
   */
  src = `/static/cat-icons/${file}.webp?v=${__CAT_ICON_VERSION__}`;
  // #endif

  // #ifndef H5
  /*
   * 小程序 / App / 支付宝…：`/static/cat-icons/wucan.png`，**不带 query**。
   *
   * ⚠️ 为什么**其它端绝对不能加**：这些端把 `/static/xxx.png` 当作**包内本地文件
   *   路径**解析，query 不是合法路径的一部分，带上去很可能直接加载失败
   *   （`<image>` 安静地显示空白，很难查）。所以用 uni-app 条件编译按平台切分：
   *   小程序/App 那条分支里**根本不出现** query。
   *   （小程序的图标随代码包一起发版，本来也不存在长缓存问题，无需版本号。）
   */
  src = `/static/cat-icons/${file}.png`;
  // #endif

  /*
   * ⚠️ 写法上为什么是「`let src` + 条件编译赋值」，而不是把两段 `return` 各包一层
   *   `#ifdef`：`vue-tsc` 跑的是**没经过 uni-app 预处理的源码**，两个 `return` 它都
   *   看得见，会报"return 之后还有代码"（不可达代码）；赋值写法预处理前后都是合法
   *   语句，类型检查与各端产物都干净。条件编译注释在普通 `.ts`（非模板）里同样由
   *   uni-app 编译器处理（`.ts` 在 preJs 的处理范围 `EXTNAME_JS` 内）。
   *
   * ⚠️ **所有分支都必定有确定的返回值**，这一点靠两段条件编译**互补且互斥**保证
   *   （`#ifdef H5` + `#ifndef H5`，合起来覆盖全部平台）：
   *     · 未预处理（`vue-tsc` 看到的源码）：两段都保留 → `src` 被连续赋值两次，
   *       最终绝不为空串；
   *     · 预处理后（任一平台）：恰好留下其中一段 → `src` 必定被赋值。
   *   不存在"两段都没跑到、返回初始空串"的平台。
   *   ⚠️ 改这段时**别把 `#ifndef H5` 换成 `#ifdef MP-WEIXIN` 这类白名单**：
   *   那样 App / 支付宝端就落进初始空串，图标全白。保持"H5 一条 + 其余一条"。
   */
  return src;
}
