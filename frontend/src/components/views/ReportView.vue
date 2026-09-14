<template>
  <view class="page">
    <!--
      吸顶区：顶栏 + Tab 一起固定在顶部（滚动时不跟随内容）。
      为什么用 sticky 而不是 fixed：fixed 会让后面内容整体上移、需要手工补一段等高占位，
      而 sticky 保留原有文档流位置，滚动到顶才「吸附」——零占位成本。
      ⚠️ sticky 生效的前提是祖先链上没有 overflow:hidden/clip，这里页面根 .page 无此属性。
    -->
    <view class="sticky-head">
      <!-- 自绘顶栏（navigationStyle: custom） -->
      <view class="nav" :style="{ paddingTop: statusBarHeight + 'px' }">
        <view class="nav-inner">
          <view class="nav-back" @click="goBack">
            <SvgIcon name="icon-chevron-left" :size="20" />
          </view>
          <text class="nav-title">报表</text>
          <view class="nav-back" />
        </view>
      </view>

      <!-- 顶部 Tab：只保留「基础统计」「分类」 -->
      <view class="tabs">
        <view class="tab-item" :class="{ active: tab === 'basic' }" @click="switchTab('basic')">
          <text class="tab-text">基础统计</text>
          <view v-if="tab === 'basic'" class="tab-underline" />
        </view>
        <view class="tab-item" :class="{ active: tab === 'category' }" @click="switchTab('category')">
          <text class="tab-text">分类</text>
          <view v-if="tab === 'category'" class="tab-underline" />
        </view>
      </view>
    </view>

    <!-- 时段选择栏 -->
    <view class="period-bar">
      <view class="period-arrow" @click="shiftPeriod(-1)">
        <SvgIcon name="icon-chevron-left" :size="16" />
      </view>
      <view class="period-center" @click="pickerVisible = true">
        <SvgIcon class="period-icon" name="icon-calendar" :size="14" />
        <text class="period-text">{{ periodText }}</text>
      </view>
      <view class="period-arrow" @click="shiftPeriod(1)">
        <SvgIcon name="icon-chevron-right" :size="16" />
      </view>
    </view>

    <!-- 加载中 -->
    <view v-if="loading" class="state">
      <text class="state-text">加载中…</text>
    </view>

    <!-- 请求失败 -->
    <EmptyState
      v-else-if="error"
      icon="icon-alert"
      text="加载失败，请稍后重试"
      button-text="重试"
      @action="loadData"
    />

    <!-- 空数据 -->
    <EmptyState
      v-else-if="!hasData"
      icon="icon-inbox"
      :text="`${periodText}暂无记录`"
    />

    <!-- 有数据 -->
    <template v-else>
      <!-- ============ 基础统计 ============ -->
      <template v-if="tab === 'basic'">
        <!-- 账本流水统计：白底深墨大数字（FL-1 无插画） -->
        <view class="hero">
          <text class="hero-label">账本流水统计</text>
          <view class="hero-balance-row">
            <text class="hero-balance-label">结余</text>
            <text class="hero-balance">¥{{ formatMoney(report.summary.balance) }}</text>
          </view>
          <view class="hero-io">
            <text class="hero-io-item">总收入 {{ formatMoney(report.summary.income) }}</text>
            <text class="hero-io-sep">|</text>
            <text class="hero-io-item">总支出 {{ formatMoney(report.summary.expense) }}</text>
          </view>
        </view>

        <!-- 记账里程碑 -->
        <view class="milestone">
          <SvgIcon class="milestone-icon" name="icon-list-check" :size="20" />
          <text class="milestone-label">记账里程碑</text>
          <text class="milestone-count">记账笔数 {{ report.summary.count }}</text>
        </view>

        <!-- 收入来源 -->
        <view class="panel">
          <text class="panel-title">收入来源</text>
          <EmptyState v-if="!report.incomeCategories.length" icon="icon-inbox" text="暂无收入记录" />
          <RankList v-else :rows="report.incomeCategories" />
        </view>

        <!-- 支出分布 -->
        <view class="panel">
          <text class="panel-title">支出分布</text>
          <EmptyState v-if="!report.expenseCategories.length" icon="icon-inbox" text="暂无支出记录" />
          <RankList v-else :rows="report.expenseCategories" />
        </view>

        <!-- 月度收支趋势（仅年粒度） -->
        <view v-if="report.granularity === 'year' && report.trend.length" class="panel">
          <text class="panel-title">月度收支趋势</text>
          <TrendChart :trend="report.trend" />
        </view>
      </template>

      <!-- ============ 分类 ============ -->
      <template v-else>
        <view class="panel">
          <view class="panel-head">
            <text class="panel-title">支出分类统计</text>
            <view class="panel-head-right">
              <text class="panel-meta">总支出 </text>
              <text class="panel-meta-val expense">{{ formatMoney(report.summary.expense) }}</text>
              <text class="panel-meta"> 记账笔数 {{ expenseCount }}</text>
            </view>
          </view>
          <EmptyState v-if="!report.expenseCategoriesL2.length" icon="icon-pie" text="暂无支出记录" />
          <template v-else>
            <view class="ring-area">
              <RingChart :items="expenseChartItems" :size="130" :thickness="24" show-labels />
            </view>
            <RankList :rows="report.expenseCategoriesL2" />
          </template>
        </view>

        <view class="panel">
          <view class="panel-head">
            <text class="panel-title">收入分类统计</text>
            <view class="panel-head-right">
              <text class="panel-meta">总收入 </text>
              <text class="panel-meta-val income">{{ formatMoney(report.summary.income) }}</text>
              <text class="panel-meta"> 记账笔数 {{ incomeCount }}</text>
            </view>
          </view>
          <EmptyState v-if="!report.incomeCategoriesL2.length" icon="icon-pie" text="暂无收入记录" />
          <template v-else>
            <view class="ring-area">
              <RingChart :items="incomeChartItems" :size="130" :thickness="24" show-labels />
            </view>
            <RankList :rows="report.incomeCategoriesL2" />
          </template>
        </view>
      </template>

      <!-- 导出报表 -->
      <view class="export-wrap">
        <view class="export-btn" @click="exportCsv">
          <SvgIcon name="icon-receipt" :size="16" />
          <text class="export-text">导出报表</text>
        </view>
      </view>
    </template>

    <!-- 时段选择弹窗：粒度由当前 Tab 记住的 period 长度决定，而不是等接口回来 -->
    <PeriodPicker
      v-model:visible="pickerVisible"
      :period="period"
      :granularity="period.length === 4 ? 'year' : 'month'"
      @confirm="onPeriodConfirm"
    />
  </view>
