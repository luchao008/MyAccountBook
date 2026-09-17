<template>
  <view class="page">
    <!-- 自绘顶栏（navigationStyle: custom） -->
    <view class="nav" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view class="nav-inner">
        <view class="nav-btn" @click="goBack">
          <SvgIcon name="icon-chevron-left" :size="20" />
        </view>
        <text class="nav-title">流水回收站</text>
        <view class="nav-btn" />
      </view>
    </view>

    <!-- 说明条：把「7 天」这条规则写在最上面，用户一眼知道保留期 -->
    <view class="tip">
      <text class="tip-text">删除的流水会保留 7 天，超期自动清除</text>
    </view>

    <view v-if="loading" class="state"><text class="state-text">加载中…</text></view>
    <EmptyState
      v-else-if="!list.length"
      icon="icon-inbox"
      text="回收站是空的"
      sub-text="删除的流水会在这里保留 7 天"
    />

    <view v-else class="list">
      <!--
        按删除时间倒序（后端已排好），这里只按「删除日期」分组展示 ——
        与参考图一致（图里是按 2026年09月07日 / 2026年09月06日 分组）。
      -->
      <template v-for="g in groups" :key="g.date">
        <view class="group-head"><text class="group-head-text">{{ g.label }}</text></view>
        <view class="card">
          <view v-for="t in g.items" :key="t.id" class="item">
            <view class="item-top">
              <text class="item-time">{{ timeOf(t) }}</text>
              <text class="item-action">删除流水</text>
            </view>
            <view class="item-main">
              <CategoryIcon class="item-icon" :name="t.category?.icon || 'cat-misc'" :size="28" />
              <text class="item-name">{{ t.category?.name || '未分类' }}</text>
              <text class="item-amount" :class="t.type === 'income' ? 'income' : 'expense'">
                {{ formatMoney(t.amount) }}
              </text>
              <view class="restore" @click="onRestore(t)"><text class="restore-text">恢复</text></view>
            </view>
            <text class="item-meta">{{ metaOf(t) }}</text>
          </view>
        </view>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 流水回收站。
 *
 * ⚠️ **只做「恢复」**（luchao 确认，照参考图）—— 没有「彻底删除」也没有「清空回收站」。
 *    超期记录由后端**查询时惰性真删**（见 transaction.service 的 listDeleted），
 *    用户不需要为"永久删除"操心。
 *
 * ⚠️ 本页是**独立页**（有返回按钮、无底栏），入口在「我的 → 流水回收站」。
 *
 * ⚠️ 参考图里每行还有「成员」（头像 + 名字），本项目**没有成员概念**，
 *    所以 meta 行只显示「账本名 · 时间」，不做假数据。
 */
import { ref, computed, onMounted } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';
import CategoryIcon from '@/components/CategoryIcon.vue';
import EmptyState from '@/components/EmptyState.vue';
import { getDeletedTransactions, restoreTransaction, type TransactionItem } from '@/api/transaction';
import { formatMoney } from '@/utils/format';

const statusBarHeight = ref(0);
try {
  const info = uni.getSystemInfoSync();
  statusBarHeight.value = info.statusBarHeight || 0;
} catch {
  statusBarHeight.value = 0;
}

const loading = ref(false);
const list = ref<TransactionItem[]>([]);

/**
 * 按「删除日期」分组（后端已按 deletedAt 倒序）。
 *
 * ⚠️ 日期文案要手工拼，不能用 `replace(/-/g, '年')` —— 那样两个连字符
 *    都会被替换掉（`2026-09-07` → `2026年09年07`）。参考图是 `2026年09月07日`。
 */
const groups = computed(() => {
  const map = new Map<string, TransactionItem[]>();
  for (const t of list.value) {
    // deletedAt 是 UTC ISO；取本地日期（回收站按"用户看到的哪天删的"分组）
    const d = localDateOf(t.deletedAt);
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(t);
  }
  return [...map.entries()].map(([date, items]) => ({
    date,
    label: formatCnDate(date),
    items,
  }));
});

