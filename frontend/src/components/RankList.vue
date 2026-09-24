<template>
  <view class="rank">
    <view
      v-for="(row, index) in visibleRows"
      :key="row.categoryId || index"
      class="rank-item"
      :class="{ 'rank-item-link': !!row.categoryId }"
      @click="onRowClick(row)"
    >
      <view class="rank-line">
        <text class="rank-no">{{ index + 1 }}</text>
        <CategoryIcon class="rank-icon" :name="row.icon" :size="28" />
        <text class="rank-name">{{ row.name }}</text>
        <text class="rank-ratio">{{ formatRatio(row.ratio) }}%</text>
        <text class="rank-dot">·</text>
        <text class="rank-sum">{{ formatMoney(row.sum) }}</text>
      </view>
      <!-- 进度条：颜色随图表序列，宽度为占比 -->
      <view class="bar-track">
        <view
          class="bar-fill"
          :style="{ width: barWidth(row.ratio), background: colorAt(index) }"
        />
      </view>
    </view>

    <view v-if="rows.length > maxVisible" class="toggle" @click="expanded = !expanded">
      <text class="toggle-text">{{ expanded ? '收起' : '点击展开' }}</text>
      <SvgIcon :name="expanded ? 'icon-chevron-up' : 'icon-chevron-down'" :size="12" />
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 分类排行列表（参考图里「收入来源 / 支出分布 / 分类统计」共用）。
 *
 * 每行两段：上行是「名次 + 图标 + 名称 + 占比 + 金额」，下行是占比进度条。
 * 进度条颜色取自图表序列，与环形图扇区同源 —— 两处看同一个分类应该是同一个颜色。
 *
 * 默认只列前 5 项，超出时给「点击展开」（参考图的交互），避免分类多时页面过长。
 */
import { ref, computed } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';
import CategoryIcon from '@/components/CategoryIcon.vue';
import { formatMoney } from '@/utils/format';
import { CHART_SERIES } from '@/constants/chart';

export interface RankRow {
  categoryId: string | null;
  name: string;
  icon: string;
  sum: string;
  ratio: number;
  count?: number;
}

const props = withDefaults(
  defineProps<{
    rows: RankRow[];
    /** 折叠时显示条数 */
    maxVisible?: number;
  }>(),
  { maxVisible: 5 }
);

/**
 * 点击某一行 → 抛给父级（父级决定跳到哪、带什么筛选参数）。
 * ⚠️ 只有 categoryId 非空才抛 ——「未分类」不可点，理由见 HomeView 的 isClickable：
 *    分类筛选能力不含未分类，硬跳过去看到的是"没带筛选的全部流水"，名不副实。
 */
const emit = defineEmits<{ (e: 'select', row: RankRow): void }>();

function onRowClick(row: RankRow) {
  if (!row.categoryId) return;
  emit('select', row);
}

const expanded = ref(false);

const visibleRows = computed(() =>
  expanded.value ? props.rows : props.rows.slice(0, props.maxVisible)
);

/**
 * 进度条颜色：与环形图**同一套序列**，按**行序（名次）**取色。
 *
 * ⚠️ 这里的「按下标取色」是**有意的**，不要照 TrendChart 的教训把它改掉：
 *    排名条的语义就是「第 n 名 = 序列第 n 色」，序列重排后第 1 名换色是**预期行为**。
 *    而 TrendChart 的坑在于「收入」是语义角色（必须永远是橙红），与下标无关 ——
 *    判断标准是：**这个颜色的含义会随顺序变吗？** 会 → 可以按下标；不会 → 必须命名常量。
 */
function colorAt(index: number): string {
  return CHART_SERIES[index % CHART_SERIES.length];
}

/** 占比保留 2 位小数展示（后端已是数字） */
function formatRatio(ratio: number): string {
  return ratio.toFixed(2);
}

/** 进度条按占比铺开；占比极小也留 2% 宽度，否则看不见这条记录存在 */
function barWidth(ratio: number): string {
  return `${Math.max(ratio, 2)}%`;
}
</script>

<style scoped lang="scss">
.rank-item {
  padding: $space-2 0;
}

/*
 * 可点行（有 categoryId）的按下态。
 * 水平方向用「补内边距 + 负外边距」把色块撑出文字两侧 8px —— 直接加 padding 会把
 * 行内容挤窄、与不可点行的文字左边界对不齐。
 */
.rank-item-link {
  cursor: pointer;
  border-radius: $radius-sm;
  padding-left: $space-2;
  padding-right: $space-2;
  margin-left: -$space-2;
  margin-right: -$space-2;
  transition: background 0.15s ease;
}

.rank-item-link:active {
  background: $v11-bg-inset;
}

/*
 * ×2 字号下「名次 + 图标 + 名称 + 占比 + 金额」一行放不下（实测 R=351 > 视口 320），
 * 用 flex-wrap 让「占比 · 金额」整体掉到第二行，margin-left:auto 负责贴右。
 * 这与旧图例（原 StatisticsView 的 .legend-item）是同一套做法 —— 正常字号下
 * wrap 是 no-op，只有真放不下时才生效，所以给正常布局加它是安全的兜底。
 */
.rank-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.rank-no {
  /* 固定宽度会让「10」在大字号下被卡住，按方案用 min-width */
  min-width: 16px;
  flex-shrink: 0;
  text-align: left;
  @include tabular-nums;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $v11-text-secondary;
}

.rank-icon {
  margin: 0 $space-2;
  flex-shrink: 0;
}

.rank-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-primary;
  @include text-safe;
}

.rank-ratio {
  flex-shrink: 0;
  /* 与名称同行时把「占比 · 金额」推到右侧；换行时它成为新行的行首 */
  margin-left: auto;
  @include tabular-nums;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  /* 占比是这一屏的核心信息之一，用 secondary —— tertiary 只有 2.80:1，读不了 */
  color: $v11-text-secondary;
}

.rank-dot {
  flex-shrink: 0;
  margin: 0 $space-1;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $v11-text-disabled;
}

.rank-sum {
  flex-shrink: 0;
  @include tabular-nums;
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-primary;
}

.bar-track {
  height: 4px;
  margin-top: $space-2;
  background: $v11-bg-inset;
  border-radius: $radius-pill;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: $radius-pill;
}

.toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $space-1;
  padding: $space-3 0 0;
  color: $v11-text-secondary;
}

.toggle-text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
}
</style>
