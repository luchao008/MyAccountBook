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
      tooltipFormat="trendTooltip"
    />
    <!--
      选中月份的「高亮 chip」（2026-09-19 按参考图加）。
      ⚠️ 为什么用 DOM 叠一层、而不是让 uCharts 自己画：
         uCharts 的 X 轴标签只有**一个全局 fontColor**，没有"单个标签变色"的能力；
         命名 formatter 只能改文字内容、改不了样式（见 config-ucharts.js 的 oddMonth）。
         位置由 uCharts 回传的几何算出来（见 onGetIndex），并已用 fillText 实测校验对齐。
    -->
    <view v-if="chipLabel" class="x-chip" :style="chipStyle">{{ chipLabel }}</view>
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
import { computed, ref, watch } from 'vue';
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

/**
 * 金额统一保留 2 位小数。
 *
 * ⚠️ 必须过这一道：结余是**浮点减法**算出来的，`19486.3 - 6599.4` 这类
 *    会产生 `12886.999999999991` 的尾数噪声 —— canvas 上直接显示这串数字
 *    （2026-09-19 用户报告"趋势图混乱"里的一半就是它们）。金额本来就只到分。
 */
const money = (n: number) => Math.round(n * 100) / 100;

/** 结余 = 收入 − 支出（可为负；必须过 money()，见其注释） */
const balances = computed(() =>
  props.trend.map((t) => money(Number(t.income) - Number(t.expense)))
);

