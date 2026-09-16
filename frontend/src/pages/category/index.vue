<template>
  <view class="page">
    <!-- ═══ 顶部栏：普通态（返回 / 标题 / 搜索）═══ -->
    <view v-if="!batchMode" class="navbar">
      <view class="nav-btn" @click="goBack">
        <SvgIcon name="icon-chevron-left" :size="20" />
      </view>
      <text class="nav-title">{{ typeLabel }}分类管理</text>
      <view class="nav-btn" @click="searching = !searching">
        <SvgIcon :name="searching ? 'icon-close' : 'icon-search'" :size="20" />
      </view>
    </view>

    <!-- ═══ 顶部栏：批量态（取消 / 选择XX分类 / 全选）═══ -->
    <view v-else class="navbar">
      <text class="nav-action" @click="exitBatch">取消</text>
      <text class="nav-title">选择{{ typeLabel }}分类</text>
      <text class="nav-action" @click="toggleAll">{{ allSelected ? '取消全选' : '全选' }}</text>
    </view>

    <!-- 搜索条：点放大镜展开 -->
    <view v-if="searching && !batchMode" class="search-bar">
      <SvgIcon class="search-icon" name="icon-search" :size="16" />
      <input
        v-model="keyword"
        class="search-input"
        placeholder="搜索分类名称"
        confirm-type="search"
      />
    </view>

    <scroll-view class="list" scroll-y>
      <EmptyState
        v-if="!filteredRoots.length"
        icon="icon-tag"
        :text="keyword ? '没有匹配的分类' : '还没有分类，在下面新建一个吧'"
      />

      <view v-for="root in filteredRoots" :key="root.id" class="group">
        <!-- 一级分类行 -->
        <view
          class="row root-row"
          @click="batchMode ? togglePick(root.id) : toggleGroup(root.id)"
        >
          <SvgIcon
            class="caret"
            :class="{ open: isExpanded(root.id) }"
            name="icon-chevron-down"
            :size="14"
          />
          <CategoryIcon :name="root.icon" :size="24" />
          <text class="root-name" :class="{ dimmed: root.isHidden }">{{ root.name }}</text>
          <text v-if="root.isHidden" class="hidden-tag">已隐藏</text>
          <view class="row-tail">
            <view v-if="batchMode" class="check" :class="{ on: isPicked(root.id) }">
              <SvgIcon v-if="isPicked(root.id)" name="icon-check" :size="14" />
            </view>
            <view v-else class="icon-btn" @click.stop="goEdit(root)">
              <SvgIcon name="icon-pencil" :size="18" />
            </view>
          </view>
        </view>

        <!-- 二级分类 -->
        <view v-if="isExpanded(root.id)" class="children">
          <view
            v-for="child in visibleChildrenOf(root.id)"
            :key="child.id"
            class="row child-row"
            @click="batchMode && togglePick(child.id)"
          >
            <CategoryIcon :name="child.icon" :size="20" />
            <text class="child-name" :class="{ dimmed: child.isHidden }">{{ child.name }}</text>
            <text v-if="child.isHidden" class="hidden-tag">已隐藏</text>
            <view class="row-tail">
              <view v-if="batchMode" class="check" :class="{ on: isPicked(child.id) }">
                <SvgIcon v-if="isPicked(child.id)" name="icon-check" :size="14" />
              </view>
              <view v-else class="icon-btn" @click.stop="goEdit(child)">
                <SvgIcon name="icon-pencil" :size="18" />
              </view>
            </view>
          </view>

          <view v-if="!batchMode && !keyword" class="add-child" @click="goAddChild(root)">
            <SvgIcon class="add-child-icon" name="icon-plus" :size="14" />
            <text class="add-child-text">新建二级分类</text>
          </view>
        </view>
      </view>

      <view class="list-tail" />
    </scroll-view>

    <!-- ═══ 底部固定栏 ═══ -->
    <view class="bottom-bar">
      <!-- 普通态：批量操作入口 + 新建一级分类 -->
      <template v-if="!batchMode">
        <view class="batch-entry" @click="enterBatch">
          <SvgIcon class="batch-entry-icon" name="icon-list-check" :size="22" />
          <view class="batch-entry-text">
            <text class="batch-entry-title">批量操作</text>
            <text class="batch-entry-sub">删除、隐藏、恢复显示</text>
          </view>
        </view>
        <view class="add-root" @click="goAddRoot">
          <SvgIcon name="icon-plus" :size="16" />
          <text>新建一级分类</text>
        </view>
      </template>

      <!-- 批量态：三个操作。按选中项的实际状态自动禁用不适用的那个 -->
      <template v-else>
        <view
          class="batch-act"
          :class="{ disabled: !canDelete }"
          @click="onBatchDelete"
        >
          <view class="batch-act-icon"><SvgIcon name="icon-trash" :size="22" /></view>
          <text class="batch-act-label">删除</text>
        </view>
        <view class="batch-act" :class="{ disabled: !canHide }" @click="onBatchHide(true)">
          <view class="batch-act-icon"><SvgIcon name="icon-eye-off" :size="22" /></view>
          <text class="batch-act-label">隐藏</text>
        </view>
        <view class="batch-act" :class="{ disabled: !canUnhide }" @click="onBatchHide(false)">
          <view class="batch-act-icon"><SvgIcon name="icon-eye" :size="22" /></view>
          <text class="batch-act-label">恢复显示</text>
        </view>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 分类管理（重构版）。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 三个与"参考图"有关的取舍，都写在这里免得下次有人以为是漏做：
 *
 * ① **收支类型是页面级参数**（`?type=expense|income`），页内不再放支出/收入开关。
 *    依据是参考图的标题写着「**支出**分类管理」——类型属于"你从哪进来的"，
 *    不属于"进来之后还能切"。配套地，「我的」页相应给出两个入口。
 *
 * ② **不放拖拽手柄**。参考图每行右侧有「≡」，但本项目的分类拖动排序还没做，
 *    放一个拖不动的手柄等于骗用户。同理也没有"点一下没反应"的控件。
 *
 * ③ **每行保留编辑入口**。参考图有；而"改名 / 换图标"确实无法用批量操作表达，
 *    去掉它会让这个能力彻底没有入口（批量模式只能删/隐藏）。
 *    编辑复用「新建分类」页（`?id=xxx`），不是另写一个页面。
 * ────────────────────────────────────────────────────────────────────────
 */
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import EmptyState from '@/components/EmptyState.vue';
import SvgIcon from '@/components/SvgIcon.vue';
import CategoryIcon from '@/components/CategoryIcon.vue';
import { useCategoryStore } from '@/store/category';
import type { CategoryItem } from '@/api/category';

