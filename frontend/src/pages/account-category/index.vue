<template>
  <view class="page">
    <view class="form-section">
      <view class="section-head">
        <text class="section-title">本账本的分类</text>
        <text class="section-action" @click="goImport">从母本导入</text>
      </view>
      <text class="section-hint">
        共 {{ currentList.length }} 个分类。移除的分类若已有交易会被拒绝。
      </text>
    </view>

    <scroll-view class="list" scroll-y :style="{ height: listHeight + 'px' }">
      <EmptyState v-if="!roots.length" icon="icon-tag" text="本账本还没有分类" />
      <view v-for="root in roots" :key="root.id" class="group">
        <view class="row root-row">
          <CategoryIcon class="row-icon" :name="root.icon" :size="24" />
          <text class="row-label">{{ root.name }}</text>
          <text v-if="!isDefaultAccount" class="row-remove" @click="onRemove(root)">移除</text>
        </view>
        <view v-for="child in childrenOf(root.id)" :key="child.id" class="row row-child">
          <CategoryIcon class="row-icon" :name="child.icon" :size="20" />
          <text class="row-label">{{ child.name }}</text>
          <text v-if="!isDefaultAccount" class="row-remove" @click="onRemove(child)">移除</text>
        </view>
      </view>
    </scroll-view>

    <view v-if="isDefaultAccount" class="notice">
      <text class="notice-text">默认账本是分类母本，其分类不可移除（只可改名 / 隐藏）。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 账本分类设置页（设计 D5/D13/D16）。
 *
 *   · 展示本账本的分类（一级 + 二级）
 *   · 「从母本导入」跳转到导入页（复用勾选树）
 *   · 「移除」调用删除接口；默认账本禁删（D16），非默认账本有交易也会被后端拒绝（D10）
 *
 * ⚠️ 分类 store 绑定「当前账本」。本页管理的账本若与当前账本不同，
 *    需要临时切换（见 onShow）—— 这会让本页"顺带改了当前账本"，
 *    属可接受的简化（用户进某账本的分类设置，本就暗示想用它）。
 */
import { ref, computed } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import CategoryIcon from '@/components/CategoryIcon.vue';
import EmptyState from '@/components/EmptyState.vue';
import { useCategoryStore } from '@/store/category';
import { useAccountStore } from '@/store/account';
import type { CategoryItem } from '@/api/category';

const categoryStore = useCategoryStore();
const accountStore = useAccountStore();

const accountId = ref('');
const listHeight = ref(400);

const isDefaultAccount = computed(
  () => accountStore.list.find((a) => a.id === accountId.value)?.isDefault ?? false
);
const currentList = computed<CategoryItem[]>(() => categoryStore.list);
const roots = computed(() => currentList.value.filter((c) => !c.parentId));

function childrenOf(parentId: string): CategoryItem[] {
  return currentList.value.filter((c) => c.parentId === parentId);
}

onLoad(async (opts?: Record<string, string>) => {
  accountId.value = opts?.accountId || accountStore.currentId;
  const info = uni.getSystemInfoSync();
  listHeight.value = Math.max(200, Math.round((info.windowHeight || 600) * 0.7));
});

onShow(async () => {
  if (accountId.value && accountStore.currentId !== accountId.value) {
    accountStore.switchTo(accountId.value);
  }
  await categoryStore.load(true);
});

function goImport() {
  const url = '/pages/account-import/index?accountId=' + accountId.value;
  uni.navigateTo({ url });
}

function onRemove(item: CategoryItem) {
  uni.showModal({
    title: '移除分类',
    content: '确定要从本账本移除「' + item.name + '」吗？',
    confirmText: '移除',
    confirmColor: '#D92D20',
    success: async (res) => {
      if (!res.confirm) return;
      try {
        await categoryStore.remove(item.id);
        uni.showToast({ title: '已移除', icon: 'none' });
      } catch (err) {
        console.error('[account-category] 移除失败', err);
      }
    },
  });
}
</script>

<style scoped lang="scss">
.page {
  min-height: $page-min-height;
  background: $v11-bg-page;
  display: flex;
  flex-direction: column;
}
.form-section {
  background: $v11-bg-card;
  padding: 16px;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.section-title {
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-primary;
  font-weight: $weight-medium;
}
.section-action {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $v11-gold;
}
.section-hint {
  display: block;
  margin-top: 6px;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
}
.list {
  flex: 1 1 auto;
}
.row {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  background: $v11-bg-card;
  border-bottom: 1px solid $v11-line;
}
.row-child {
  padding-left: 44px;
}
.row-icon {
  margin-right: 10px;
  flex: none;
}
.row-label {
  flex: 1 1 auto;
  min-width: 0;
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-primary;
}
.row-remove {
  flex: none;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $danger;
}
.notice {
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
  background: $v11-bg-inset;
}
.notice-text {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
}
</style>