/** qiun-data-charts 的 chartData 格式：categories + series（每项可指定 type） */
const chartData = computed(() => ({
  categories: props.trend.map((t) => t.label),
  series: [
    {
      name: '收入',
      type: 'line',
      data: props.trend.map((t) => money(Number(t.income))),
      color: INCOME_COLOR,
    },
    {
      name: '支出',
      type: 'line',
      data: props.trend.map((t) => money(Number(t.expense))),
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
 *    每个元素是一个轴分组。照抄 ECharts 的写法不会生效。
 * ⚠️ 而且**formatter 函数在这套封装里根本不生效**：qiun-data-charts 会把 opts
 *    `JSON.parse(JSON.stringify())` 两次（optsProps / cfu.option[cid]），函数被丢掉。
 *    自定义格式只能走 vendor 的命名 formatter 表（详见下面 yAxis.data[0] 的注释）。
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
  /*
   * ⚠️ `dataLabel: false` **必须显式写**：uCharts 的判据是
   *    `opts.dataLabel !== false`（见 u-charts.js 的 drawMixDataPoints）——
   *    **不写就等于开**。12 个月 × 3 条序列 = 36 个数字标签糊在图上，
   *    还会把未取整的浮点数一起画出来（2026-09-19 用户截图报告的问题）。
   */
  dataLabel: false,
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
    /*
     * X 轴：默认只显示**单数月**（01/03/05/07/09/11），被点中的那个月一律显示。
     * ⚠️ 这里只能写**命名 formatter 的名字**（函数会被 JSON 序列化丢掉），
     *    实现见 `config-ucharts.js` 的 `oddMonth`（它通过 opts.tooltip.index 识别选中月）。
     */
    format: 'oddMonth',
  },
  yAxis: {
    gridType: 'dash',
    gridColor: '#f1f1f1',
    dashLength: 4,
    /* 只要 3 条横向网格线（参考图：3万 / 1.5万 / 0）——splitNumber = 刻度段数 = 线数-1 */
    splitNumber: 2,
    /*
     * ⚠️ `showTitle` 是**轴级总开关**（u-charts.js 读的是 `opts.yAxis.showTitle`，
     *    不是 `yAxis.data[i].showTitle`）——放错层级会被 vendor 的 mix 默认值
     *    `yAxis.showTitle: true`（config-ucharts.js）盖住：
     *    我们从没给过 title → 轴顶画出字面量 **"undefined"**（2026-09-19 用户报告）。
     *    实测确认：改这里之前那行 undefined 一直在（fillText 注入抓到的坐标是轴顶左侧）。
     */
    showTitle: false,
    data: [
      {
        position: 'left',
        fontColor: '#6b6b72',
        fontSize: 10,
        axisLine: false,
        /*
         * ⚠️ **不要在这里写 formatter 函数**：qiun-data-charts 会把 opts 做一次
         *    `JSON.parse(JSON.stringify(...))`（optsProps 与 cfu.option[cid] 两处），
         *    **函数被静默丢掉** → uCharts 回落到默认格式（`tofix` 位小数）。
         *    本文件曾有一版「≥1 万显示 x.x万」的 formatter —— 从来没生效过。
         *    自定义格式只能走 vendor 的命名 formatter：`format: '<名字>'`，
         *    实现写在 `config-ucharts.js` 的 formatter 表里（本项目已加 amountWan / oddMonth）。
         */
        format: 'amountWan',
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
      /*
       * ⚠️ 背景色必须写 **hex**，透明度走 bgOpacity —— 不能写 `rgba(...)`：
       *    uCharts 用 hexToRgb(bgColor, bgOpacity) 解析（u-charts.js:2847），
       *    正则只认 hex，传 rgba 会返回 null 并抛 "Cannot read properties of null"，
       *    **整个 tooltip 都画不出来**（2026-09-19 点图时才发现，属存量问题）。
       *    这里写的 #222226 + 0.9 = 原 rgba(34,34,38,.9) 的等价写法。
       */
      bgColor: '#222226',
      bgOpacity: 0.9,
      fontColor: '#ffffff',
      borderRadius: 6,
    },
  },
}));

/** 被点选的月份下标（-1 = 未选中）。X 轴高亮 chip 与 uCharts 自身的竖线/tooltip 共用它 */
const selectedIndex = ref(-1);
/** 选中月份标签中心的横坐标（CSS px，相对图表容器左边缘） */
const chipCenter = ref(0);
/** 选中月份标签行的上沿纵坐标（CSS px） */
const chipTop = ref(0);

/** 选中月份的文字；无选中、或换时段后下标越界 → 空串，chip 自动隐藏 */
const chipLabel = computed(() => {
  const item = props.trend[selectedIndex.value];
  return selectedIndex.value >= 0 && item ? item.label : '';
});

const chipStyle = computed(() => ({
  left: `${chipCenter.value}px`,
  top: `${chipTop.value}px`,
}));

/**
 * 选中的下标 + 几何 → 落成 chip 的位置。
 *
 * 几何来自 uCharts 回传的 **当时的 opts**：`area = [上, 右, 下, 左]`、`width` / `height`。
 * X 轴 boundaryGap 默认 `'center'`（见 u-charts.js 构造器），第 i 个分类的 band 中心：
 *   `area[3] + eachSpacing * (i + 0.5)`，其中 `eachSpacing = (width - area[1] - area[3]) / 分类数`。
 * ⚠️ 这套公式已用「注入 fillText 抓真实文字坐标」实测校验（见 scripts/verify-report.mjs 的对齐断言）。
 */
function applyPicked(idx: number, o: any) {
  if (typeof idx !== 'number' || idx < 0) return;
  const n = (o?.categories || []).length;
  if (!n) return;
  selectedIndex.value = Math.min(n - 1, idx);
  if (!Array.isArray(o.area) || !o.width) return;
  const plotLeft = o.area[3];
  const each = (o.width - o.area[1] - plotLeft) / n;
  /*
   * ⚠️ 横向用 `area[3] + eachSpacing * i`（**不是** band 中心 +0.5）：
   *    uCharts 画 X 轴文字用的是 `xAxisPoints[index]`（u-charts.js:4571），
   *    而 `xAxisPoints[i] = area[3] + eachSpacing * i` —— 与"点"的位置（band 中心）
   *    差半格。chip 要盖住那行文字，就必须跟文字对齐而不是跟点对齐。
   *    实测核对：area=[15,15,62,42]、width=311、12 个月 → each≈21.25，
   *    算得 11月(下标10)=254.5，实绘 11月@255 ✅。
   */
  chipCenter.value = plotLeft + each * selectedIndex.value;
  // X 轴文字行的上沿（area[2] = 图表底部预留区：X 轴文字 + 图例）
  chipTop.value = (o.height || 0) - (o.area[2] || 0);
}

/**
 * 点选某个月份（uCharts 的 tap 事件）。
 *
 * ⚠️ **索引一律用 uCharts 回传的**，不要自己按坐标反算：
 *    uCharts 的 `findCurrentIndex` 用"与哪个分类点最近"判界（u-charts.js:7352），
 *    与"落在哪个 band 就算哪个"差半格 —— 实测点 05月 标签位置时它给的是 04月。
 *    自算会让 chip 高亮的月份和 tooltip 显示的数值**差一个月**。
 *    这里直接把它的 `currentIndex` 拿来用，两者永远同源。（代价：拖拽不联动，
 *    与本图 tooltip 的行为一致——它也只在点击时弹。）
 *
 * ⚠️ 回传的 `currentIndex` 是 `{ index, group }` 对象（不是数字），数字形态也兼容。
 */
function onGetIndex(e: any) {
  const ci = e?.currentIndex;
  applyPicked(typeof ci === 'number' ? ci : ci?.index, e?.opts);
}

/*
 * 换时段 / 换账本 → 整批数据被替换，旧的选中下标不再指向原来那个月
 * （不重置的话 chip 会贴到新数据的同一下标上，属于"张冠李戴"）。
 */
watch(
  () => props.trend,
  () => {
    selectedIndex.value = -1;
  }
);
</script>

<style scoped lang="scss">
.trend-chart {
  width: 100%;
  height: 240px;
  /* chip 的定位基准（绝对定位） */
  position: relative;
}

/*
 * 选中月份的高亮标签（覆盖在 canvas 的 X 轴文字行上）。
 * 规格取自参考图：白底圆角小块 + 深色加粗文字，与其余灰色的月份标签形成对比。
 */
.x-chip {
  position: absolute;
  /* left 由 JS 按 uCharts 几何算出（分类 band 中心），这里只负责把自身居中 */
  transform: translateX(-50%);
  padding: 2px 6px;
  border-radius: 6px;
  background: $v11-bg-card;
  color: $v11-text-primary;
  font-size: $font-caption;
  line-height: $lh-caption;
  font-weight: $weight-medium;
  /* 纯展示，不能吃掉 canvas 的点击/滑动 */
  pointer-events: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  white-space: nowrap;
}
</style>
