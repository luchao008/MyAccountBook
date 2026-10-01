<template>
  <!--
    趋势图（TrendChart）的**加载占位**。

    为什么单独做成一个组件、而不在调用点内联几行 `<Skeleton>`：
    `defineAsyncComponent` 的 `loadingComponent` 只能拿到一个组件引用、**不能传 props**，
    所以占位内容必须自带模板。而 uni-app 下不能用运行时的 render 函数 / 模板字符串
    （模板要编译到各端），因此只能落成一个 .vue 文件。

    ⚠️ 高度必须与 TrendChart 的根节点一致（`TrendChart.vue` 的 `.trend-chart` = 240px）：
       占位与真图不等高的话，图加载完成时会把下方的面板整体顶一下 —— 那比没有占位更难受。
       改 TrendChart 的高度时记得同步这里。
  -->
  <view class="trend-chart-skeleton">
    <Skeleton w="100%" h="240" r="12" />
  </view>
</template>

<script setup lang="ts">
import Skeleton from '@/components/Skeleton.vue';
</script>

<style scoped lang="scss">
.trend-chart-skeleton {
  width: 100%;
  /* 与 TrendChart 的 .trend-chart 对齐（见上方注释） */
  height: 240px;
}
</style>
