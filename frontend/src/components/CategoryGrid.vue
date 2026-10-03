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

/*
 * ⚠️ 过渡**只列具体属性**，不用 `all`（2026-10-02 改）。
 *
 * 为什么不能 `all`：`all` 会把 `border-width` 也纳入过渡 —— 而
 * `border-width` 是**布局属性**，每帧都触发 layout + paint，不是合成层。
 * 一屏最多 89 个格子各带一条这样的过渡，白白增加切换时的样式重算。
 *
 * 为什么基础态要先声明 `border: 2px solid transparent`（而不是留空、靠 `.icon-active` 加）：
 *   留空的话，选中那一刻 `border-style` 从 none 变 solid、`border-color` 从
 *   **初始值 currentColor**（深墨色）过渡到金色 —— 会先闪出一圈**深色描边**。
 *   预置透明描边后，两态的 width/style 完全一致，只有颜色在动，没有闪烁。
 *
 * ⚠️ 几何不变的前提是 `box-sizing: border-box`（App.vue 全局给 view 设了）。
 *    所以 48px 外框始终是 48px，只是内容区从 48 变成 44 —— 内部图标是固定 24px
 *    且 flex 居中，位置与大小都不受影响。
 *    **改这里之后要重跑 `scripts/reflow-audit.mjs`** 确认没有新的"压邻居"。
 */
.icon-box {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: $v11-bg-inset;
  border: 2px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background-color 0.15s,
    border-color 0.15s;
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
