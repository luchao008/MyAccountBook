<template>
  <view class="ring-wrap" :style="{ width: size + 'px', height: size + 'px' }">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`">
      <!-- 底环 -->
      <circle
        :cx="center"
        :cy="center"
        :r="radius"
        fill="none"
        stroke="#EDEFF3"
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
import { CHART_SERIES } from '@/constants/chart';

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
 */
const segments = computed<Segment[]>(() => {
  if (total.value <= 0) return [];
  let acc = 0;
  return props.items.map((item, index) => {
    const length = ((item.value || 0) / total.value) * circumference.value;
    const offset = -acc;
    acc += length;
    return {
      color: item.color || props.palette[index % props.palette.length],
      length,
      offset,
    };
  });
});
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
  font-size: 12px;
  color: $text-tertiary;
}

.center-value {
  font-size: 20px;
  font-weight: 600;
  color: $text-primary;
  margin-top: 2px;
}
</style>
