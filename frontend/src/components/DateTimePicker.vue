<template>
  <view v-if="visible" class="mask" @click="close">
    <view class="sheet" @click.stop>
      <view class="header">
        <text />
        <text class="done" @click="confirm">完成</text>
      </view>

      <!-- ===== 日期面板：日历在上，「时刻」行在下 ===== -->
      <view v-if="panel === 'date'" class="panel">
        <view class="cal">
          <view class="cal-header">
            <view class="cal-nav" @click="shiftMonth(-1)"><SvgIcon name="icon-chevron-left" :size="20" /></view>
            <view class="cal-title" @click="toggleMonthPicker">
              <text class="cal-title-text">{{ viewYear }} 年 {{ viewMonth + 1 }} 月</text>
              <SvgIcon
                class="cal-title-caret"
                :name="showMonthPicker ? 'icon-chevron-up' : 'icon-chevron-down'"
                :size="16"
              />
            </view>
            <view class="cal-nav" @click="shiftMonth(1)"><SvgIcon name="icon-chevron-right" :size="20" /></view>
          </view>

          <!-- 年月快速选择 -->
          <view v-if="showMonthPicker" class="month-picker">
            <picker-view class="wheel" :value="monthWheelValue" @change="onMonthWheelChange">
              <picker-view-column>
                <view v-for="y in years" :key="'y' + y" class="wheel-item">{{ y }} 年</view>
              </picker-view-column>
              <picker-view-column>
                <view v-for="m in 12" :key="'m' + m" class="wheel-item">{{ m }} 月</view>
              </picker-view-column>
            </picker-view>
            <view class="confirm" @click="confirmMonthPicker">
              <text class="confirm-text">确定</text>
            </view>
          </view>

          <!-- 日历网格：swiper 支持手指左右滑动切月 -->
          <view v-else class="cal-grid">
            <view class="week-row">
              <text v-for="w in weekLabels" :key="w" class="week-label">{{ w }}</text>
            </view>
            <swiper
              class="month-swiper"
              :current="swiperIndex"
              :duration="swiperDuration"
              @change="onSwipe"
              @animationfinish="onSwipeFinish"
            >
              <swiper-item v-for="(m, i) in swiperMonths" :key="i">
                <view v-if="m" class="day-grid">
                  <view v-for="(d, j) in monthCells(m.year, m.month)" :key="j" class="day-cell">
                    <view
                      v-if="d"
                      class="day"
                      :class="{
                        today: isTodayOf(m.year, m.month, d) && !isSelectedOf(m.year, m.month, d),
                        selected: isSelectedOf(m.year, m.month, d),
                      }"
                      @click="selectOf(m.year, m.month, d)"
                    >
                      <text class="day-text">{{
                        isTodayOf(m.year, m.month, d) && !isSelectedOf(m.year, m.month, d) ? '今' : d
                      }}</text>
                    </view>
                  </view>
                </view>
              </swiper-item>
            </swiper>
          </view>
        </view>

        <!-- 时刻行（在日历下方；年月滚轮展开时隐藏） -->
        <view v-if="!showMonthPicker" class="row" @click="onTimeRowClick">
          <text class="row-label">时刻</text>
          <view class="row-right">
            <text v-if="timeEnabled" class="row-value">{{ timeText }}</text>
            <view class="switch-wrap" @click.stop>
              <switch :checked="timeEnabled" color="#CF4A12" @change="onTimeSwitch" />
            </view>
          </view>
        </view>
      </view>

      <!-- ===== 时刻面板：日期行 + 时刻行 + 时分滚轮在下 ===== -->
      <view v-else class="panel">
        <view class="row" @click="onDateRowClick">
          <text class="row-label">日期</text>
          <view class="row-right">
            <text class="row-value">{{ dateText }}</text>
            <SvgIcon class="row-arrow" name="icon-chevron-right" :size="16" />
          </view>
        </view>
        <view class="row" @click="onTimeRowClick">
          <text class="row-label">时刻</text>
          <view class="row-right">
            <text class="row-value">{{ timeText }}</text>
            <view class="switch-wrap" @click.stop>
              <switch :checked="timeEnabled" color="#CF4A12" @change="onTimeSwitch" />
            </view>
          </view>
        </view>
        <picker-view class="wheel" :value="wheelValue" @change="onWheelChange">
          <picker-view-column>
            <view v-for="h in 24" :key="'h' + h" class="wheel-item">{{ pad(h - 1) }}</view>
          </picker-view-column>
          <picker-view-column>
            <view v-for="m in 60" :key="'m' + m" class="wheel-item">{{ pad(m - 1) }}</view>
          </picker-view-column>
        </picker-view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import SvgIcon from '@/components/SvgIcon.vue';
