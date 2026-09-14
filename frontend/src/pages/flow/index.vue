<template>
  <view class="page">
    <!-- ── 自绘顶栏（navigationStyle: custom）── -->
    <view class="nav" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view class="nav-inner">
        <view class="nav-btn nav-back" @click="goBack">
          <SvgIcon name="icon-chevron-left" :size="20" />
        </view>
        <text class="nav-title">全部流水</text>
        <view class="nav-actions">
          <!-- ① 更多：底部弹窗（导出/筛选/排序） -->
          <view class="nav-btn" @click="actionVisible = true">
            <SvgIcon name="icon-more" :size="20" />
          </view>
          <!-- ② 日历 -->
          <view class="nav-btn" @click="goCalendar">
            <SvgIcon name="icon-calendar" :size="20" />
          </view>
          <!-- ③ 搜索：页内展开，不跳页 -->
          <view class="nav-btn" @click="toggleSearch">
            <SvgIcon name="icon-search" :size="20" />
          </view>
          <!-- ④ 记一笔 -->
          <view class="nav-btn" @click="goRecord">
            <SvgIcon name="icon-plus" :size="20" />
          </view>
        </view>
      </view>

      <!-- 搜索框：点放大镜后滑出，与筛选面板的「备注」是两个独立输入 -->
      <view v-if="searchVisible" class="search-bar">
        <SvgIcon class="search-icon" name="icon-search" :size="16" />
        <input
          class="search-input"
          :value="searchKeyword"
          placeholder="搜索备注或分类名"
          focus
          confirm-type="search"
          @input="onSearchInput"
          @confirm="reloadAll"
        />
        <view class="search-clear" @click="clearSearch">
          <SvgIcon name="icon-close" :size="16" />
        </view>
      </view>
    </view>

    <!-- ── 渐变头图：结余 + 收支 ── -->
    <view class="hero">
      <view class="hero-main">
        <text class="hero-balance">{{ formatMoney(total.balance) }}</text>
        <text class="hero-balance-label">结余</text>
      </view>
      <view class="hero-io">
        <text class="hero-io-item">收入 {{ formatMoney(total.income) }}</text>
        <text class="hero-io-sep">|</text>
        <text class="hero-io-item">支出 {{ formatMoney(total.expense) }}</text>
      </view>
    </view>

    <!-- ── 状态 ── -->
    <view v-if="loading" class="state"><text class="state-text">加载中…</text></view>
    <EmptyState
      v-else-if="error"
      icon="icon-alert"
      text="加载失败，请稍后重试"
      button-text="重试"
      @action="reloadAll"
    />
    <EmptyState v-else-if="!groups.length" icon="icon-inbox" text="该条件下暂无流水" />

    <!-- ── 分组列表 ── -->
    <view v-else class="groups">
      <view v-for="g in groups" :key="g.key" class="group">
        <!-- 组头：点击展开/收起 -->
        <view class="group-head" @click="toggleGroup(g)">
          <view class="group-title-wrap">
            <text class="group-title">{{ periodLabel(g.key, g.unit).title }}</text>
            <text v-if="periodLabel(g.key, g.unit).sub" class="group-sub">
              {{ periodLabel(g.key, g.unit).sub }}
            </text>
          </view>
          <view class="group-right">
            <view class="group-amounts">
              <view class="group-line">
                <text class="group-key">结余</text>
                <text class="group-val" :class="signClass(g.balance)">{{ formatMoney(g.balance) }}</text>
              </view>
              <view class="group-line">
                <text class="group-key">收入</text>
                <text class="group-val income">{{ formatMoney(g.income) }}</text>
                <text class="group-sep">|</text>
                <text class="group-key">支出</text>
                <text class="group-val expense">{{ formatMoney(g.expense) }}</text>
              </view>
            </view>
            <SvgIcon
              class="group-arrow"
              :name="expanded.has(g.key) ? 'icon-chevron-up' : 'icon-chevron-down'"
              :size="16"
            />
          </view>
        </view>

        <!-- 组内明细：按日分组 -->
        <view v-if="expanded.has(g.key)" class="group-body">
          <view v-if="loadingDetail.has(g.key)" class="detail-loading">
            <text class="state-text">加载中…</text>
          </view>
          <EmptyState v-else-if="!details[g.key]?.length" icon="icon-inbox" text="该时段无流水" />
          <template v-else>
            <view v-for="day in details[g.key]" :key="day.date" class="day">
              <view class="day-head"><text class="day-head-text">{{ dayHeader(day.date) }}</text></view>
              <view
                v-for="t in day.items"
                :key="t.id"
                class="txn"
                @click="editTransaction(t.id)"
              >
                <CategoryIcon class="txn-icon" :name="t.category?.icon || 'cat-misc'" :size="28" />
                <view class="txn-main">
                  <text class="txn-name">{{ t.category?.name || '未分类' }}</text>
                  <text class="txn-meta">{{ txnMeta(t) }}</text>
                </view>
                <text class="txn-amount" :class="t.type === 'income' ? 'income' : 'expense'">
                  {{ t.type === 'income' ? '+' : '-' }}{{ formatMoney(t.amount) }}
                </text>
              </view>
            </view>
          </template>
        </view>
      </view>
    </view>

    <!-- ── 底部筛选栏：月 / 分类（点击各自弹层）── -->
    <view class="filter-bar">
      <view class="filter-item" :class="{ active: unitOpen }" @click="openUnitPicker">
        <text class="filter-text">{{ unitLabel }}</text>
        <SvgIcon class="filter-arrow" name="icon-chevron-down" :size="12" />
      </view>
      <view class="filter-item" :class="{ active: categoryOpen }" @click="openCategoryPicker">
        <text class="filter-text">{{ categoryFilterLabel }}</text>
        <SvgIcon class="filter-arrow" name="icon-chevron-down" :size="12" />
      </view>
    </view>

    <!-- ── 弹层 ①：更多操作（参考图 5）── -->
    <view v-if="actionVisible" class="mask" @click="actionVisible = false">
      <view class="sheet" @click.stop>
        <view class="sheet-head">
          <text class="sheet-title">批量操作</text>
          <text class="sheet-sub">编辑、复制(含跨账本)、分享及删除流水</text>
        </view>
        <view class="sheet-item" @click="doExport"><text class="sheet-item-text">流水导出</text></view>
        <view class="sheet-item" @click="openFilterFromSheet">
          <text class="sheet-item-text">筛选</text>
        </view>
        <view class="sheet-item" @click="openSortPicker"><text class="sheet-item-text">排序</text></view>
        <view class="sheet-item sheet-cancel" @click="actionVisible = false">
          <text class="sheet-item-text">取消</text>
        </view>
      </view>
    </view>

    <!-- ── 弹层 ②：分组粒度（参考图：年/季/月/周/天）── -->
    <view v-if="unitOpen" class="mask" @click="unitOpen = false">
      <view class="sheet" @click.stop>
        <view
          v-for="u in UNIT_OPTIONS"
          :key="u.value"
          class="sheet-item sheet-item-row"
          @click="pickUnit(u.value)"
        >
          <text class="sheet-item-text" :class="{ 'sheet-item-active': unit === u.value }">
            {{ u.label }}
          </text>
          <SvgIcon
            v-if="unit === u.value"
            class="sheet-check"
            name="icon-check"
            :size="18"
          />
        </view>
      </view>
    </view>

    <!-- ── 弹层 ③：分类多选（参考图 2）── -->
    <view v-if="categoryOpen" class="mask" @click="categoryOpen = false">
      <view class="sheet sheet-tall" @click.stop>
        <view class="sheet-header">
          <view class="sheet-header-btn" @click="categoryOpen = false">
            <SvgIcon name="icon-close" :size="20" />
          </view>
          <text class="sheet-header-title">选择分类</text>
          <view class="sheet-header-btn" @click="clearCategories">
            <text class="sheet-header-action">取消全选</text>
          </view>
        </view>
        <scroll-view class="cat-list" scroll-y>
          <template v-for="root in categoryTree" :key="root.id">
            <view class="cat-row cat-root" @click="toggleCategory(root.id)">
              <view class="cat-check" :class="{ checked: draftCategories.includes(root.id) }">
                <SvgIcon v-if="draftCategories.includes(root.id)" name="icon-check" :size="14" />
              </view>
              <CategoryIcon class="cat-icon" :name="root.icon" :size="24" />
              <text class="cat-name">{{ root.name }}</text>
            </view>
            <view
              v-for="child in root.children"
              :key="child.id"
              class="cat-row cat-child"
              @click="toggleCategory(child.id)"
            >
              <view class="cat-check" :class="{ checked: draftCategories.includes(child.id) }">
                <SvgIcon v-if="draftCategories.includes(child.id)" name="icon-check" :size="14" />
              </view>
              <CategoryIcon class="cat-icon" :name="child.icon" :size="24" />
              <text class="cat-name">{{ child.name }}</text>
            </view>
          </template>
        </scroll-view>
        <view class="sheet-footer">
          <view class="btn btn-confirm" @click="applyCategories">
            <text class="btn-text confirm-text">确定</text>
          </view>
        </view>
      </view>
    </view>

    <!-- ── 弹层 ④：筛选面板 ── -->
    <FlowFilterPanel
      v-model:visible="filterVisible"
      :model="filterModel"
      @apply="onFilterApply"
      @pick-time="timeOpen = true"
      @pick-category="categoryOpen = true"
    />

    <!-- ── 弹层 ⑤：时间预设 ── -->
    <view v-if="timeOpen" class="mask" @click="timeOpen = false">
      <view class="sheet" @click.stop>
        <view class="sheet-header">
          <view class="sheet-header-btn" @click="timeOpen = false">
            <SvgIcon name="icon-close" :size="20" />
          </view>
          <text class="sheet-header-title">选择时间</text>
          <view class="sheet-header-btn" />
        </view>
        <view
          v-for="opt in TIME_PRESETS"
          :key="opt.label"
          class="sheet-item sheet-item-row"
          @click="pickTimePreset(opt)"
        >
          <text class="sheet-item-text" :class="{ 'sheet-item-active': timeLabel === opt.label }">
            {{ opt.label }}
          </text>
          <SvgIcon v-if="timeLabel === opt.label" class="sheet-check" name="icon-check" :size="18" />
        </view>
      </view>
    </view>

    <!-- ── 弹层 ⑥：排序 ── -->
    <view v-if="sortOpen" class="mask" @click="sortOpen = false">
      <view class="sheet" @click.stop>
        <view
          v-for="s in SORT_OPTIONS"
          :key="s.value"
          class="sheet-item sheet-item-row"
          @click="pickSort(s.value)"
        >
          <text class="sheet-item-text" :class="{ 'sheet-item-active': order === s.value }">
            {{ s.label }}
          </text>
          <SvgIcon v-if="order === s.value" class="sheet-check" name="icon-check" :size="18" />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 流水页（底栏「流水」跳转进入，独立页、不带主导航底栏）。
 *
 * 结构对齐参考图：
 *   · 自绘顶栏：返回 + 标题 + 四个动作（更多 / 日历 / 搜索 / 记一笔）
 *   · 渐变头图：结余（大号白字）+ 收入/支出（小字）
 *   · 分组列表：按底部筛选栏选的粒度分组，点组头展开该组明细（明细内再按日分组）
 *   · 底部筛选栏：月（粒度）/ 分类（多选）
 *
 * 数据来源：
 *   · 分组列表 → `GET /transactions/summary?unit=...`（一次拿全组）
 *   · 展开明细 → `GET /transactions?start=&end=`（只拉该组区间）
 * 两者共用同一套筛选参数，见 service 层的 applyFilters 注释。
 */
