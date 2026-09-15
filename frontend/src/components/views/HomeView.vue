<template>
  <view class="page">
    <!-- 顶部 banner：当前账本的历年累计 -->
    <view class="banner">
      <view class="banner-top">
        <view class="account-switch" @click="switchAccount">
          <SvgIcon class="account-icon" name="icon-wallet" :size="14" />
          <text class="account-name">{{ accountStore.currentName }}</text>
          <SvgIcon class="account-arrow" name="icon-chevron-down" :size="12" />
        </view>
        <SvgIcon class="banner-deco" name="icon-chart-bar" :size="28" />
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
      <!-- 每行可点：跳到流水页并带上该区间的起止与分组粒度 -->
      <view
        v-for="(item, index) in overview.ranges"
        :key="item.key"
        class="range-row"
        @click="goFlow(item)"
      >
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
          <text class="summary-item">
            总支出
            <text class="summary-val">{{ formatMoney(monthExpense) }}</text>
          </text>
        </view>
      </view>

      <EmptyState v-if="!ranking.length" icon="icon-chart-bar" text="本月还没有支出记录" />

      <view v-else class="rank-list">
        <view v-for="(item, index) in visibleRanking" :key="item.categoryId || index" class="rank-item">
          <text class="rank-no">{{ index + 1 }}</text>
          <view class="rank-body">
            <view class="rank-line">
              <view class="rank-name">
                <CategoryIcon :name="item.icon" :size="36" />
                <text>{{ item.name }}</text>
              </view>
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

        <view v-if="ranking.length > COLLAPSED_COUNT" class="rank-toggle" @click="expanded = !expanded">
          <text class="rank-toggle-text">{{ expanded ? '收起' : '点击展开' }}</text>
          <SvgIcon :name="expanded ? 'icon-chevron-up' : 'icon-chevron-down'" :size="12" />
        </view>
      </view>
    </view>

    <!-- 底栏的「记一笔」与导航由容器统一承载，视图内不再持有 -->
  </view>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import EmptyState from '@/components/EmptyState.vue';
import { useUserStore } from '@/store/user';
import { useAccountStore } from '@/store/account';
import { useCategoryStore } from '@/store/category';
import { getOverview, getCategoryStat, type CategoryStatItem } from '@/api/statistics';
import type { SummaryUnit } from '@/api/transaction';
import SvgIcon from '@/components/SvgIcon.vue';
import CategoryIcon from '@/components/CategoryIcon.vue';
import { formatMoney } from '@/utils/format';
import { SOLID_SERIES } from '@/constants/chart';

const userStore = useUserStore();
const accountStore = useAccountStore();
const categoryStore = useCategoryStore();

const loading = ref(false);
const ranking = ref<CategoryStatItem[]>([]);

/** 折叠时展示的条数（与参考图一致：默认 5 条 + 「点击展开」） */
const COLLAPSED_COUNT = 5;
const expanded = ref(false);

/** 折叠态：默认只显示前 COLLAPSED_COUNT 条；展开后显示全部 */
const visibleRanking = computed(() =>
  expanded.value ? ranking.value : ranking.value.slice(0, COLLAPSED_COUNT)
);

const overview = reactive({
  total: { income: '0.00', expense: '0.00', balance: '0.00', count: 0 },
  ranges: [] as any[],
});

/** 本月支出汇总（排行卡片右上角展示） */
const monthRange = computed(() => overview.ranges.find((r) => r.key === 'month'));
const monthExpense = computed(() => monthRange.value?.expense || '0.00');
const monthCount = computed(() => monthRange.value?.count || 0);

/**
 * 区间图标 / 排行进度条底色。
 * 图标上压着 14px 白字，所以只能取「可承载白字的实心序列」
 * （白字压其上实测均 ≥5.18:1；序列末位的中性灰仅 3.06:1，不能用于此）。
 * 真源见 src/constants/chart.ts。
 */
const iconColors = [...SOLID_SERIES];
const iconTexts = ['日', '周', '月', '¥', '年'];

/**
 * 区间 key → 流水页的分组粒度。
 *
 * 「今天」用天、「本周」用周、「本月」用月、「本年/去年」用年 ——
 * 与参考图里底栏显示的粒度一致（图1 天 / 图2 周 / 图3 月 / 图4 年）。
 * 「去年」也是年粒度，只是区间落在上一年。
 */
const RANGE_UNIT: Record<string, SummaryUnit> = {
  today: 'day',
  week: 'week',
  month: 'month',
  year: 'year',
  lastYear: 'year',
};

