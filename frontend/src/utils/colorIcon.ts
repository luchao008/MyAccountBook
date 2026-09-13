/**
 * 彩色图标的查找入口。
 *
 * 数据本身在 `constants/color-icons.ts`（由 `scripts/gen-color-icons.mjs` 生成）。
 * 这里只做**一次建索引 + 查询**，不重复存数据。
 *
 * 为什么单独放一个文件而不写进生成物：生成物是"数据"，随时可能被重新生成覆盖；
 * 查询逻辑是"代码"，不该跟着一起被覆盖掉。
 */
import { COLOR_ICON_SETS } from '@/constants/color-icons';

/** key → { body, size }。各图标集的 viewBox 边长不同，必须连尺寸一起记住 */
const INDEX = new Map<string, { body: string; size: number }>();

for (const set of COLOR_ICON_SETS) {
  for (const [key, body] of Object.entries(set.icons)) {
    INDEX.set(key, { body, size: set.size });
  }
}

/** 全部可选彩色图标的 key（顺序即生成顺序，Tab 内展示直接用它） */
export const COLOR_ICON_KEYS: string[] = [...INDEX.keys()];

/** 某个集合下的 key（菜单按 Tab 展示时用） */
export function colorIconKeysOf(setKey: string): string[] {
  return COLOR_ICON_KEYS.filter((k) => k.startsWith(`${setKey}:`));
}

/**
 * 是不是彩色图标的 key。
 *
 * 判定依据是"在索引里查得到"，而不是"含不含冒号" ——
 * 后者会把将来可能出现的其它带冒号的值误判成图标 key。
 */
export function isColorIconKey(name?: string | null): boolean {
  return !!name && INDEX.has(name);
}

/** 取图标的 SVG body 与其 viewBox 边长 */
export function getColorIcon(name?: string | null) {
  if (!name) return null;
  return INDEX.get(name) ?? null;
}
