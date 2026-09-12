<template>
  <view class="page">
    <!-- 顶部 banner：当前账本的历年累计 -->
    <view class="banner">
      <view class="banner-top">
        <view class="account-switch" @click="switchAccount">
          <text class="account-icon">📁</text>
          <text class="account-name">{{ accountStore.currentName }}</text>
          <text class="account-arrow">▾</text>
        </view>
        <text class="banner-deco">📊</text>
      </view>

      <view class="banner-main">
        <text class="banner-label">总支出</text>
        <text class="banner-expense">¥{{ formatMoney(overview.total.expense) }}</text>
      </view>

      <view class="banner-sub">
        <view class="sub-item">
          <text class="sub-label">总收入</text>
          <text class="sub-value">{{ formatMoney(overview.total.income) }}</text>
        </view>
        <view class="sub-item">
          <text class="sub-label">结余</text>
          <text class="sub-value">{{ formatMoney(overview.total.balance) }}</text>
        </view>
      </view>
    </view>

    <!-- 时间区间统计 -->
    <view class="card range-card">
      <view v-for="(item, index) in overview.ranges" :key="item.key" class="range-row">
        <view class="range-icon" :style="{ background: iconColors[index % iconColors.length] }">
          <text class="range-icon-text">{{ iconTexts[index] || '¥' }}</text>
        </view>
        <view class="range-main">
          <text class="range-label">{{ item.label }}</text>
          <text class="range-period">{{ item.period }}</text>
        </view>
        <view class="range-amounts">
          <view class="amount-line">
            <text class="amount-key">总收入</text>
            <text class="amount-val income">{{ formatMoney(item.income) }}</text>
          </view>
          <view class="amount-line">
            <text class="amount-key">总支出</text>
            <text class="amount-val expense">{{ formatMoney(item.expense) }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 本月分类支出排行 -->
    <view class="card rank-card">
      <view class="rank-header">
        <text class="rank-title">本月各分类支出排行</text>
        <view class="rank-summary">
          <text class="summary-item">记账笔数 {{ monthCount }}</text>
          <text class="summary-item">总支出 {{ formatMoney(monthExpense) }}</text>
        </view>
      </view>

      <EmptyState v-if="!ranking.length" icon="📊" text="本月还没有支出记录" />

      <view v-else class="rank-list">
        <view v-for="(item, index) in ranking" :key="item.categoryId || index" class="rank-item">
          <text class="rank-no">{{ index + 1 }}</text>
          <view class="rank-body">
            <view class="rank-line">
              <text class="rank-name">{{ iconOf(item.icon) }} {{ item.name }}</text>
              <view class="rank-right">
                <text class="rank-ratio">{{ item.ratio }}%</text>
                <text class="rank-dot">•</text>
                <text class="rank-amount">{{ formatMoney(item.sum) }}</text>
              </view>
            </view>
            <view class="bar-bg">
              <view
                class="bar-fill"
                :style="{
                  width: barWidth(item.ratio),
                  background: iconColors[index % iconColors.length],
                }"
              />
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 底栏中间的记一笔 -->
    <RecordFab />
  </view>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app';
import EmptyState from '@/components/EmptyState.vue';
import RecordFab from '@/components/RecordFab.vue';
import { useUserStore } from '@/store/user';
import { useAccountStore } from '@/store/account';
import { useCategoryStore } from '@/store/category';
import { getOverview, getCategoryStat, type CategoryStatItem } from '@/api/statistics';
import { iconOf } from '@/utils/icon';
import { formatMoney } from '@/utils/format';

const userStore = useUserStore();
const accountStore = useAccountStore();
const categoryStore = useCategoryStore();

const loading = ref(false);
const ranking = ref<CategoryStatItem[]>([]);

const overview = reactive({
  total: { income: '0.00', expense: '0.00', balance: '0.00', count: 0 },
  ranges: [] as any[],
});

/** 本月支出汇总（排行卡片右上角展示） */
const monthRange = computed(() => overview.ranges.find((r) => r.key === 'month'));
const monthExpense = computed(() => monthRange.value?.expense || '0.00');
const monthCount = computed(() => monthRange.value?.count || 0);

const iconColors = ['#4A90D9', '#50E3C2', '#F5A623', '#FF6B35', '#BD10E0', '#7ED321'];
const iconTexts = ['日', '周', '月', '¥', '年'];