</template>

<script setup lang="ts">
/**
 * 报表页（独立页，底栏那一格「报表」跳转至此）。
 *
 * 两个 Tab：
 *   - 基础统计：结余汇总 + 记账里程碑 + 收入来源 + 支出分布 + 月度趋势（年粒度才有）
 *   - 分类：支出/收入分类统计（环形图带引出线标注 + 排行）
 *
 * 时段粒度由 PeriodPicker 决定：年（YYYY）按整年聚合、趋势显示 12 个月；
 * 年月（YYYY-MM）按单月聚合、不显示趋势。
 *
 * 三种状态统一由一次请求驱动（/statistics/report 是聚合接口，不会有"一半转圈"）。
 */
import { ref, reactive, computed, onMounted } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';
import EmptyState from '@/components/EmptyState.vue';
import RankList from '@/components/RankList.vue';
import RingChart from '@/components/RingChart.vue';
import TrendChart from '@/components/TrendChart.vue';
import PeriodPicker from '@/components/PeriodPicker.vue';
import { useAccountStore } from '@/store/account';
import { getReport, type ReportData, type ReportCategory } from '@/api/statistics';
import { CHART_SERIES } from '@/constants/chart';
import { formatMoney } from '@/utils/format';

const accountStore = useAccountStore();

const tab = ref<'basic' | 'category'>('basic');
const pickerVisible = ref(false);
const loading = ref(false);
const error = ref(false);