/** 点区间行 → 跳到流水页，带上起止日期与分组粒度 */
function goFlow(item: { key: string; start: string; end: string }) {
  const unit = RANGE_UNIT[item.key] || 'month';
  uni.navigateTo({
    url: `/pages/flow/index?start=${item.start}&end=${item.end}&unit=${unit}`,
  });
}

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
    // 保留全量：折叠/展开由 visibleRanking 控制，不在这里截断
    ranking.value = rank;
    expanded.value = false;
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

/**
 * 由容器在「切到本视图」或「容器页重新显示」时调用。
 * 单页架构下视图没有自己的页面生命周期，onShow 统一由容器驱动。
 */
async function activate() {
  if (!userStore.isLogin) {
    uni.reLaunch({ url: '/pages/login/index' });
    return;
  }
  await accountStore.load();
  categoryStore.load();
  loadData();
}

/** 容器转发下来的下拉刷新 */
async function onPullDownRefresh() {
  await accountStore.load();
  loadData();
}

onMounted(activate);

defineExpose({ activate, onPullDownRefresh });
</script>

<style scoped lang="scss">
.page {
  min-height: $page-min-height;
  background: $bg-canvas;
  padding: 12px 12px 0;
  /* 自定义导航栏 52px + 凸起按钮向外溢出的部分 */
  padding-bottom: calc(88px + env(safe-area-inset-bottom));
}

/* ===== 顶部 banner ===== */
.banner {
  background: $gradient-banner;
  border-radius: 16px;
  padding: 16px 18px 18px;
  color: $text-inverse;
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
  /* 22px 行盒 + 上下各 8px = 38 —— 账本切换入口，原来只有 30 */
  padding: 8px 12px;
  max-width: 70%;
}

.account-icon {
  /* 不写 color：继承 .banner 的白字，压在品牌色渐变上 */
  margin-right: 4px;
}

.account-name {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  font-weight: $weight-medium;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.account-arrow {
  /* 不写 color：继承 .banner 的白字 */
  margin-left: 4px;
  opacity: 0.9;
}

.banner-deco {
  /* 纯装饰（不承载信息，WCAG 豁免），故保留 opacity */
  opacity: 0.85;
}

.banner-main {
  margin-top: 18px;
}

.banner-label {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
}

.banner-expense {
  display: block;
  @include tabular-nums;
  font-size: $font-display-lg;
  line-height: $lh-display-lg;
  font-weight: $weight-semibold;
  margin-top: 2px;
  letter-spacing: -0.5px;
  /* 200% 字号下 36px→72px，「¥13,918.05」实测需要 394px，而 banner 内宽只有 288px。
     banner 有 overflow:hidden（为了裁掉装饰 emoji），不管它的话金额右半截直接消失；
     而 body 也是 overflow-x:hidden，用户连滚都滚不出来（WCAG 1.4.4 内容丢失）。
     数字本身没有断行点，只能靠 anywhere 显式允许在任意字符间断行：
     拆成两行是难看，但一位数字都不丢；换成 text-overflow: ellipsis 才是真丢内容。 */
  overflow-wrap: anywhere;
}

.banner-sub {
  display: flex;
  /* ×2 字号下「总收入 32,130.80」+「结余 18,212.75」一行塞不下。
     flex-wrap 仅在放不下时生效，正常字号下是 no-op。 */
  flex-wrap: wrap;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.28);
}

.sub-item {
  /* 用 flex-basis: auto（不是 0）—— line-breaking 看的是 hypothetical size：
     auto → max-content（「总收入 32,130.80」实测约 118px），于是「放不放得下」由内容真实宽度决定。
     取 0 的话 hypothetical 只剩 min-width，换行阈值变成一个写死的数、与内容脱钩。
     这里踩过一坑：一度用 flex:1 1 0 + min-width:9em 想把阈值绑到字号上，
     但把容器内宽算成了 288px（实际 banner 左右各 18px padding，只有 260px），
     于是正常字号下也被顶成两行，白白改了原设计。改回 basis:auto 后：
       正常字号：118 × 2 = 236 ≤ 260 → 仍是并排两栏，与改动前完全一致
       ×2 字号：230 × 2 = 460 > 260 → 换行，各占一行完整显示 */
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  /* 标签与数值自己放不下时，数值掉到第二行，而不是被裁掉 */
  flex-wrap: wrap;
  align-items: baseline;
}

.sub-label {
  font-size: $font-caption;
  line-height: $lh-caption;
  margin-right: 6px;
  /* ×2 实测若不拦，「总收入」会被竖排成「总/收/入」三行 —— 中文没有断行点，必须显式禁止 */
  white-space: nowrap;
  flex-shrink: 0;
}