const categoryStore = useCategoryStore();

const type = ref<'income' | 'expense'>('expense');
const typeLabel = computed(() => (type.value === 'income' ? '收入' : '支出'));

/** 批量模式 */
const batchMode = ref(false);
const selected = ref<string[]>([]);

/** 展开的一级分类 id 集合 */
const expanded = ref<string[]>([]);

/** 搜索（仅普通态可用：批量态的顶栏被 取消/全选 占满） */
const searching = ref(false);
const keyword = ref('');

const roots = computed(() =>
  type.value === 'expense' ? categoryStore.expenseRoots : categoryStore.incomeRoots
);

/** 组内的二级分类：搜索时不做二级过滤（命中一级就展示整组，避免"搜到一级却看不到内容"） */
function visibleChildrenOf(parentId: string): CategoryItem[] {
  return categoryStore.childrenOf(parentId);
}

const filteredRoots = computed(() => {
  const kw = keyword.value.trim();
  if (!kw) return roots.value;
  return roots.value.filter((r) => r.name.includes(kw));
});

/** 当前列表里全部分类的 id（用于"全选"） */
const allIds = computed(() => {
  const ids: string[] = [];
  for (const r of filteredRoots.value) {
    ids.push(r.id);
    for (const c of visibleChildrenOf(r.id)) ids.push(c.id);
  }
  return ids;
});

const allSelected = computed(
  () => allIds.value.length > 0 && allIds.value.every((id) => selected.value.includes(id))
);

/** 选中的分类实体（含隐藏状态，用于判断三个操作各自是否可用） */
const selectedItems = computed(() =>
  selected.value.map((id) => categoryStore.byId(id)).filter((c): c is CategoryItem => !!c)
);

const canDelete = computed(() => selectedItems.value.length > 0);
/**
 * 三个按钮**按选中项的实际状态自动禁用**，而不是点了没反应。
 * 选中的全是已隐藏分类时，「隐藏」禁用；全是可见的时，「恢复显示」禁用。
 * 混合选中时两个都可用 —— 各自只作用于状态匹配的那部分。
 */
const canHide = computed(() => selectedItems.value.some((c) => !c.isHidden));
const canUnhide = computed(() => selectedItems.value.some((c) => c.isHidden));

function isPicked(id: string): boolean {
  return selected.value.includes(id);
}

function isExpanded(id: string): boolean {
  return expanded.value.includes(id);
}

/** 默认展开全部一级分类，避免用户以为没有二级分类 */
function expandAll() {
  expanded.value = roots.value.map((r) => r.id);
}

function toggleGroup(id: string) {
  expanded.value = isExpanded(id)
    ? expanded.value.filter((x) => x !== id)
    : [...expanded.value, id];
}

