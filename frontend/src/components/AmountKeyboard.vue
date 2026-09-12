<template>
  <view class="keyboard">
    <view class="row">
      <view class="key" @click="press('7')">7</view>
      <view class="key" @click="press('8')">8</view>
      <view class="key" @click="press('9')">9</view>
      <view class="key fn" @click="backspace">删除</view>
    </view>
    <view class="row">
      <view class="key" @click="press('4')">4</view>
      <view class="key" @click="press('5')">5</view>
      <view class="key" @click="press('6')">6</view>
      <view class="key fn" @click="clear">清空</view>
    </view>
    <view class="row">
      <view class="key" @click="press('1')">1</view>
      <view class="key" @click="press('2')">2</view>
      <view class="key" @click="press('3')">3</view>
      <view class="key confirm" @click="emit('confirm')">完成</view>
    </view>
    <view class="row">
      <view class="key zero" @click="press('0')">0</view>
      <view class="key" @click="press('.')">.</view>
      <view class="key confirm" @click="emit('confirm')">保存</view>
    </view>
  </view>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'confirm'): void;
}>();

const MAX_INT_LEN = 9;

function press(char: string) {
  let next = props.modelValue || '';

  // 小数点：只能有一个
  if (char === '.') {
    if (next.includes('.')) return;
    if (next === '') next = '0';
    emit('update:modelValue', next + '.');
    return;
  }

  // 小数最多两位
  const dotIndex = next.indexOf('.');
  if (dotIndex >= 0 && next.length - dotIndex - 1 >= 2) return;

  // 整数部分长度限制
  if (dotIndex < 0 && next.replace(/^0+/, '').length >= MAX_INT_LEN) return;

  // 避免 "00" 这种前导零
  if (next === '0') next = '';

  emit('update:modelValue', next + char);
}

function backspace() {
  emit('update:modelValue', (props.modelValue || '').slice(0, -1));
}

function clear() {
  emit('update:modelValue', '');
}
</script>

<style scoped lang="scss">
.keyboard {
  background: $bg-page;
  padding: 6px;
}

.row {
  display: flex;
  margin-bottom: 8px;
}

.key {
  flex: 1;
  height: 48px;
  margin-right: 8px;
  background: $bg-card;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: $font-h1;
  line-height: $lh-h1;
  color: $text-primary;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.key:last-child {
  margin-right: 0;
}

.key:active {
  background: $bg-subtle;
}

.zero {
  flex: 2;
}

.fn {
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-secondary;
  background: $bg-subtle;
}

.confirm {
  background: $brand-600;
  color: $text-inverse;
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
}

.confirm:active {
  background: $brand-800;
}
</style>
