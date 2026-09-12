<template>
  <view class="page">
    <!-- 月份切换 -->
    <view class="month-bar">
      <view class="arrow-btn" @click="shiftMonth(-1)">‹</view>
      <picker mode="date" fields="month" :value="month" @change="onMonthChange">
        <view class="month-text">{{ month }}</view>
      </picker>
      <view class="arrow-btn" @click="shiftMonth(1)">›</view>
    </view>

    <!-- 当前账本 -->
    <view class="account-line">
      <text class="account-line-text">📁 统计范围：{{ accountStore.currentName }}</text>
    </view>

    <!-- 汇总 -->
    <view class="summary">
      <view class="summary-item">
        <text class="label">收入</text>
        <text class="value income">¥{{ stat.income }}</text>
      </view>
      <view class="summary-item">
        <text class="label">支出</text>
        <text class="value expense">¥{{ stat.expense }}</text>
      </view>
      <view class="summary-item">
        <text class="label">结余</text>
        <text class="value">¥{{ stat.balance }}</text>
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
        icon="📊"
        :text="`本月暂无${type === 'expense' ? '支出' : '收入'}记录`"
      />

      <view v-else class="chart-area">
        <RingChart
          :items="chartItems"
          :size="180"
          :thickness="26"
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

    <RecordFab />
  </view>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import RingChart from '@/components/RingChart.vue';
import EmptyState from '@/components/EmptyState.vue';
import RecordFab from '@/components/RecordFab.vue';
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
      icon: '📦',
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

onLoad(async () => {
  await accountStore.load();
  loadData();
});
onShow(async () => {
  await accountStore.load();
  loadData();
});
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  background: $bg-page;
  padding: 16px;
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}

.month-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  background: $bg-card;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 16px;
}

.arrow-btn {
  /* 44×44：翻月是高频操作，用满触控建议值 */
  width: $touch-target-min;
  padding: 10px 0;
  text-align: center;
  font-size: $icon-xl;
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

.summary {
  display: flex;
  /* ×2 下每个金额需要 215px，三个并排 645px ≫ 内宽 288px。wrap 让它们各占一行 */
  flex-wrap: wrap;
  background: $bg-card;
  border-radius: 12px;
  padding: 20px 0;
  margin-bottom: 16px;
}

.account-line {
  padding: 0 4px 10px;
}

.account-line-text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-secondary;
}

.summary-item {
  /* 用 flex-basis: auto —— 理由见 home 页 .sub-item 的注释：
     换行与否应当由「内容真实宽度 vs 容器可用宽度」决定，而不是某个写死的阈值。
     三栏实测（320px 视口，卡片内宽 288px）：
       「¥32130.80」@ $font-h1 20px 需要约 105px，三等分每栏只有 96px
       → 3 × 105 = 315 > 288，于是换行（原来的写法是硬挤进 96px，
         结果三个金额互相压住、数字叠在一起，而 body 的 overflow-x:hidden
         让这个屏既没有滚动条也没有报错，只有肉眼能看出来）。
       ×2 字号下每栏需要约 210px，一行只放得下一个 → 三个纵向排开 */
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.label {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-tertiary;
}

.value {
  @include tabular-nums;
  font-size: $font-h1;
  line-height: $lh-h1;
  font-weight: $weight-semibold;
  color: $text-primary;
  margin-top: 4px;
}

.income {
  color: $income;
}

.expense {
  color: $expense;
}

.panel {
  background: $bg-card;
  border-radius: 12px;
  padding: 16px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
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
  padding: 8px 12px;
  margin-left: 8px;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-secondary;
  background: $bg-subtle;
  border-radius: 12px;
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
  margin-top: 20px;
}

.legend-item {
  display: flex;
  /* ×2 下 色点18 + 名称84 + 金额200 + 占比99 ≫ 内宽 256px。
     wrap 后「金额 + 占比」整体掉到第二行；margin-left:auto 负责贴右。 */
  flex-wrap: wrap;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid $divider;
}

.legend-item:last-child {
  border-bottom: none;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 8px;
}

.legend-name {
  flex: 1;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-primary;
}

.legend-sum {
  // 等宽数字 + 定宽右对齐：让「¥1,234.56」和「¥12.00」的小数点竖直对齐
  // （不加 min-width 的话 box 宽度随内容变化，text-align 形同虚设）
  @include amount;
  min-width: 76px;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-secondary;
  margin-right: 12px;
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
  padding: 40px 0;
  color: $text-tertiary;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
}
</style>
