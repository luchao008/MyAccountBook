<template>
  <view class="keyboard">
    <view class="key" @click="digit('7')">7</view>
    <view class="key" @click="digit('8')">8</view>
    <view class="key" @click="digit('9')">9</view>
    <view class="key op" @click="operator('-')">−</view>

    <view class="key" @click="digit('4')">4</view>
    <view class="key" @click="digit('5')">5</view>
    <view class="key" @click="digit('6')">6</view>
    <view class="key op" @click="operator('+')">＋</view>

    <view class="key" @click="digit('1')">1</view>
    <view class="key" @click="digit('2')">2</view>
    <view class="key" @click="digit('3')">3</view>
    <!-- 主操作在右下角：右手拇指的自然落点，纵向跨两行 -->
    <view class="key confirm" @click="emit('confirm')">确定</view>

    <view class="key" @click="dot">.</view>
    <view class="key" @click="digit('0')">0</view>
    <view class="key op" @click="backspace">
      <SvgIcon name="icon-backspace" :size="24" />
    </view>
  </view>
</template>

<script setup lang="ts">
import SvgIcon from '@/components/SvgIcon.vue';
import { pressDigit, pressDot, pressOperator, backspaceExpr } from '@/utils/amountExpr';

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'confirm'): void;
}>();

/*
 * 键盘本身不做任何规则判断 —— 输入规则（前导零 / 小数点 / 位数 /
 * 符号与运算符状态机）全部收敛在 utils/amountExpr.ts，那里是纯函数、
 * 有单测钉死（test/amount-expr.test.ts）。组件只负责转发，
 * 避免出现"组件里一份规则、工具里一份规则"的双写漂移。
 */

function digit(d: string) {
  emit('update:modelValue', pressDigit(props.modelValue || '', d));
}

function dot() {
  emit('update:modelValue', pressDot(props.modelValue || ''));
}

function operator(op: '+' | '-') {
  emit('update:modelValue', pressOperator(props.modelValue || '', op));
}

function backspace() {
  emit('update:modelValue', backspaceExpr(props.modelValue || ''));
}
</script>

<style scoped lang="scss">
/* ============================================================
   金额键盘 · v1.1「iOS 原生观感 · 暖金调」· 加减计算版

   按键之间靠 1px 分隔线（容器底色 + grid gap）区分，**不靠阴影**；
   辅助键（运算符 / 退格）用 $v11-bg-inset 底与数字键（白底）分组。

   ⚠️ 几何仍是 4 列 × 48px 键高、主操作右下角跨两行 —— 拇指落点的
      物理尺寸不动。本次改造只换了右列与底行的键位内容
      （＋/－/退格图标入列，「清空」键按参考图移除）。
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
  /*
   * 按下态：v1.1 用 $v11-bg-inset —— 浅灰，压白键仅 1.04:1，
   * 比 FL-1 的 $bg-subtle 更轻，与新的分隔线同属一档刻度。
   *
   * ⚠️ 这里刻意**不写色值字面量**：check-contrast 的「旧色值残留扫描」
   *    会扫 .vue 里的 #rrggbb，写在注释里也算残留。
   */
  background: $v11-bg-inset;
}

/* 辅助键（运算符 / 退格）：靠底色与数字键分组，不靠阴影 */
.op {
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