import { ref, reactive, computed, onMounted } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';
import CategoryIcon from '@/components/CategoryIcon.vue';
import EmptyState from '@/components/EmptyState.vue';
import FlowFilterPanel, { type FlowFilter } from '@/components/FlowFilterPanel.vue';
import { useAccountStore } from '@/store/account';
import { useCategoryStore } from '@/store/category';
import {
  getTransactionSummary,
  getTransactions,
  type SummaryItem,
  type SummaryUnit,
  type TransactionItem,
} from '@/api/transaction';
import { formatMoney } from '@/utils/format';
import { periodRange, periodLabel, dayHeader } from '@/utils/period';

const accountStore = useAccountStore();
const categoryStore = useCategoryStore();

const statusBarHeight = ref(0);
try {
  statusBarHeight.value = uni.getSystemInfoSync().statusBarHeight || 0;
} catch {
  statusBarHeight.value = 0;
}

/* ── 筛选状态 ── */
const unit = ref<SummaryUnit>('month');
const unitLabel = computed(() => UNIT_OPTIONS.find((u) => u.value === unit.value)?.label || '月');
/** 筛选栏上的分类文案：未选显示「分类」，选了显示「已选 N 个」 */
const categoryFilterLabel = computed(() =>
  filterModel.categoryIds.length ? `已选 ${filterModel.categoryIds.length} 个` : '分类'
);
const order = ref<'time' | 'amountDesc' | 'amountAsc'>('time');