/** ISO → 本地 YYYY-MM-DD（空值回落成空串） */
function localDateOf(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** YYYY-MM-DD → 2026年09月07日（参考图的写法） */
function formatCnDate(d: string): string {
  if (!d) return '未知日期';
  const [y, m, day] = d.split('-');
  return `${y}年${m}月${day}日`;
}

/** 删除时刻 HH:mm */
function timeOf(t: { deletedAt?: string | null }): string {
  const s = t.deletedAt;
  if (!s) return '';
  const d = new Date(s);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 副标题：账本名 · 原记账日期时刻。
 *
 * ⚠️ 用**完整日期**而不是 `dayHeader()`（后者返回 `15日 Tue`）——
 *    参考图这里是 `2026-06-15 08:35` 这种完整形式。因为已经不在原上下文里了，
 *    "15日" 看不出是哪个月。
 *
 * ⚠️ 参考图还有「成员」（头像 + 名字），本项目**没有成员概念**，不做假数据。
 */
function metaOf(t: TransactionItem): string {
  const parts: string[] = [];
  if (t.account?.name) parts.push(t.account.name);
  parts.push(t.recordTime ? `${t.recordDate} ${t.recordTime.slice(0, 5)}` : t.recordDate);
  return parts.join(' · ');
}

async function load() {
  loading.value = true;
  try {
    list.value = await getDeletedTransactions();
  } catch (err) {
    console.error('[recycle] 加载失败', err);
  } finally {
    loading.value = false;
  }
}

function onRestore(t: TransactionItem) {
  uni.showModal({
    title: '恢复流水',
    content: `确定恢复这笔流水？（${t.category?.name || '未分类'} ${formatMoney(t.amount)}）`,
    confirmText: '确定恢复',
    success: async (res) => {
      if (!res.confirm) return;
      try {
        await restoreTransaction(t.id);
        uni.showToast({ title: '已恢复', icon: 'none' });
        load();
      } catch (err) {
        console.error('[recycle] 恢复失败', err);
      }
    },
  });
}

function goBack() {
  uni.navigateBack();
}

onMounted(load);
</script>

<style scoped lang="scss">
.page {
  min-height: $page-min-height;
  background: $v11-bg-page;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
}

/* ===== 自绘顶栏 ===== */
.nav {
  background: $v11-bg-card;
  border-bottom: 1px solid $v11-line;
}

.nav-inner {
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 $space-2;
}

.nav-btn {
  min-width: $touch-target-min;
  height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $v11-text-primary;
}

.nav-title {
  font-size: $font-h2;
  line-height: $lh-h2;
  font-weight: $weight-semibold;
  color: $v11-text-primary;
}

/* ===== 说明条 ===== */
.tip {
  padding: $space-3 $space-4;
  background: $v11-bg-inset;
}

.tip-text {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
}

.state {
  padding: 48px 0;
  text-align: center;
}

.state-text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $v11-text-secondary;
}

/* ===== 列表 ===== */
.list {
  padding: $space-3;
}

.group-head {
  padding: $space-2 $space-1;
}

.group-head-text {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
}

.card {
  background: $v11-bg-card;
  border-radius: $v11-radius-card;
  overflow: hidden;
  margin-bottom: $space-3;
}

.item {
  padding: $space-3 $space-4;
  border-bottom: 1px solid $v11-line;
}

.item:last-child {
  border-bottom: none;
}

.item-top {
  display: flex;
  align-items: baseline;
}

.item-time {
  @include tabular-nums;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
  margin-right: $space-2;
}

.item-action {
  flex: 1;
  min-width: 0;
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-secondary;
}

.item-main {
  display: flex;
  align-items: center;
  margin-top: $space-2;
}

.item-icon {
  flex-shrink: 0;
  margin-right: $space-2;
}

.item-name {
  flex: 1;
  min-width: 0;
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-primary;
  @include text-safe;
}

.item-amount {
  @include amount;
  min-width: 72px;
  font-size: $font-body;
  line-height: $lh-body;
  font-weight: $weight-medium;
  margin-right: $space-2;
}

.income {
  color: $v11-income-amount;
}

.expense {
  color: $v11-teal-amount;
}

/*
 * 「恢复」按钮：浅金底 + 深金字 + 金色细边。
 * 文字 #A85F12 压 #FDF6EF = 4.55:1 ✅；那 1px 金色边保证胶囊形状在白卡上可见
 * （浅金底本身压白卡只有 1.07 —— v1.1 调色板的已知缺口）。
 */
.restore {
  flex-shrink: 0;
  min-height: 32px;
  padding: 0 $space-3;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-pill;
  background: $v11-gold-soft;
  border: 1px solid $v11-gold-fill;
}

.restore-text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  font-weight: $weight-medium;
  color: $v11-gold;
}

.item-meta {
  display: block;
  margin-top: $space-1;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
  @include text-safe;
}
</style>