/**
 * 时段按 Tab **各自记忆**。
 *
 * 两个 Tab 的默认粒度不同，这是刻意的：
 *   · 基础统计看「走势与结构」→ 默认**当年**（趋势图有 12 个月才有意义）
 *   · 分类看「这个月花在哪」→ 默认**当月**（单月明细最常用）
 * 切换 Tab 时各用各的时段，互不干扰；在某个 Tab 改了时段也只影响它自己。
 */
const now = new Date();
const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const thisYear = String(now.getFullYear());

const tabState = reactive<Record<'basic' | 'category', { period: string }>>({
  basic: { period: thisYear },
  category: { period: thisMonth },
});

/** 当前 Tab 的时段 */
const period = computed(() => tabState[tab.value].period);

const report = reactive<ReportData>({
  period: '',
  granularity: 'month',
  start: '',
  end: '',
  summary: { income: '0.00', expense: '0.00', balance: '0.00', count: 0 },
  // 一级口径：基础统计 Tab
  expenseCategories: [],
  incomeCategories: [],
  // 二级口径：分类 Tab（同一份数据由后端一次产出，两级之和各自为 100%）
  expenseCategoriesL2: [],
  incomeCategoriesL2: [],
  trend: [],
});

/** 顶栏状态栏高度（custom 导航栏需要自己顶开） */
const statusBarHeight = ref(0);
try {
  const info = uni.getSystemInfoSync();
  statusBarHeight.value = info.statusBarHeight || 0;
} catch {
  statusBarHeight.value = 0;
}

const periodText = computed(() => {
  const [y, m] = period.value.split('-');
  return m ? `${y}年${Number(m)}月` : `${y}年`;
});

const hasData = computed(() => report.summary.count > 0);

/** 笔数：两级口径的 count 之和相同（同一批交易换了个分组方式），这里用二级的 */
const expenseCount = computed(() =>
  report.expenseCategoriesL2.reduce((sum, r) => sum + r.count, 0)
);
const incomeCount = computed(() =>
  report.incomeCategoriesL2.reduce((sum, r) => sum + r.count, 0)
);

/** 环形图数据：Top 6 + 其他（与其他页口径一致） */
function toChartItems(rows: ReportCategory[]) {
  const MAX = 6;
  if (rows.length <= MAX) {
    return rows.map((r, i) => ({ name: r.name, value: Number(r.sum), color: CHART_SERIES[i % CHART_SERIES.length] }));
  }
  const sorted = [...rows].sort((a, b) => Number(b.sum) - Number(a.sum));
  const rest = sorted.slice(MAX);
  const restSum = rest.reduce((s, r) => s + Number(r.sum), 0);
  const items = sorted.slice(0, MAX).map((r, i) => ({ name: r.name, value: Number(r.sum), color: CHART_SERIES[i] }));
  items.push({ name: '其他', value: restSum, color: CHART_SERIES[6] });
  return items;
}

/**
 * 环形图与排行都用**二级口径**（分类 Tab 的用途是「看清具体花在哪」）。
 * 基础统计 Tab 的「收入来源 / 支出分布」仍用一级口径（看大类结构）——
 * 两个 Tab 粒度不同是有意的，与参考图一致（图4 是一级、图5 是二级）。
 */
const expenseChartItems = computed(() => toChartItems(report.expenseCategoriesL2));
const incomeChartItems = computed(() => toChartItems(report.incomeCategoriesL2));

