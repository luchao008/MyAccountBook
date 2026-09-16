<template>
  <view v-if="visible" class="mask" @click="close">
    <view class="sheet" @click.stop>
      <view class="sheet-header">
        <view class="sheet-header-btn" @click="close">
          <SvgIcon name="icon-close" :size="20" />
        </view>
        <text class="sheet-header-title">选择时间</text>
        <view class="sheet-header-btn" />
      </view>

      <!--
        中间内容（预设列表 + 自定义滚轮）放在 scroll-view 里：
        否则「自定义」展开后总高超过 .sheet 的 max-height，会把底部「确定」挤出屏幕。
        ⚠️ 高度由 JS 算出，不依赖 flex 推导（uni-app 的 scroll-view 不吃 flex）。
      -->
      <scroll-view class="sheet-body" scroll-y :style="{ height: bodyHeight + 'px' }">
        <view
          v-for="opt in presets"
          :key="opt.label"
          class="sheet-item sheet-item-row"
          @click="pickPreset(opt)"
        >
          <text class="sheet-item-text" :class="{ 'sheet-item-active': label === opt.label }">
            {{ opt.label }}
          </text>
          <SvgIcon v-if="label === opt.label" class="sheet-check" name="icon-check" :size="18" />
        </view>

        <!--
          自定义区间：选「自定义」后就地展开 ——
          上方两个可点的开始/结束、下方三列滚轮、底部「确定」。
          ⚠️ 这两处日期与滚轮是双向绑定的：点上方切换编辑对象、滚轮改的是同一个值。
        -->
        <view v-if="customOpen" class="range-panel">
          <view class="range-tabs">
            <view class="range-tab" @click="switchEnd('start')">
              <text class="range-tab-label">开始时间</text>
              <text class="range-tab-value" :class="{ active: activeEnd === 'start' }">
                {{ formatCn(customStart) }}
              </text>
              <view v-if="activeEnd === 'start'" class="range-tab-line" />
            </view>
            <text class="range-sep">-</text>
            <view class="range-tab" @click="switchEnd('end')">
              <text class="range-tab-label">结束时间</text>
              <text class="range-tab-value" :class="{ active: activeEnd === 'end' }">
                {{ formatCn(customEnd) }}
              </text>
              <view v-if="activeEnd === 'end'" class="range-tab-line" />
            </view>
          </view>

          <picker-view class="range-wheel" :value="wheelValue" @change="onWheelChange">
            <picker-view-column>
              <view v-for="y in RANGE_YEARS" :key="'y' + y" class="wheel-item">{{ y }}年</view>
            </picker-view-column>
            <picker-view-column>
              <view v-for="m in 12" :key="'m' + m" class="wheel-item">{{ m }}月</view>
            </picker-view-column>
            <picker-view-column>
              <view v-for="d in wheelDays" :key="'d' + d" class="wheel-item">{{ d }}日</view>
            </picker-view-column>
          </picker-view>
        </view>
      </scroll-view>

      <view class="sheet-footer">
        <view class="btn btn-confirm" @click="confirm">
          <text class="btn-text confirm-text">确定</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 时间区间选择弹层（6 预设 + 三列滚轮自定义区间）。
 *
 * ⚠️ **从 flow 页抽出来的公共组件**（2026-09-15）。抽的原因是「数据导出」页
 *    要用同一套交互 —— 项目一贯反对各写一遍，MEMORY 里明确记着两份必然分叉。
 *
 * 受控方式：**完全受控**（modelValue + update:modelValue），不持有自己的已选区间：
 *   · 点预设 / 点「确定」→ emit 出去，由父级决定何时真正应用
 *   · **本组件不负责 reload** —— flow 页要等筛选面板的「确定」才刷新，
 *     导出页则在点「导出」时才用，两者时机不同，不能写死在组件里
 *
 * ⚠️ **「自定义」不立即应用**：点它只展开滚轮，点「确定」才 emit。
 *    否则用户还没选日期，父级就已经显示「自定义」+ 空区间了。
 */
import { ref, computed, watch } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';

export interface TimeRange {
  /** 展示文案：全部时间 / 本月 / 自定义 等 */
  label: string;
  /** YYYY-MM-DD，空串表示不限 */
  start: string;
  end: string;
}