/** 进度条宽度：占比过小的也给 2% 保证可见 */
function barWidth(ratio: number): string {
  const v = Math.max(Number(ratio) || 0, 2);
  return `${Math.min(v, 100)}%`;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function loadData() {
  loading.value = true;
  try {
    const accountId = accountStore.currentId;
    const [ov, rank] = await Promise.all([
      getOverview(accountId),
      getCategoryStat(currentMonth(), 'expense', accountId),
    ]);
    overview.total = ov.total;
    overview.ranges = ov.ranges;
    // 只展示前 10 名，避免首页过长
    ranking.value = rank.slice(0, 10);
  } catch (err) {
    console.error('[home] 加载失败', err);
  } finally {
    loading.value = false;
    uni.stopPullDownRefresh();
  }
}

/** 切换账本 */
function switchAccount() {
  const list = accountStore.list;
  if (list.length <= 1) {
    uni.showModal({
      title: '只有一个账本',
      content: '到「我的 - 账本管理」可以新建账本',
      showCancel: false,
    });
    return;
  }

  uni.showActionSheet({
    itemList: list.map((a) => (a.isDefault ? `${a.name}（默认）` : a.name)),
    success: (res) => {
      const target = list[res.tapIndex];
      if (!target || target.id === accountStore.currentId) return;
      accountStore.switchTo(target.id);
      uni.showToast({ title: `已切到 ${target.name}`, icon: 'none' });
      loadData();
    },
  });
}

onShow(async () => {
  if (!userStore.isLogin) {
    uni.reLaunch({ url: '/pages/login/index' });
    return;
  }
  await accountStore.load();
  categoryStore.load();
  loadData();
});

onPullDownRefresh(async () => {
  await accountStore.load();
  loadData();
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f5f6f8;
  padding: 12px 12px 0;
  /* 给底部的凸起按钮与 tabBar 留空间 */
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}

/* ===== 顶部 banner ===== */
.banner {
  background: linear-gradient(135deg, #ff6b35 0%, #ff9563 55%, #ffb347 100%);
  border-radius: 16px;
  padding: 16px 18px 18px;
  color: #fff;
  position: relative;
  overflow: hidden;
}

.banner-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.account-switch {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.22);
  border-radius: 14px;
  padding: 4px 12px;
  max-width: 70%;
}

.account-icon {
  font-size: 13px;
  margin-right: 4px;
}

.account-name {
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.account-arrow {
  font-size: 11px;
  margin-left: 4px;
  opacity: 0.9;
}

.banner-deco {
  font-size: 26px;
  opacity: 0.85;
}

.banner-main {
  margin-top: 18px;
}

.banner-label {
  font-size: 13px;
  opacity: 0.9;
}

.banner-expense {
  display: block;
  font-size: 36px;
  font-weight: 700;
  margin-top: 2px;
  letter-spacing: -0.5px;
}

.banner-sub {
  display: flex;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.28);
}

.sub-item {
  flex: 1;
  display: flex;
  align-items: baseline;
}

.sub-label {
  font-size: 12px;
  opacity: 0.9;
  margin-right: 6px;
}

.sub-value {
  font-size: 15px;
  font-weight: 500;
}

/* ===== 通用卡片 ===== */
.card {
  background: #fff;
  border-radius: 16px;
  margin-top: 12px;
}

/* ===== 区间统计 ===== */
.range-card {
  padding: 4px 0;
}

.range-row {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid #f7f7f8;
}

.range-row:last-child {
  border-bottom: none;
}

.range-icon {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.range-icon-text {
  color: #fff;
  font-size: 14px;
  font-weight: 500;
}

.range-main {
  flex: 1;
  margin-left: 12px;
  display: flex;
  flex-direction: column;
}

.range-label {
  font-size: 15px;
  color: #333;
  font-weight: 500;
}

.range-period {
  font-size: 11px;
  color: #bbb;
  margin-top: 2px;
}

.range-amounts {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.amount-line {
  display: flex;
  align-items: baseline;
}

.amount-key {
  font-size: 11px;
  color: #999;
  margin-right: 6px;
}

.amount-val {
  font-size: 14px;
  font-weight: 500;
  min-width: 76px;
  text-align: right;
}

.income {
  color: #52c41a;
}

.expense {
  color: #ff4d4f;
}

/* ===== 分类排行 ===== */
.rank-card {
  padding: 16px;
}

.rank-header {
  margin-bottom: 12px;
}

.rank-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.rank-summary {
  display: flex;
  margin-top: 6px;
}

.summary-item {
  font-size: 12px;
  color: #999;
  margin-right: 14px;
}

.rank-item {
  display: flex;
  align-items: flex-start;
  padding: 10px 0;
}

.rank-no {
  width: 18px;
  font-size: 13px;
  color: #bbb;
  padding-top: 2px;
}

.rank-body {
  flex: 1;
}

.rank-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.rank-name {
  font-size: 14px;
  color: #333;
}

.rank-right {
  display: flex;
  align-items: center;
}

.rank-ratio {
  font-size: 13px;
  color: #999;
}

.rank-dot {
  font-size: 12px;
  color: #ddd;
  margin: 0 6px;
}

.rank-amount {
  font-size: 14px;
  color: #333;
  font-weight: 500;
}

.bar-bg {
  height: 4px;
  background: #f2f3f5;
  border-radius: 2px;
  margin-top: 8px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s;
}
</style>
