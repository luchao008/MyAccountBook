<template>
  <!--
    两套画法按解析出来的名字分流（见文件头）：
      · 分类图标（`cat-*`）→ 彩色软胶正文，颜色写死在 SVG 里，`viewBox` 用自己的边长
      · 功能图标（`icon-*`）→ 单色线性，颜色由 `currentColor` 决定
    顺序有讲究：先判彩色，否则会落到底下的线性分支，渲染出一个空的 path（不报错、只是看不见）。
  -->
  <svg
    v-if="art"
    class="svg-icon"
    :width="px"
    :height="px"
    :viewBox="`0 0 ${art.box} ${art.box}`"
    aria-hidden="true"
    v-html="art.body"
  />
  <svg
    v-else
    class="svg-icon"
    :width="px"
    :height="px"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="d" />
  </svg>
</template>

<script setup lang="ts">
/**
 * 图标组件 —— **两套画法**，按解析出来的名字自动分流。
 *
 * | 名字 | 画法 | 颜色 |
 * |---|---|---|
 * | `icon-*`（功能图标：箭头、按钮、状态） | 24 网格 / 1.75px 描边 / round cap+join / 纯线性 | `currentColor`，**由外层决定** |
 * | `cat-*`（分类图标） | 48 网格 / 彩色软胶渐变 / 多色填充 | **写死在正文里**，不受 `currentColor` 影响 |
 *
 * 为什么合成一个组件而不是分两个：分流依据是"解析出来的名字"，而解析本身收敛在
 * `resolveIconName` 一处 —— 拆成两个组件就等于让每个调用点自己判断该用哪个，
 * 那正是"某处漏判 → 白块/花块"的来源（`CategoryIcon` 头部已记过同类教训）。
 *
 * 三条使用约定：
 *
 * 1. **`icon-*` 的颜色由外层决定**。组件内部不写颜色，一律 `currentColor` ——
 *    这正是换掉 emoji 的核心收益：图标能跟随选中态、禁用态、深色模式变化。
 *    外部设置父元素的 `color` 即可。
 *    ⚠️ 但 `cat-*` **不再遵守这条**：2026-10-01 起分类图标改绘为彩色软胶，
 *       颜色写死在 `category-icons.ts` 里。需要跟随文字色的场景请改用 `icon-*`。
 *
 * 2. **`size` 必须取图标阶梯上的值**（12 / 14 / 16 / 20 / 24 / 28 / 48 / 64，见 tokens.scss 的 `$icon-*`）。
 *    图标尺寸与字号阶梯**刻意解耦** —— 这是 emoji 事故的根治办法：
 *    emoji 是"字"，会跟着系统字号一起放大；图标是"图"，不该跟着文字缩放。
 *
 * 3. **`name` 可以是图标名、emoji 或空值**。解析收敛在 `resolveIconName` 一处，
 *    所以调用点不需要判类型，也不会出现"某处漏判 → 白块"。
 *
 * ⚠️ 目标端是 H5：这里用的是原生 `<svg>`，浏览器原生支持。
 *    若将来要上小程序（不支持内联 svg 标签），需要在本组件内按 `process.env.UNI_PLATFORM`
 *    分支降级为 base64 data-uri 的 background-image，**而不是分叉出第二套图标文件**。
 */
import { computed } from 'vue';
import { UI_ICONS, CATEGORY_ICONS, resolveIconName } from '@/constants/icons';
import type { CategoryIconArt } from '@/constants/category-icons';

const props = withDefaults(
  defineProps<{
    /** 图标名（`icon-*` / `cat-*`），兼容 emoji 与空值 */
    name?: string | null;
    /** 显示尺寸，px。必须取图标阶梯上的值 */
    size?: number;
    /** 描边宽度，24 网格下的设计值是 1.75（**只对 `icon-*` 生效**，分类图标没有描边） */
    stroke?: number;
  }>(),
  { name: '', size: 24, stroke: 1.75 },
);

const ui = UI_ICONS as unknown as Record<string, string>;
const cat = CATEGORY_ICONS as unknown as Record<string, CategoryIconArt>;

/** 解析收敛在 `resolveIconName` 一处（它保证任何输入都有图标名，含兜底） */
const resolved = computed(() => resolveIconName(props.name));

/**
 * 分类图标的彩色正文。
 * 取不到（即解析结果是 `icon-*`）就返回 undefined，走下面的线性分支。
 */
const art = computed<CategoryIconArt | undefined>(() => cat[resolved.value]);

/** 只在走线性分支时才需要 `d`；彩色分支不读它 */
const d = computed(() => (art.value ? '' : (ui[resolved.value] ?? '')));

const px = computed(() => `${props.size}px`);
</script>

<style scoped lang="scss">
.svg-icon {
  display: block;
  flex: none;
  /* 图标不参与文字排版：不继承字号，也不受行高影响 */
  vertical-align: middle;
}
</style>
