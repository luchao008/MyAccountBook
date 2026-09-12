<template>
  <view class="page">
    <view class="type-switch">
      <view class="type-btn" :class="{ active: type === 'expense' }" @click="type = 'expense'">
        支出分类
      </view>
      <view class="type-btn" :class="{ active: type === 'income' }" @click="type = 'income'">
        收入分类
      </view>
    </view>

    <EmptyState v-if="!roots.length" icon="🏷️" text="还没有分类，在下面新建一个吧" />

    <!-- 一级分类分组 -->
    <view v-for="root in roots" :key="root.id" class="group">
      <view class="group-header" @click="toggle(root.id)">
        <text class="caret" :class="{ open: isExpanded(root.id) }">⌄</text>
        <text class="group-icon">{{ iconOf(root.icon) }}</text>
        <text class="group-name">{{ root.name }}</text>
        <text class="group-count" v-if="childrenOf(root.id).length">
          {{ childrenOf(root.id).length }}
        </text>
        <text class="action" @click.stop="onDelete(root, 0)">删除</text>
      </view>

      <view v-if="isExpanded(root.id)" class="children">
        <view v-for="child in childrenOf(root.id)" :key="child.id" class="child-row">
          <text class="child-icon">{{ iconOf(child.icon) }}</text>
          <text class="child-name">{{ child.name }}</text>
          <text class="action" @click.stop="onDelete(child, childrenOf(root.id).length)">
            删除
          </text>
        </view>

        <view class="add-child" @click="onAddChild(root)">
          <text class="add-child-icon">＋</text>
          <text class="add-child-text">新建二级分类</text>
        </view>
      </view>
    </view>

    <!-- 新建一级分类 -->
    <view class="add-box">
      <view class="add-row">
        <input v-model="newName" class="input" placeholder="新一级分类名称" maxlength="64" />
        <view class="add-btn" @click="onAddRoot">新建一级分类</view>
      </view>
      <text class="hint">
        分类最多两级：一级分类下可建二级分类，二级分类下不能再建。删除一级分类会连同其下二级分类一起删除。
      </text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import EmptyState from '@/components/EmptyState.vue';
import { useCategoryStore } from '@/store/category';
import { iconOf } from '@/utils/icon';
import type { CategoryItem } from '@/api/category';

const categoryStore = useCategoryStore();
const type = ref<'income' | 'expense'>('expense');
const newName = ref('');
/** 展开的一级分类 id 集合 */
const expanded = ref<string[]>([]);

const roots = computed(() =>
  type.value === 'expense' ? categoryStore.expenseRoots : categoryStore.incomeRoots
);

function childrenOf(parentId: string): CategoryItem[] {
  return categoryStore.childrenOf(parentId);
}

function isExpanded(id: string): boolean {
  return expanded.value.includes(id);
}

/** 默认展开全部一级分类，避免用户以为没有二级分类 */
function expandAll() {
  expanded.value = roots.value.map((r) => r.id);
}

function toggle(id: string) {
  expanded.value = isExpanded(id)
    ? expanded.value.filter((x) => x !== id)
    : [...expanded.value, id];
}

onLoad(async () => {
  await categoryStore.load(true);
  expandAll();
});

async function onAddRoot() {
  const name = newName.value.trim();
  if (!name) {
    uni.showToast({ title: '请输入分类名称', icon: 'none' });
    return;
  }
  try {
    await categoryStore.add({ name, type: type.value, icon: '📦' });
    newName.value = '';
    expandAll();
    uni.showToast({ title: '已添加', icon: 'success' });
  } catch (err) {
    console.error('[category] 添加失败', err);
  }
}

