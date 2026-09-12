<template>
  <view class="grid">
    <view
      v-for="item in categories"
      :key="item.id"
      class="grid-item"
      :class="{ active: item.id === modelValue }"
      @click="onPick(item.id)"
    >
      <view class="icon-box" :class="{ 'icon-active': item.id === modelValue }">
        <text class="icon">{{ iconOf(item.icon) }}</text>
      </view>
      <text class="name">{{ item.name }}</text>
    </view>

    <view v-if="!categories.length" class="empty">暂无分类，请先到「我的 - 分类管理」添加</view>
  </view>
</template>

<script setup lang="ts">
import { iconOf } from '@/utils/icon';
import type { CategoryItem } from '@/api/category';

defineProps<{
  categories: CategoryItem[];
  modelValue: string | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void;
}>();

function onPick(id: string) {
  // 再次点击已选中的分类 = 取消选择（允许"未分类"）
  emit('update:modelValue', id);
}
</script>

<style scoped>
.grid {
  display: flex;
  flex-wrap: wrap;
  padding: 8px 0;
}

.grid-item {
  width: 25%;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 16px;
}

.icon-box {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.icon-active {
  background: #fff1eb;
  border: 2px solid #ff6b35;
}

.icon {
  font-size: 24px;
}

.name {
  font-size: 12px;
  color: #666;
  margin-top: 6px;
}

.active .name {
  color: #ff6b35;
  font-weight: 500;
}

.empty {
  width: 100%;
  text-align: center;
  color: #999;
  font-size: 13px;
  padding: 24px 0;
}
</style>
