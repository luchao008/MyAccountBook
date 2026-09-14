<template>
  <view class="trend-chart">
    <qiun-data-charts
      type="line"
      :chartData="chartData"
      :opts="opts"
      :ontouch="true"
      :canvas2d="true"
      canvasId="trendChart"
      @getIndex="onGetIndex"
    />
  </view>
</template>

<script setup lang="ts">
/**
 * 月度收支趋势折线图（uCharts / qiun-data-charts 封装）。
 *
 * 为什么引入 uCharts 而不是继续自绘：折线图需要坐标轴、触摸 tooltip、动画，
 * 自绘成本远高于环形图（环形图只有扇区计算，折线图有轴刻度 + 手势交互）。
 * uCharts 是 uni-app 生态的图表标准（Apache 2.0），组件已在 uni_modules 中，
 * easycom 自动扫描，无需手动 import。
 *
 * 配色沿用项目的图表序列：收入 = CHART_SERIES[0] 橙红、支出 = CHART_SERIES[3] 青，
 * 与参考图一致；两条线都带图例文字标签，颜色不作为唯一区分手段（WCAG 1.4.1）。
 */
import { computed } from 'vue';
import type { ReportTrendItem } from '@/api/statistics';
import { CHART_SERIES } from '@/constants/chart';
import { formatMoney } from '@/utils/format';

const props = defineProps<{
  trend: ReportTrendItem[];
}>();

const INCOME_COLOR = CHART_SERIES[0]; // #c2410c 橙红
const EXPENSE_COLOR = CHART_SERIES[3]; // #0e7490 青

/** qiun-data-charts 的 chartData 格式：categories + series */
const chartData = computed(() => ({
  categories: props.trend.map((t) => t.label),
  series: [
    {
      name: '收入',
      data: props.trend.map((t) => Number(t.income)),
      color: INCOME_COLOR,
    },
    {
      name: '支出',
      data: props.trend.map((t) => Number(t.expense)),
      color: EXPENSE_COLOR,
    },
  ],
}));

/**
 * 图表配置。
 *
 * ⚠️ uCharts 的 yAxis 配置与 ECharts 完全不同：它放在 opts.yAxis.data 数组里，
 *    每个元素是一个轴分组，formatter 也在轴对象上。照抄 ECharts 的写法不会生效。
 * ⚠️ 图例文字必须给 fontColor —— uCharts 默认用序列色，橙红/青在浅底上做小字
 *    对比度不足；统一换成 $text-secondary #5a6472（6.00:1 ✅）。
 */
const opts = computed(() => ({
  color: [INCOME_COLOR, EXPENSE_COLOR],
  padding: [15, 15, 0, 10],
  legend: {
    show: true,
    position: 'bottom',
    fontColor: '#5a6472',
    fontSize: 12,
    lineHeight: 22,
  },
  xAxis: {
    disableGrid: true,
    fontColor: '#6e7787',
    fontSize: 10,
    axisLineColor: '#e6e9ef',
  },
  yAxis: {
    gridType: 'dash',
    gridColor: '#e6e9ef',
    dashLength: 4,
    data: [
      {
        position: 'left',
        fontColor: '#6e7787',
        fontSize: 10,
        axisLine: false,
        // 金额格式化：超过 1 万显示「x.x万」，否则原值
        formatter: (val: number) =>
          val >= 10000 ? `${(val / 10000).toFixed(1)}万` : String(val),
      },
    ],
  },
  extra: {
    line: {
      type: 'curve',
      width: 2,
    },
    tooltip: {
      showBox: true,
      bgColor: 'rgba(31, 35, 41, 0.9)',
      fontColor: '#ffffff',
      borderRadius: 6,
      // 自定义 tooltip 内容：显示「收入 x / 支出 y」两行
      // uCharts 的 tooltip 默认格式已够用，此处保留默认，靠图例区分
    },
  },
}));

/** 触摸索引（当前未使用，保留用于将来高亮联动） */
function onGetIndex(e: any) {
  // e.currentIndex 是当前触摸的月份下标
  return e;
}
</script>

<style scoped lang="scss">
.trend-chart {
  width: 100%;
  height: 240px;
}
</style>
