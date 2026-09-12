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
          <view v-for="(row, index) in rows" :key="row.categoryId || index" class="legend-item">
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

const accountStore = useAccountStore();

const palette = [
  '#FF6B35',
  '#4A90D9',
  '#F5A623',
  '#7ED321',
  '#BD10E0',
  '#50E3C2',
  '#9B9B9B',
  '#FF4081',
];

const month = ref(currentMonth());
const type = ref<'income' | 'expense'>('expense');
const rows = ref<CategoryStatItem[]>([]);
const stat = reactive({ month: '', income: '0.00', expense: '0.00', balance: '0.00' });

const totalAmount = computed(() =>
  rows.value.reduce((sum, r) => sum + Number(r.sum), 0).toFixed(2)
);

const chartItems = computed(() =>
  rows.value.map((r, index) => ({
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

<style scoped>
.page {
  min-height: 100vh;
  background: #f5f6f8;
  padding: 16px;
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}

.month-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 16px;
}

.arrow-btn {
  width: 40px;
  text-align: center;
  font-size: 22px;
  color: #999;
}

.month-text {
  min-width: 120px;
  text-align: center;
  font-size: 16px;
  font-weight: 500;
  color: #333;
}

.summary {
  display: flex;
  background: #fff;
  border-radius: 12px;
  padding: 20px 0;
  margin-bottom: 16px;
}

.account-line {
  padding: 0 4px 10px;
}

.account-line-text {
  font-size: 13px;
  color: #666;
}

.summary-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.label {
  font-size: 12px;
  color: #999;
}

.value {
  font-size: 18px;
  font-weight: 600;
  color: #333;
  margin-top: 4px;
}

.income {
  color: #52c41a;
}

.expense {
  color: #ff4d4f;
}

.panel {
  background: #fff;
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
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.type-tabs {
  display: flex;
}

.tab {
  padding: 4px 12px;
  margin-left: 8px;
  font-size: 13px;
  color: #666;
  background: #f5f5f5;
  border-radius: 12px;
}

.tab.active {
  background: #ff6b35;
  color: #fff;
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
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f5f5f5;
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
  font-size: 14px;
  color: #333;
}

.legend-sum {
  font-size: 14px;
  color: #666;
  margin-right: 12px;
}

.legend-ratio {
  width: 56px;
  text-align: right;
  font-size: 13px;
  color: #999;
}

.empty {
  text-align: center;
  padding: 40px 0;
  color: #999;
  font-size: 13px;
}
</style>
