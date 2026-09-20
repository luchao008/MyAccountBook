<template>
  <view v-if="visible" class="mask" @click="close">
    <view class="sheet" @click.stop>
      <view class="header">
        <text />
        <text class="done" @click="confirm">完成</text>
      </view>

      <!-- ===== 日期面板：日历在上，「时刻」行在下 ===== -->
      <template v-if="panel === 'date'">
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

          <!-- 年月快速选择（展开时替换日历网格，底部橙色「确定」） -->
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

          <template v-else>
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
          </template>
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
      </template>

      <!-- ===== 时刻面板：日期行 + 时刻行 + 时分滚轮在下 ===== -->
      <template v-else>
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
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import SvgIcon from '@/components/SvgIcon.vue';
import { ref, computed, watch } from 'vue';

const weekLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const dowNames = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

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

/** 展开面板：'date'（日历在上 + 时刻行）| 'time'（日期行 + 时刻行 + 滚轮） */
const panel = ref<'date' | 'time'>('date');

/* ===== 年月快速选择 ===== */
const showMonthPicker = ref(false);
/** 可选年份：2000 ~ 当前年 + 5（记账常要补录历史） */
const MIN_YEAR = 2000;
const MAX_YEAR = new Date().getFullYear() + 5;
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

/** 点「日期」行 → 切到日期面板（日期行消失、日历展示在上方） */
function onDateRowClick() {
  panel.value = 'date';
  showMonthPicker.value = false;
}

/** 点「时刻」行 → 切到时刻面板；开关未开时顺带打开 */
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
 * 确认年月：只把日历翻到该年月，**不选中任何日期** ——
 * 具体选哪天仍由用户点日历决定（年月选择只负责「翻页」）。
 */
function confirmMonthPicker() {
  viewYear.value = years[yearIndex.value];
  viewMonth.value = monthIndex.value;
  showMonthPicker.value = false;
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
  /* 固定高度：切面板（日历/年月滚轮/时分滚轮）时弹窗高度不跳动 */
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
  /* 24px 行盒 + 上下各 10px = 44（原 padding: 4px 8px 只有 32） */
  padding: 10px 12px;
}

/* ===== 摘要行（日期 / 时刻）===== */
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  /* 44px 行盒：可点切换面板 */
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
  /* 44×44：翻月是日历里唯一的高频点击目标。改用 flex 居中而不是 text-align，
     因为图标是 svg 不是字，text-align 对它无效 */
  width: $touch-target-min;
  min-height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $v11-text-secondary;
}

.cal-title {
  min-width: 130px;
  /* 标题可点（展开年月滚轮），44px 行盒保证触控目标 */
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
 *
 * ⚠️ 内描边是必需的，不是装饰 —— $v11-gold-soft 压白卡只有 1.07 可见度，
 *    没有它就完全看不出这里是个圆。（这是 v1.1 调色板的已知缺口，见 tokens.scss §10）
 * 文字 #8F5312 压 #FDF6EF = 5.74:1 ✅
 * 选中态由后面的 .selected 覆盖（实心金 + 白字 4.87:1），两者可同时存在，靠源码顺序决胜。
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
