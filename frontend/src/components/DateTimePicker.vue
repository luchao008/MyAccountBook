<template>
  <!--
    ⚠️ `v-if` 只在**首次**打开时才真挂载；关掉后仅 `v-show` 隐藏，DOM 留着复用。
    挂载一次的实测成本（4x 降速）：月历 3 格 + swiper ≈ 220ms，而再次打开 ≈ 2ms ——
    日期选择器是记账时反复要用的东西，第二次之后必须是无感的。
    （隐藏期间不留任何副作用：状态在 watch(visible) 里统一归位。）
  -->
  <view v-if="everOpened" v-show="visible" class="mask" @click="close">
    <view class="sheet" @click.stop>
      <view class="header">
        <text />
        <text class="done" @click="confirm">完成</text>
      </view>

      <!-- ===== 日期面板：日历在上，「时刻」行在下 ===== -->
      <view v-if="panel === 'date'" class="panel">
        <view class="cal">
          <view class="cal-header">
            <view class="cal-nav" @click="shiftBy(-1)"><SvgIcon name="icon-chevron-left" :size="20" /></view>
            <view class="cal-title" @click="toggleMonthPicker">
              <text class="cal-title-text">{{ viewYear }} 年 {{ viewMonth + 1 }} 月</text>
              <SvgIcon
                class="cal-title-caret"
                :name="showMonthPicker ? 'icon-chevron-up' : 'icon-chevron-down'"
                :size="16"
              />
            </view>
            <view class="cal-nav" @click="shiftBy(1)"><SvgIcon name="icon-chevron-right" :size="20" /></view>
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

          <!--
            日历网格：swiper 固定 3 项（前 / 当前 / 后月），滑完复位到中间再换数据。
            ⚠️ 这是本组件**弹出速度的命门**：早先版本一次性渲染 2000 ~ MAX_YEAR 的
               全部 384 个月（384 个 swiper-item + 5 张月历），真机会把主线程堵住 1s 以上，
               用户感知就是「点日期半天弹不出来」。固定 3 项后滑动手感不变
               （原生手势 + 惯性仍在），挂载成本降两个数量级。
               与日历页 `pages/calendar/index.vue` 收起态是同一套做法。
          -->
          <view v-else class="cal-grid">
            <view class="week-row">
              <text v-for="w in weekLabels" :key="w" class="week-label">{{ w }}</text>
            </view>
            <swiper
              class="month-swiper"
              :current="swiperIndex"
              :duration="swipeDuration"
              @animationfinish="onSwipeSettle"
            >
              <swiper-item v-for="(m, i) in swiperMonths" :key="i">
                <view class="day-grid">
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

/* 可选范围换算成「月下标」的上下界，用于越界收敛（见 monthOfIndex / shiftBy） */
const MIN_IDX = MIN_YEAR * 12;
const MAX_IDX = MAX_YEAR * 12 + 11;

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

/** 日历当前展示的年月（month 为 0-based）。**固定渲染在 swiper 中间那一格** */
const viewYear = ref(2026);
const viewMonth = ref(0);
const selectedDate = ref('');

/** swiper 下标：0/1/2 = 前 / 当前 / 后月。平时恒为 1（中线），只在滑动动画期间短暂偏离 */
const swiperIndex = ref(1);

/** swiper 动画时长；复位那一帧临时置 0 → 瞬移（见 onSwipeSettle） */
const swipeDuration = ref(SWIPE_MS);

/**
 * 三格各自显示的月份 = 基准月 + offsets[i]，平时是 [-1, 0, 1]（前 / 当前 / 后月）。
 * 越界（2000-01 之前 / MAX_YEAR-12 之后）由 monthOfIndex 收敛到边界月。
 *
 * ⚠️ 滑动落定后会**临时**把落点那一格也拉回基准月（[-1,0,0] / [0,0,1]），
 *    原因见 onSwipeSettle：复位要隔一帧才落到 DOM 上，那一帧视口还停在落点上，
 *    让落点与中线显示同一个月，这一帧里用户看到的就是正确的月份。
 */
const offsets = ref([-1, 0, 1]);

const swiperMonths = computed(() => {
  const base = viewYear.value * 12 + viewMonth.value;
  return offsets.value.map((d) => monthOfIndex(base + d));
});

