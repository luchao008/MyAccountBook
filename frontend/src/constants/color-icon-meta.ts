/**
 * 彩色图标**元数据** · 由 `scripts/gen-color-icons.mjs` 生成，**请勿手改**。
 *
 * 重新生成：`node scripts/gen-color-icons.mjs`
 *
 * ⚠️ 与 `color-icons.ts` 分成两个文件是刻意的，不要合并：
 *   那个文件是 600 KB+ 的图标正文，只在真的画图标时才需要（动态 import 分包）；
 *   这个文件要**同步可用** —— `isColorIconKey()` 在渲染分支上被调用，
 *   异步会让首帧判不出该用彩色还是单色渲染器。
 */
export interface ColorIconSetMeta {
  /** 集合标识，也是图标 key 的前缀 */
  key: string;
  /** Tab 上显示的名字 */
  label: string;
  /** 该集合的 viewBox 边长（各集合不同，渲染时必须用它） */
  size: number;
  /** 该集合的图标数量（Tab 上显示，也用于自检） */
  count: number;
}

export const COLOR_ICON_SET_META: ColorIconSetMeta[] = [
  { key: "colorful", label: "多彩", size: 48, count: 329 },
  { key: "life", label: "生活", size: 128, count: 141 },
];

/** 全部彩色图标数量（Tab 名旁边与自检用） */
export const COLOR_ICON_TOTAL = 470;
