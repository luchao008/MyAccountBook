<template>
  <!--
    轻遮罩：既能"点空白关闭"，又不把整页压黑 —— 下拉菜单不是模态弹层。
  -->
  <view v-if="visible" class="dropdown-mask" @click="onMask">
    <!--
      面板从**顶栏下方**往下展开（`top` 由调用方给 = 顶栏底部）。
      ⚠️ 展开效果用 `transform-origin: top` + 纵向缩放做出来，而不是 `height: auto` 过渡
         （后者不可动画，只能瞬变）。缩放的副作用是文字/图标会被短暂压扁 ——
         0.2s 内肉眼基本看不出来，比"没有动画"好得多。
    -->
    <view class="dropdown" :style="{ top: top + 'px' }" @click.stop>
      <view
        v-for="opt in options"
        :key="opt.value"
        class="dropdown-item"
        @click="onPick(opt.value)"
      >
        <text class="dropdown-text" :class="{ active: opt.value === modelValue }">
          {{ opt.label }}
        </text>
        <SvgIcon
          v-if="opt.value === modelValue"
          class="dropdown-check"
          name="icon-check"
          :size="16"
        />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 导航栏下拉选择（2026-09-30 新增）。
 *
 * 用在「图表页」顶部标题上：点「分类支出 ▾」后，选项面板**从顶栏下方往下展开**，
 * 而不是像其它弹层那样从屏幕底部升起 —— 因为触发点在顶部，
 * 从顶部展开才符合"它就是从这儿掉下来的"直觉（luchao 要求）。
 *
 * 与 CategoryPicker / 底部 sheet 的区别：那两者是"选择内容"的模态层，
 * 这个是"切换当前视图口径"的轻量菜单，所以遮罩很淡、面板紧贴触发点。
 */
withDefaults(
  defineProps<{
    visible: boolean;
    modelValue: string;
    options: { value: string; label: string }[];
    /** 面板顶部位置（px）—— 调用方传"顶栏底部"，通常 = 状态栏 + 44 */
    top?: number;
  }>(),
  { top: 44 },
);

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'pick', value: string): void;
}>();

function onMask() {
  emit('update:visible', false);
}

function onPick(value: string) {
  emit('pick', value);
  emit('update:visible', false);
}
</script>

<style scoped lang="scss">
.dropdown-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.12);
  z-index: 1000;
}

.dropdown {
  position: absolute;
  left: 0;
  right: 0;
  background: $v11-bg-card;
  /* 只圆下面两个角：上面与顶栏齐平，圆了反而像浮在顶上的一块补丁 */
  border-radius: 0 0 $v11-radius-card $v11-radius-card;
  overflow: hidden;
  transform-origin: top center;
  animation: dropdown-in 0.2s ease-out;
  /*
   * 阴影：与图表页的总额块同源 —— 都是"浮在内容之上"的层，
   * 扁平语言里靠这一层阴影把层级讲清楚。
   */
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
  @include reduce-motion;
}

@keyframes dropdown-in {
  from {
    transform: scaleY(0.4);
    opacity: 0;
  }
  to {
    transform: scaleY(1);
    opacity: 1;
  }
}

.dropdown-item {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 $space-5;
  border-bottom: 1px solid $v11-line;
}

.dropdown-item:last-child {
  border-bottom: none;
}

.dropdown-text {
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  color: $v11-text-primary;
}

.dropdown-text.active {
  color: $v11-gold;
  font-weight: $weight-medium;
}

.dropdown-check {
  color: $v11-gold;
}
</style>
