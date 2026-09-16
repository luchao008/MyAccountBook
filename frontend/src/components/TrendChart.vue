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
 * 配色：三条序列走 `constants/chart.ts` 的**语义常量**（`TREND_*_COLOR`），**不按下标取色**：
 *   · 收入 = 橙红 `#c2410c`
 *   · 支出 = 青绿 `#0E7C86`（v1.1）
 *   · 结余 = 蓝   `#1d63b8`
 *
 * ⚠️ 2026-09-16 v1.1 **踩过的坑（值得单独记一笔）**：
 *    本文件原来写的是 `CHART_SERIES[0]` / `[3]` / `[1]` —— 按下标取色。
 *    而 v1.1 把 CHART_SERIES **整体重排**了（青绿提到首位），于是三条线的颜色被
 *    **静默换掉**：收入由橙红变青绿、支出由青变品红、结余由蓝变紫。
 *    没有报错、没有告警、**没有任何脚本能抓到**（下标永远合法，类型也对）。
 *    只有肉眼看图才会发现 —— 而这一步恰好没有任何自动化覆盖。
 *    → 修法不是把下标改成新位置（下次重排又会坏），而是把**语义固定成命名常量**。
 *    **通用教训：凡是"按位置"取的资源，一旦列表顺序会变，就必须改成按语义取。**
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
import {
  TREND_INCOME_COLOR,
  TREND_EXPENSE_COLOR,
  TREND_BALANCE_COLOR,
} from '@/constants/chart';

const props = defineProps<{
  trend: ReportTrendItem[];
}>();

const INCOME_COLOR = TREND_INCOME_COLOR; // #c2410c 橙红
const EXPENSE_COLOR = TREND_EXPENSE_COLOR; // #0E7C86 青绿（v1.1）
const BALANCE_COLOR = TREND_BALANCE_COLOR; // #1d63b8 蓝

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
 * ⚠️ 图例文字必须给 fontColor —— uCharts 默认用序列色，小字在浅底上对比度不足。
 *    统一用 v1.1 的 secondary `#6b6b72`（压白卡 5.29:1 ✅ / 压 #F8F8F8 4.98:1 ✅）。
 *
 * ⚠️ 下面几处色值**只能写字面量** —— uCharts 的 opts 是普通 JS 对象，
 *    SCSS 变量进不来（同 §9.17 的"双写"问题）。它们是 v1.1 token 的手工副本，
 *    改 tokens.scss 时要一起改。副本清单（共 4 处）：
 *      图例文字 `#6b6b72` / 轴文字 `#6b6b72` / 轴线与网格 `#f1f1f1` / tooltip 深底 `rgba(34,34,38,.9)`
 * ⚠️ 结余可能为负 → y 轴要能显示负值，**不设 min 让它自适应**。
 */
const opts = computed(() => ({
  color: [INCOME_COLOR, EXPENSE_COLOR, BALANCE_COLOR],
  padding: [15, 15, 0, 10],
  legend: {
    show: true,
    position: 'bottom',
    fontColor: '#6b6b72',
    fontSize: 12,
    lineHeight: 22,
  },
  xAxis: {
    disableGrid: true,
    fontColor: '#6b6b72',
    fontSize: 10,
    axisLineColor: '#f1f1f1',
  },
  yAxis: {
    gridType: 'dash',
    gridColor: '#f1f1f1',
    dashLength: 4,
    data: [
      {
        position: 'left',
        fontColor: '#6b6b72',
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
      bgColor: 'rgba(34, 34, 38, 0.9)',
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