import { ref, computed, watch, nextTick } from 'vue';

const weekLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const dowNames = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

/** swiper 切月动画时长（ms） */
const SWIPE_MS = 240;

/** 可选年份：2000 ~ 当前年 + 5（记账常要补录历史） */
const MIN_YEAR = 2000;
const MAX_YEAR = new Date().getFullYear() + 5;

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

/** 时刻开关：是否记录时刻 */
const timeEnabled = ref(false);
const hour = ref(0);
const minute = ref(0);
/** picker-view 的受控值 [时下标, 分下标] */
const wheelValue = ref([0, 0]);

/** 展开面板：date（日历在上 + 时刻行）| time（日期行 + 时刻行 + 滚轮） */
const panel = ref<'date' | 'time'>('date');

/* ===== 月份 swiper（5 item，动画结束后静默复位到中间）===== */
/** 中间 item 的下标：前后各预渲染 2 个月，共 5 屏 */
const SWIPER_CENTER = 2;
const swiperIndex = ref(SWIPER_CENTER);
/** swiper 动画时长；静默复位时临时置 0（不动画） */
const swiperDuration = ref(SWIPE_MS);
/** 动画期间忽略连点 */
const animating = ref(false);
/** 本次滑动方向（+1=下一月，-1=上一月），动画结束后据此提交年月 */
const swipeDelta = ref(0);
/** 复位过程中，避免 animationfinish 重入 */
let resetting = false;

/** 五个 item 对应的 {year, month}；越界（<2000-01 / >MAX_YEAR-12）为 null */
const swiperMonths = computed<({ year: number; month: number } | null)[]>(() => {
  const base = viewYear.value * 12 + viewMonth.value;
  return [-2, -1, 0, 1, 2].map((d) => {
    const idx = base + d;
    if (idx < MIN_YEAR * 12 || idx > MAX_YEAR * 12 + 11) return null;
    return { year: Math.floor(idx / 12), month: ((idx % 12) + 12) % 12 };
  });
});

/* ===== 年月快速选择 ===== */
const showMonthPicker = ref(false);
const years = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => MIN_YEAR + i);
const yearIndex = ref(0);
const monthIndex = ref(0);
const monthWheelValue = computed(() => [yearIndex.value, monthIndex.value]);

/** 日期摘要（如「2026年9月20日 星期日」） */
const dateText = computed(() => {
  const parts = selectedDate.value.split('-').map(Number);
  if (parts.length !== 3 || !parts.every((n) => Number.isFinite(n))) return '';
  const [y, m, d] = parts;
  const dow = new Date(y, m - 1, d).getDay();
  return y + '年' + m + '月' + d + '日 ' + dowNames[dow];
});

