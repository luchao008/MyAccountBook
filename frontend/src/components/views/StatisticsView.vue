<template>
  <view class="page">
    <!-- 月份切换 -->
    <view class="month-bar">
      <view class="arrow-btn" @click="shiftMonth(-1)"><SvgIcon name="icon-chevron-left" :size="20" /></view>
      <picker mode="date" fields="month" :value="month" @change="onMonthChange">
        <view class="month-text">{{ month }}</view>
      </picker>
      <view class="arrow-btn" @click="shiftMonth(1)"><SvgIcon name="icon-chevron-right" :size="20" /></view>
    </view>

    <!-- 当前账本 -->
    <view class="account-line">
      <view class="account-line-text">
        <SvgIcon name="icon-wallet" :size="14" />
        <text>统计范围：{{ accountStore.currentName }}</text>
      </view>
    </view>

    <!-- 汇总：结余是结论（独占一行、28px），收入与支出是明细（14px 并排小字） -->
    <view class="summary">
      <view class="balance-row">
        <text class="balance-label">结余</text>
        <text class="balance-value">¥{{ stat.balance }}</text>
      </view>
      <view class="io-row">
        <text class="io-item income">收入 +{{ stat.income }}</text>
        <text class="io-item expense">支出 -{{ stat.expense }}</text>
      </view>
    </view>

    <!-- 分类占比 -->
    <view class="panel">
      <view class="panel-header">
        <text class="panel-title">分类占比</text>
        <view class="type-tabs">
          <text
            class="tab"
            :class="{ active: type === 'expense' }"
            @click="setType('expense')"
          >
            支出
          </text>
          <text class="tab" :class="{ active: type === 'income' }" @click="setType('income')">
            收入
          </text>
        </view>
      </view>

      <EmptyState
        v-if="!rows.length"
        icon="icon-chart-bar"
        :text="`本月暂无${type === 'expense' ? '支出' : '收入'}记录`"
      />

      <view v-else class="chart-area">
        <RingChart
          :items="chartItems"
          :size="180"
          :thickness="24"
          :center-label="type === 'expense' ? '总支出' : '总收入'"
          :center-value="`¥${totalAmount}`"
        />

        <view class="legend">
          <view v-for="(row, index) in displayRows" :key="row.categoryId || index" class="legend-item">
            <view class="dot" :style="{ background: palette[index % palette.length] }" />
            <text class="legend-name">{{ row.name }}</text>
            <text class="legend-sum">¥{{ row.sum }}</text>
            <text class="legend-ratio">{{ row.ratio }}%</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 底栏由容器统一承载 -->
  </view>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import RingChart from '@/components/RingChart.vue';
import SvgIcon from '@/components/SvgIcon.vue';
import EmptyState from '@/components/EmptyState.vue';
import { useAccountStore } from '@/store/account';
import { getMonthlyStat, getCategoryStat, type CategoryStatItem } from '@/api/statistics';
import { CHART_SERIES } from '@/constants/chart';

const accountStore = useAccountStore();

const palette = [...CHART_SERIES];

const month = ref(currentMonth());
const type = ref<'income' | 'expense'>('expense');
const rows = ref<CategoryStatItem[]>([]);
const stat = reactive({ month: '', income: '0.00', expense: '0.00', balance: '0.00' });

/**
 * 环形图最多 7 段 = Top 6 + 「其他」。
 *
 * 为什么阈值是「超过 6」而不是「超过 7」：调色板第 7 色（中性灰 #8a94a6）
 * 是**专供「其他」**的，只有聚合才用得上。若允许 7 个真实分类各占一色，
 * 第 7 个分类就会顶着灰色出现 —— 灰色在这一屏里就等于「其他」，语义会打架。
 * 所以一超过 6 个分类就聚合，保证「灰 = 其他」这条对应关系永远成立。
 */
const MAX_SLICES = 6;

