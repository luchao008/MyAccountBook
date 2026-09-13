<template>
  <svg
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
 * 几何图标组件（设计文档 `docs/UI设计方案·扁平化.md` §5）。
 *
 * 规格：24×24 网格 / 1.75px 描边 / round cap+join / 单色 currentColor。
 *
 * 三条使用约定：
 *
 * 1. **颜色由外层决定**。组件内部不写颜色，一律 `currentColor` ——
 *    这正是换掉 emoji 的核心收益：图标能跟随选中态、禁用态、深色模式变化。
 *    外部设置父元素的 `color` 即可。
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

const props = withDefaults(
  defineProps<{
    /** 图标名（`icon-*` / `cat-*`），兼容 emoji 与空值 */
    name?: string | null;
    /** 显示尺寸，px。必须取图标阶梯上的值 */
    size?: number;
    /** 描边宽度，24 网格下的设计值是 1.75 */
    stroke?: number;
  }>(),
  { name: '', size: 24, stroke: 1.75 }
);

const ui = UI_ICONS as unknown as Record<string, string>;
const cat = CATEGORY_ICONS as unknown as Record<string, string>;

const d = computed(() => {
  const n = resolveIconName(props.name);
  return ui[n] ?? cat[n] ?? '';
});

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
