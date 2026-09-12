<template>
  <view class="ring-wrap" :style="{ width: size + 'px', height: size + 'px' }">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`">
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
    </svg>

    <!-- 中心文案 -->
    <view class="ring-center">
      <text class="center-label">{{ centerLabel }}</text>
      <text class="center-value">{{ centerValue }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
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
  }>(),
  {
    size: 180,
    thickness: 24,
    centerLabel: '',
    centerValue: '',
    palette: () => [...CHART_SERIES],
  }
);

const center = computed(() => props.size / 2);
const radius = computed(() => (props.size - props.thickness) / 2);
const circumference = computed(() => 2 * Math.PI * radius.value);

const total = computed(() => props.items.reduce((sum, item) => sum + (item.value || 0), 0));

interface Segment {
  color: string;
  length: number;
  offset: number;
}

/**
 * 把每个分类换算成一段圆弧。
 * stroke-dasharray 只画 length 长度，剩余留白；
 * stroke-dashoffset 为负表示沿着圆周向后偏移（顺时针推进）。
 *
 * 留白：每段两端各收 CHART_SEGMENT_GAP / 2，露出的**底环**就是相邻扇区之间的白缝。
 * 纯色相区分对红绿色盲用户是不够的（旧调色板实测有低到 17.1 的色对），
 * 物理隔开才是真正的兜底手段 —— 见方案 §2.7「配套硬要求」第 1 条。
 * （注：文档给的 `stroke="#FFFFFF" stroke-width="2"` 写法实测无效，原因见
 *   constants/chart.ts 里 CHART_SEGMENT_GAP 的注释。）
 */
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
  // 只有一段时整圈没有相邻边界，留缝反而会多出一道豁口
  if (raw.length < 2) return raw;
  return raw.map((s) => ({
    ...s,
    length: Math.max(s.length - CHART_SEGMENT_GAP, 0.1),
    offset: s.offset - CHART_SEGMENT_GAP / 2,
  }));
});

/** 有扇区时底环必须是白色（白缝的来源）；无数据时退回浅灰，否则白环在白卡上不可见 */
const trackColor = computed(() => (segments.value.length ? CHART_TRACK : CHART_TRACK_EMPTY));
</script>

<style scoped lang="scss">
.ring-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
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
  color: $text-tertiary;
}

.center-value {
  @include tabular-nums;
  font-size: $font-h1;
  line-height: $lh-h1;
  font-weight: $weight-semibold;
  color: $text-primary;
  margin-top: 2px;
}
</style>