const searchVisible = ref(false);
const searchKeyword = ref('');

const filterModel = reactive<FlowFilter>({
  start: '',
  end: '',
  timeLabel: '全部时间',
  categoryIds: [],
  minAmount: '',
  maxAmount: '',
  keyword: '',
});

/** 分类多选的草稿（点「确定」才写回 filterModel） */
const draftCategories = ref<string[]>([]);

/* ── 弹层开关 ── */
const actionVisible = ref(false);
const unitOpen = ref(false);
const categoryOpen = ref(false);
const filterVisible = ref(false);
const timeOpen = ref(false);
const sortOpen = ref(false);
const timeLabel = computed(() => filterModel.timeLabel);

/* ── 数据 ── */
const loading = ref(false);
const error = ref(false);
const groups = ref<SummaryItem[]>([]);
const expanded = ref<Set<string>>(new Set());
const details = ref<Record<string, { date: string; items: TransactionItem[] }[]>>({});
const loadingDetail = ref<Set<string>>(new Set());

const UNIT_OPTIONS: { value: SummaryUnit; label: string }[] = [
  { value: 'year', label: '年' },
  { value: 'quarter', label: '季' },
  { value: 'month', label: '月' },
  { value: 'week', label: '周' },
  { value: 'day', label: '天' },
];