function togglePick(id: string) {
  selected.value = isPicked(id)
    ? selected.value.filter((x) => x !== id)
    : [...selected.value, id];
}

function toggleAll() {
  selected.value = allSelected.value ? [] : [...allIds.value];
}

onLoad(async (opts?: Record<string, string>) => {
  type.value = opts?.type === 'income' ? 'income' : 'expense';
  // 分类管理页必须拿到**全量**（含已隐藏）——否则用户没有任何入口把隐藏的恢复回来。
  // store 缓存的本来就是全量，这里 force 一次是为了拿到别处改动后的最新状态。
  await categoryStore.load(true);
  expandAll();
});

function goBack() {
  uni.navigateBack();
}

function enterBatch() {
  batchMode.value = true;
  selected.value = [];
  searching.value = false;
  keyword.value = '';
  expandAll();
}

function exitBatch() {
  batchMode.value = false;
  selected.value = [];
}

/**
 * 新建 / 编辑都跳同一个页面：
 *   无 id 无 parentId → 新建一级
 *   有 parentId      → 新建二级
 *   有 id            → 编辑（名称 + 图标）
 */
function goAddRoot() {
  uni.navigateTo({ url: `/pages/category-new/index?type=${type.value}` });
}

function goAddChild(root: CategoryItem) {
  uni.navigateTo({
    url: `/pages/category-new/index?parentId=${root.id}&type=${root.type}`,
  });
}

function goEdit(item: CategoryItem) {
  uni.navigateTo({ url: `/pages/category-new/index?id=${item.id}` });
}

/** 批量删除：提示里要区分"直接删的"和"被级联删掉的" */
function onBatchDelete() {
  if (!canDelete.value) return;

  const items = selectedItems.value;
  const rootsPicked = items.filter((c) => !c.parentId);
  const pickedIds = new Set(items.map((c) => c.id));
  const loneChildren = items.filter((c) => c.parentId && !pickedIds.has(c.parentId));
  // 会被级联删掉的二级数量（与后端算法一致：仅统计"一级被选中"的那些组）
  const cascaded = rootsPicked.reduce(
    (n, r) => n + categoryStore.childrenOf(r.id).length,
    0
  );
  const direct = rootsPicked.length + loneChildren.length;

  uni.showModal({
    title: '删除分类',
    content:
      `将删除 ${direct} 个分类` +
      (cascaded ? `，并连同其下 ${cascaded} 个二级分类一并删除` : '') +
      `。相关账单会变为「未分类」，且无法撤销。`,
    confirmText: '删除',
    confirmColor: '#D92D20',
    success: async (res) => {
      if (!res.confirm) return;
      try {
        const result = await categoryStore.batchRemove(selected.value);
        exitBatch();
        expandAll();
        uni.showToast({
          title: result.deletedChildren
            ? `已删除 ${result.deleted} 个（含 ${result.deletedChildren} 个二级）`
            : `已删除 ${result.deleted} 个`,
          icon: 'none',
        });
      } catch (err) {
        console.error('[category] 批量删除失败', err);
      }
    },
  });
}

/** 批量隐藏 / 恢复显示 */
async function onBatchHide(hidden: boolean) {
  if (hidden ? !canHide.value : !canUnhide.value) return;
  try {
    const result = await categoryStore.batchHide(selected.value, hidden);
    exitBatch();
    expandAll();
    uni.showToast({
      title: hidden ? `已隐藏 ${result.updated} 个分类` : `已恢复 ${result.updated} 个分类`,
      icon: 'none',
    });
  } catch (err) {
    console.error('[category] 批量隐藏失败', err);
  }
}
</script>

<style scoped lang="scss">
/* 自绘顶栏 + 内部 scroll-view 滚动 ⇒ 容器必须有**确定高度**，
   min-height 下 flex 子项会按内容撑开、把底栏顶出屏幕（icon-picker 踩过） */
.page {
  height: $page-min-height;
  background: $v11-bg-page;
  display: flex;
  flex-direction: column;
}

/* ═══ 顶栏 ═══ */
.navbar {
  flex: none;
  height: 44px;
  display: flex;
  align-items: center;
  padding: 0 $space-3;
  border-bottom: 1px solid $v11-line;
}

.nav-btn {
  width: $touch-target-min;
  height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $v11-text-primary;
}

.nav-title {
  flex: 1;
  min-width: 0;
  text-align: center;
  font-size: $font-h2;
  line-height: $lh-h2;
  font-weight: $weight-semibold;
  color: $v11-text-primary;
}

.nav-action {
  min-width: 64px;
  text-align: center;
  padding: $space-2 0;
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-gold;
}

/* ═══ 搜索条 ═══ */
.search-bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: $space-2;
  padding: $space-2 $space-4;
  border-bottom: 1px solid $v11-line;
}

