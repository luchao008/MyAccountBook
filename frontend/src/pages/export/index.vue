<template>
  <view class="page">
    <view class="nav" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view class="nav-inner">
        <view class="nav-btn" @click="goBack">
          <SvgIcon name="icon-chevron-left" :size="20" />
        </view>
        <text class="nav-title">数据导出</text>
        <view class="nav-btn" />
      </view>
    </view>

    <view class="tip"><text class="tip-text">选择流水导出周期</text></view>

    <view class="rows">
      <view class="row" @click="timeOpen = true">
        <SvgIcon class="row-icon" name="icon-calendar" :size="20" />
        <text class="row-label">日期</text>
        <view class="row-main">
          <text class="row-value">{{ rangeLabel }}</text>
          <text v-if="rangeText" class="row-sub">{{ rangeText }}</text>
        </view>
        <SvgIcon class="row-arrow" name="icon-chevron-right" :size="16" />
      </view>

      <view class="row" @click="expenseOpen = true">
        <SvgIcon class="row-icon" name="icon-tag" :size="20" />
        <text class="row-label">支出分类</text>
        <view class="row-main"><text class="row-value">{{ expenseLabel }}</text></view>
        <SvgIcon class="row-arrow" name="icon-chevron-right" :size="16" />
      </view>

      <view class="row" @click="incomeOpen = true">
        <SvgIcon class="row-icon" name="icon-tag" :size="20" />
        <text class="row-label">收入分类</text>
        <view class="row-main"><text class="row-value">{{ incomeLabel }}</text></view>
        <SvgIcon class="row-arrow" name="icon-chevron-right" :size="16" />
      </view>
    </view>

    <view class="footer">
      <view class="btn" :class="{ 'btn-disabled': exporting }" @click="doExport">
        <text class="btn-text">{{ exporting ? '导出中…' : '导出' }}</text>
      </view>
    </view>

    <TimeRangePicker v-model:visible="timeOpen" :model-value="timeRange" @pick="onTimePicked" />
    <FlowCategoryPicker
      v-model:visible="expenseOpen"
      :model="expenseIds"
      type="expense"
      title="选择支出分类"
      @apply="onExpenseApply"
    />
    <FlowCategoryPicker
      v-model:visible="incomeOpen"
      :model="incomeIds"
      type="income"
      title="选择收入分类"
      @apply="onIncomeApply"
    />
  </view>
</template>

<script setup lang="ts">
/**
 * 数据导出页（独立页）。
 *
 * 需求（参考图）：把「流水导出」做成一个专门的页面，可以设置时间与分类。
 *
 * ⚠️ 与参考图的差异（**不做假控件**）：
 *   · 参考图的「账户 / 成员 / 商家 / 项目」—— 本项目只有"账本"，
 *     且导出恒为**当前账本**（用户确认不做账本行），后三者没有对应数据模型
 *   · 参考图的「导出流水图片」—— 需要 canvas 绘制，用户确认不做
 *   · 参考图顶部的「流水导出 / 报表导出」两个 Tab —— 用户确认只做流水导出；
 *     报表导出仍留在报表页（ReportView 自带按钮），不搬家
 *
 * ⚠️ 分页拉全量：列表接口 size 上限 100，这里循环拉到取完。
 *    安全上限 200 页（2 万条），防止异常情况下无限循环。
 */
import { ref, computed } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';
import TimeRangePicker, { type TimeRange } from '@/components/TimeRangePicker.vue';
import FlowCategoryPicker from '@/components/FlowCategoryPicker.vue';
import { getTransactions, type TransactionItem } from '@/api/transaction';
import { useAccountStore } from '@/store/account';
import { useCategoryStore } from '@/store/category';
import { toCsv, downloadCsv } from '@/utils/csv';

const accountStore = useAccountStore();
const categoryStore = useCategoryStore();