const SORT_OPTIONS = [
  { value: 'time', label: '按时间（默认）' },
  { value: 'amountDesc', label: '按金额从高到低' },
  { value: 'amountAsc', label: '按金额从低到高' },
] as const;

const TIME_PRESETS = [
  { label: '全部时间', start: '', end: '' },
  { label: '本月', ...monthRange(0) },
  { label: '上月', ...monthRange(-1) },
  { label: '本年', start: `${new Date().getFullYear()}-01-01`, end: `${new Date().getFullYear()}-12-31` },
];

function monthRange(offset: number) {
  const d = new Date();
  const y = d.getFullYear();
  const m0 = d.getMonth() + offset;
  const start = new Date(y, m0, 1);
  const end = new Date(y, m0 + 1, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    start: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-01`,
    end: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
  };
}

/** 头部总额 = 各分组之和（与筛选条件联动，口径自洽） */
const total = computed(() => {
  let income = 0;
  let expense = 0;
  for (const g of groups.value) {
    income += Number(g.income);
    expense += Number(g.expense);
  }
  return {
    income: income.toFixed(2),
    expense: expense.toFixed(2),
    balance: (income - expense).toFixed(2),
  };
});

/** 分类树（一级 + 其下二级），数据来自 category store */
const categoryTree = computed(() => {
  const all = categoryStore.list || [];
  const roots = all.filter((c: any) => !c.parentId);
  return roots.map((r: any) => ({
    ...r,
    children: all.filter((c: any) => c.parentId === r.id),
  }));
});

/** 组装查询参数：两个关键词独立，筛选面板的优先 */
function baseParams() {
  const kw = filterModel.keyword || searchKeyword.value || '';
  return {
    start: filterModel.start || undefined,
    end: filterModel.end || undefined,
    categoryIds: filterModel.categoryIds.length ? filterModel.categoryIds.join(',') : undefined,
    accountId: accountStore.currentId || undefined,
    keyword: kw || undefined,
    minAmount: filterModel.minAmount || undefined,
    maxAmount: filterModel.maxAmount || undefined,
  };
}

async function loadGroups() {
  loading.value = true;
  error.value = false;
  try {
    await accountStore.load();
    groups.value = await getTransactionSummary({ unit: unit.value, ...baseParams() });
  } catch (err) {
    console.error('[flow] 分组加载失败', err);
    error.value = true;
  } finally {
    loading.value = false;
  }
}

/** 只重拉列表（搜索/筛选变化） */
function reloadAll() {
  expanded.value = new Set();
  details.value = {};
  loadGroups();
}

async function toggleGroup(g: SummaryItem) {
  const key = g.key;
  if (expanded.value.has(key)) {
    expanded.value.delete(key);
    expanded.value = new Set(expanded.value);
    return;
  }
  expanded.value.add(key);
  expanded.value = new Set(expanded.value);

  if (details.value[key]) return; // 已加载过，直接用缓存

  loadingDetail.value.add(key);
  loadingDetail.value = new Set(loadingDetail.value);
  try {
    const { start, end } = periodRange(key, g.unit);
    /*
     * ⚠️ 展开明细要用**该组的日期区间**，而不是全局筛选里的 start/end ——
     * 后者是用户另外设的时间范围，两者语义不同。所以这里先展开 baseParams，
     * 再用组的区间覆盖（顺序不能反，否则会被 baseParams 里的值盖掉）。
     */
    const page = await getTransactions({
      ...baseParams(),
      start,
      end,
      size: 100,
      order: order.value,
    });
    details.value[key] = groupByDay(page.list);
  } catch (err) {
    console.error('[flow] 明细加载失败', err);
    details.value[key] = [];
  } finally {
    loadingDetail.value.delete(key);
    loadingDetail.value = new Set(loadingDetail.value);
  }
}

/** 明细按日分组（后端已按时间倒序，这里只做归组，保持顺序） */
function groupByDay(list: TransactionItem[]) {
  const map = new Map<string, TransactionItem[]>();
  for (const t of list) {
    const arr = map.get(t.recordDate) || [];
    arr.push(t);
    map.set(t.recordDate, arr);
  }
  return [...map.entries()].map(([date, items]) => ({ date, items }));
}

/** 明细行副标题：账本名 · 备注 · 时刻（参考图的位置） */
function txnMeta(t: TransactionItem): string {
  const parts: string[] = [];
  if (t.account?.name) parts.push(t.account.name);
  if (t.note) parts.push(t.note);
  if (t.recordTime) parts.push(t.recordTime.slice(0, 5));
  return parts.join(' · ');
}

function signClass(v: string): string {
  return Number(v) < 0 ? 'expense' : 'income';
}

/* ── 交互 ── */
function toggleSearch() {
  searchVisible.value = !searchVisible.value;
  if (!searchVisible.value) {
    searchKeyword.value = '';
    reloadAll();
  }
}
function onSearchInput(e: any) {
  searchKeyword.value = e.detail.value;
}
function clearSearch() {
  searchKeyword.value = '';
  reloadAll();
}

function openUnitPicker() {
  unitOpen.value = true;
}
function pickUnit(u: SummaryUnit) {
  unit.value = u;
  unitOpen.value = false;
  reloadAll();
}

function openCategoryPicker() {
  draftCategories.value = [...filterModel.categoryIds];
  categoryOpen.value = true;
}
function toggleCategory(id: string) {
  const i = draftCategories.value.indexOf(id);
  if (i >= 0) draftCategories.value.splice(i, 1);
  else draftCategories.value.push(id);
}
function clearCategories() {
  draftCategories.value = [];
}
function applyCategories() {
  filterModel.categoryIds = [...draftCategories.value];
  categoryOpen.value = false;
  reloadAll();
}

function openFilterFromSheet() {
  actionVisible.value = false;
  filterVisible.value = true;
}
function onFilterApply(v: FlowFilter) {
  Object.assign(filterModel, v);
  reloadAll();
}

function pickTimePreset(opt: { label: string; start: string; end: string }) {
  filterModel.timeLabel = opt.label;
  filterModel.start = opt.start;
  filterModel.end = opt.end;
  timeOpen.value = false;
}

function openSortPicker() {
  actionVisible.value = false;
  sortOpen.value = true;
}
function pickSort(v: 'time' | 'amountDesc' | 'amountAsc') {
  order.value = v;
  sortOpen.value = false;
  reloadAll();
}

/** 导出当前分组为 CSV */
function doExport() {
  actionVisible.value = false;
  const rows: string[][] = [['分组', '收入', '支出', '结余', '笔数']];
  for (const g of groups.value) {
    const l = periodLabel(g.key, g.unit);
    rows.push([`${l.sub}${l.title}`, g.income, g.expense, g.balance, String(g.count)]);
  }
  const csv = '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\n');
  // #ifdef H5
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `流水_${unitLabel.value}_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  uni.showToast({ title: '已导出', icon: 'none' });
  // #endif
  // #ifndef H5
  uni.showToast({ title: '当前端暂不支持导出', icon: 'none' });
  // #endif
}
function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/* ── 导航 ── */
function goBack() {
  const pages = getCurrentPages();
  if (pages.length > 1) uni.navigateBack();
  else uni.reLaunch({ url: '/pages/main/index' });
}
function goCalendar() {
  uni.navigateTo({ url: '/pages/calendar/index' });
}
function goRecord() {
  uni.navigateTo({ url: '/pages/record/index' });
}
function editTransaction(id: string) {
  uni.navigateTo({ url: `/pages/record/index?id=${id}` });
}

onMounted(async () => {
  await categoryStore.load();
  await loadGroups();
});
</script>

<style scoped lang="scss">
.page {
  min-height: $page-min-height;
  background: $bg-canvas;
  /* 底部筛选栏是 fixed，留出高度避免遮住最后一组 */
  padding-bottom: calc(52px + env(safe-area-inset-bottom));
}

/* ── 顶栏 ── */
.nav {
  background: $bg-canvas;
}

.nav-inner {
  height: 44px;
  display: flex;
  align-items: center;
  padding: 0 $space-2;
}

.nav-btn {
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

.nav-actions {
  display: flex;
}

.search-bar {
  display: flex;
  align-items: center;
  margin: 0 $space-4 $space-2;
  padding: 0 $space-3;
  height: 36px;
  background: $bg-sunken;
  border-radius: $radius-md;
}

.search-icon {
  color: $text-tertiary;
  margin-right: $space-2;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-primary;
}

.search-clear {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $text-tertiary;
}

/* ── 渐变头图 ── */
.hero {
  background: $gradient-banner;
  padding: $space-5 $space-4;
}

/*
 * ×2 字号下「15,852.80 结余」一行放不下（实测 R=329 > 视口 320）。
 * 与项目其他金额行同一套做法：`flex-wrap` 让「结余」标签整体掉到第二行。
 * 正常字号下 wrap 是 no-op，所以给正常布局加它是安全的兜底。
 */
.hero-main {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
}

.hero-balance {
  @include tabular-nums;
  font-size: $font-display;
  line-height: $lh-display;
  font-weight: $weight-semibold;
  color: $text-inverse;
  @include text-safe;
}

.hero-balance-label {
  margin-left: $space-2;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-inverse;
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
  color: $text-inverse;
}

.hero-io-sep {
  margin: 0 $space-2;
  color: $text-inverse;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
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

/* ── 分组 ── */
.group {
  background: $bg-canvas;
  border-bottom: 1px solid $line;
}

.group-head {
  display: flex;
  align-items: center;
  padding: $space-3 $space-4;
}

.group-title-wrap {
  flex-shrink: 0;
  min-width: 64px;
}

.group-title {
  display: block;
  font-size: $font-h1;
  line-height: $lh-h1;
  font-weight: $weight-semibold;
  color: $text-primary;
}

.group-sub {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-tertiary;
}

.group-right {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
}

.group-amounts {
  flex: 1;
  min-width: 0;
}

.group-line {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.group-key {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-tertiary;
  margin-left: $space-2;
}

.group-val {
  @include tabular-nums;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  margin-left: 2px;
}

.group-sep {
  margin: 0 $space-1;
  color: $text-disabled;
  font-size: $font-caption;
  line-height: $lh-caption;
}

.group-arrow {
  margin-left: $space-2;
  color: $text-disabled;
  flex-shrink: 0;
}

/* ── 明细 ── */
.group-body {
  background: $bg-canvas;
}

.detail-loading {
  padding: $space-4;
  text-align: center;
}

.day-head {
  padding: $space-2 $space-4;
  background: $bg-subtle;
}

.day-head-text {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-secondary;
}

.txn {
  display: flex;
  align-items: center;
  padding: $space-3 $space-4;
  border-bottom: 1px solid $line;
}

.txn-icon {
  margin-right: $space-3;
  flex-shrink: 0;
}

.txn-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.txn-name {
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-primary;
  @include text-safe;
}

.txn-meta {
  margin-top: 2px;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-tertiary;
  @include text-safe;
}

.txn-amount {
  flex-shrink: 0;
  margin-left: $space-3;
  @include tabular-nums;
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

/* ── 底部筛选栏 ── */
.filter-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 100;
  display: flex;
  background: $bg-canvas;
  border-top: 1px solid $line;
  height: 48px;
  padding-bottom: env(safe-area-inset-bottom);
}

.filter-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $space-1;
  color: $text-secondary;
}

.filter-item.active {
  color: $brand-700;
}

.filter-text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
}

.filter-arrow {
  color: currentColor;
}

/* ── 通用弹层 ── */
.mask {
  position: fixed;
  inset: 0;
  background: $bg-mask;
  z-index: 1000;
  display: flex;
  align-items: flex-end;
}

.sheet {
  width: 100%;
  max-height: 80vh;
  background: $bg-card;
  border-radius: $radius-lg $radius-lg 0 0;
  padding-bottom: env(safe-area-inset-bottom);
}

.sheet-tall {
  height: 80vh;
  display: flex;
  flex-direction: column;
}

.sheet-head {
  padding: $space-4 $space-4 $space-2;
  text-align: center;
}

.sheet-title {
  display: block;
  font-size: $font-h2;
  line-height: $lh-h2;
  font-weight: $weight-semibold;
  color: $text-primary;
}

.sheet-sub {
  display: block;
  margin-top: $space-1;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-tertiary;
}

.sheet-item {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-top: 1px solid $line;
}

.sheet-item-row {
  justify-content: space-between;
  padding: 0 $space-5;
}

.sheet-item-text {
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  color: $text-primary;
}

.sheet-item-active {
  color: $brand-700;
  font-weight: $weight-medium;
}

.sheet-check {
  color: $brand-700;
}

.sheet-cancel {
  margin-top: $space-2;
  border-top: none;
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $space-3 $space-2;
}

.sheet-header-btn {
  min-width: $touch-target-min;
  height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $text-secondary;
}

.sheet-header-title {
  font-size: $font-h2;
  line-height: $lh-h2;
  font-weight: $weight-semibold;
  color: $text-primary;
}

.sheet-header-action {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $brand-700;
}

.cat-list {
  flex: 1;
  min-height: 0;
}

.cat-row {
  display: flex;
  align-items: center;
  min-height: 52px;
  padding: 0 $space-4;
  border-bottom: 1px solid $line;
}

.cat-child {
  padding-left: $space-8;
}

.cat-check {
  width: 20px;
  height: 20px;
  border-radius: $radius-sm;
  border: 1.5px solid $border-input;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: $space-3;
  flex-shrink: 0;
  color: $text-inverse;
}

.cat-check.checked {
  background: $brand-600;
  border-color: $brand-600;
}

.cat-icon {
  margin-right: $space-3;
  flex-shrink: 0;
}

.cat-name {
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-primary;
  @include text-safe;
}

.sheet-footer {
  padding: $space-4;
}

.btn {
  min-height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-md;
}

.btn-confirm {
  background: $brand-600;
}

.btn-text {
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  font-weight: $weight-medium;
}

.confirm-text {
  color: $text-inverse;
}

/* 宽屏限宽居中（与报表页同一约定：独立页无底栏，可安全限宽） */
@media (min-width: 600px) {
  .page {
    max-width: 480px;
    margin: 0 auto;
    border-left: 1px solid $line;
    border-right: 1px solid $line;
  }
  .filter-bar {
    max-width: 480px;
    left: 50%;
    transform: translateX(-50%);
  }
}
</style>