.search-icon {
  flex: none;
  color: $v11-text-secondary;
}

.search-input {
  flex: 1;
  min-width: 0;
  height: 36px;
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-primary;
}

/* ═══ 列表 ═══ */
.list {
  flex: 1;
  min-height: 0;
}

.list-tail {
  height: 24px;
}

.group + .group {
  border-top: 8px solid $v11-bg-inset;
}

.row {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-3 $space-4;
  min-height: 56px;
}

.root-row {
  padding-left: $space-3;
}

.caret {
  flex: none;
  color: $v11-text-secondary;
  transition: transform 0.2s;
}

.caret.open {
  transform: rotate(180deg);
}

.root-name {
  flex: 1;
  min-width: 0;
  /* 折行而不是 ellipsis：×2 字号下「柴米油盐蔬菜瓜果」需要 224px 而只剩下约 217px，
     截断等于把分类名吃掉一截（WCAG 1.4.4）。行变高是正确的降级。 */
  overflow-wrap: anywhere;
  font-size: $font-body;
  line-height: $lh-body;
  font-weight: $weight-medium;
  color: $v11-text-primary;
}

.children {
  border-top: 1px solid $v11-line;
}

.child-row {
  padding-left: 46px;
  border-bottom: 1px solid $v11-line;
}

.child-name {
  flex: 1;
  min-width: 0;
  /* 折行而不是 ellipsis：×2 字号下「柴米油盐蔬菜瓜果」需要 224px 而只剩下约 217px，
     截断等于把分类名吃掉一截（WCAG 1.4.4）。行变高是正确的降级。 */
  overflow-wrap: anywhere;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $v11-text-secondary;
}

/* 隐藏态用换色而不是 opacity：文字加透明度会静默吃掉对比度 */
.dimmed {
  color: $v11-text-secondary;
}

.hidden-tag {
  flex: none;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $badge-neutral-text;
  background: $badge-neutral-bg;
  border-radius: $radius-sm;
  padding: 1px 6px;
}

.row-tail {
  flex: none;
  display: flex;
  align-items: center;
}

.icon-btn {
  width: $touch-target-min;
  height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $v11-text-secondary;
}

/* 选择框：24×24，选中后实心 + 白勾 */
.check {
  width: 24px;
  height: 24px;
  border-radius: $radius-sm;
  border: 1.5px solid $border-input;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $text-inverse;
}

.check.on {
  background: $v11-gold;
  border-color: $v11-gold;
}

.add-child {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $space-1;
  padding: $space-3 0;
  min-height: 44px;
}

.add-child-icon {
  color: $v11-gold;
}

.add-child-text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $v11-gold;
}

/* ═══ 底部固定栏 ═══ */
.bottom-bar {
  flex: none;
  display: flex;
  /* ×2 字号下「批量操作」的双行文案 + 「新建一级分类」一共需要约 590px，
     远超 320px 视口 → 必须换行，否则会把「批量操作」挤成 21px 宽（实测）。
     wrap 在正常字号下是 no-op（两段共需约 296px，320px 放得下）。 */
  flex-wrap: wrap;
  align-items: center;
  border-top: 1px solid $v11-line;
  background: $v11-bg-page;
  padding-bottom: env(safe-area-inset-bottom);
}

.batch-entry {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-3 $space-4;
  min-height: 60px;
}

.batch-entry-icon {
  flex: none;
  color: $v11-text-primary;
}

.batch-entry-text {
  min-width: 0;
}

.batch-entry-title {
  display: block;
  font-size: $font-body;
  line-height: $lh-body;
  font-weight: $weight-medium;
  color: $v11-text-primary;
}

.batch-entry-sub {
  display: block;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
}

.add-root {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $space-1;
  padding: $space-3 $space-4;
  min-height: 60px;
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-gold;
  /* 这里**刻意不放分隔线**：参考图两段之间有一条竖线，但 ×2 字号下两段必须换行，
     换行后 border-left 会变成第二行左侧一道孤立的竖线，看着像渲染坏了。
     装饰性元素不值得为它牺牲布局正确性 —— 顶栏那条横线已经完成了"与列表分隔"。 */
}

.batch-act {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $space-1;
  padding: $space-2 0 $space-3;
  min-height: 64px;
}

.batch-act-icon {
  width: 40px;
  height: 40px;
  border-radius: $radius-md;
  background: $v11-bg-inset;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $v11-text-primary;
}

.batch-act-label {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
}

/* 禁用态：换色而不是 opacity（同 .dimmed 的理由） */
.batch-act.disabled .batch-act-icon {
  color: $v11-text-disabled;
}

.batch-act.disabled .batch-act-label {
  color: $v11-text-disabled;
}
</style>
