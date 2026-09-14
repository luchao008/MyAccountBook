<template>
  <!--
    「报表」独立页 —— 底栏那一格「报表」带 url，跳转到这里（见 components/TabBar.vue）。

    为什么它是独立页而不是容器里的一个视图：报表需要自己的页面栈与返回按钮
    （从记账页过来、看完原路返回），而单页容器里的视图切换是"就地换内容"，没有返回路径。

    本页在 pages.json 里配置了 navigationStyle: custom —— 报表用自绘顶栏
    （参考图形态：返回 + 居中标题），与分类管理页同一套做法。

    内容全部由 ReportView 承载：它是新报表实现（双 Tab + 年/月粒度 + 聚合接口），
    旧的 StatisticsView 已被它取代并删除。
  -->
  <ReportView />
</template>

<script setup lang="ts">
import ReportView from '@/components/views/ReportView.vue';
</script>
