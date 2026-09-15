<template>
  <view v-if="visible" class="mask" @click="close">
    <view class="sheet" @click.stop>
      <view class="header">
        <text class="header-title">筛选</text>
        <view class="header-close" @click="close"><SvgIcon name="icon-close" :size="20" /></view>
      </view>

      <scroll-view class="body" scroll-y>
        <!--
          时间：**两行**（参考图形态）——
          第一行是预设名（本月 / 上月 / 自定义…），第二行是具体日期区间。
          一行放不下"2026年09月01日 - 2026年09月30日"，硬塞会把预设名挤掉。
        -->
        <view class="row" @click="openTimePicker">
          <SvgIcon class="row-icon" name="icon-clock" :size="18" />
          <text class="row-label">时间</text>
          <view class="row-main">
            <text class="row-value">{{ timeLabel }}</text>
            <text v-if="rangeText" class="row-sub">{{ rangeText }}</text>
          </view>
          <SvgIcon class="row-arrow" name="icon-chevron-right" :size="16" />
        </view>

        <!--
          流水类型：**多选弹层**（参考图形态），点开 FlowTypePicker。
          ⚠️ 全选 / 全不选都视为「不过滤」，所以全选时右侧不显示具体类型名，
             而是回落到「全部」—— 如实反映"当前没有按类型过滤"。
        -->
        <view class="row" @click="emit('pick-type')">
          <SvgIcon class="row-icon" name="icon-filter" :size="18" />
          <text class="row-label">类型</text>
          <view class="row-main">
            <text class="row-value">{{ typeLabel }}</text>
          </view>
          <SvgIcon class="row-arrow" name="icon-chevron-right" :size="16" />
        </view>

        <!--
          分类**不在这里** —— 它已经是底部栏的「分组维度」（一级/二级），与「时间」平级。
          筛选面板里再放一个分类，两个入口的语义会打架（一个是"换个方式分组"、
          一个是"过滤掉一部分"），用户分不清当前到底在按什么看。
        -->

        <!-- 金额区间 -->
        <view class="row">
          <SvgIcon class="row-icon" name="icon-card" :size="18" />
          <text class="row-label">金额</text>
          <view class="amount-range">
            <input
              class="amount-input"
              type="digit"
              placeholder="最低"
              :value="draft.minAmount"
              @input="onAmountInput('minAmount', $event)"
            />
            <text class="amount-sep">-</text>
            <input
              class="amount-input"
              type="digit"
              placeholder="最高"
              :value="draft.maxAmount"
              @input="onAmountInput('maxAmount', $event)"
            />
          </view>
        </view>

        <!-- 备注关键词 -->
        <view class="row">
          <SvgIcon class="row-icon" name="icon-tag" :size="18" />
          <text class="row-label">备注</text>
          <input
            class="note-input"
            placeholder="填写备注关键词"
            :value="draft.keyword"
            @input="onKeywordInput"
          />
        </view>
      </scroll-view>

      <view class="footer">
        <view class="btn btn-reset" @click="reset"><text class="btn-text reset-text">重置</text></view>
        <view class="btn btn-confirm" @click="confirm"><text class="btn-text confirm-text">确定</text></view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 流水筛选面板（时间 / 金额 / 备注）。
 *
 * ⚠️ **分类不在这里**：它已改为底部栏的「分组维度」（一级 / 二级），与「时间」平级。
 *    筛选是"过滤掉一部分"，分组是"换个方式组织"，两个入口放一起会让人分不清当前在按什么看。
 * ⚠️ 参考图里的「账户 / 成员 / 商家 / 项目」在本项目数据模型里没有对应概念，
 *    照搬就是假控件（项目一贯反对）。
 */
import { reactive, computed, watch } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';

export interface FlowFilter {
  /** YYYY-MM-DD，空串表示不限 */
  start: string;
  end: string;
  /** 时间预设的展示文案（'全部时间' / '本月' / '自定义' 等） */
  timeLabel: string;
  /**
   * 流水类型多选。**全选与全不选都视为「不过滤」**（用户确认）——
   * 全不选若真返回空集，用户会以为"账本没数据"，而实际是筛掉了自己。
   */
  types: string[];
  minAmount: string;
  maxAmount: string;
  keyword: string;
}

const props = defineProps<{
  visible: boolean;
  model: FlowFilter;
}>();

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  (e: 'apply', value: FlowFilter): void;
  (e: 'pick-time'): void;
  (e: 'pick-type'): void;
}>();

/** 草稿：改完点「确定」才生效，中途关闭不污染已应用的筛选 */
const draft = reactive<FlowFilter>({ ...props.model });

watch(
  () => props.visible,
  (v) => {
    if (v) Object.assign(draft, props.model);
  }
);

/*
 * ⚠️ 由父级承载的子弹层（时间 / 类型）改的是 `props.model`，而不是本组件的 draft ——
 *    只监听 `visible` 的话，用户在这些子弹层里选完、回到筛选面板，
 *    draft 里还是旧值，点「确定」会把改动**丢掉**（实测过两次）。
 *
 *    **尤其注意类型弹层**：它是**叠在本面板之上**的（z-index 1100 > 1000），
 *    本面板的 `visible` 全程为 true，`watch(visible)` 根本不会触发 ——
 *    必须像这里一样按字段受控同步，否则「选完类型 → 回面板 → 点确定」会被旧值覆盖
 *    （这正是用户报的 bug：选了"支出"，确定后又变回全选）。
 *
 *    做法：把「时间三件套」与「类型」都做成受控同步。
 *    将来再加叠层子弹层时，**把它的字段也加到这里**，别指望 watch(visible)。
 */
