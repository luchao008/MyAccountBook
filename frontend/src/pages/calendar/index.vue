<template>
  <view class="page">
    <!-- 自绘顶栏：返回 + 月份（点击展开年月选择） -->
    <view class="nav" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view class="nav-inner">
        <view class="nav-btn" @click="goBack"><SvgIcon name="icon-chevron-left" :size="20" /></view>
        <view class="nav-title-wrap" @click="monthPickerVisible = true">
          <text class="nav-title">{{ viewYear }}年{{ viewMonth + 1 }}月{{ selectedDay }}日</text>
          <SvgIcon class="nav-title-arrow" name="icon-chevron-down" :size="12" />
        </view>
        <view class="nav-btn" />
      </view>
    </view>

    <!-- 日历：周日起始（与项目 DateTimePicker 一致） -->
    <view class="calendar">
      <view class="week-row">
        <text v-for="w in WEEK_LABELS" :key="w" class="week-label">{{ w }}</text>
      </view>

      <view class="day-grid">
        <view v-for="(cell, i) in cells" :key="i" class="day-cell">
          <view
            v-if="cell"
            class="day"
            :class="{
              today: isToday(cell.date),
              selected: cell.date === selectedDate,
              empty: !cell.hasData,
            }"
            @click="selectDay(cell.date)"
          >
            <text class="day-num">{{ cell.day }}</text>
            <!-- 两行：上行支出、下行收入（只有支出时只显示一行） -->
            <text v-if="cell.expense" class="day-amount expense">{{ shortMoney(cell.expense) }}</text>
            <text v-if="cell.income" class="day-amount income">{{ shortMoney(cell.income) }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 当日明细 / 空状态 -->
    <view class="detail">
      <view v-if="loading" class="state"><text class="state-text">加载中…</text></view>
      <EmptyState
        v-else-if="!dayItems.length"
        icon="icon-inbox"
        text="无流水"
        sub-text="点击右下角加号可快速记账"
      />
      <template v-else>
        <view v-for="t in dayItems" :key="t.id" class="txn" @click="editTransaction(t.id)">
          <CategoryIcon class="txn-icon" :name="t.category?.icon || 'cat-misc'" :size="28" />
          <view class="txn-main">
            <text class="txn-name">{{ t.category?.name || '未分类' }}</text>
            <text class="txn-meta">{{ txnMeta(t) }}</text>
          </view>
          <text class="txn-amount" :class="t.type === 'income' ? 'income' : 'expense'">
            {{ t.type === 'income' ? '+' : '-' }}{{ formatMoney(t.amount) }}
          </text>
        </view>
      </template>
    </view>

    <!-- 右下角 FAB：快速记账（本页无主导航底栏，故不与底栏凸起项重复） -->
    <view class="fab" @click="goRecord">
      <SvgIcon name="icon-plus" :size="28" />
    </view>

    <!-- 年月选择 -->
    <view v-if="monthPickerVisible" class="mask" @click="monthPickerVisible = false">
      <view class="sheet" @click.stop>
        <view class="sheet-header">
          <view class="sheet-header-btn" @click="monthPickerVisible = false">
            <SvgIcon name="icon-close" :size="20" />
          </view>
          <text class="sheet-header-title">选择月份</text>
          <view class="sheet-header-btn" />
        </view>
        <picker-view class="wheel" :value="wheelValue" @change="onWheelChange">
          <picker-view-column>
            <view v-for="y in years" :key="'y' + y" class="wheel-item">{{ y }} 年</view>
          </picker-view-column>
          <picker-view-column>
            <view v-for="m in 12" :key="'m' + m" class="wheel-item">{{ m }} 月</view>
          </picker-view-column>
        </picker-view>
        <view class="sheet-footer">
          <view class="btn btn-confirm" @click="confirmMonth">
            <text class="btn-text confirm-text">确定</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 日历页（流水页顶栏第二个图标跳转进入）。
 *
 * 结构对齐参考图：
 *   · 上半屏日历，每日格子下方显示当天**支出（上行）/ 收入（下行）**，
 *     只有支出时只显示一行 —— 这是参考图里"多数日期一行、个别日期两行"的形态。
 *   · 下半屏显示**选中那天的明细**；没有流水时显示空状态，右下角 FAB 快速记账。
 *
 * 数据：一次拉该月全部流水（`GET /transactions?start=&end=&size=100`），
 * 在前端按日聚合出格子上的数字并归组当天明细 —— 避免为每个日期各发一次请求。
 */
import { ref, computed, onMounted } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';
import CategoryIcon from '@/components/CategoryIcon.vue';
import EmptyState from '@/components/EmptyState.vue';
import { useAccountStore } from '@/store/account';
import { getTransactions, type TransactionItem } from '@/api/transaction';
import { formatMoney } from '@/utils/format';

const WEEK_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const accountStore = useAccountStore();

const statusBarHeight = ref(0);
try {
  statusBarHeight.value = uni.getSystemInfoSync().statusBarHeight || 0;
} catch {
  statusBarHeight.value = 0;
}

const now = new Date();
const viewYear = ref(now.getFullYear());
const viewMonth = ref(now.getMonth()); // 0-based
const selectedDay = ref(now.getDate());

const loading = ref(false);
const monthItems = ref<TransactionItem[]>([]);
const monthPickerVisible = ref(false);

const pad = (n: number) => String(n).padStart(2, '0');

/** 选中日期 YYYY-MM-DD */
const selectedDate = computed(
  () => `${viewYear.value}-${pad(viewMonth.value + 1)}-${pad(selectedDay.value)}`
);

/** 按日聚合：{ 'YYYY-MM-DD': { income, expense } } */
const dayMap = computed(() => {
  const map: Record<string, { income: number; expense: number }> = {};
  for (const t of monthItems.value) {
    const cur = map[t.recordDate] || { income: 0, expense: 0 };
    if (t.type === 'income') cur.income += Number(t.amount);
    else cur.expense += Number(t.amount);
    map[t.recordDate] = cur;
  }
  return map;
});

interface Cell {
  day: number;
  date: string;
  income: number;
  expense: number;
  hasData: boolean;
}

/**
 * 日历格子（周日起始，与项目 `DateTimePicker` 一致）。
 * 前后补 null 让 1 号对齐到正确的星期几。
 */
const cells = computed<(Cell | null)[]>(() => {
  const y = viewYear.value;
  const m0 = viewMonth.value;
  const firstDow = new Date(y, m0, 1).getDay();
  const daysInMonth = new Date(y, m0 + 1, 0).getDate();

  const out: (Cell | null)[] = [];
  for (let i = 0; i < firstDow; i++) out.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${y}-${pad(m0 + 1)}-${pad(d)}`;
    const agg = dayMap.value[date];
    out.push({
      day: d,
      date,
      income: agg?.income || 0,
      expense: agg?.expense || 0,
      hasData: !!agg,
    });
  }
  return out;
});

/** 选中那天的明细（后端已按时间倒序，直接过滤保持顺序） */
const dayItems = computed(() => monthItems.value.filter((t) => t.recordDate === selectedDate.value));

function isToday(date: string): boolean {
  return date === `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * 格子里的金额用**紧凑写法**，否则一行放不下。
 *
 * ⚠️ 这不是"好看"，是被实测逼出来的：320px 屏下每个格子内宽只有约 41px，
 *    而 12px 字号（项目硬下限）下 "119.40" 需要约 42px —— 差一点就溢出。
 *    参考图里也是紧凑写法（"1.17万"）。
 *
 * 分档：
 *   ≥ 1万  → "1.17万"（2 位小数）
 *   ≥ 1000 → "3.3k"（1 位小数）
 *   ≥ 100  → "119"（取整，不显示分位）
 *   < 100  → "15.8"（1 位小数）
 * 分位在格子这种极小尺寸下没有意义（下方当日明细里有完整金额）。
 */
function shortMoney(v: number): string {
  if (v >= 10000) return `${(v / 10000).toFixed(2)}万`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 100) return String(Math.round(v));
  return v.toFixed(1);
}

function txnMeta(t: TransactionItem): string {
  const parts: string[] = [];
  if (t.account?.name) parts.push(t.account.name);
  if (t.note) parts.push(t.note);
  if (t.recordTime) parts.push(t.recordTime.slice(0, 5));
  return parts.join(' · ');
}

/* ── 年月选择 ── */
const years = Array.from({ length: 11 }, (_, i) => now.getFullYear() - 5 + i);
const yearIndex = ref(years.indexOf(now.getFullYear()));
const monthIndex = ref(now.getMonth());
const wheelValue = computed(() => [yearIndex.value, monthIndex.value]);

function onWheelChange(e: any) {
  yearIndex.value = e.detail.value[0];
  monthIndex.value = e.detail.value[1];
}

function confirmMonth() {
  viewYear.value = years[yearIndex.value];
  viewMonth.value = monthIndex.value;
  monthPickerVisible.value = false;
  loadMonth();
}

function selectDay(date: string) {
  const d = Number(date.slice(8, 10));
  selectedDay.value = d;
}

async function loadMonth() {
  loading.value = true;
  try {
    await accountStore.load();
    const start = `${viewYear.value}-${pad(viewMonth.value + 1)}-01`;
    const end = `${viewYear.value}-${pad(viewMonth.value + 1)}-${pad(
      new Date(viewYear.value, viewMonth.value + 1, 0).getDate()
    )}`;
    const page = await getTransactions({
      start,
      end,
      size: 100,
      accountId: accountStore.currentId || undefined,
    });
    monthItems.value = page.list;
  } catch (err) {
    console.error('[calendar] 加载失败', err);
    monthItems.value = [];
  } finally {
    loading.value = false;
  }
}

function goBack() {
  const pages = getCurrentPages();
  if (pages.length > 1) uni.navigateBack();
  else uni.reLaunch({ url: '/pages/main/index' });
}

function goRecord() {
  uni.navigateTo({ url: '/pages/record/index' });
}

function editTransaction(id: string) {
  uni.navigateTo({ url: `/pages/record/index?id=${id}` });
}

onMounted(loadMonth);
</script>

<style scoped lang="scss">
.page {
  min-height: $page-min-height;
  background: $bg-canvas;
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}

.nav {
  background: $bg-canvas;
}

.nav-inner {
  height: 44px;
  display: flex;
  align-items: center;
  padding: 0 $space-2;
}

.nav-btn {
  width: $touch-target-min;
  height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $text-primary;
}

.nav-title-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $space-1;
}

.nav-title {
  font-size: $font-h2;
  line-height: $lh-h2;
  font-weight: $weight-semibold;
  color: $text-primary;
}

.nav-title-arrow {
  color: $text-secondary;
}

/* ── 日历 ── */
.calendar {
  padding: $space-2 $space-2 $space-4;
  border-bottom: 1px solid $line;
}

.week-row {
  display: flex;
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
  justify-content: center;
  padding: 3px 1px;
}

/*
 * 宽度用**流式**而不是写死 44px。
 *
 * 踩过：写死 44px 在 320px 屏上放不下 —— 容器宽 304px ÷ 7 = 43.4px/格，
 * 44px 的盒子直接压到邻居身上（reflow-audit 实测「压邻居 5 处」）。
 * 改为 `width: 100%` + `max-width` 后，窄屏自动收缩、宽屏不超过 44px。
 */
.day {
  width: 100%;
  max-width: 44px;
  min-height: 68px;
  border-radius: $radius-md;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 4px 1px;
  background: $brand-50;
}

/* 无数据的日子不铺底色，避免整屏都是色块 */
.day.empty {
  background: transparent;
}

.day.today {
  border: 1.5px solid $brand-600;
  padding: 2.5px 0.5px;
}

.day.selected {
  background: $brand-600;
}

.day-num {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-primary;
  @include tabular-nums;
}

.day.selected .day-num {
  color: $text-inverse;
  font-weight: $weight-semibold;
}

/*
 * ⚠️ 这里**不能**用 9px 这类阶梯外字面量：项目的字号校验器会直接报 MISMATCH
 *    （`npm run check:contrast` 第 13 节）。且 12px 是项目的硬下限。
 *    格子宽度在 320px 屏上只有约 41px，「1.17万」在 12px 下刚好放得下；
 *    再大字号（200%）必然溢出，属 reflow-audit 的已知接受项。
 */
/*
 * ⚠️ 这里刻意**不用** `overflow: hidden` + `text-overflow: ellipsis`：
 *    uni-app 把 `<text>` 渲染成 inline `<span>`，ellipsis 对它不生效 ——
 *    结果是"被祖先静默裁掉"，正是项目反复强调的那类**看不见的内容丢失**
 *    （reflow-audit 首跑就报「被裁 1 处」，三个视口全中）。
 *    改为让金额本身足够短（见 shortMoney），并允许它换行兜底。
 */
.day-amount {
  font-size: $font-caption;
  line-height: $lh-caption;
  @include tabular-nums;
  max-width: 100%;
  @include text-safe;
}

/* 支出用中性色：支出红压 brand-50 只有 4.47:1，小字号下不达标 */
.day.empty .day-amount,
.day .day-amount.expense {
  color: $text-secondary;
}

.day .day-amount.income {
  color: $income;
}

.day.selected .day-amount {
  color: $text-inverse;
}

/* ── 当日明细 ── */
.detail {
  min-height: 240px;
}

.state {
  padding: $space-8 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.state-text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-secondary;
}

.txn {
  display: flex;
  align-items: center;
  padding: $space-3 $space-4;
  border-bottom: 1px solid $line;
}

.txn-icon {
  margin-right: $space-3;
  flex-shrink: 0;
}

.txn-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.txn-name {
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-primary;
  @include text-safe;
}

.txn-meta {
  margin-top: 2px;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-tertiary;
  @include text-safe;
}

.txn-amount {
  flex-shrink: 0;
  margin-left: $space-3;
  @include tabular-nums;
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  font-weight: $weight-medium;
}

.income {
  color: $income;
}

.expense {
  color: $expense;
}

/* ── FAB（本页无主导航底栏，不与其凸起项重复）── */
.fab {
  position: fixed;
  right: $space-5;
  bottom: calc(#{$space-5} + env(safe-area-inset-bottom));
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: $brand-600;
  color: $text-inverse;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.fab:active {
  background: $brand-800;
}

/* ── 年月弹层 ── */
.mask {
  position: fixed;
  inset: 0;
  background: $bg-mask;
  z-index: 1000;
  display: flex;
  align-items: flex-end;
}

.sheet {
  width: 100%;
  background: $bg-card;
  border-radius: $radius-lg $radius-lg 0 0;
  padding-bottom: env(safe-area-inset-bottom);
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $space-3 $space-2;
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

.wheel {
  height: 200px;
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
}

.btn {
  min-height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-md;
}

.btn-confirm {
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
