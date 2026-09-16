<template>
  <view class="ring-wrap" :style="wrapStyle">
    <svg :width="boxSizeNum" :height="boxSizeNum" :viewBox="`0 0 ${boxSizeNum} ${boxSizeNum}`">
      <!-- 底环：有扇区时是白色，扇区之间那道白缝就是它露出来的 -->
      <circle
        :cx="center"
        :cy="center"
        :r="radius"
        fill="none"
        :stroke="trackColor"
        :stroke-width="thickness"
      />
      <!-- 数据段：用 stroke-dasharray 画圆弧，旋转 -90° 让起点在 12 点方向 -->
      <circle
        v-for="(seg, index) in segments"
        :key="index"
        :cx="center"
        :cy="center"
        :r="radius"
        fill="none"
        :stroke="seg.color"
        :stroke-width="thickness"
        :stroke-dasharray="`${seg.length} ${circumference}`"
        :stroke-dashoffset="seg.offset"
        :transform="`rotate(-90 ${center} ${center})`"
        stroke-linecap="butt"
      />

      <!-- 引出线（参考图的环形图特征）：从弧外缘斜向引出，末端横一小段 -->
      <g v-if="showLabels">
        <polyline
          v-for="(lab, index) in labels"
          :key="'l' + index"
          :points="lab.line"
          fill="none"
          :stroke="lab.color"
          stroke-width="1"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </g>
    </svg>

    <!--
      引出线标注的文字必须走 **HTML 覆盖层**，不能写在 <svg> 里。

      ⚠️ 实测验出来的坑：uni-app 会把模板里的 <text> 编译成 <uni-text> 自定义元素，
         而 SVG 不认这个标签 —— 结果是**引出线画出来了、文字却完全不渲染**，
         而且不报任何错（polyline 因为不是 uni 组件，所以照常工作）。
         这类"静默空白"只能在真实浏览器里看出来，build / tsc 全绿也没用。

      定位：**相对容器中心**用 calc 计算，而不是相对 SVG 写死像素 ——
      容器宽度随屏幕变化（375 主目标 / 320 最低支持），写死像素要么在窄屏溢出
      （被 body 的 overflow-x:hidden 静默裁掉），要么在宽屏离环太远。
      容器占满父级宽度、SVG 在其中水平居中，因此「容器中心 == 环心」。
    -->
    <template v-if="showLabels">
      <view
        v-for="(lab, index) in labels"
        :key="'t' + index"
        class="ring-label"
        :class="lab.onRight ? 'right' : 'left'"
        :style="labelStyle(lab)"
      >
        <!-- 名称可截断（超长省略号）；百分比**完整**显示、不参与压缩 -->
        <text class="ring-label-name">{{ lab.name }}</text>
        <text class="ring-label-ratio">{{ lab.ratio }}%</text>
      </view>
    </template>

    <!-- 中心文案（可选，报表的环形图不展示） -->
    <view v-if="centerLabel || centerValue" class="ring-center">
      <text v-if="centerLabel" class="center-label">{{ centerLabel }}</text>
      <text v-if="centerValue" class="center-value">{{ centerValue }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 环形图（SVG 自绘，零依赖）。
 *
 * 两种展示形态：
 *   - 无标注：环形 + 下方图例（旧用法）
 *   - showLabels：**引出线标注**，分类名与占比直接标在环外（参考图的报表形态）
 *
 * ⚠️ 扇区之间的白缝不是画上去的，而是把每段圆弧各收 2px 后「露出的底环」——
 *    所以有扇区时底环必须是白色。详见 constants/chart.ts。
 */
import { computed } from 'vue';
import {
  CHART_SERIES,
  CHART_TRACK,
  CHART_TRACK_EMPTY,
  CHART_SEGMENT_GAP,
} from '@/constants/chart';

interface RingItem {
  name: string;
  value: number;
  color?: string;
}

const props = withDefaults(
  defineProps<{
    items: RingItem[];
    size?: number;
    thickness?: number;
    centerLabel?: string;
    centerValue?: string;
    palette?: string[];
    /** 是否绘制引出线标注（分类名 + 占比） */
    showLabels?: boolean;
  }>(),
  {
    size: 180,
    thickness: 24,
    centerLabel: '',
    centerValue: '',
    palette: () => [...CHART_SERIES],
    showLabels: false,
  }
);

/**
 * SVG 画布相对环直径的外扩量：只用来容纳引出线最外那段水平线。
 *
 * ⚠️ 文字是 HTML 覆盖层、不占 SVG 空间，所以这个值**只管引线**，不必为文字留位置。
 *    取 16 正好放下「环外缘 + 10px 水平段」；取大了会在环四周凭空多出一圈空白。
 */
const PAD = 16;
const boxSizeNum = computed(() => props.size + PAD * 2);
const boxSize = computed(() => `${boxSizeNum.value}px`);

/** 环心相对画布的位置 */
const center = computed(() => boxSizeNum.value / 2);
const radius = computed(() => (props.size - props.thickness) / 2);
const circumference = computed(() => 2 * Math.PI * radius.value);

/** 环外缘半径（扇区外边界） */
const outerR = computed(() => radius.value + props.thickness / 2);

/**
 * 标签起点距环心的水平距离（= 环外缘 + 引线水平段 + 间隙）。
 *
 * 这个值直接决定「名称能显示几个字」——它越小、留给文字的空间越大。
 * 实测（size 130，outerR 65，gap = 65 + 8 = 73；375px 面板宽 343、半宽 171.5）：
 *   名称可用 ≈ 171.5 − 73 − 45(百分比) − 3(间距) ≈ **50px ≈ 4 个汉字**
 * 320px 最低支持：半宽 144 − 73 = 71px → 名称约 2 字，
 * 但**百分比始终完整**（它 flex:none 不参与压缩）。
 */
const LABEL_GAP = computed(() => outerR.value + 8);

const wrapStyle = computed<Record<string, string>>(() => ({
  width: props.showLabels ? '100%' : boxSize.value,
  height: boxSize.value,
}));

const total = computed(() => props.items.reduce((sum, item) => sum + (item.value || 0), 0));

interface Segment {
  color: string;
  length: number;
  offset: number;
}

const segments = computed<Segment[]>(() => {
  if (total.value <= 0) return [];
  let acc = 0;
  const raw = props.items.map((item, index) => {
    const length = ((item.value || 0) / total.value) * circumference.value;
    const offset = -acc;
    acc += length;
    return {
      color: item.color || props.palette[index % props.palette.length],
      length,
      offset,
    };
  });
  if (raw.length < 2) return raw;
  return raw.map((s) => ({
    ...s,
    length: Math.max(s.length - CHART_SEGMENT_GAP, 0.1),
    offset: s.offset - CHART_SEGMENT_GAP / 2,
  }));
});

/**
 * 引出线标注的几何。
 *
 * 每个扇区取「中点角度」，从环外缘引一条折线到环外：
 *   起点（环外缘）→ 拐点（斜向外推 8px）→ 终点（水平段再走 14px）。
 * 文字贴在终点同侧：右半边向左延伸、左半边向右延伸（始终朝环心方向对齐）。
 */
interface Label {
  name: string;
  ratio: string;
  color: string;
  /** SVG polyline 的 points */
  line: string;
  /** 文字中心的 y（相对画布顶，画布与容器同高，故可直接用于容器定位） */
  textY: number;
  onRight: boolean;
}

const labels = computed<Label[]>(() => {
  if (!props.showLabels || total.value <= 0) return [];
  let acc = 0;
  return props.items.map((item, index) => {
    const portion = (item.value || 0) / total.value;
    // 中点角度（相对 12 点方向，顺时针），转成标准数学角（0 = 3 点方向）
    const midFrac = acc + portion / 2;
    acc += portion;
    const angle = midFrac * Math.PI * 2 - Math.PI / 2;

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const onRight = cos >= 0;

    // 起点：环外缘
    const x0 = center.value + outerR.value * cos;
    const y0 = center.value + outerR.value * sin;
    // 拐点：斜向外推 4px
    const elbowR = outerR.value + 4;
    const x1 = center.value + elbowR * cos;
    const y1 = center.value + elbowR * sin;
    // 终点：水平段再走 6px（与 LABEL_GAP 的 +8 对齐，留 2px 缝）
    const endR = outerR.value + 6;
    const x2 = center.value + (onRight ? endR : -endR);

    return {
      name: item.name,
      ratio: ((item.value / total.value) * 100).toFixed(2),
      color: item.color || props.palette[index % props.palette.length],
      line: `${x0},${y0} ${x1},${y1} ${x2},${y1}`,
      textY: y1,
      onRight,
    };
  });
});

/**
 * 标签定位。
 *
 * `max-width: calc(50% - gap)` 保证文字永不越过容器边界（容器占满父级宽度）；
 * `top: textY` + `translateY(-50%)` 让文字竖直居中在引出线终点上。
 * 左侧标签额外加 `flex-direction: row-reverse`（见样式），让名称贴环、百分比在外。
 */
function labelStyle(lab: Label): Record<string, string> {
  const gap = LABEL_GAP.value;
  const base: Record<string, string> = {
    top: `${lab.textY}px`,
    transform: 'translateY(-50%)',
    maxWidth: `calc(50% - ${gap}px)`,
  };
  if (lab.onRight) {
    base.left = `calc(50% + ${gap}px)`;
  } else {
    base.right = `calc(50% + ${gap}px)`;
  }
  return base;
}

/** 有扇区时底环必须是白色（白缝的来源）；无数据时退回浅灰，否则白环在白卡上不可见 */
const trackColor = computed(() => (segments.value.length ? CHART_TRACK : CHART_TRACK_EMPTY));
</script>

<style scoped lang="scss">
.ring-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
}

