<template>
  <!--
    「报表」独立页 —— 底栏那一格「报表」带 url，跳转到这里（见 components/TabBar.vue）。

    为什么它不再是 `pages/main` 里的一个视图：报表需要**自己的页面栈与返回按钮**
    （从记账页过来、看完原路返回，且返回后原视图与滚动位置都还在），
    而单页容器里的视图切换是"就地换内容"，没有返回路径。

    内容复用 `StatisticsView`（与容器内曾是同一份实现，不是复制一份页面）：
    该组件在 `onMounted` 调 `activate()` 拉数据，所以每次进入本页都是新实例、
    数据天然是最新的，不需要额外接容器那套 `activate / onShow` 转发。

    页面根节点直接用组件本身（它的根 `.page` 已经带了 `min-height: $page-min-height`
    与白底），不再套一层无内容的 `<view>` —— 包裹层除了多一个类名什么也没做。
  -->
  <StatisticsView />
</template>

<script setup lang="ts">
import StatisticsView from '@/components/views/StatisticsView.vue';
</script>