watch(
  () => [props.model.timeLabel, props.model.start, props.model.end, props.model.types],
  () => {
    draft.timeLabel = props.model.timeLabel;
    draft.start = props.model.start;
    draft.end = props.model.end;
    // 数组要换新引用：直接赋同一个引用时，父级用 filterModel.types = [...] 换掉的
    // 是新数组，这里同步没问题；但若父级原地 push/splice，同一引用会导致 watch 判不出变化。
    draft.types = [...(props.model.types || [])];
  },
  { deep: true }
);

const timeLabel = computed(() => draft.timeLabel || '全部时间');

/**
 * 流水类型选项（与 FlowTypePicker 的 options 保持一致）。
 * 只有两项，不值得为它引一个组件常量文件；将来后端加类型时两处一起改。
 */
const TYPE_LABELS: Record<string, string> = { expense: '支出', income: '收入' };
const TYPE_VALUES = Object.keys(TYPE_LABELS);

/**
 * 类型行的展示文案。
 * ⚠️ **全选与全不选都显示「全部」** —— 二者语义上都是"没有按类型过滤"，
 *    显示"支出、收入"反而会让用户以为筛过了。
 */
const typeLabel = computed(() => {
  const sel = draft.types || [];
  if (!sel.length || sel.length >= TYPE_VALUES.length) return '全部';
  return sel.map((v) => TYPE_LABELS[v] || v).join('、');
});

/**
 * 日期区间的展示文案：`2026年09月01日 - 2026年09月30日`。
 * 未设范围（"全部时间"）时返回空串 —— 此时不该显示第二行。
 *
 * ⚠️ 用**本地时间**手工拼，不能用 `new Date(str).toLocaleDateString()`：
 *    后者在不同浏览器/时区下的格式与分隔符不一致（且 `2026-09-01` 会被按 UTC 解析，
 *    在东八区可能显示成 8 月 31 日）。
 */
const rangeText = computed(() => {
  if (!draft.start || !draft.end) return '';
  return `${formatCn(draft.start)} - ${formatCn(draft.end)}`;
});

function formatCn(d: string): string {
  const [y, m, day] = d.split('-');
  return `${y}年${m}月${day}日`;
}

function openTimePicker() {
  emit('pick-time');
}

function onAmountInput(field: 'minAmount' | 'maxAmount', e: any) {
  draft[field] = e.detail.value;
}
function onKeywordInput(e: any) {
  draft.keyword = e.detail.value;
}

function reset() {
  draft.start = '';
  draft.end = '';
  draft.timeLabel = '全部时间';
  draft.minAmount = '';
  draft.maxAmount = '';
  draft.keyword = '';
  // 「重置」= 回到什么都没筛，类型一并复位为全选（用户确认）
  draft.types = [...TYPE_VALUES];
}

function confirm() {
  emit('apply', { ...draft });
  close();
}

function close() {
  emit('update:visible', false);
}
</script>

<style scoped lang="scss">
/*
 * 弹层贴屏幕底边升起（**不留**底栏高度）——底栏被盖住是有意为之：
 * 弹层是模态的，此时底栏不可操作，留白反而在下方露出一条无意义的缝。
 * 只留安全区（刘海屏底部）。
 */
.mask {
  position: fixed;
  inset: 0;
  background: $bg-mask;
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  padding-bottom: env(safe-area-inset-bottom);
}

.sheet {
  width: 100%;
  max-height: 72vh;
  background: $bg-card;
  border-radius: $radius-lg $radius-lg 0 0;
  display: flex;
  flex-direction: column;
}

.header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: $space-4;
}

.header-title {
  font-size: $font-h2;
  line-height: $lh-h2;
  font-weight: $weight-semibold;
  color: $text-primary;
}

.header-close {
  position: absolute;
  right: $space-3;
  width: $touch-target-min;
  height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $text-secondary;
}

.body {
  flex: 1;
  min-height: 0;
}

.row {
  display: flex;
  align-items: center;
  min-height: $touch-target-min;
  padding: $space-3 $space-4;
  border-bottom: 1px solid $line;
}

.row-icon {
  color: $text-tertiary;
  margin-right: $space-2;
  flex-shrink: 0;
}

.row-label {
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-primary;
  flex-shrink: 0;
}

.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.row-value {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-secondary;
  @include text-safe;
}

/* 第二行：具体日期区间 */
.row-sub {
  margin-top: 2px;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-tertiary;
  @include text-safe;
}

.row-arrow {
  margin-left: $space-1;
  color: $text-disabled;
  flex-shrink: 0;
}

.amount-range {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: $space-2;
}

.amount-input {
  width: 84px;
  height: 32px;
  padding: 0 $space-2;
  background: $bg-sunken;
  border-radius: $radius-sm;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-primary;
  text-align: center;
  @include tabular-nums;
}

.amount-sep {
  color: $text-disabled;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
}

.note-input {
  flex: 1;
  text-align: right;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-primary;
}

.footer {
  display: flex;
  gap: $space-3;
  padding: $space-4;
}

.btn {
  min-height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-md;
}

.btn-reset {
  width: 96px;
  background: $brand-50;
}

.btn-confirm {
  flex: 1;
  background: $brand-600;
}

.btn-text {
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  font-weight: $weight-medium;
}

.reset-text {
  color: $brand-700;
}

.confirm-text {
  color: $text-inverse;
}
</style>
