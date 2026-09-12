<template>
  <view class="page">
    <!-- 筛选栏 -->
    <view class="filter-bar">
      <picker mode="date" fields="month" :value="month" @change="onMonthChange">
        <view class="filter-item">
          <text>{{ month }}</text>
          <text class="arrow">▾</text>
        </view>
      </picker>
      <view class="type-tabs">
        <text
          v-for="tab in typeTabs"
          :key="tab.value"
          class="tab"
          :class="{ active: typeFilter === tab.value }"
          @click="setType(tab.value)"
        >
          {{ tab.label }}
        </text>
      </view>
    </view>

    <!-- 汇总 -->
    <view class="summary">
      <text class="summary-text">
        📁 {{ accountStore.currentName }} · 收入 ¥{{ stat.income }} · 支出 ¥{{ stat.expense }}
      </text>
    </view>

    <!-- 加载中（首次） -->
    <view v-if="loading && !list.length" class="tip">加载中...</view>

    <!-- 空状态 -->
    <EmptyState
      v-else-if="!list.length"
      icon="📒"
      text="这个月还没有记录"
      button-text="去记一笔"
      @action="goRecord"
    />

    <!-- 列表：左滑可编辑/删除，点击整行也能编辑 -->
    <uni-swipe-action v-else>
      <uni-swipe-action-item
        v-for="item in list"
        :key="item.id"
        :right-options="swipeOptions"
        @click="onSwipeClick($event, item)"
      >
        <view class="list-item" @click="goEdit(item)">
          <view class="item-icon">
            <text>{{ iconOf(item.category?.icon) }}</text>
          </view>
          <view class="item-main">
            <text class="item-name">{{ item.category?.name || '未分类' }}</text>
            <text class="item-meta">{{ item.recordDate }} {{ item.note }}</text>
          </view>
          <text class="item-amount" :class="item.type === 'income' ? 'income' : 'expense'">
            {{ item.type === 'income' ? '+' : '-' }}{{ item.amount }}
          </text>
        </view>
      </uni-swipe-action-item>
    </uni-swipe-action>

    <!-- 上拉加载更多 -->
    <uni-load-more
      v-if="list.length"
      :status="loadMoreStatus"
      :content-text="loadMoreText"
    />

    <RecordFab />
  </view>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { onLoad, onShow, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import EmptyState from '@/components/EmptyState.vue';
import RecordFab from '@/components/RecordFab.vue';
import { getTransactions, deleteTransaction, type TransactionItem } from '@/api/transaction';
import { getMonthlyStat } from '@/api/statistics';
import { useAccountStore } from '@/store/account';
import { iconOf } from '@/utils/icon';

const accountStore = useAccountStore();

const list = ref<TransactionItem[]>([]);
const loading = ref(false);
const page = ref(1);
const size = 10;
const total = ref(0);

const typeFilter = ref<'all' | 'income' | 'expense'>('all');
const typeTabs = [
  { label: '全部', value: 'all' as const },
  { label: '收入', value: 'income' as const },
  { label: '支出', value: 'expense' as const },
];

const stat = reactive({ income: '0.00', expense: '0.00' });

const month = ref(currentMonth());
const hasMore = computed(() => list.value.length < total.value);

/** uni-load-more 状态：more / loading / noMore */
const loadMoreStatus = computed(() => {
  if (loading.value && list.value.length) return 'loading';
  return hasMore.value ? 'more' : 'noMore';
});

const loadMoreText = {
  contentdown: '上拉加载更多',
  contentrefresh: '加载中...',
  contentnomore: '没有更多了',
};

const swipeOptions = [
  { text: '编辑', style: { backgroundColor: '#1D63B8' } },
  { text: '删除', style: { backgroundColor: '#D92D20' } },
];

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 月份 -> 日期区间（闭区间） */
function monthRange(m: string) {
  const [y, mm] = m.split('-').map(Number);
  const lastDay = new Date(y, mm, 0).getDate();
  return { start: `${m}-01`, end: `${m}-${String(lastDay).padStart(2, '0')}` };
}

async function loadStat() {
  try {
    const res = await getMonthlyStat(month.value, accountStore.currentId);
    stat.income = res.income;
    stat.expense = res.expense;
  } catch (err) {
    console.error('[detail] 统计加载失败', err);
  }
}

async function loadList(reset = true) {
  if (loading.value) return;
  if (reset) page.value = 1;

  loading.value = true;
  try {
    const { start, end } = monthRange(month.value);
    const params: Record<string, any> = {
      start,
      end,
      page: page.value,
      size,
      accountId: accountStore.currentId,
    };
    if (typeFilter.value !== 'all') params.type = typeFilter.value;

    const res = await getTransactions(params);
    total.value = res.total;
    list.value = reset ? res.list : [...list.value, ...res.list];
  } catch (err) {
    console.error('[detail] 列表加载失败', err);
  } finally {
    loading.value = false;
    uni.stopPullDownRefresh();
  }
}

function onMonthChange(e: any) {
  month.value = e.detail.value;
  loadStat();
  loadList(true);
}

function setType(value: 'all' | 'income' | 'expense') {
  if (typeFilter.value === value) return;
  typeFilter.value = value;
  loadList(true);
}

function goRecord() {
  uni.navigateTo({ url: '/pages/record/index' });
}

function goEdit(item: TransactionItem) {
  uni.navigateTo({ url: `/pages/record/index?id=${item.id}` });
}

function confirmDelete(item: TransactionItem) {
  uni.showModal({
    title: '确认删除',
    content: '删除后不可恢复，确定要删除这笔记录吗？',
    success: async (res) => {
      if (!res.confirm) return;
      try {
        await deleteTransaction(item.id);
        uni.showToast({ title: '已删除', icon: 'success' });
        loadStat();
        loadList(true);
      } catch (err) {
        console.error('[detail] 删除失败', err);
      }
    },
  });
}

function onSwipeClick(e: any, item: TransactionItem) {
  // right-options 顺序：[编辑, 删除]
  if (e.index === 0) goEdit(item);
  else if (e.index === 1) confirmDelete(item);
}

onLoad(async () => {
  await accountStore.load();
  loadStat();
  loadList(true);
});

onShow(async () => {
  // 从记一笔/编辑页返回、或在首页切换了账本时都要刷新
  await accountStore.load();
  loadStat();
  loadList(true);
});

onPullDownRefresh(() => {
  loadStat();
  loadList(true);
});

onReachBottom(() => {
  if (!hasMore.value) return;
  page.value += 1;
  loadList(false);
});
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  background: $bg-page;
  padding-bottom: calc(72px + env(safe-area-inset-bottom));
}