const props = defineProps<{
  visible: boolean;
  modelValue: TimeRange;
}>();

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  (e: 'update:modelValue', v: TimeRange): void;
  (e: 'pick', v: TimeRange): void;
}>();

/** 视口高度（uni-app 下 scroll-view 需要确定高度，不能靠 flex 推导） */
const windowHeight = ref(812);
try {
  const info = uni.getSystemInfoSync();
  windowHeight.value = info.windowHeight || 812;
} catch {
  windowHeight.value = 812;
}

/**
 * 弹层中间区高度（px）。
 * ⚠️ 必须由 JS 算：uni-app 的 scroll-view 不吃 flex 推导（项目在时间弹层踩过三轮）。
 *    取值 = 视口高 × 72%（与 .sheet 的 max-height 一致） − header − footer；下限 160。
 */
const bodyHeight = computed(() => {
  const vh = windowHeight.value || 812;
  return Math.max(160, Math.round(vh * 0.72) - 144);
});

const pad2 = (n: number) => String(n).padStart(2, '0');
const todayStr = (() => {
  const d = new Date();
  return [d.getFullYear(), pad2(d.getMonth() + 1), pad2(d.getDate())].join('-');
})();

function monthRange(offset: number) {
  const d = new Date();
  const y = d.getFullYear();
  const m0 = d.getMonth() + offset;
  const start = new Date(y, m0, 1);
  const end = new Date(y, m0 + 1, 0);
  return {
    start: [start.getFullYear(), pad2(start.getMonth() + 1), '01'].join('-'),
    end: [end.getFullYear(), pad2(end.getMonth() + 1), pad2(end.getDate())].join('-'),
  };
}

/** 6 个预设（与参考图一致） */
const presets = computed<TimeRange[]>(() => {
  const y = new Date().getFullYear();
  return [
    { label: '全部时间', start: '', end: '' },
    { label: '本月', ...monthRange(0) },
    { label: '上月', ...monthRange(-1) },
    { label: '本年', start: y + '-01-01', end: y + '-12-31' },
    { label: '去年', start: y - 1 + '-01-01', end: y - 1 + '-12-31' },
    { label: '自定义', start: '', end: '' },
  ];
});

const label = computed(() => props.modelValue.label || '全部时间');

/* ── 自定义区间 ── */
const RANGE_YEARS = Array.from({ length: 50 }, (_, i) => 2000 + i);

/**
 * 「自定义」滚轮是否展开。
 * ⚠️ 单独用状态，不要拿 label === 自定义 当判据 —— 那样必须在点「自定义」的瞬间
 *    就改 label，于是用户还没选日期就已经显示「自定义」+ 空区间了。
 */
const customOpen = ref(false);
const activeEnd = ref<'start' | 'end'>('start');
const customStart = ref(todayStr);
const customEnd = ref(todayStr);

const wheelYear = ref(Math.max(0, RANGE_YEARS.indexOf(new Date().getFullYear())));
const wheelMonth = ref(new Date().getMonth());
const wheelDay = ref(new Date().getDate() - 1);

/** 滚轮当前月份的天数（闰年/大小月都要算对，否则 2 月 31 日会出现） */
const wheelDays = computed(() => {
  const y = RANGE_YEARS[wheelYear.value] ?? 2000;
  return new Date(y, wheelMonth.value + 1, 0).getDate();
});
const wheelValue = computed(() => [wheelYear.value, wheelMonth.value, wheelDay.value]);

function formatCn(d: string): string {
  const [y, m, day] = d.split('-');
  return y + '年' + m + '月' + day + '日';
}

/** 打开时把滚轮对齐到当前已选区间（没选过就用今天） */
watch(
  () => props.visible,
  (v) => {
    if (!v) return;
    customOpen.value = false;
    customStart.value = props.modelValue.start || todayStr;
    customEnd.value = props.modelValue.end || todayStr;
    switchEnd('start');
  }
);

/** 切换编辑对象：把滚轮同步到那一端当前的值 */
function switchEnd(which: 'start' | 'end') {
  activeEnd.value = which;
  const cur = which === 'start' ? customStart.value : customEnd.value;
  const [y, m, d] = cur.split('-').map(Number);
  wheelYear.value = Math.max(0, RANGE_YEARS.indexOf(y));
  wheelMonth.value = m - 1;
  wheelDay.value = d - 1;
}

