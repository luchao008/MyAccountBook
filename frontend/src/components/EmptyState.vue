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

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
}

.icon {
  font-size: 48px;
  opacity: 0.5;
}

.text {
  font-size: 14px;
  color: #999;
  margin-top: 12px;
  text-align: center;
  line-height: 1.6;
}

.btn {
  margin-top: 20px;
  padding: 8px 24px;
  background: #ff6b35;
  border-radius: 20px;
}

.btn-text {
  font-size: 14px;
  color: #fff;
}
</style>