/** 月下标 → 年月（越界收敛到边界） */
function monthOfIndex(idx: number): { year: number; month: number } {
  const i = Math.min(Math.max(idx, MIN_IDX), MAX_IDX);
  return { year: Math.floor(i / 12), month: i % 12 };
}

/** 时刻开关：是否记录时刻 */
const timeEnabled = ref(false);
const hour = ref(0);
const minute = ref(0);
/** picker-view 的受控值 [时下标, 分下标] */
const wheelValue = ref([0, 0]);

/** 展开面板：date（日历在上 + 时刻行）| time（日期行 + 时刻行 + 滚轮） */
const panel = ref<'date' | 'time'>('date');

/** 是否已挂载过（首次打开置 true，此后只切换 v-show，见模板顶部注释） */
const everOpened = ref(false);

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
 * 翻月：改 year/month（越界不动）。
 *
 * ⚠️ **箭头点按走这里，是「立即换月」而不是滑动动画**：动画要靠改 swiper 的
 *    `current` 来触发，而 3 项窗口里 `current` 同时兼任"数据中线"——
 *    连点箭头时（上一次动画没落定）会与手势落定的换月叠加，导致多跳一个月。
 *    立即换月没有这个问题，连点 N 次就是 N 个月，手感也更跟手。
 *    左右滑动手势仍是原生滑动动画（见 onSwipeSettle）。
 */
function shiftBy(delta: number) {
  const idx = viewYear.value * 12 + viewMonth.value + delta;
  if (idx < MIN_IDX || idx > MAX_IDX) return;
  viewYear.value = Math.floor(idx / 12);
  viewMonth.value = idx % 12;
}

/**
 * 手指滑动落定：换月 + 把 swiper 复位到中线。
 *
 * ⚠️ 挂在 `animationfinish` 而**不是** `change`：实测 uni-app 的 swiper 在手指离开的
 *    同一帧就派发 change，惯性动画还要再滑 ~240ms。此时改数据，正在滑出/滑入的邻格
 *    内容会当场变化（月历错位、重影）。等惯性动画落定再改，改的是已经站稳的那一格，
 *    配合 offsets 的临时复制，全程无感。
 *
 * ⚠️ 复位分两步，缺一不可：uni 的 swiper 内部 `current` 滑到 0/2 后就停在那儿，
 *    只改我们的 ref 不会把它拉回来（prop 值没变 → 内部不回写）。
 *    ① 先把 prop 同步成真实下标 ② 再改回 1 触发内部回流；
 *    ②还必须用 0 时长瞬移 —— 中线那一格已经换成新月份，若让它滑 240ms，
 *    用户会看到月历被"撕开"滑一屏。
 */
function onSwipeSettle(e: any) {
  const i = e.detail.current;

  // current = 1：复位动画落定（或"没滑够"的回弹）→ 恢复常规三格与滑动时长
  if (i === 1) {
    offsets.value = [-1, 0, 1];
    swipeDuration.value = SWIPE_MS;
    return;
  }

  shiftBy(i === 0 ? -1 : 1); // 越界不动（2000-01 / 上限月）
  /*
   * 落点那一格先复制基准月：此刻它正显示用户刚滑到的那个月，
   * 复制过来后"换月"这一步在这一格上完全看不出变化（相邻格在视口外，随便改）。
   */
  offsets.value = i === 2 ? [-1, 0, 0] : [0, 0, 1];
  swiperIndex.value = i; // ① prop 追上真实下标
  nextTick(() => {
    swipeDuration.value = 0; // ② 0 时长瞬移回中线
    swiperIndex.value = 1;
  });
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
    everOpened.value = true;
    showMonthPicker.value = false;
    panel.value = 'date';
    /*
     * 组件实例本身不在 v-if 里（销毁重建的是模板根节点），所以以下状态会跨次打开存活。
     * 万一上次是「滑动/复位还没落定就点了完成或遮罩」，swiper 可能停在 0/2 上、
     * offsets 还留着临时复制 —— 那这次打开就会错位。每次打开一律归位。
     */
    swiperIndex.value = 1;
    offsets.value = [-1, 0, 1];
    swipeDuration.value = SWIPE_MS;

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
