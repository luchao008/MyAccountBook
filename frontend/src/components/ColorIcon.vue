<template>
  <svg
    class="color-icon"
    :width="px"
    :height="px"
    :viewBox="`0 0 ${box} ${box}`"
    aria-hidden="true"
    v-html="body"
  />
</template>

<script setup lang="ts">
/**
 * 彩色图标组件（与 `SvgIcon` 并列的第二套图标渲染）。
 *
 * 分工：
 *   `SvgIcon`    —— 单色界面图标，颜色由 `currentColor` 决定，能跟随选中/禁用/主题色；
 *   `ColorIcon`  —— 多色图标（分类图标选择器里可选的那些），**颜色写死在 SVG 里**，
 *                   不受外部 `color` 影响。
 *
 * 所以两者不能互相替代：界面图标必须用 `SvgIcon`（要能变色），
 * 用户挑的分类图标用本组件（要保住彩色）。
 *
 * ⚠️ 各图标集的 viewBox 边长不同（flat-color-icons 48、noto 128），
 *    必须按 key 取对应的边长，不能统一写 24 —— 否则图标会被裁切或缩得很小。
 *
 * ⚠️ `v-html` 渲染的是**内置的图标数据**（构建期由 `scripts/gen-color-icons.mjs` 生成），
 *    不含任何用户输入，因此没有 XSS 面。
 */
import { computed } from 'vue';
import { colorIconsReady, getColorIcon } from '@/utils/colorIcon';

const props = withDefaults(
  defineProps<{
    /** 彩色图标 key，形如 `colorful:about` / `life:cat` */
    name?: string | null;
    /** 显示尺寸，px。取图标阶梯上的值 */
    size?: number;
  }>(),
  { name: '', size: 24 }
);

/**
 * ⚠️ 必须显式依赖 `colorIconsReady`。
 *
 * 索引是普通 `Map`（非响应式），而图标正文是**动态 import 分包**拉取的。
 * 只写 `getColorIcon(props.name)` 的话：首帧拿到 null → 缓存住空字符串 →
 * 分包下载完成后**不会重算** → 图标永远空白（且不报错）。
 * 先读一次 `colorIconsReady.value` 就把这条依赖建上了。
 */
const icon = computed(() => {
  if (!colorIconsReady.value) return null;
  return getColorIcon(props.name);
});

const body = computed(() => icon.value?.body ?? '');

/** 该图标集自己的 viewBox 边长 */
const box = computed(() => icon.value?.size ?? 24);

const px = computed(() => `${props.size}px`);
</script>

<style scoped lang="scss">
.color-icon {
  display: block;
  /* 图标不参与文字排版：不继承字号，也不受行高影响（与 SvgIcon 同一约定） */
  flex: none;
  vertical-align: middle;
}
</style>