const displayRows = computed<CategoryStatItem[]>(() => {
  const list = rows.value;
  if (list.length <= MAX_SLICES) return list;

  const sorted = [...list].sort((a, b) => Number(b.sum) - Number(a.sum));
  const rest = sorted.slice(MAX_SLICES);
  const restSum = rest.reduce((sum, r) => sum + Number(r.sum), 0);
  const all = sorted.reduce((sum, r) => sum + Number(r.sum), 0);

  return [
    ...sorted.slice(0, MAX_SLICES),
    {
      categoryId: null,
      name: '其他',
      icon: 'cat-misc',
      type: type.value,
      sum: restSum.toFixed(2),
      // 占比按「金额 / 总额」重算，而不是把各段百分比相加（四舍五入会凑不出 100%）
      ratio: all > 0 ? Number(((restSum / all) * 100).toFixed(2)) : 0,
      count: rest.reduce((sum, r) => sum + r.count, 0),
    },
  ];
});

const totalAmount = computed(() =>
  rows.value.reduce((sum, r) => sum + Number(r.sum), 0).toFixed(2)
);

const chartItems = computed(() =>
  displayRows.value.map((r, index) => ({
    name: r.name,
    value: Number(r.sum),
    color: palette[index % palette.length],
  }))
);

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function loadData() {
  try {
    const accountId = accountStore.currentId;
    const monthly = await getMonthlyStat(month.value, accountId);
    stat.month = monthly.month;
    stat.income = monthly.income;
    stat.expense = monthly.expense;
    stat.balance = monthly.balance;

    rows.value = await getCategoryStat(month.value, type.value, accountId);
  } catch (err) {
    console.error('[statistics] 加载失败', err);
  }
}

function shiftMonth(delta: number) {
  const [y, m] = month.value.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  month.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  loadData();
}

function onMonthChange(e: any) {
  month.value = e.detail.value;
  loadData();
}

function setType(next: 'income' | 'expense') {
  if (type.value === next) return;
  type.value = next;
  loadData();
}

/** 由容器在「切到本视图」或「容器页重新显示」时调用 */
async function activate() {
  await accountStore.load();
  loadData();
}

onMounted(activate);

defineExpose({ activate });
</script>

<style scoped lang="scss">
/* ============================================================
   统计页 · FL-1「通栏扁平 + 数字优先」
   ============================================================ */
.page {
  min-height: $page-min-height;
  background: $bg-canvas;
  padding: 0;
  /*
   * 底栏留白，**默认 0**。
   *
   * 本视图目前只被独立页「报表」（`pages/statistics`）承载，那页没有底栏，
   * 所以默认值就是 0 —— 不留一段凭空多出来的 88px 空白。
   * 若将来把它放回容器（容器有底栏），由承载方显式给 `--view-bottom-gap: 88px`
   * （56px 底栏 + 凸起按钮外溢），这套约定与账本选择页给 MineView 写的
   * `--view-bottom-gap: 52px` 是同一个。
   * 默认取"没有底栏"而不是"有底栏"：**让默认值等于最常见的实际情形**，
   * 忘记设的场景会表现为"内容贴着底部"（一眼能看出），而不是"页底一片空白"（容易被忽略）。
   */
  padding-bottom: calc(var(--view-bottom-gap, 0px) + env(safe-area-inset-bottom));
}

/* ── 月份切换：通栏 + 下边线（不再做成浮起的白卡） ── */
.month-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  background: $bg-canvas;
  padding: $space-2 $space-4;
  border-bottom: 1px solid $line;
}

.arrow-btn {
  /* 44×44：翻月是高频操作，用满触控建议值。
     改用 flex 居中 + min-height，让触控目标不再依赖字体行高 */
  width: $touch-target-min;
  min-height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $text-tertiary;
}

.month-text {
  min-width: 120px;
  /* 24px 行盒 + 上下各 6px = 36（picker 的点击区就是这层） */
  padding: 6px 0;
  text-align: center;
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  font-weight: $weight-medium;
  color: $text-primary;
}