.filter-bar {
  position: sticky;
  top: 0;
  z-index: 10;
  background: $bg-card;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid $divider;
}

.filter-item {
  display: flex;
  align-items: center;
  /* 月份筛选是本页主控件：原为 24px（刚好卡在 SC 2.5.8 的 AA 下限），
     上下各加 6px 后 36px —— 未达 44 的建议值，理由与实测值见方案 §7.3 */
  padding: 6px 0;
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-primary;
  font-weight: $weight-medium;
}

.arrow {
  font-size: $icon-xs;
  color: $text-tertiary;
  margin-left: 4px;
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

.summary {
  padding: 12px 16px;
  background: $bg-card;
  margin-bottom: 8px;
}

.summary-text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-secondary;
}

.list-item {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  background: $bg-card;
  border-bottom: 1px solid $divider;
}

.item-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: $bg-subtle;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: $icon-lg;
}

.item-main {
  flex: 1;
  margin-left: 12px;
  display: flex;
  flex-direction: column;
}

.item-name {
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-primary;
}

.item-meta {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-tertiary;
  margin-top: 2px;
}

.item-amount {
  // 等宽数字 + 定宽右对齐：让各行的「+1,234.56」「-12.00」小数点竖直对齐。
  // 只写 text-align 是没用的 —— 这一格宽度由内容决定，
  // 必须先给 min-width 撑出固定宽度，右对齐才有对象可言。
  @include amount;
  min-width: 80px;
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

.tip {
  text-align: center;
  padding: 24px 0;
  color: $text-secondary;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
}
</style>
