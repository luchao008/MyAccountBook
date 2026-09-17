<template>
  <!-- 彩色图标：颜色写死在 SVG 里，要保住彩色 -->
  <ColorIcon v-if="useColor" :name="name" :size="size" />
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
 *
 * ⚠️ 2026-09-16 阶段 5：彩色图标正文改为**动态 import 分包**
 *    （此前是静态 import，导致首屏必须下载 600 KB / gzip 212 KB，
 *      而绝大部分图标用户一辈子用不到 —— 只有图标选择器会全量展示）。
 *    代价是"索引不再随模块加载就绪"，所以这里多了一层**复核**：
 *      ① 先按**形态**判定（`<集合>:<名字>`）—— 同步，首帧就能定下渲染器；
 *      ② 数据到位后再查一次索引，**取不到就退回单色渲染**。
 *    少了第 ② 步，一个陈旧 / 拼错的彩色 key 会渲染成**空白**（不报错、只是看不见）。
 *
 *    本组件顺带承担"触发加载"的职责：任何页面只要画分类图标，分包就会被拉起。
 */
import { computed, onMounted } from 'vue';
import ColorIcon from '@/components/ColorIcon.vue';
import SvgIcon from '@/components/SvgIcon.vue';
import { colorIconsReady, getColorIcon, isColorIconKey, loadColorIcons } from '@/utils/colorIcon';

const props = withDefaults(
  defineProps<{
    name?: string | null;
    size?: number;
  }>(),
  { name: '', size: 24 }
);

onMounted(() => {
  // 幂等：多个实例只会真正发起一次请求
  void loadColorIcons();
});

const useColor = computed(() => {
  // ① 形态判定（同步）。数据未就绪时先按彩色渲染 —— 尺寸是对的，内容待分包到达后填入
  if (!isColorIconKey(props.name)) return false;
  if (!colorIconsReady.value) return true;
  // ② 复核：索引里真的查得到才继续用彩色，否则退回单色（避免空白）
  return !!getColorIcon(props.name);
});
</script>