function onAddChild(root: CategoryItem) {
  uni.showModal({
    title: `在「${root.name}」下新建`,
    editable: true,
    placeholderText: '输入二级分类名称',
    success: async (res) => {
      if (!res.confirm) return;
      const name = (res.content || '').trim();
      if (!name) return;
      try {
        await categoryStore.add({
          name,
          type: root.type,
          icon: '📦',
          parentId: root.id,
        });
        if (!isExpanded(root.id)) expanded.value.push(root.id);
        uni.showToast({ title: '已添加', icon: 'success' });
      } catch (err) {
        console.error('[category] 添加二级失败', err);
      }
    },
  });
}

function onDelete(item: CategoryItem, childCount: number) {
  const extra =
    childCount > 0
      ? `该分类下还有 ${childCount} 个二级分类，会一并删除；`
      : '';
  uni.showModal({
    title: '删除分类',
    content: `${extra}相关账单会变为「未分类」。确定删除「${item.name}」？`,
    success: async (res) => {
      if (!res.confirm) return;
      try {
        const result = await categoryStore.remove(item.id);
        expandAll();
        uni.showToast({
          title:
            result.deletedChildren > 0
              ? `已删除（含 ${result.deletedChildren} 个二级）`
              : '已删除',
          icon: 'none',
        });
      } catch (err) {
        console.error('[category] 删除失败', err);
      }
    },
  });
}
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  background: $bg-page;
  padding: 16px;
  padding-bottom: calc(24px + env(safe-area-inset-bottom));
}

.type-switch {
  display: flex;
  background: $bg-card;
  border-radius: 12px;
  padding: 4px;
  margin-bottom: 16px;
}

.type-btn {
  flex: 1;
  text-align: center;
  padding: 10px 0;
  font-size: 15px;
  color: $text-secondary;
  border-radius: 8px;
}

.type-btn.active {
  background: $brand-600;
  color: $text-inverse;
  font-weight: 500;
}

.group {
  background: $bg-card;
  border-radius: 14px;
  margin-bottom: 12px;
  overflow: hidden;
}

.group-header {
  display: flex;
  align-items: center;
  padding: 14px 16px;
}

.caret {
  width: 18px;
  font-size: 14px;
  color: $text-tertiary;
  transition: transform 0.2s;
}

.caret.open {
  transform: rotate(180deg);
}

.group-icon {
  font-size: 20px;
  margin-left: 4px;
}

.group-name {
  flex: 1;
  margin-left: 10px;
  font-size: 15px;
  color: $text-primary;
  font-weight: 500;
}

.group-count {
  font-size: 12px;
  color: $badge-neutral-text;
  background: $badge-neutral-bg;
  border-radius: 9px;
  padding: 1px 8px;
  margin-right: 10px;
}

.children {
  padding: 0 16px 8px 38px;
  border-top: 1px solid $divider;
}

.child-row {
  display: flex;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid $divider;
}

.child-icon {
  font-size: 17px;
}

.child-name {
  flex: 1;
  margin-left: 10px;
  font-size: 14px;
  color: $text-secondary;
}

.action {
  font-size: 13px;
  color: $expense;
  padding: 2px 0;
}

.add-child {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 0 4px;
}

.add-child-icon {
  font-size: 14px;
  color: $brand-700;
  margin-right: 4px;
}

.add-child-text {
  font-size: 13px;
  color: $brand-700;
}

.add-box {
  margin-top: 16px;
  background: $bg-card;
  border-radius: 14px;
  padding: 16px;
}

.add-row {
  display: flex;
  align-items: center;
}

.input {
  flex: 1;
  height: 40px;
  background: $bg-subtle;
  border-radius: 8px;
  padding: 0 12px;
  font-size: 15px;
}

.add-btn {
  margin-left: 12px;
  padding: 0 16px;
  height: 40px;
  line-height: 40px;
  background: $brand-600;
  color: $text-inverse;
  border-radius: 8px;
  font-size: 14px;
}

.hint {
  display: block;
  margin-top: 12px;
  font-size: 12px;
  color: $text-tertiary;
  line-height: 1.6;
}
</style>
