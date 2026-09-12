<template>
  <view class="fab-wrap" @click="go">
    <view class="fab">
      <text class="fab-plus">＋</text>
    </view>
    <text class="fab-label">记一笔</text>
  </view>
</template>

<script setup lang="ts">
/**
 * 底栏中间的「记一笔」凸起按钮。
 *
 * 实现说明：uni-app 的 tabBar 不支持凸起按钮（tabBar.list 必须是页面路径，
 * 而记一笔是普通页面，注册成 tab 会导致跳转时序问题）。
 * 所以这里用页面内的 fixed 元素模拟：4 个 Tab 页各引入一次，
 * 定位在屏幕水平中点 —— 4 项 tabBar 的 50% 处正好是第 2、3 项之间的空白，
 * 不会遮住任何 Tab 文字。
 */
function go() {
  uni.navigateTo({ url: '/pages/record/index' });
}
</script>

<style scoped lang="scss">
.fab-wrap {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: 0;
  /* 必须高于 tabBar（uni-app 的 tabBar z-index 为 998） */
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-bottom: calc(4px + env(safe-area-inset-bottom));
}

.fab {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: $brand-600;
  border: 3px solid $bg-card;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px $shadow-brand-glow;
}

.fab:active {
  background: $brand-800;
}

.fab-plus {
  color: $text-inverse;
  font-size: 28px;
  line-height: 1;
  margin-top: -2px;
}

.fab-label {
  font-size: 11px;
  color: $brand-700;
  margin-top: 1px;
}
</style>
