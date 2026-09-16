<template>
  <view class="page">
    <view class="form-section">
      <view class="section-head">
        <text class="section-title">从母本导入分类</text>
        <text class="section-action" @click="toggleAll">{{ allSelected ? '取消全选' : '全选' }}</text>
      </view>
      <text class="section-hint">勾选要加入本账本的分类（已在本账本中的不会重复）</text>
    </view>

    <CategoryCheckTree
      v-if="candidates.length"
      v-model="pickedIds"
      :categories="candidates"
      :body-height="treeHeight"
    />
    <EmptyState v-else icon="icon-tag" text="没有可导入的分类" />

    <view class="footer">
      <view class="btn" :class="{ disabled: !pickedIds.length }" @click="onSubmit">
        <text class="btn-text">导入 {{ pickedIds.length }} 个分类</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 从母本（默认账本）导入分类到指定账本（设计 D13）。
 *
 * 候选 = 母本全部分类。默认全选，用户取消掉不要的。
 * 已在目标账本里的同名分类会被后端唯一键挡住 → 前端先行过滤，避免提交无效项。
 */
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import CategoryCheckTree from '@/components/CategoryCheckTree.vue';
import EmptyState from '@/components/EmptyState.vue';
import { getCategoryCandidates, importCategories } from '@/api/account';
import { getCategories } from '@/api/category';
import { useAccountStore } from '@/store/account';
import type { CategoryItem } from '@/api/category';

const accountStore = useAccountStore();

const accountId = ref('');
const candidates = ref<CategoryItem[]>([]);
const pickedIds = ref<string[]>([]);
const treeHeight = ref(300);

const allSelected = computed(
  () => candidates.value.length > 0 && pickedIds.value.length === candidates.value.length
);

onLoad(async (opts?: Record<string, string>) => {
  accountId.value = opts?.accountId || accountStore.currentId;
  const info = uni.getSystemInfoSync();
  treeHeight.value = Math.max(160, Math.round((info.windowHeight || 600) * 0.5));

  try {
    const [all, existing] = await Promise.all([
      getCategoryCandidates() as Promise<CategoryItem[]>,
      getCategories(accountId.value) as Promise<CategoryItem[]>,
    ]);
    // 过滤掉目标账本已有的同名分类（同名会被唯一键挡住）
    const existingNames = new Set(existing.map((c) => c.name));
    candidates.value = all.filter((c) => !existingNames.has(c.name));
    pickedIds.value = candidates.value.map((c) => c.id);
  } catch (err) {
    console.error('[account-import] 候选分类加载失败', err);
  }
});

function toggleAll() {
  pickedIds.value = allSelected.value ? [] : candidates.value.map((c) => c.id);
}

async function onSubmit() {
  if (!pickedIds.value.length) return;
  try {
    const res = await importCategories(accountId.value, pickedIds.value);
    uni.showToast({ title: '已导入 ' + res.imported + ' 个', icon: 'none' });
    setTimeout(() => uni.navigateBack(), 600);
  } catch (err) {
    console.error('[account-import] 导入失败', err);
  }
}
</script>

<style scoped lang="scss">
.page {
  min-height: $page-min-height;
  background: $bg-canvas;
  padding-bottom: 96px;
}
.form-section {
  background: $bg-card;
  padding: 16px;
  margin-bottom: 12px;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.section-title {
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-primary;
  font-weight: $weight-medium;
}
.section-action {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $brand-700;
}
.section-hint {
  display: block;
  margin-top: 6px;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-secondary;
}
.footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
  background: $bg-card;
  border-top: 1px solid $line;
}
.btn {
  height: 48px;
  background: $brand-600;
  border-radius: $radius-md;
  display: flex;
  align-items: center;
  justify-content: center;
}
.btn.disabled {
  opacity: 0.5;
}
.btn-text {
  color: $text-inverse;
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  font-weight: $weight-medium;
}
</style>
