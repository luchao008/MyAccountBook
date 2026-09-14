<template>
  <view v-if="visible" class="mask" @click="close">
    <view class="sheet" @click.stop>
      <view class="header">
        <text class="header-title">筛选</text>
        <view class="header-close" @click="close"><SvgIcon name="icon-close" :size="20" /></view>
      </view>

      <scroll-view class="body" scroll-y>
        <!-- 时间 -->
        <view class="row" @click="openTimePicker">
          <SvgIcon class="row-icon" name="icon-clock" :size="18" />
          <text class="row-label">时间</text>
          <text class="row-value">{{ timeLabel }}</text>
          <SvgIcon class="row-arrow" name="icon-chevron-right" :size="16" />
        </view>

        <!-- 分类（多选） -->
        <view class="row" @click="openCategoryPicker">
          <SvgIcon class="row-icon" name="icon-filter" :size="18" />
          <text class="row-label">分类</text>
          <text class="row-value">{{ categoryLabel }}</text>
          <SvgIcon class="row-arrow" name="icon-chevron-right" :size="16" />
        </view>

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
 * 流水筛选面板（参考图 4：时间 / 分类 / 金额 / 备注）。
 *
 * ⚠️ 只做项目真实支持的项：参考图里的「账户 / 成员 / 商家 / 项目」在数据模型里
 *    没有对应概念，照搬就是假控件（项目一贯反对）。「账户」的语义更接近**账本**，
 *    但它已经在别处（账本切换）承担入口，这里不重复放。
 *
 * 「时间」「分类」点开后各自是一个独立弹层（由父级承载），
 * 本组件只负责展示当前值与编辑金额/备注。
 */
import { reactive, computed, watch } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';

export interface FlowFilter {
  /** YYYY-MM-DD，空串表示不限 */
  start: string;
  end: string;
  /** 时间预设的展示文案（'全部时间' / '本月' / '自定义' 等） */
  timeLabel: string;
  /** 已选分类 id（多选） */
  categoryIds: string[];
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
  (e: 'pick-category'): void;
}>();

/** 草稿：改完点「确定」才生效，中途关闭不污染已应用的筛选 */
const draft = reactive<FlowFilter>({ ...props.model });

watch(
  () => props.visible,
  (v) => {
    if (v) Object.assign(draft, props.model);
  }
);

const timeLabel = computed(() => draft.timeLabel || '全部时间');
const categoryLabel = computed(() =>
  draft.categoryIds.length ? `已选 ${draft.categoryIds.length} 个` : '全部'
);

function openTimePicker() {
  emit('pick-time');
}
function openCategoryPicker() {
  emit('pick-category');
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
  draft.categoryIds = [];
  draft.minAmount = '';
  draft.maxAmount = '';
  draft.keyword = '';
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
.mask {
  position: fixed;
  inset: 0;
  background: $bg-mask;
  z-index: 1000;
  display: flex;
  align-items: flex-end;
}

.sheet {
  width: 100%;
  max-height: 80vh;
  background: $bg-card;
  border-radius: $radius-lg $radius-lg 0 0;
  display: flex;
  flex-direction: column;
  padding-bottom: env(safe-area-inset-bottom);
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

.row-value {
  flex: 1;
  text-align: right;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
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