/** 时刻摘要（如「20:40」） */
const timeText = computed(() => pad(hour.value) + ':' + pad(minute.value));

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function todayStr(): string {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function dateStr(y: number, m: number, d: number): string {
  return y + '-' + pad(m + 1) + '-' + pad(d);
}

/** 某年月的日历格子（前置空白补齐到周日起始） */
function monthCells(y: number, m: number): (number | null)[] {
  const first = new Date(y, m, 1);
  const startWeek = first.getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const arr: (number | null)[] = Array.from({ length: startWeek }, () => null);
  for (let d = 1; d <= days; d++) arr.push(d);
  return arr;
}

function isTodayOf(y: number, m: number, d: number): boolean {
  return dateStr(y, m, d) === todayStr();
}

function isSelectedOf(y: number, m: number, d: number): boolean {
  return dateStr(y, m, d) === selectedDate.value;
}

function selectOf(y: number, m: number, d: number) {
  selectedDate.value = dateStr(y, m, d);
}

/**
 * 点箭头翻月：改 swiperIndex 触发 swiper 自身的滑动动画（与手指滑动同一套）。
 * 年月数据不在此刻提交，等动画结束后在 onSwipeFinish 里提交，
 * 否则中途改数据会让滑入的那一屏内容错位。
 */
function shiftMonth(delta: number) {
  if (animating.value) return;
  const base = viewYear.value * 12 + viewMonth.value + delta;
  if (base < MIN_YEAR * 12 || base > MAX_YEAR * 12 + 11) return;
  swipeDelta.value = delta;
  animating.value = true;
  swiperIndex.value = SWIPER_CENTER + delta;
}

/**
 * swiper change：动画开始时触发。
 * 手指滑动走这里记录方向；点箭头时已在 shiftMonth 里记过，忽略。
 */
function onSwipe(e: any) {
  const i = e.detail.current;
  if (i === SWIPER_CENTER) return;
  // 复位期间（duration=0 的静默跳转）会触发一次 change，需忽略
  if (resetting) return;
  // 记录方向（支持快速滑动一次跨多屏）；不因 animating 提前 return，
  // 否则快滑时 delta 会丢，导致复位到错误月份
  swipeDelta.value = i - SWIPER_CENTER;
  animating.value = true;
}

/**
 * swiper animationfinish：动画结束时触发。
 * 在这里提交年月，并把 swiper 静默复位到中间 item（duration=0，视觉不动）。
 */
async function onSwipeFinish(e: any) {
  if (resetting) return;
  const i = e.detail.current;
  if (i === SWIPER_CENTER) {
    animating.value = false;
    return;
  }
  // 直接由 current 算 delta，比依赖 swipeDelta 更可靠（防快滑时状态错乱）
  const d = i - SWIPER_CENTER;
  if (!d) {
    animating.value = false;
    return;
  }
  resetting = true;

  // 关键：duration=0 + 更新年月 + index 回中间，必须在同一 tick 完成 ——
  // 否则 swiper 会先按旧数据渲染一帧（滑入的月错位），再复位时闪一下。
  swiperDuration.value = 0;
  const base = viewYear.value * 12 + viewMonth.value + d;
  const clamped = Math.min(
    Math.max(base, MIN_YEAR * 12),
    MAX_YEAR * 12 + 11,
  );
  viewYear.value = Math.floor(clamped / 12);
  viewMonth.value = ((clamped % 12) + 12) % 12;
  swiperIndex.value = SWIPER_CENTER;

  await nextTick();
  swiperDuration.value = SWIPE_MS;
  swipeDelta.value = 0;
  animating.value = false;
  resetting = false;
}

/** 点日期行 → 切到日期面板（日期行消失、日历展示在上方） */
function onDateRowClick() {
  panel.value = 'date';
  showMonthPicker.value = false;
}

/** 点时刻行 → 切到时刻面板；开关未开时顺带打开 */
function onTimeRowClick() {
  if (!timeEnabled.value) {
    timeEnabled.value = true;
    const now = new Date();
    hour.value = now.getHours();
    minute.value = now.getMinutes();
    wheelValue.value = [hour.value, minute.value];
  }
  panel.value = 'time';
  showMonthPicker.value = false;
}

/** 展开/收起年月滚轮；展开时对齐当前日历正在显示的年月 */
function toggleMonthPicker() {
  if (showMonthPicker.value) {
    showMonthPicker.value = false;
    return;
  }
  const yi = years.indexOf(viewYear.value);
  yearIndex.value = yi >= 0 ? yi : years.indexOf(new Date().getFullYear());
  monthIndex.value = viewMonth.value;
  showMonthPicker.value = true;
}

function onMonthWheelChange(e: any) {
  yearIndex.value = e.detail.value[0];
  monthIndex.value = e.detail.value[1];
}

/**
 * 确认年月：只把日历翻到该年月，不选中任何日期，
 * 具体选哪天仍由用户点日历决定（年月选择只负责翻页）。
 */
function confirmMonthPicker() {
  viewYear.value = years[yearIndex.value];
  viewMonth.value = monthIndex.value;
  showMonthPicker.value = false;
  swiperIndex.value = SWIPER_CENTER;
}

/** 时刻开关：开 → 切到时刻面板；关 → 切回日期面板 */
function onTimeSwitch(e: any) {
  timeEnabled.value = !!e.detail.value;
  if (timeEnabled.value) {
    const now = new Date();
    hour.value = now.getHours();
    minute.value = now.getMinutes();
    wheelValue.value = [hour.value, minute.value];
    panel.value = 'time';
  } else {
    panel.value = 'date';
  }
  showMonthPicker.value = false;
}

function onWheelChange(e: any) {
  const [h, m] = e.detail.value;
  hour.value = h;
  minute.value = m;
}

function confirm() {
  let t: string | null = null;
  if (timeEnabled.value) t = pad(hour.value) + ':' + pad(minute.value);
  emit('confirm', { date: selectedDate.value, time: t });
  emit('update:visible', false);
}

function close() {
  emit('update:visible', false);
}

watch(
  () => props.visible,
  (v) => {
    if (!v) return;
    showMonthPicker.value = false;
    panel.value = 'date';
    animating.value = false;
    swipeDelta.value = 0;
    resetting = false;
    swiperDuration.value = SWIPE_MS;
    swiperIndex.value = SWIPER_CENTER;

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
  background: $v11-bg-card;
  border-radius: 16px 16px 0 0;
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
  height: 500px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
  color: $v11-gold;
  font-weight: $weight-medium;
  /* 24px 行盒 + 上下各 10px = 44 */
  padding: 10px 12px;
}

.panel {
  display: flex;
  flex-direction: column;
}

/* ===== 摘要行（日期 / 时刻）===== */
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  min-height: $touch-target-min;
}

.row-label {
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-secondary;
}

.row-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.row-value {
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-primary;
}

.row-arrow {
  color: $v11-text-secondary;
}

.switch-wrap {
  margin-left: 8px;
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
  width: $touch-target-min;
  min-height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $v11-text-secondary;
}

.cal-title {
  min-width: 130px;
  min-height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.cal-title-text {
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  font-weight: $weight-semibold;
  color: $v11-text-primary;
}

.cal-title-caret {
  color: $v11-text-secondary;
}

/* ===== 年月快速选择 ===== */
.month-picker {
  padding-bottom: 4px;
}

.confirm {
  margin: 12px 12px 4px;
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

/* ===== 日历网格（swiper 滑动切月）===== */
.cal-grid {
  overflow: hidden;
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
  color: $v11-text-secondary;
}

/*
 * swiper 需要固定高度。按月最多 6 行、每行 44px（34 圆 + 上下 5）算 → 264px，
 * 固定为 6 行高度，避免 4/5 行的月份切换时日历高度忽大忽小。
 */
.month-swiper {
  height: 264px;
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
  background: $v11-bg-inset;
}

.day-text {
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-primary;
}

/*
 * 今天（未选中态）：浅金底 + 深金字 + 1.5px 金色内描边。
 * 文字 #8F5312 压 #FDF6EF = 5.74:1 ✅
 * 选中态由后面的 .selected 覆盖（实心金 + 白字 4.87:1）。
 */
.today {
  background: $v11-gold-soft;
  box-shadow: inset 0 0 0 1.5px $v11-gold-fill;
}

.today .day-text {
  color: $v11-gold-pressed;
}

/* 选中：实心橙 */
.selected {
  background: $v11-gold;
  box-shadow: 0 2px 8px $v11-gold-shadow;
}

.selected .day-text {
  color: $text-inverse;
  font-weight: $weight-semibold;
}

/* ===== 时分 / 年月滚轮 ===== */
.wheel {
  height: 180px;
}

.wheel-item {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: $font-h1;
  line-height: $lh-h1;
  color: $v11-text-primary;
}
</style>
