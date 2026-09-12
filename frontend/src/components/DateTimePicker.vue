<template>
  <view v-if="visible" class="mask" @click="close">
    <view class="sheet" @click.stop>
      <view class="header">
        <text />
        <text class="done" @click="confirm">完成</text>
      </view>

      <!-- 日历 -->
      <view class="cal">
        <view class="cal-header">
          <text class="cal-nav" @click="shiftMonth(-1)">‹</text>
          <text class="cal-title">{{ viewYear }} 年 {{ viewMonth + 1 }} 月</text>
          <text class="cal-nav" @click="shiftMonth(1)">›</text>
        </view>

        <view class="week-row">
          <text v-for="w in weekLabels" :key="w" class="week-label">{{ w }}</text>
        </view>

        <view class="day-grid">
          <view v-for="(d, i) in cells" :key="i" class="day-cell">
            <view
              v-if="d"
              class="day"
              :class="{
                today: isToday(d) && !isSelected(d),
                selected: isSelected(d),
              }"
              @click="select(d)"
            >
              <text class="day-text">{{ isToday(d) && !isSelected(d) ? '今' : d }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 时刻开关 -->
      <view class="time-row">
        <text class="time-label">时刻</text>
        <switch :checked="timeEnabled" color="#CF4A12" @change="onTimeSwitch" />
      </view>

      <!-- 时分滚轮 -->
      <picker-view
        v-if="timeEnabled"
        class="wheel"
        :value="wheelValue"
        @change="onWheelChange"
      >
        <picker-view-column>
          <view v-for="h in 24" :key="'h' + h" class="wheel-item">{{ pad(h - 1) }}</view>
        </picker-view-column>
        <picker-view-column>
          <view v-for="m in 60" :key="'m' + m" class="wheel-item">{{ pad(m - 1) }}</view>
        </picker-view-column>
      </picker-view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

const weekLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const props = defineProps<{
  visible: boolean;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm 或 null（未记录时刻） */
  time: string | null;
}>();

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  /** 确认时一次性带回日期与时刻 */
  (e: 'confirm', payload: { date: string; time: string | null }): void;
}>();

/** 日历当前展示的年月（month 为 0-based） */
const viewYear = ref(2026);
const viewMonth = ref(0);
const selectedDate = ref('');

const timeEnabled = ref(false);
const hour = ref(0);
const minute = ref(0);
/** picker-view 的受控值 [时下标, 分下标] */
const wheelValue = ref([0, 0]);

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateStr(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

/** 日历格子：前置空白补齐到周日起始，再排当月天数 */
const cells = computed<(number | null)[]>(() => {
  const first = new Date(viewYear.value, viewMonth.value, 1);
  const startWeek = first.getDay();
  const days = new Date(viewYear.value, viewMonth.value + 1, 0).getDate();
  const arr: (number | null)[] = Array.from({ length: startWeek }, () => null);
  for (let d = 1; d <= days; d++) arr.push(d);
  return arr;
});

function isToday(d: number): boolean {
  return dateStr(viewYear.value, viewMonth.value, d) === todayStr();
}

function isSelected(d: number): boolean {
  return dateStr(viewYear.value, viewMonth.value, d) === selectedDate.value;
}

function select(d: number) {
  selectedDate.value = dateStr(viewYear.value, viewMonth.value, d);
}

function shiftMonth(delta: number) {
  const next = new Date(viewYear.value, viewMonth.value + delta, 1);
  viewYear.value = next.getFullYear();
  viewMonth.value = next.getMonth();
}

function onTimeSwitch(e: any) {
  timeEnabled.value = !!e.detail.value;
  // 打开时默认落在当前时间，少滚一下
  if (timeEnabled.value) {
    const now = new Date();
    hour.value = now.getHours();
    minute.value = now.getMinutes();
    wheelValue.value = [hour.value, minute.value];
  }
}

function onWheelChange(e: any) {
  const [h, m] = e.detail.value;
  hour.value = h;
  minute.value = m;
}

function confirm() {
  emit('confirm', {
    date: selectedDate.value,
    time: timeEnabled.value ? `${pad(hour.value)}:${pad(minute.value)}` : null,
  });
  emit('update:visible', false);
}

function close() {
  emit('update:visible', false);
}

/** 打开时用外部值初始化日历与时刻 */
watch(
  () => props.visible,
  (v) => {
    if (!v) return;

    const parts = (props.date || '').split('-').map(Number);
    if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
      viewYear.value = parts[0];
      viewMonth.value = parts[1] - 1;
      selectedDate.value = props.date;
    } else {
      const now = new Date();
      viewYear.value = now.getFullYear();
      viewMonth.value = now.getMonth();
      selectedDate.value = todayStr();
    }

    timeEnabled.value = !!props.time;
    if (props.time) {
      const [h, m] = props.time.split(':').map(Number);
      hour.value = h;
      minute.value = m;
    } else {
      const now = new Date();
      hour.value = now.getHours();
      minute.value = now.getMinutes();
    }
    wheelValue.value = [hour.value, minute.value];
  },
  { immediate: true },
);
</script>

<style scoped lang="scss">
.mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 1200;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.sheet {
  background: $bg-card;
  border-radius: 16px 16px 0 0;
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
}

.header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 14px 20px 6px;
}

.done {
  font-size: $font-body;
  line-height: $lh-body;
  color: $brand-700;
  font-weight: $weight-medium;
  /* 24px 行盒 + 上下各 10px = 44（原 padding: 4px 8px 只有 32） */
  padding: 10px 12px;
}

/* ===== 日历 ===== */
.cal {
  padding: 0 12px;
}

.cal-header {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 0;
}

.cal-nav {
  /* 44×44：翻月是日历里唯一的高频点击目标 */
  width: $touch-target-min;
  text-align: center;
  font-size: $icon-lg;
  color: $text-tertiary;
  padding: 10px 0;
}

.cal-title {
  min-width: 130px;
  text-align: center;
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  font-weight: $weight-semibold;
  color: $text-primary;
}

.week-row {
  display: flex;
  margin-top: 4px;
}

.week-label {
  flex: 1;
  text-align: center;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-tertiary;
}

.day-grid {
  display: flex;
  flex-wrap: wrap;
}

.day-cell {
  width: calc(100% / 7);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 5px 0;
}

.day {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.day:active {
  background: $bg-subtle;
}

.day-text {
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-primary;
}

/* 今天：橙色圆底白字（未选中时） */
.today {
  background: $brand-100;
}

.today .day-text {
  color: $brand-800;
}

/* 选中：实心橙 */
.selected {
  background: $brand-600;
  box-shadow: 0 2px 8px $shadow-brand-soft;
}

.selected .day-text {
  color: $text-inverse;
  font-weight: $weight-semibold;
}

/* ===== 时刻 ===== */
.time-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid $divider;
  margin-top: 8px;
}

.time-label {
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-primary;
}

.wheel {
  height: 180px;
}

.wheel-item {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: $font-h1;
  line-height: $lh-h1;
  color: $text-primary;
}
</style>
