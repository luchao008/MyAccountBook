<template>
  <view class="trend-chart">
    <qiun-data-charts
      type="mix"
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
 * 月度收支趋势图（uCharts / qiun-data-charts 封装）。
 *
 * 形态（2026-09-16 加「结余」）：
 *   · 收入 / 支出 —— **折线**（原有）
 *   · 结余 = 收入 − 支出 —— **面积**（新增，可为负）
 *
 * 为什么引入 uCharts 而不是自绘：折线图需要坐标轴、触摸 tooltip、动画，
 * 自绘成本远高于环形图。uCharts 是 uni-app 生态的图表标准（Apache 2.0）。
 *
 * 配色：收入 = CHART_SERIES[0] 橙红、支出 = CHART_SERIES[3] 青、结余 = CHART_SERIES[1] 蓝。
 *
 * ⚠️ **颜色不作为唯一区分手段**（WCAG 1.4.1）：三条序列都有图例文字标签，
 *    且结余是**面积**（与两条折线形态不同）。之所以接受"结余蓝 vs 支出青在红绿色盲
 *    模拟下可区分度偏低（1.13）"：图例文字 + 形态差异已足够区分，
 *    这与项目「颜色非唯一手段」的既定原则一致（环形图标注也是靠文字而非纯色）。
 *
 * ⚠️ 结余可以为负（支出 > 收入），面积图对负值的渲染依赖 uCharts 的正负支持，
 *    已实测（见 verify-report 的断言）。
 */
import { computed } from 'vue';
import type { ReportTrendItem } from '@/api/statistics';
import { CHART_SERIES } from '@/constants/chart';

const props = defineProps<{
  trend: ReportTrendItem[];
}>();

const INCOME_COLOR = CHART_SERIES[0]; // #c2410c 橙红
const EXPENSE_COLOR = CHART_SERIES[3]; // #0e7490 青
const BALANCE_COLOR = CHART_SERIES[1]; // #1d63b8 蓝

/** 结余 = 收入 − 支出（可为负） */
const balances = computed(() =>
  props.trend.map((t) => Number(t.income) - Number(t.expense))
);

/** qiun-data-charts 的 chartData 格式：categories + series（每项可指定 type） */
const chartData = computed(() => ({
  categories: props.trend.map((t) => t.label),
  series: [
    {
      name: '收入',
      type: 'line',
      data: props.trend.map((t) => Number(t.income)),
      color: INCOME_COLOR,
    },
    {
      name: '支出',
      type: 'line',
      data: props.trend.map((t) => Number(t.expense)),
      color: EXPENSE_COLOR,
    },
    {
      name: '结余',
      type: 'area',
      data: balances.value,
      color: BALANCE_COLOR,
    },
  ],
}));

/**
 * 图表配置。
 *
 * ⚠️ uCharts 的 yAxis 配置与 ECharts 完全不同：它放在 opts.yAxis.data 数组里，
 *    每个元素是一个轴分组，formatter 也在轴对象上。照抄 ECharts 的写法不会生效。
 * ⚠️ 图例文字必须给 fontColor —— uCharts 默认用序列色，小字在浅底上对比度不足；
 *    统一换成 $text-secondary #5a6472（6.00:1 ✅）。
 * ⚠️ 结余可能为负 → y 轴要能显示负值，**不设 min 让它自适应**。
 */
const opts = computed(() => ({
  color: [INCOME_COLOR, EXPENSE_COLOR, BALANCE_COLOR],
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
    // 混合图里的面积配置（uCharts：opts.extra.mix.area）
    mix: {
      area: {
        gradient: true,
        opacity: 0.2,
      },
      line: {
        width: 2,
      },
    },
    tooltip: {
      showBox: true,
      bgColor: 'rgba(31, 35, 41, 0.9)',
      fontColor: '#ffffff',
      borderRadius: 6,
    },
  },
}));

/** 触摸索引（当前未使用，保留用于将来高亮联动） */
function onGetIndex(e: any) {
  return e;
}
</script>

<style scoped lang="scss">
.trend-chart {
  width: 100%;
  height: 240px;
}
</style>
