<template>
  <!-- 彩色图标：颜色写死在 SVG 里，要保住彩色 -->
  <ColorIcon v-if="isColor" :name="name" :size="size" />
  <!-- 其余一律交给 SvgIcon：它已兼容单色 key 与 emoji，解析收敛在 resolveIconName 一处 -->
  <SvgIcon v-else :name="name" :size="size" />
</template>

<script setup lang="ts">
/**
 * 分类图标：**按 icon 值自动选渲染器**。
 *
 * 分类的 `icon` 字段现在有三种可能的值，调用点不该各自判断：
 *   1. 彩色图标 key（`colorful:about`）→ `ColorIcon`（多色，保留原色）
 *   2. 单色图标 key（`cat-food` / `icon-tag`）→ `SvgIcon`（跟随 `currentColor`）
 *   3. emoji（历史数据）→ 也由 `SvgIcon` 兜住（它内部调用 `resolveIconName`）
 *
 * 三种情况收敛在这一个组件里，是为了避免"某个页面漏判一种 → 显示白块"。
 * 这种漏判极难在自查时发现，因为每一页单独看都"正常"。
 */
import { computed } from 'vue';
import ColorIcon from '@/components/ColorIcon.vue';
import SvgIcon from '@/components/SvgIcon.vue';
import { isColorIconKey } from '@/utils/colorIcon';

const props = withDefaults(
  defineProps<{
    name?: string | null;
    size?: number;
  }>(),
  { name: '', size: 24 }
);

const isColor = computed(() => isColorIconKey(props.name));
</script>
