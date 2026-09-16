<template>
  <view class="keyboard">
    <view class="key" @click="press('7')">7</view>
    <view class="key" @click="press('8')">8</view>
    <view class="key" @click="press('9')">9</view>
    <view class="key fn" @click="backspace">删除</view>

    <view class="key" @click="press('4')">4</view>
    <view class="key" @click="press('5')">5</view>
    <view class="key" @click="press('6')">6</view>
    <view class="key fn" @click="clear">清空</view>

    <view class="key" @click="press('1')">1</view>
    <view class="key" @click="press('2')">2</view>
    <view class="key" @click="press('3')">3</view>
    <!-- 主操作在右下角：右手拇指的自然落点，纵向跨两行 -->
    <view class="key confirm" @click="emit('confirm')">完成</view>

    <view class="key zero" @click="press('0')">0</view>
    <view class="key" @click="press('.')">.</view>
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
/* ============================================================
   金额键盘 · v1.1「iOS 原生观感 · 暖金调」

   按键之间靠 1px 分隔线（容器底色 + grid gap）区分，**不靠阴影**；
   辅助键（删除 / 清空 / 小数点）用 $v11-bg-inset 底与数字键（白底）分组。

   ⚠️ v1.1 只把「线」与「底」两处刻度调淡，**键盘几何一行未动**：
      键高 48、4 列栅格、主操作跨两行 —— 这些是拇指落点的物理尺寸，
      不随视觉语言变化。改动仅限 $line → $v11-line、$bg-subtle → $v11-bg-inset。
   ============================================================ */
.keyboard {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  /* gap 露出容器的 $v11-line 底色 = 1px 分隔线 */
  gap: 1px;
  background: $v11-line;
  padding: 1px;
}

.key {
  height: 48px;
  background: $v11-bg-card;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: $font-h1;
  line-height: $lh-h1;
  color: $v11-text-primary;
  /* 扁平：无阴影 */
}

.key:active {
  /* 按下态：v1.1 用 $v11-bg-inset（#F5F5F5，对白键 1.04:1）——
     比旧 $bg-subtle 更轻，与新的分隔线刻度同一档 */
  background: $v11-bg-inset;
}

.zero {
  grid-column: span 2;
}

/* 辅助键：靠底色与数字键分组，不靠阴影 */
.fn {
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-secondary;
  background: $v11-bg-inset;
}

/*
 * 主操作：右下角，纵向跨两行。
 * 白字压 $v11-gold = 4.87:1 ✅（对比度对称：白底金字同样是 4.87）
 */
.confirm {
  grid-row: span 2;
  height: auto;
  background: $v11-gold;
  color: $text-inverse;
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  font-weight: $weight-medium;
}

.confirm:active {
  background: $v11-gold-pressed;
}
</style>
