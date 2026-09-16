<template>
  <view class="empty">
    <SvgIcon class="icon" :name="icon" :size="48" />
    <text class="text">{{ text }}</text>
    <text v-if="subText" class="sub-text">{{ subText }}</text>
    <view v-if="buttonText" class="btn" @click="emit('action')">
      <text class="btn-text">{{ buttonText }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import SvgIcon from '@/components/SvgIcon.vue';

withDefaults(
  defineProps<{
    icon?: string;
    text?: string;
    /** 次级说明（如「点击右下角加号可快速记账」） */
    subText?: string;
    buttonText?: string;
  }>(),
  {
    // 图标名而不是 emoji：emoji 不受 color 影响，做不出状态与主题
    icon: 'icon-inbox',
    text: '暂无数据',
    subText: '',
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
  /* 图标改用显式颜色：font-size 对 svg 无效，而继承色在深浅背景上会失控 */
  color: $v11-text-primary;
  /*
   * 这里**保留 opacity**：它是纯装饰的空状态插画，不承载信息（WCAG 豁免）。
   * ⚠️ opacity 只允许用在这类图形上 —— 文字用 opacity 会静默吃掉对比度
   *    （本项目已踩过：白字 4.52 × 0.85 只剩 3.69）。
   */
  opacity: 0.5;
}

.text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  // v1.1 沿用「secondary 而非 tertiary」，而且更加必要：
  // 本组件是复用的，父容器可能是白卡 #FFFFFF，也可能是页面底 #F8F8F8。
  // $v11-text-secondary 是唯一**双底都达标**的次级色（5.29 / 4.98）；
  // $v11-text-tertiary #9A9AA0 只有 2.80 —— v1.1 已把它降级为「仅装饰」，不得承载正文。
  color: $v11-text-secondary;
  margin-top: 12px;
  text-align: center;
  line-height: $lh-body-sm;
}

/* 次级说明：同样用 secondary —— 页面底上 tertiary 不达标的场景之一 */
.sub-text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $v11-text-secondary;
  margin-top: 6px;
  text-align: center;
}

.btn {
  margin-top: 20px;
  padding: 8px 24px;
  /*
   * v1.1：品牌橙 #CF4A12 → 暖橙金 $v11-gold #A85F12。
   * 白字压其上 4.87:1 ✅（旧值 4.52，改完反而更清楚）。
   * 圆角走按钮档 $v11-radius-btn；本按钮高度约 38px，25px 圆角即等于药丸。
   */
  background: $v11-gold;
  border-radius: $v11-radius-btn;
}

.btn-text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-inverse;
}
</style>
