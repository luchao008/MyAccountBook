<template>
  <view class="page">
    <!-- 账本名 -->
    <view class="form-section">
      <text class="section-title">账本名称</text>
      <input v-model="name" class="input" placeholder="例如：家庭账本" maxlength="64" />
    </view>

    <!-- 分类选择 -->
    <view class="form-section">
      <view class="section-head">
        <text class="section-title">选择分类</text>
        <text class="section-action" @click="toggleAll">{{ allSelected ? '取消全选' : '全选' }}</text>
      </view>
      <text class="section-hint">从「{{ defaultAccountName }}」复制选中的分类到新账本（可随时修改）</text>
    </view>

    <CategoryCheckTree
      v-if="candidates.length"
      v-model="pickedIds"
      :categories="candidates"
      :body-height="treeHeight"
    />
    <EmptyState v-else icon="icon-tag" text="母本还没有分类" />

    <view class="footer">
      <view class="btn" :class="{ disabled: !canSubmit }" @click="onSubmit">
        <text class="btn-text">创建账本</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 新建账本页（设计 D4：独立页而非弹窗）。
 *
 * 交互（设计 D3/D6/D9）：
 *   · 账本名 + 分类勾选树（候选 = 默认账本/母本的全部分类）
 *   · **默认全选**，用户取消掉不要的
 *   · 勾一级连带其下二级；只勾二级自动带上父（由 CategoryCheckTree 保证）
 */
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import CategoryCheckTree from '@/components/CategoryCheckTree.vue';
import EmptyState from '@/components/EmptyState.vue';
import { getCategoryCandidates, createAccount } from '@/api/account';
import { useAccountStore } from '@/store/account';
import type { CategoryItem } from '@/api/category';

const accountStore = useAccountStore();

const name = ref('');
const candidates = ref<CategoryItem[]>([]);
const pickedIds = ref<string[]>([]);
const defaultAccountName = ref('默认账本');
const treeHeight = ref(300);

const allSelected = computed(
  () => candidates.value.length > 0 && pickedIds.value.length === candidates.value.length
);
const canSubmit = computed(() => name.value.trim().length > 0);

onLoad(async () => {
  // body 高度按视口算（uni scroll-view 不吃 flex 推导）
  const info = uni.getSystemInfoSync();
  treeHeight.value = Math.max(160, Math.round((info.windowHeight || 600) * 0.5));

  try {
    candidates.value = (await getCategoryCandidates()) as CategoryItem[];
    // 默认全选（D3）
    pickedIds.value = candidates.value.map((c) => c.id);
  } catch (err) {
    console.error('[account-new] 候选分类加载失败', err);
  }

  const def = accountStore.list.find((a) => a.isDefault);
  if (def) defaultAccountName.value = def.name;
});

function toggleAll() {
  pickedIds.value = allSelected.value ? [] : candidates.value.map((c) => c.id);
}

async function onSubmit() {
  if (!canSubmit.value) return;
  const trimmed = name.value.trim();
  try {
    await createAccount({
      name: trimmed,
      icon: 'wallet',
      copyAll: false,
      categoryIds: pickedIds.value,
    });
    await accountStore.refresh();
    uni.showToast({ title: '已创建', icon: 'success' });
    setTimeout(() => uni.navigateBack(), 600);
  } catch (err) {
    console.error('[account-new] 创建失败', err);
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

.input {
  margin-top: 10px;
  height: 44px;
  padding: 0 12px;
  background: $bg-sunken;
  border-radius: $radius-sm;
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-primary;
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