.account-line {
  padding: $space-3 $space-4 $space-2;
}

.account-line-text {
  display: flex;
  align-items: center;
  gap: $space-1;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-secondary;
}

/*
 * 汇总：结余独占一行（它是「结论」），收入/支出降为并排小字（它们是「明细」）。
 *
 * 这一处改的是方案 §7.3 记录的一个**实测 bug**：
 * 原设计把三个金额做成 20px 并排三栏，阶段 5 归一到 20px 后每栏需 105px，
 * 而三等分只有 96px —— 三个数字互相压在一起，
 * 且 body 的 overflow-x:hidden 让它既不报错也不出滚动条，只有肉眼能看出来。
 * 现在层级也清楚了：三栏并列等于告诉用户「这三个同等重要」，而事实不是。
 */
.summary {
  padding: $space-4 $space-4 $space-3;
  background: $bg-canvas;
  border-bottom: 1px solid $line;
}

.balance-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.balance-label {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-secondary;
  flex-shrink: 0;
}

.balance-value {
  @include tabular-nums;
  font-size: $font-display;
  line-height: $lh-display;
  font-weight: $weight-semibold;
  color: $text-primary;
  text-align: right;
  /* ×2 字号下金额需要折行而不是被裁掉（金额宁可换行也不能丢内容） */
  @include text-safe;
}

.io-row {
  display: flex;
  align-items: baseline;
  margin-top: $space-2;
}

.io-item {
  @include tabular-nums;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  margin-right: $space-4;
  @include text-safe;
}

.income {
  color: $income;
}

.expense {
  color: $expense;
}

/* ── 分类占比：通栏，靠上边线与上面的汇总区分 ── */
.panel {
  background: $bg-canvas;
  padding: $space-4;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: $space-3;
}

.panel-title {
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  font-weight: $weight-semibold;
  color: $text-primary;
}

.type-tabs {
  display: flex;
}

.tab {
  /* 22px 行盒 + 上下各 8px = 38 */
  padding: $space-2 $space-3;
  margin-left: $space-2;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-secondary;
  background: $bg-subtle;
  border-radius: $radius-sm;
}

.tab.active {
  background: $brand-600;
  color: $text-inverse;
}

.chart-area {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.legend {
  width: 100%;
  margin-top: $space-5;
}

.legend-item {
  display: flex;
  /* ×2 下 色点18 + 名称84 + 金额200 + 占比99 ≫ 内宽 256px。
     wrap 后「金额 + 占比」整体掉到第二行；margin-left:auto 负责贴右。 */
  flex-wrap: wrap;
  align-items: center;
  padding: $space-2 0;
  border-bottom: 1px solid $line;
}

.legend-item:last-child {
  border-bottom: none;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: $space-2;
  flex-shrink: 0;
}

.legend-name {
  flex: 1;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-primary;
  @include text-safe;
}

.legend-sum {
  // 等宽数字 + 定宽右对齐：让「¥1,234.56」和「¥12.00」的小数点竖直对齐
  // （不加 min-width 的话 box 宽度随内容变化，text-align 形同虚设）
  @include amount;
  min-width: 76px;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-secondary;
  margin-right: $space-3;
  /* 与名称同行时没有剩余空间，auto 是 no-op；独占一行时把金额+占比推到右侧 */
  margin-left: auto;
}

.legend-ratio {
  /* 原本写死 width: 56px —— ×2 下「40.26%」实测需要 99px，
     被死死卡在 56px 里溢出后遭裁切（实测 R=331 > 视口 320）。
     按方案 §3.3：固定宽度一律改 min-width，右对齐的约束由 text-align 承担。 */
  min-width: 56px;
  flex-shrink: 0;
  text-align: right;
  @include tabular-nums;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-tertiary;
}

.empty {
  text-align: center;
  padding: $space-8 0;
  color: $text-tertiary;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
}
</style>
