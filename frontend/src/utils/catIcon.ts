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
  return file ? `/static/cat-icons/${file}` : '';
}
