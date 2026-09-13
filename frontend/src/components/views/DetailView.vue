<template>
  <view class="page">
    <!-- 筛选栏 -->
    <view class="filter-bar">
      <picker mode="date" fields="month" :value="month" @change="onMonthChange">
        <view class="filter-item">
          <text>{{ month }}</text>
          <SvgIcon class="arrow" name="icon-chevron-down" :size="12" />
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

    <!-- 汇总：支出是结论，收入是明细 -->
    <view class="summary">
      <view class="summary-left">
        <SvgIcon name="icon-wallet" :size="14" />
        <text class="summary-account">{{ accountStore.currentName }}</text>
      </view>
      <view class="summary-right">
        <text class="summary-expense">-{{ stat.expense }}</text>
        <text class="summary-income">收入 +{{ stat.income }}</text>
      </view>
    </view>

    <!-- 加载中（首次） -->
    <view v-if="loading && !list.length" class="tip">加载中...</view>

    <!-- 空状态 -->
    <EmptyState
      v-else-if="!list.length"
      icon="icon-receipt"
      text="这个月还没有记录"
      button-text="去记一笔"
      @action="goRecord"
    />

    <!-- 列表：按日分组，左滑可编辑/删除，点击整行也能编辑 -->
    <view v-for="group in grouped" :key="group.date" class="day-group">
      <!-- 日期粘性头：日期 + 当日小计 -->
      <view class="day-header">
        <text class="day-date">{{ formatDay(group.date) }}</text>
        <text class="day-sum">
          <text v-if="group.income > 0" class="day-income">+{{ group.income.toFixed(2) }}</text>
          <text v-if="group.expense > 0" class="day-expense">-{{ group.expense.toFixed(2) }}</text>
        </text>
      </view>

      <uni-swipe-action>
        <uni-swipe-action-item
          v-for="item in group.items"
          :key="item.id"
          :right-options="swipeOptions"
          @click="onSwipeClick($event, item)"
        >
          <view class="list-item" @click="goEdit(item)">
            <view class="item-icon">
              <CategoryIcon :name="item.category?.icon" :size="20" />
            </view>
            <view class="item-main">
              <text class="item-name">{{ item.category?.name || '未分类' }}</text>
              <text class="item-meta">
                {{ item.recordTime ? item.recordTime.slice(0, 5) + ' ' : '' }}{{ item.note }}
              </text>
            </view>
            <text class="item-amount" :class="item.type === 'income' ? 'income' : 'expense'">
              {{ item.type === 'income' ? '+' : '-' }}{{ item.amount }}
            </text>
          </view>
        </uni-swipe-action-item>
      </uni-swipe-action>
    </view>

    <!-- 上拉加载更多 -->
    <uni-load-more
      v-if="list.length"
      :status="loadMoreStatus"
      :content-text="loadMoreText"
    />

    <!-- 底栏由容器统一承载 -->
  </view>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import EmptyState from '@/components/EmptyState.vue';
import { getTransactions, deleteTransaction, type TransactionItem } from '@/api/transaction';
import { getMonthlyStat } from '@/api/statistics';
import { useAccountStore } from '@/store/account';
import SvgIcon from '@/components/SvgIcon.vue';
import CategoryIcon from '@/components/CategoryIcon.vue';

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

/**
 * 按记账日期分组，并算出当日收支小计（方案 §7.2 的 ③）。
 *
 * 后端已按 record_date DESC 排序，所以这里顺序遍历即可自然得到"新日期在前"，
 * 不需要再排序。分页追加的数据会触发重新计算。
 */
const grouped = computed(() => {
  const map = new Map<
    string,
    { date: string; income: number; expense: number; items: TransactionItem[] }
  >();

  for (const item of list.value) {
    let g = map.get(item.recordDate);
    if (!g) {
      g = { date: item.recordDate, income: 0, expense: 0, items: [] };
      map.set(item.recordDate, g);
    }
    if (item.type === 'income') g.income += Number(item.amount);
    else g.expense += Number(item.amount);
    g.items.push(item);
  }

  return Array.from(map.values());
});