function onWheelChange(e: any) {
  const [yi, mi, di] = e.detail.value;
  wheelYear.value = yi;
  wheelMonth.value = mi;
  // 换月后当月天数可能变少（如 1/31 → 2 月），把日下标收敛到合法范围
  const maxDay = new Date(RANGE_YEARS[yi], mi + 1, 0).getDate();
  const dayIdx = Math.min(di, maxDay - 1);
  wheelDay.value = dayIdx;

  const val = [RANGE_YEARS[yi], pad2(mi + 1), pad2(dayIdx + 1)].join('-');
  if (activeEnd.value === 'start') customStart.value = val;
  else customEnd.value = val;
}

/** 点预设（非自定义）→ 直接 emit，由父级决定是否立即应用 */
function pickPreset(opt: TimeRange) {
  if (opt.label === '自定义') {
    // 只展开滚轮，**不改** modelValue
    customOpen.value = true;
    if (props.modelValue.start) customStart.value = props.modelValue.start;
    if (props.modelValue.end) customEnd.value = props.modelValue.end;
    switchEnd('start');
    return;
  }
  customOpen.value = false;
  const next: TimeRange = { label: opt.label, start: opt.start, end: opt.end };
  emit('update:modelValue', next);
  emit('pick', next);
  close();
}

/** 「确定」：自定义区间时写回（起止颠倒自动交换） */
function confirm() {
  if (customOpen.value) {
    const [s, e] = [customStart.value, customEnd.value].sort();
    const next: TimeRange = { label: '自定义', start: s, end: e };
    emit('update:modelValue', next);
    emit('pick', next);
  }
  close();
}

function close() {
  customOpen.value = false;
  emit('update:visible', false);
}
</script>

<style scoped lang="scss">
/*
 * 弹层贴屏幕底边升起（不留底栏高度）—— 底栏被盖住是有意为之：
 * 弹层是模态的，此时底栏不可操作，留白反而在下方露出一条无意义的缝。
 */
.mask {
  position: fixed;
  inset: 0;
  background: $bg-mask;
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  padding-bottom: env(safe-area-inset-bottom);
}

/*
 * ⚠️ overflow: hidden 不能省：只写 max-height 时它**约束不住 flex 子项**，
 *    内容超长会直接溢出（footer 落到屏幕外 / 内容盖住按钮并拦截点击）。
 */
.sheet {
  width: 100%;
  max-height: 72vh;
  background: $bg-card;
  border-radius: $radius-lg $radius-lg 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 中间可滚动区的高度**由 JS 算出**（模板上的 :style），不参与 flex 拉伸 */
.sheet-body {
  flex: none;
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $space-3 $space-2;
  flex: none;
}

.sheet-header-btn {
  min-width: $touch-target-min;
  height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $text-secondary;
}

.sheet-header-title {
  font-size: $font-h2;
  line-height: $lh-h2;
  font-weight: $weight-semibold;
  color: $text-primary;
}

.sheet-item {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-top: 1px solid $line;
}

.sheet-item-row {
  justify-content: space-between;
  padding: 0 $space-5;
}

.sheet-item-text {
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  color: $text-primary;
}

.sheet-item-active {
  color: $brand-700;
  font-weight: $weight-medium;
}

.sheet-check {
  color: $brand-700;
}

.range-panel {
  border-top: 1px solid $line;
  padding: $space-3 0 0;
}

.range-tabs {
  display: flex;
  align-items: flex-start;
  padding: 0 $space-4 $space-2;
}

.range-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.range-tab-label {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-tertiary;
}

.range-tab-value {
  margin-top: $space-1;
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  color: $text-primary;
  @include tabular-nums;
}

.range-tab-value.active {
  color: $brand-700;
  font-weight: $weight-medium;
}

.range-tab-line {
  margin-top: $space-2;
  height: 2px;
  width: 100%;
  background: $brand-600;
  border-radius: $radius-pill;
}

.range-sep {
  margin: $space-5 $space-2 0;
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  color: $text-disabled;
}

.range-wheel {
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

.sheet-footer {
  padding: $space-4;
  flex: none;
}

.btn {
  min-height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-md;
}

.btn-confirm {
  flex: 1;
  background: $brand-600;
}

.btn-text {
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  font-weight: $weight-medium;
}

.confirm-text {
  color: $text-inverse;
}
</style>
