<template>
  <view class="empty">
    <text class="icon">{{ icon }}</text>
    <text class="text">{{ text }}</text>
    <view v-if="buttonText" class="btn" @click="emit('action')">
      <text class="btn-text">{{ buttonText }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    icon?: string;
    text?: string;
    buttonText?: string;
  }>(),
  {
    icon: '📭',
    text: '暂无数据',
    buttonText: '',
  }
);

const emit = defineEmits<{
  (e: 'action'): void;
}>();
</script>

<style scoped lang="scss">
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
}

.icon {
  font-size: $icon-3xl;
  opacity: 0.5;
}

.text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  // 用 secondary 而非 tertiary：本组件是复用的，父容器可能是白卡也可能是页面底
  // （detail 页就挂在页面底上），tertiary 压页面底只有 4.17:1，不达标
  color: $text-secondary;
  margin-top: 12px;
  text-align: center;
  line-height: $lh-body-sm;
}

.btn {
  margin-top: 20px;
  padding: 8px 24px;
  background: $brand-600;
  border-radius: 20px;
}

.btn-text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-inverse;
}
</style>