/** 日期头文案：今天 / 昨天 / M月D日 周X */
function formatDay(date: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  if (date === todayStr) return '今天';

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayStr = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(
    yesterday.getDate(),
  )}`;
  if (date === yesterdayStr) return '昨天';

  const [y, m, d] = date.split('-').map(Number);
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][
    new Date(y, m - 1, d).getDay()
  ];
  return `${m}月${d}日 ${week}`;
}

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

/**
 * 由容器在「切到本视图」或「容器页重新显示」时调用。
 * 从记一笔/编辑页返回、或在首页切换了账本时都要刷新，所以每次激活都重载。
 */
async function activate() {
  await accountStore.load();
  loadStat();
  loadList(true);
}

/** 容器转发：下拉刷新 */
function onPullDownRefresh() {
  loadStat();
  loadList(true);
}

/** 容器转发：触底加载下一页 */
function onReachBottom() {
  if (!hasMore.value) return;
  page.value += 1;
  loadList(false);
}

onMounted(activate);

defineExpose({ activate, onPullDownRefresh, onReachBottom });
</script>

<style scoped lang="scss">
/* ============================================================
   明细页 · FL-1「通栏扁平」
   分区靠发丝线与 subtle 底，不靠卡片浮起；间距一律走 8px 栅格。
   ============================================================ */
.page {
  min-height: $page-min-height;
  background: $bg-canvas;
  /* 自定义导航栏 52px + 凸起按钮向外溢出的部分 */
  padding-bottom: calc(88px + env(safe-area-inset-bottom));
}

/* ── 筛选条：吸顶，靠下边线表达层级（不用阴影） ── */
.filter-bar {
  position: sticky;
  top: 0;
  z-index: 10;
  background: $bg-canvas;
  padding: $space-3 $space-4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid $line;
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
  color: $text-tertiary;
  margin-left: $space-1;
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

/* ── 汇总：支出是结论（大、带符号），收入是明细（小） ── */
.summary {
  display: flex;
  /* ×2 字号下右侧（支出金额 + 收入）实测需要 274px，而内容宽只有 288px ——
     加上左侧账本名就必然顶破（实测文档宽 325 > 视口 320）。
     wrap 让右侧整体掉到第二行。这条是 320px×200% 复验抓出来的既有问题：
     单页容器改造后一直没重跑复验（方案文档 §7.4 的脚本丢在 /tmp 里了）。 */
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  padding: $space-3 $space-4;
  background: $bg-canvas;
  border-bottom: 1px solid $line;
}

.summary-left {
  display: flex;
  align-items: center;
  gap: $space-1;
  min-width: 0;
}

.summary-account {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-secondary;
  @include text-safe;
}

.summary-right {
  display: flex;
  /* ① 自己也要能换行：×2 下调到第二行后，它自身仍需 309px 而内容宽只有 288px，
        光靠父级 wrap 不够（实测「收入 +16000.00」的右边界到了 325 > 320）。
     ② 去掉 flex-shrink: 0 —— 那条是"宁可溢出也不压缩"，在大字号下正是溢出的成因；
        改为允许换行后就不需要它了。 */
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: flex-end;
  min-width: 0;
  /* 与账本名同行时没有剩余空间，auto 是 no-op；掉到第二行后它负责靠右 */
  margin-left: auto;
}

.summary-expense {
  @include tabular-nums;
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  font-weight: $weight-semibold;
  /* 支出红压白底 4.83:1 ✅（压 subtle 只有 4.47，故金额必须落白底） */
  color: $expense;
}

.summary-income {
  margin-left: $space-3;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-secondary;
}

/* ── 按日分组 ── */
.day-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $space-2 $space-4;
  background: $bg-subtle;
  border-bottom: 1px solid $line;
}

.day-date {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-secondary;
}

.day-sum {
  display: flex;
  align-items: baseline;
}

/*
 * ⚠️ 这里的当日小计**故意不用红绿**：
 *   支出红压 subtle(#EEF1F5) 只有 4.26:1、收入绿 4.46:1，都不达标（方案 §4.3）。
 *   收支的区分改由 +/− 符号承担（WCAG 1.4.1 本来也要求符号同步）。
 */
.day-income,
.day-expense {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-secondary;
}

.day-income {
  margin-right: $space-2;
}

/* ── 列表行：行高 56 = 上下的 8px + 图标 40 ── */
.list-item {
  display: flex;
  align-items: center;
  min-height: 56px;
  padding: $space-2 $space-4;
  background: $bg-canvas;
  border-bottom: 1px solid $line;
}

.item-icon {
  width: 40px;
  height: 40px;
  /* 方形色块：方案 §6.3 规定圆形只给头像与环形图，
     方形在小尺寸下可辨识度更高 */
  border-radius: $radius-md;
  background: $bg-sunken;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  /* 压 $bg-sunken(#EEF1F5) 13.93:1 */
  color: $text-primary;
}

.item-main {
  flex: 1;
  margin-left: $space-3;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.item-name {
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-primary;
  @include text-safe;
}

.item-meta {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-tertiary;
  margin-top: 2px;
  @include text-safe;
}

.item-amount {
  // 等宽数字 + 定宽右对齐：让各行的「+1,234.56」「-12.00」小数点竖直对齐。
  // 只写 text-align 是没用的 —— 这一格宽度由内容决定，
  // 必须先给 min-width 撑出固定宽度，右对齐才有对象可言。
  @include amount;
  min-width: 84px;
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  font-weight: $weight-medium;
  flex-shrink: 0;
}

.income {
  color: $income;
}

.expense {
  color: $expense;
}

.tip {
  text-align: center;
  padding: $space-6 0;
  color: $text-secondary;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
}
</style>
