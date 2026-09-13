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
        <CategoryIcon class="icon" :name="item.icon" :size="24" />
      </view>
      <text class="name">{{ item.name }}</text>
    </view>

    <view v-if="!categories.length" class="empty">暂无分类，请先到「我的 - 分类管理」添加</view>
  </view>
</template>

<script setup lang="ts">
import CategoryIcon from '@/components/CategoryIcon.vue';
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

<style scoped lang="scss">
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
  background: $bg-subtle;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.icon-active {
  background: $brand-100;
  border: 2px solid $brand-600;
}

.icon {
  /* 压 $bg-subtle(#EEF1F5) 13.93:1 */
  color: $text-primary;
}

.icon-active .icon {
  /* 压 $brand-100(#FFE3D6) 4.06:1，图形按 3:1 判定 */
  color: $brand-700;
}

.name {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-secondary;
  margin-top: 6px;
}

.active .name {
  color: $brand-700;
  font-weight: $weight-medium;
}

.empty {
  width: 100%;
  text-align: center;
  color: $text-tertiary;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  padding: 24px 0;
}
</style>