const statusBarHeight = ref(0);
try {
  const info = uni.getSystemInfoSync();
  statusBarHeight.value = info.statusBarHeight || 0;
} catch {
  statusBarHeight.value = 0;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 默认本月（与参考图一致） */
function monthRangeNow(): TimeRange {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  return {
    label: '本月',
    start: y + '-' + pad2(m + 1) + '-01',
    end: y + '-' + pad2(m + 1) + '-' + pad2(last),
  };
}

/* 日期 */
const timeOpen = ref(false);
const timeRange = ref<TimeRange>(monthRangeNow());

function onTimePicked(v: TimeRange) {
  timeRange.value = v;
}

const rangeLabel = computed(() => timeRange.value.label || '全部时间');

/** 日期区间展示：2026.09.01-2026.09.30（与参考图同格式，用点分隔） */
const rangeText = computed(() => {
  const s = timeRange.value.start;
  const e = timeRange.value.end;
  if (!s || !e) return '';
  return s.replace(/-/g, '.') + '-' + e.replace(/-/g, '.');
});

/* 分类 */
const expenseOpen = ref(false);
const incomeOpen = ref(false);
const expenseIds = ref<string[]>([]);
const incomeIds = ref<string[]>([]);

function onExpenseApply(ids: string[]) {
  expenseIds.value = ids;
}
function onIncomeApply(ids: string[]) {
  incomeIds.value = ids;
}

/**
 * 分类行的展示文案（与筛选面板同一套规则）。
 * 空数组 = 不过滤，显示「全选」（参考图就是「全选」）。
 */
function catLabel(ids: string[]): string {
  if (!ids.length) return '全选';
  if (ids.length === 1) {
    const item = categoryStore.byId(ids[0]);
    return item ? categoryStore.fullNameOf(ids[0]) : '全选';
  }
  const roots = new Set<string>();
  for (const id of ids) {
    const item = categoryStore.byId(id);
    if (item) roots.add(item.parentId || item.id);
  }
  return '已选 ' + roots.size + ' 项';
}

const expenseLabel = computed(() => catLabel(expenseIds.value));
const incomeLabel = computed(() => catLabel(incomeIds.value));

/* 导出 */
const exporting = ref(false);
const PAGE_SIZE = 100;
const MAX_PAGES = 200;

/**
 * 分类 id → 拆成「一级 / 二级」两列。
 *
 * 三种情况都要处理：
 *   · 未分类（categoryId 为 null）→ 一级填「未分类」，二级留空
 *   · 挂的是一级（parentId 为 null，历史/导入数据可能有）→ 一级填它自己，二级留空
 *   · 挂的是二级 → 一级填父名，二级填它自己
 */
function splitCategory(categoryId: string | null): { root: string; child: string } {
  if (!categoryId) return { root: '未分类', child: '' };
  const item = categoryStore.byId(categoryId);
  if (!item) return { root: '未分类', child: '' };
  if (!item.parentId) return { root: item.name, child: '' };
  const parent = categoryStore.byId(item.parentId);
  return { root: parent ? parent.name : item.name, child: item.name };
}

async function doExport() {
  if (exporting.value) return;
  exporting.value = true;
  try {
    const accountId = accountStore.currentId || undefined;
    const catIds = [...expenseIds.value, ...incomeIds.value];

    // ① 循环分页拉全量
    const all: TransactionItem[] = [];
    let page = 1;
    for (;;) {
      const res = await getTransactions({
        accountId,
        start: timeRange.value.start || undefined,
        end: timeRange.value.end || undefined,
        categoryIds: catIds.length ? catIds.join(',') : undefined,
        page,
        size: PAGE_SIZE,
      });
      all.push(...res.list);
      if (!res.list.length || all.length >= res.total || page >= MAX_PAGES) break;
      page += 1;
    }

    // ② CSV：6 列（与随手记导出文件同名同序，去掉本项目没有的列）
    const rows: string[][] = [['交易类型', '日期', '一级分类', '二级分类', '金额', '备注']];
    for (const t of all) {
      const { root, child } = splitCategory(t.categoryId);
      rows.push([
        t.type === 'income' ? '收入' : '支出',
        t.recordTime ? t.recordDate + ' ' + t.recordTime.slice(0, 5) : t.recordDate,
        root,
        child,
        t.amount,
        t.note || '',
      ]);
    }

    // ③ 下载
    const stamp = new Date();
    const name =
      '流水_' + timeRange.value.start + '_' + timeRange.value.end + '_' +
      stamp.getFullYear() + pad2(stamp.getMonth() + 1) + pad2(stamp.getDate()) + '.csv';
    if (downloadCsv(name, toCsv(rows))) {
      uni.showToast({ title: '已导出 ' + all.length + ' 条', icon: 'none' });
    } else {
      uni.showToast({ title: '当前端暂不支持导出', icon: 'none' });
    }
  } catch (err) {
    console.error('[export] 导出失败', err);
  } finally {
    exporting.value = false;
  }
}

function goBack() {
  uni.navigateBack();
}

// 进页面先加载分类（splitCategory 要用）与账本
categoryStore.load();
accountStore.load();
</script>

<style scoped lang="scss">
.page {
  min-height: $page-min-height;
  background: $bg-page;
  display: flex;
  flex-direction: column;
}

/* ===== 自绘顶栏 ===== */
.nav {
  background: $bg-card;
  border-bottom: 1px solid $line;
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
  color: $text-primary;
}

.nav-title {
  font-size: $font-h2;
  line-height: $lh-h2;
  font-weight: $weight-semibold;
  color: $text-primary;
}

/* ===== 说明条 ===== */
.tip {
  padding: $space-3 $space-4;
  background: $bg-subtle;
}

.tip-text {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-secondary;
}

/* ===== 配置行 ===== */
.rows {
  background: $bg-card;
}

.row {
  display: flex;
  align-items: center;
  min-height: 56px;
  padding: $space-3 $space-4;
  border-bottom: 1px solid $line;
}

.row:last-child {
  border-bottom: none;
}

.row-icon {
  flex-shrink: 0;
  margin-right: $space-3;
  color: $text-secondary;
}

.row-label {
  flex-shrink: 0;
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-primary;
}

.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.row-value {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-secondary;
  @include text-safe;
}

.row-sub {
  margin-top: 2px;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-tertiary;
  @include text-safe;
}

.row-arrow {
  flex-shrink: 0;
  margin-left: $space-1;
  color: $text-disabled;
}

/* ===== 底部导出按钮 ===== */
.footer {
  margin-top: auto;
  padding: $space-4;
  padding-bottom: calc(#{$space-4} + env(safe-area-inset-bottom));
}

.btn {
  min-height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-md;
  background: $brand-600;
}

.btn-disabled {
  background: $brand-200;
}

.btn-text {
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  font-weight: $weight-medium;
  color: $text-inverse;
}
</style>
