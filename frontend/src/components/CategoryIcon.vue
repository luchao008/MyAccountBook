<template>
  <!--
    三个渲染器按 `icon` 值的形态分流，顺序有讲究：
    图片图标必须排最前 —— `img:` key 也含冒号，先判形态才不会被误放进彩色分支的判定。
  -->
  <image v-if="imgSrc" class="image-icon" :src="imgSrc" :style="imgStyle" mode="aspectFit" />
  <!-- 彩色图标：颜色写死在 SVG 里，要保住彩色 -->
  <ColorIcon v-else-if="useColor" :name="name" :size="size" />
  <!-- 其余一律交给 SvgIcon：它已兼容单色 key 与 emoji，解析收敛在 resolveIconName 一处 -->
  <SvgIcon v-else :name="name" :size="size" />
</template>

<script setup lang="ts">
/**
 * 分类图标：**按 icon 值自动选渲染器**。
 *
 * 分类的 `icon` 字段现在有四种可能的值，调用点不该各自判断：
 *   1. 图片图标 key（`img:午餐`）→ `<image>`（静态 PNG，按需 HTTP 加载；2026-09-19 新增）
 *   2. 彩色图标 key（`colorful:about`）→ `ColorIcon`（多色，保留原色）
 *   3. 单色图标 key（`cat-food` / `icon-tag`）→ `SvgIcon`（跟随 `currentColor`）
 *   4. emoji（历史数据）→ 也由 `SvgIcon` 兜住（它内部调用 `resolveIconName`）
 *
 * 四种情况收敛在这一个组件里，是为了避免"某个页面漏判一种 → 显示白块"。
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
 *    本组件顺带承担"触发加载"的职责：页面里出现**非图片图标**的实例时，分包才会被拉起
 *    （图片图标不吃彩色分包，见 onMounted 的注释）。
 */
import { computed, onMounted } from 'vue';
import ColorIcon from '@/components/ColorIcon.vue';
import SvgIcon from '@/components/SvgIcon.vue';
import { colorIconsReady, getColorIcon, isColorIconKey, loadColorIcons } from '@/utils/colorIcon';
import { catIconSrc, isCatIconKey } from '@/utils/catIcon';

const props = withDefaults(
  defineProps<{
    name?: string | null;
    size?: number;
    /**
     * 图片图标（`img:`）的额外倍率，默认 1（即与 `size` 同尺寸）。
     *
     * 为什么单独给图片图标一个倍率：图片图标是**位图插画**，细节比 emoji / 单色图标多，
     * 同样尺寸下观感偏小。图标选择器与分类管理页希望它们更大
     * （2026-09-19 luchao 要求这两页的图片图标翻倍）。
     * 不做成"全局放大"，是因为其余页面（首页/流水/日历）的图标尺寸是跟着行高排版的，
     * 整体变大反而挤。
     */
    imageScale?: number;
  }>(),
  { name: '', size: 24, imageScale: 1 }
);

/** 图片图标（`img:<分类名>`）的静态资源地址；非图片 key 为空串（走后面的分支） */
const imgSrc = computed(() => (isCatIconKey(props.name) ? catIconSrc(props.name as string) : ''));
/** 图片图标的实际渲染边长 = size × imageScale（见 imageScale 的说明） */
const imgSize = computed(() => Math.round(props.size * props.imageScale));
/** 图片要显式给宽高：uni-app 的 `<image>` 默认 320×240，不给尺寸会被撑开 */
const imgStyle = computed(() => ({ width: `${imgSize.value}px`, height: `${imgSize.value}px` }));

onMounted(() => {
  /*
   * 幂等：多个实例只会真正发起一次请求。
   * ⚠️ 图片图标**不需要**彩色分包 —— 分类默认图标大多是 `img:` 后，
   *    若不跳过，含分类图标的每一页（首页/流水/日历…）都会白白拉那 212 KB。
   *    同一页里只要有一个"非图片图标"的实例，分包照样会被拉起。
   */
  if (!imgSrc.value) void loadColorIcons();
});

const useColor = computed(() => {
  // ① 形态判定（同步）。数据未就绪时先按彩色渲染 —— 尺寸是对的，内容待分包到达后填入
  if (!isColorIconKey(props.name)) return false;
  if (!colorIconsReady.value) return true;
  // ② 复核：索引里真的查得到才继续用彩色，否则退回单色（避免空白）
  return !!getColorIcon(props.name);
});
</script>

<style scoped lang="scss">
/*
 * 图片图标：与 SvgIcon / ColorIcon 同一条约定 —— 不参与文字排版、不继承字号。
 * `<image>` 是 uni-app 组件（H5 下渲染为 uni-image > img），宽高由行内样式给定。
 */
.image-icon {
  display: block;
  flex: none;
  vertical-align: middle;
}
</style>