/*
 * 引出线标注的文字覆盖层。
 *
 * ⚠️ 用 `display: flex` 而不是一行纯文本：需要让**名称可压缩、百分比不可压缩** ——
 *    直接写 `{{name}} {{ratio}}%` 会让两者一起被省略号截断（变成 "60.18…"），
 *    而百分比截断比名称截断严重得多（占比是这一屏的核心信息）。
 */
.ring-label {
  position: absolute;
  display: flex;
  align-items: baseline;
  gap: 3px;
  /* 文字是覆盖层，不参与布局，也不该拦住下方内容的点击 */
  pointer-events: none;
}

.ring-label-name {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
  /* 名称可压缩：min-width:0 是 flex 子项能收缩的前提（默认 min-width:auto 不许窄于内容） */
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ring-label-ratio {
  font-size: $font-caption;
  line-height: $lh-caption;
  /* 占比绝不能用 tertiary —— 它是这一屏的核心信息，tertiary 只有 2.80:1 */
  color: $v11-text-secondary;
  /* 百分比绝不压缩、绝不换行 */
  flex: none;
  white-space: nowrap;
  @include tabular-nums;
}

.ring-center {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.center-label {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
}

.center-value {
  @include tabular-nums;
  font-size: $font-h1;
  line-height: $lh-h1;
  font-weight: $weight-semibold;
  color: $v11-text-primary;
  margin-top: 2px;
}
</style>