async function loadData() {
  loading.value = true;
  error.value = false;
  try {
    await accountStore.load();
    const data = await getReport(period.value, accountStore.currentId);
    Object.assign(report, data);
    // 时段回填：PeriodPicker 需要知道当前粒度才能正确回显模式
    report.period = data.period;
  } catch (err) {
    console.error('[report] 加载失败', err);
    error.value = true;
  } finally {
    loading.value = false;
  }
}

function switchTab(next: 'basic' | 'category') {
  if (tab.value === next) return;
  tab.value = next;
  // 每个 Tab 有自己的时段，切过去要用它自己的时段重新拉数据
  loadData();
}

/** 左右箭头按**当前 Tab 记忆的粒度**步进：年模式 ±1 年，月模式 ±1 月 */
function shiftPeriod(delta: number) {
  const cur = period.value;
  if (cur.length === 4) {
    tabState[tab.value].period = String(Number(cur) + delta);
  } else {
    const [y, m] = cur.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    tabState[tab.value].period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  loadData();
}

function onPeriodConfirm(payload: { period: string; granularity: 'year' | 'month' }) {
  tabState[tab.value].period = payload.period;
  loadData();
}

function goBack() {
  const pages = getCurrentPages();
  if (pages.length > 1) {
    uni.navigateBack();
  } else {
    uni.reLaunch({ url: '/pages/main/index' });
  }
}

/**
 * 导出当前 Tab + 当前时段为 CSV（H5 端）。
 * 纯前端拼接，数据就是页面上这一份，不需要额外接口。
 */
function exportCsv() {
  const rows: string[][] = [];
  const pt = periodText.value;
  if (tab.value === 'basic') {
    rows.push(['报表', '基础统计', pt]);
    rows.push(['结余', report.summary.balance]);
    rows.push(['总收入', report.summary.income]);
    rows.push(['总支出', report.summary.expense]);
    rows.push(['记账笔数', String(report.summary.count)]);
    rows.push([]);
    rows.push(['收入来源', '金额', '占比%']);
    report.incomeCategories.forEach((r) => rows.push([r.name, r.sum, String(r.ratio)]));
    rows.push([]);
    rows.push(['支出分布', '金额', '占比%']);
    report.expenseCategories.forEach((r) => rows.push([r.name, r.sum, String(r.ratio)]));
  } else {
    // 分类 Tab 导出二级口径；多一列「所属一级」便于在 Excel 里分组
    rows.push(['报表', '分类', pt]);
    rows.push(['支出分类统计', '金额', '占比%', '所属一级']);
    report.expenseCategoriesL2.forEach((r) =>
      rows.push([r.name, r.sum, String(r.ratio), r.parentName ?? ''])
    );
    rows.push([]);
    rows.push(['收入分类统计', '金额', '占比%', '所属一级']);
    report.incomeCategoriesL2.forEach((r) =>
      rows.push([r.name, r.sum, String(r.ratio), r.parentName ?? ''])
    );
  }

  // BOM 让 Excel 正确识别 UTF-8 中文
  const csv = '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\n');
  // #ifdef H5
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `报表_${tab.value === 'basic' ? '基础统计' : '分类'}_${period.value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  uni.showToast({ title: '已导出', icon: 'none' });
  // #endif
  // #ifndef H5
  uni.showToast({ title: '当前端暂不支持导出', icon: 'none' });
  // #endif
}

/** CSV 单元格转义：含逗号/引号/换行时用双引号包裹 */
function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

onMounted(loadData);
</script>

<style scoped lang="scss">
.page {
  min-height: $page-min-height;
  background: $bg-canvas;
}

/* ── 吸顶区：顶栏 + Tab ── */
.sticky-head {
  position: sticky;
  top: 0;
  z-index: 10;
  background: $bg-canvas;
}

/* ── 自绘顶栏 ── */
.nav {
  background: $bg-canvas;
}

.nav-inner {
  height: 44px;
  display: flex;
  align-items: center;
}

.nav-back {
  width: $touch-target-min;
  height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $text-primary;
}

.nav-title {
  flex: 1;
  text-align: center;
  font-size: $font-h2;
  line-height: $lh-h2;
  font-weight: $weight-semibold;
  color: $text-primary;
}

/* ── 顶部 Tab ── */
.tabs {
  display: flex;
  background: $bg-canvas;
  border-bottom: 1px solid $line;
}

.tab-item {
  flex: 1;
  min-height: $touch-target-min;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
}

.tab-text {
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  color: $text-secondary;
}

.tab-item.active .tab-text {
  color: $text-primary;
  font-weight: $weight-semibold;
}

.tab-underline {
  position: absolute;
  bottom: 0;
  width: 24px;
  height: 3px;
  border-radius: $radius-pill;
  background: $brand-600;
}

/* ── 时段选择栏 ── */
.period-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: $space-2 $space-4;
  border-bottom: 1px solid $line;
}

.period-arrow {
  width: $touch-target-min;
  min-height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $text-tertiary;
}

.period-center {
  flex: 1;
  min-height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $space-1;
}

.period-icon {
  color: $text-secondary;
}

.period-text {
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  font-weight: $weight-medium;
  color: $text-primary;
}

/* ── 状态 ── */
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

/* ── 账本流水统计 ── */
.hero {
  padding: $space-4;
  border-bottom: 1px solid $line;
}

.hero-label {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-secondary;
}

.hero-balance-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: $space-2;
}

.hero-balance-label {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-secondary;
  flex-shrink: 0;
}

.hero-balance {
  @include tabular-nums;
  font-size: $font-display;
  line-height: $lh-display;
  font-weight: $weight-semibold;
  color: $text-primary;
  text-align: right;
  @include text-safe;
}

.hero-io {
  display: flex;
  align-items: center;
  margin-top: $space-2;
}

.hero-io-item {
  @include tabular-nums;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-secondary;
  @include text-safe;
}

.hero-io-sep {
  margin: 0 $space-2;
  color: $text-disabled;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
}

/* ── 记账里程碑 ── */
.milestone {
  display: flex;
  align-items: center;
  padding: $space-3 $space-4;
  border-bottom: 1px solid $line;
}

.milestone-icon {
  color: $brand-700;
  margin-right: $space-2;
}

.milestone-label {
  flex: 1;
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-primary;
}

.milestone-count {
  @include tabular-nums;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-tertiary;
}

/* ── 面板 ── */
.panel {
  padding: $space-4;
  border-bottom: 1px solid $line;
}

.panel-title {
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  font-weight: $weight-semibold;
  color: $text-primary;
}

.panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: $space-2;
  margin-bottom: $space-2;
}

.panel-head-right {
  display: flex;
  align-items: baseline;
}

.panel-meta {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-tertiary;
}

.panel-meta-val {
  @include tabular-nums;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  font-weight: $weight-semibold;
}

.panel-meta-val.expense {
  color: $expense;
}

.panel-meta-val.income {
  color: $income;
}

.ring-area {
  display: flex;
  justify-content: center;
  /* 上下留白压到最小：SVG 画布已含引线外扩量，这里再加就会显得空旷 */
  padding: $space-1 0;
}

/* ── 导出 ── */
.export-wrap {
  display: flex;
  justify-content: center;
  padding: $space-5 $space-4;
}

.export-btn {
  display: flex;
  align-items: center;
  gap: $space-2;
  min-height: $touch-target-min;
  padding: 0 $space-5;
  border: 1px solid $line-strong;
  border-radius: $radius-md;
  color: $text-secondary;
}

.export-text {
  font-size: $font-body;
  line-height: $lh-body;
}

/* 宽屏（桌面端）限宽居中：报表页是独立页、没有底栏，可以安全限宽 */
@media (min-width: 600px) {
  .page {
    max-width: 480px;
    margin: 0 auto;
    border-left: 1px solid $line;
    border-right: 1px solid $line;
  }
}
</style>