.sub-value {
  @include tabular-nums;
  font-size: $font-body;
  line-height: $lh-body;
  font-weight: $weight-medium;
  min-width: 0;
  overflow-wrap: anywhere;
}

/* ===== 通用卡片 ===== */
.card {
  background: $bg-card;
  border-radius: 16px;
  margin-top: 12px;
}

/* ===== 区间统计 ===== */
.range-card {
  padding: 4px 0;
}

.range-row {
  display: flex;
  /* ×2 下 32(图标)+12+154(主文案)+215(金额块) = 413px > 内宽 288px。
     wrap 后金额块整体掉到第二行，而不是把右边界顶出视口被 body 裁掉。 */
  flex-wrap: wrap;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid $line;
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
  color: $text-inverse;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  font-weight: $weight-medium;
}

.range-main {
  /* 必须是 flex: 1 1 auto 而不是 flex: 1 ——
     `flex: 1` 的简写等价于 `flex: 1 1 0%`，flex-basis 为 0 意味着
     **换行算法认为这一栏不需要任何空间**，于是金额块永远不会被换到下一行，
     反过来把主文案挤成 22px 宽（实测 ×2 下 range-label 只有 22px 却要放 30px 的字）。
     basis 取 auto 后 hypothetical size = max-content（约 180px），
     32(图标) + 180 + 215(金额块) = 427 > 内宽 288 → 金额块换行，主文案拿回整行。 */
  flex: 1 1 auto;
  /* flex 项默认 min-width:auto = 「不许窄于内容」，会让整行顶破容器 */
  min-width: 0;
  margin-left: 12px;
  display: flex;
  flex-direction: column;
}

.range-label {
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-primary;
  font-weight: $weight-medium;
}

.range-period {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-tertiary;
  margin-top: 2px;
}

.range-amounts {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 0;
  /* 独占一行时 margin-left:auto 把它推到右侧；与主文案同行时无剩余空间，是 no-op */
  margin-left: auto;
}

.amount-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
}

.amount-key {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-tertiary;
  margin-right: 6px;
  white-space: nowrap;
  flex-shrink: 0;
}

.amount-val {
  @include tabular-nums;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  font-weight: $weight-medium;
  min-width: 76px;
  text-align: right;
  overflow-wrap: anywhere;
}

.income {
  color: $income;
}

.expense {
  color: $expense;
}

/* ===== 分类排行 ===== */
.rank-card {
  padding: 16px;
}

.rank-header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 12px;
  margin-bottom: 12px;
}

.rank-title {
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  font-weight: $weight-semibold;
  color: $text-primary;
}

.rank-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
}

.summary-item {
  @include tabular-nums;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-tertiary;
  margin-right: 14px;
}

.summary-item:last-child {
  margin-right: 0;
}

/* 「总支出」的数值：白卡上 5.05:1 ✅，与区间卡片的支出色一致 */
.summary-val {
  color: $expense;
  font-weight: $weight-medium;
}

.rank-item {
  display: flex;
  align-items: flex-start;
  padding: 12px 0;
}

.rank-no {
  /* 原本写死 width: 18px —— ×2 下「10」要 36px，被卡在 18px 里压到分类名上。
     按方案 §3.3：固定宽度一律改 min-width，让内容自己撑开。 */
  min-width: 18px;
  flex-shrink: 0;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-tertiary;
}

.rank-body {
  flex: 1;
}

.rank-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
}

.rank-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-primary;
  min-width: 0;
}

.rank-name .svg-icon {
  /* 压白卡 6.00:1；比分类名弱一档，让名称先被看到 */
  color: $text-secondary;
}

.rank-right {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  min-width: 0;
  margin-left: auto;
}

.rank-ratio {
  @include tabular-nums;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-tertiary;
}

.rank-dot {
  font-size: $icon-xs;
  color: $text-disabled;
  margin: 0 6px;
}

.rank-amount {
  // 定宽右对齐的理由同明细页 .item-amount：宽度不定时 text-align 等于没写
  @include amount;
  min-width: 72px;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-primary;
  font-weight: $weight-medium;
}

.bar-bg {
  height: 6px;
  background: $bg-subtle;
  border-radius: $radius-pill;
  margin-top: 10px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: $radius-pill;
  transition: width 0.3s;
}

/* 「点击展开 / 收起」——与 RankList.vue 的 .toggle 同一套做法 */
.rank-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $space-1;
  /* 上下留白凑够 44px 触控目标（WCAG 2.5.8 建议值） */
  padding: 12px 0 4px;
  margin-top: 4px;
  color: $text-secondary;
}

.rank-toggle-text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
}
</style>
