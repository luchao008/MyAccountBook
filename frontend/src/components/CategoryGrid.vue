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
  background: $v11-bg-inset;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

/*
 * 选中图标：浅金底 + 主色金图标 + 2px 金色描边。
 *
 * ⚠️ 为什么用 $v11-gold-soft 而不是旧 FL-1 的浅橙底 #FFE3D6：
 *    v1.1 的调色板里**没有**「比 #FDF6EF 更深、又能让金字保持 4.5:1」的中间档
 *    （实测：把浅金底加深到能与白卡区分，金字就跌到 4.06 以下，无解）。
 *    所以浅金底压白卡只有 1.07 可见度 —— **选中态由那 2px 描边承担**，底色只是氛围。
 *    ⚠️ 描边不能去掉：去掉后底色等于不存在，选中会完全看不出来。
 */
.icon-active {
  background: $v11-gold-soft;
  border: 2px solid $v11-gold;
}

.icon {
  /* 压 $v11-bg-inset(#EEF1F5) 13.93:1 */
  color: $v11-text-primary;
}

.icon-active .icon {
  /* 压 $v11-gold-soft(#FDF6EF) 4.55:1 ✅（图形按 3:1 判定，余量充足） */
  color: $v11-gold;
}

.name {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
  margin-top: 6px;
}

.active .name {
  color: $v11-gold;
  font-weight: $weight-medium;
}

.empty {
  width: 100%;
  text-align: center;
  color: $v11-text-secondary;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  padding: 24px 0;
}
</style>
