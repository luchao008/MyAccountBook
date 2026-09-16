<template>
  <view v-if="visible" class="mask" @click="close">
    <view class="sheet" @click.stop>
      <view class="header">
        <text class="title">选择时间</text>
        <view class="close" @click="close"><SvgIcon name="icon-close" :size="20" /></view>
      </view>

      <!-- 粒度切换：月 / 年 -->
      <view class="mode-switch">
        <view
          class="mode-item"
          :class="{ active: mode === 'month' }"
          @click="switchMode('month')"
        >
          <text class="mode-text">月</text>
        </view>
        <view
          class="mode-item"
          :class="{ active: mode === 'year' }"
          @click="switchMode('year')"
        >
          <text class="mode-text">年</text>
        </view>
      </view>

      <!-- 年模式：仅一列年份 -->
      <picker-view v-if="mode === 'year'" class="wheel" :value="yearWheelValue" @change="onYearWheelChange">
        <picker-view-column>
          <view v-for="y in years" :key="'y' + y" class="wheel-item">{{ y }} 年</view>
        </picker-view-column>
      </picker-view>

      <!-- 月模式：年 + 月两列 -->
      <picker-view v-else class="wheel" :value="monthWheelValue" @change="onMonthWheelChange">
        <picker-view-column>
          <view v-for="y in years" :key="'y' + y" class="wheel-item">{{ y }} 年</view>
        </picker-view-column>
        <picker-view-column>
          <view v-for="m in 12" :key="'m' + m" class="wheel-item">{{ m }} 月</view>
        </picker-view-column>
      </picker-view>

      <view class="confirm" @click="confirm">
        <text class="confirm-text">确定</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 报表时段选择弹窗（年 / 年月 双模式）。
 *
 * 与 DateTimePicker 的区别：那个选「某一天 + 时刻」，这个只选「年」或「年-月」，
 * 且多了一个粒度切换开关 —— 粒度直接决定报表要按整年还是单月聚合，
 * 所以确认时把 period 与 granularity 一起抛给调用方。
 *
 * ⚠️ picker-view 的 value 是「下标数组」而非值本身，两列/一列时下标含义不同，
 *    所以 yearWheelValue / monthWheelValue 必须分别维护（合成一个会在切模式时错位）。
 */
import SvgIcon from '@/components/SvgIcon.vue';
import { ref, computed, watch } from 'vue';

const props = defineProps<{
  visible: boolean;
  /** 当前时段：'2026'（年）或 '2026-09'（年月） */
  period: string;
  /** 当前粒度 */
  granularity: 'year' | 'month';
}>();

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  (e: 'confirm', payload: { period: string; granularity: 'year' | 'month' }): void;
}>();

/** 可选年份范围：当前年前后各 5 年 */
const NOW_YEAR = new Date().getFullYear();
const years = Array.from({ length: 11 }, (_, i) => NOW_YEAR - 5 + i);

const mode = ref<'year' | 'month'>('month');
const yearIndex = ref(0);
const monthIndex = ref(0);

/** 年模式：单列 → [年下标] */
const yearWheelValue = computed(() => [yearIndex.value]);
/** 月模式：两列 → [年下标, 月下标] */
const monthWheelValue = computed(() => [yearIndex.value, monthIndex.value]);

/** 打开时用外部 period 回填，避免每次打开都停在默认值 */
watch(
  () => props.visible,
  (v) => {
    if (!v) return;
    mode.value = props.granularity;
    const [y, m] = props.period.split('-');
    const yi = years.indexOf(Number(y));
    yearIndex.value = yi >= 0 ? yi : years.indexOf(NOW_YEAR);
    monthIndex.value = m ? Number(m) - 1 : new Date().getMonth();
  }
);

function switchMode(next: 'year' | 'month') {
  mode.value = next;
}

function onYearWheelChange(e: any) {
  yearIndex.value = e.detail.value[0];
}

function onMonthWheelChange(e: any) {
  yearIndex.value = e.detail.value[0];
  monthIndex.value = e.detail.value[1];
}

function confirm() {
  const y = years[yearIndex.value];
  const period =
    mode.value === 'year'
      ? `${y}`
      : `${y}-${String(monthIndex.value + 1).padStart(2, '0')}`;
  emit('confirm', { period, granularity: mode.value });
  close();
}

function close() {
  emit('update:visible', false);
}
</script>

<style scoped lang="scss">
.mask {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: $bg-mask;
  z-index: 1000;
  display: flex;
  align-items: flex-end;
}

.sheet {
  width: 100%;
  background: $v11-bg-card;
  border-radius: $v11-radius-sheet-top $v11-radius-sheet-top 0 0;
  padding-bottom: env(safe-area-inset-bottom);
}

.header {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: $space-4;
}

.title {
  font-size: $font-h2;
  line-height: $lh-h2;
  font-weight: $weight-semibold;
  color: $v11-text-primary;
}

.close {
  position: absolute;
  right: $space-4;
  width: $touch-target-min;
  height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $v11-text-secondary;
}

.mode-switch {
  display: flex;
  gap: $space-3;
  padding: 0 $space-4 $space-3;
}

.mode-item {
  flex: 1;
  /* 44px 行盒：粒度切换是主操作，用满触控建议值 */
  min-height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $v11-bg-inset;
  border-radius: $radius-md;
}

.mode-item.active {
  background: $v11-gold-soft;
}

.mode-text {
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-secondary;
}

.mode-item.active .mode-text {
  color: $v11-gold;
  font-weight: $weight-semibold;
}

.wheel {
  height: 200px;
}

.wheel-item {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: $font-h1;
  line-height: $lh-h1;
  color: $v11-text-primary;
}

.confirm {
  margin: $space-4;
  min-height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $v11-gold;
  border-radius: $v11-radius-btn;
}

.confirm-text {
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  font-weight: $weight-medium;
  color: $text-inverse;
}
</style>
