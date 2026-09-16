<template>
  <view class="month-grid">
    <view class="week-row">
      <text v-for="(w, i) in WEEK_LABELS" :key="i" class="week-label">{{ w }}</text>
    </view>

    <view class="day-grid">
      <view v-for="(cell, i) in cells" :key="i" class="day-cell">
        <view
          v-if="cell"
          class="day"
          :class="{
            today: cell.date === todayStr && cell.date !== selectedDate,
            selected: cell.date === selectedDate,
            empty: !cell.hasData,
          }"
          @click="emit('select', cell.date)"
        >
          <!-- 今天显示「今」而不是数字（与项目 DateTimePicker 一致） -->
          <text class="day-num">{{ cell.date === todayStr && cell.date !== selectedDate ? '今' : cell.day }}</text>
          <!-- 两行：上行支出、下行收入（只有支出时只显示一行） -->
          <text v-if="cell.expense" class="day-amount expense">{{ shortMoney(cell.expense) }}</text>
          <text v-if="cell.income" class="day-amount income">{{ shortMoney(cell.income) }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 单个日历月（收起态的 swiper 与展开态的虚拟列表共用）。
 *
 * 抽成组件的理由：两处渲染的是同一张网格，复制一份必然出现
 * "改了一处忘了另一处"（字号、间距、今天/选中态会慢慢分叉）。
 *
 * 数据由父级传入 **全量的「日期 → 收支」映射**，本组件只负责取用 ——
 * 这样滚动到哪个月都能立刻出数，不需要每个组件各持一份。
 */
import { computed } from 'vue';

const WEEK_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface DayAgg {
  income: number;
  expense: number;
}

const props = defineProps<{
  year: number;
  /** 0-based */
  month: number;
  /** 日期 → 收支聚合（全量映射，缺失表示当天无流水） */
  dayAgg: Record<string, DayAgg>;
  selectedDate: string;
  todayStr: string;
}>();

const emit = defineEmits<{ (e: 'select', date: string): void }>();

const pad = (n: number) => String(n).padStart(2, '0');

interface Cell {
  day: number;
  date: string;
  income: number;
  expense: number;
  hasData: boolean;
}

/** 网格（周日起始，与项目 DateTimePicker 一致）；前后补 null 对齐星期 */
const cells = computed<(Cell | null)[]>(() => {
  const y = props.year;
  const m0 = props.month;
  const firstDow = new Date(y, m0, 1).getDay();
  const daysInMonth = new Date(y, m0 + 1, 0).getDate();

  const out: (Cell | null)[] = [];
  for (let i = 0; i < firstDow; i++) out.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${y}-${pad(m0 + 1)}-${pad(d)}`;
    const agg = props.dayAgg[date];
    out.push({
      day: d,
      date,
      income: agg?.income || 0,
      expense: agg?.expense || 0,
      hasData: !!agg,
    });
  }
  return out;
});

/**
 * 格子金额的**紧凑写法**。
 *
 * ⚠️ 不是"好看"，是被实测逼的：320px 屏下每格内宽约 41px，
 *    12px 字号（项目硬下限）下 "119.40" 要约 42px —— 差一点就溢出。
 * 分档：≥1万→"1.17万"、≥1000→"3.3k"、≥100→取整、<100→1 位小数。
 */
function shortMoney(v: number): string {
  if (v >= 10000) return `${(v / 10000).toFixed(2)}万`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 100) return String(Math.round(v));
  return v.toFixed(1);
}
</script>

<style scoped lang="scss">
.week-row {
  display: flex;
}

.week-label {
  flex: 1;
  text-align: center;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
}

.day-grid {
  display: flex;
  flex-wrap: wrap;
}

.day-cell {
  width: calc(100% / 7);
  display: flex;
  justify-content: center;
  padding: 3px 1px;
}

/*
 * 宽度用**流式**而不是写死 44px。
 * 踩过：写死 44px 在 320px 屏上放不下 —— 容器宽 304px ÷ 7 = 43.4px/格，
 * 44px 的盒子直接压到邻居身上（reflow-audit 实测「压邻居 5 处」）。
 */
.day {
  width: 100%;
  max-width: 44px;
  min-height: 68px;
  border-radius: $radius-md;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 4px 1px;
  background: $v11-gold-soft;
}

/* 无数据的日子不铺底色，避免整屏都是色块 */
.day.empty {
  background: transparent;
}

.day.today {
  border: 1.5px solid $v11-gold;
  padding: 2.5px 0.5px;
}

.day.selected {
  background: $v11-gold;
}

.day-num {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $v11-text-primary;
  @include tabular-nums;
}

.day.selected .day-num {
  color: $text-inverse;
  font-weight: $weight-semibold;
}

/*
 * ⚠️ 这里刻意**不用** `overflow: hidden` + `text-overflow: ellipsis`：
 *    uni-app 把 `<text>` 渲染成 inline `<span>`，ellipsis 对它不生效 ——
 *    结果是"被祖先静默裁掉"，正是项目反复强调的那类看不见的内容丢失
 *    （reflow-audit 首跑就报「被裁 1 处」，三个视口全中）。
 *    改为让金额本身足够短（见 shortMoney），并允许换行兜底。
 */
.day-amount {
  font-size: $font-caption;
  line-height: $lh-caption;
  @include tabular-nums;
  max-width: 100%;
  @include text-safe;
}

/*
 * ⚠️ 2026-09-14 收支配色对调后，这条规则必须跟着换 ——
 *    它依赖的事实是"**哪个是红色**"（红压 brand-50 只有 4.47:1，小字号下不达标），
 *    而对调后红色从 expense 变成了 **income**。
 *    不改的话：日历格子里的**收入**金额会掉到 4.47:1（不达标），
 *    而支出反而"白得"了中性色。
 *
 *    这也说明：凡是**依赖具体色相**的规则，在色值对调时都要重新审视 ——
 *    纯 `color: $income` 这类会自动跟随，条件分支不会。
 */
.day.empty .day-amount,
.day .day-amount.income {
  color: $v11-text-secondary;
}

.day .day-amount.expense {
  color: $v11-teal-amount;
}

.day.selected .day-amount {
  color: $text-inverse;
}
</style>
