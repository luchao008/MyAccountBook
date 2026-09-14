<template>
  <view class="rank">
    <view v-for="(row, index) in visibleRows" :key="row.categoryId || index" class="rank-item">
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

const expanded = ref(false);

const visibleRows = computed(() =>
  expanded.value ? props.rows : props.rows.slice(0, props.maxVisible)
);

/** 进度条颜色：与环形图同一套序列，按行序取色 */
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
  color: $text-tertiary;
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
  color: $text-primary;
  @include text-safe;
}

.rank-ratio {
  flex-shrink: 0;
  /* 与名称同行时把「占比 · 金额」推到右侧；换行时它成为新行的行首 */
  margin-left: auto;
  @include tabular-nums;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-tertiary;
}

.rank-dot {
  flex-shrink: 0;
  margin: 0 $space-1;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-disabled;
}

.rank-sum {
  flex-shrink: 0;
  @include tabular-nums;
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-primary;
}

.bar-track {
  height: 4px;
  margin-top: $space-2;
  background: $bg-sunken;
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
  color: $text-secondary;
}

.toggle-text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
}
</style>
