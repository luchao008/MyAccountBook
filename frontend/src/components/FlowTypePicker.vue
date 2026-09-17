<template>
  <view v-if="visible" class="mask" @click="close">
    <view class="sheet" @click.stop>
      <view class="header">
        <view class="header-btn" @click="close"><SvgIcon name="icon-close" :size="20" /></view>
        <text class="header-title">选择流水类型</text>
        <view class="header-btn header-action" @click="toggleAll">
          <text class="header-action-text">{{ allSelected ? '取消全选' : '全选' }}</text>
        </view>
      </view>

      <!--
        高度**由 JS 算出**（见 bodyHeight），不依赖 flex 推导。
        ⚠️ uni-app 的 scroll-view 不吃 flex：`flex:1 + min-height:0` 会按内容撑开，
           溢出并**盖住底部「确定」**；`flex:1 + height:0` 会把 footer 挤出容器。
           本项目时间弹层踩过同样三轮，最终都是 JS 算高度。
           本弹层目前只有 2 项、看起来正常，但选项一多就会复现，故一并修。
      -->
      <scroll-view class="body" scroll-y :style="{ height: bodyHeight + 'px' }">
        <view v-for="opt in options" :key="opt.value" class="row" @click="toggle(opt.value)">
          <text class="row-label">{{ opt.label }}</text>
          <view class="checkbox" :class="{ checked: draft.includes(opt.value) }">
            <SvgIcon v-if="draft.includes(opt.value)" name="icon-check" :size="14" />
          </view>
        </view>
      </scroll-view>

      <view class="footer">
        <view class="btn btn-confirm" @click="confirm"><text class="btn-text confirm-text">确定</text></view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 流水类型选择弹层（参考图形态：多选列表 + 每行右侧橙色圆形勾选框）。
 *
 * ⚠️ **弹层叠在筛选面板之上**（z-index 1100 > 筛选面板的 1000）：
 *    从筛选面板的「类型」行进入，关掉它直接回到筛选面板，视觉上无闪烁。
 *
 * ⚠️ **当前数据模型只支持 income / expense 两种**（`transactions.type` 是
 *    `ENUM('income','expense')`）。选项写成 `options` 数组是为了**将来扩展只改这一处**；
 *    参考图里的「转账 / 借入 / 借出 / 收债…」在本项目没有对应字段，**不放假选项**（项目一贯原则）。
 *
 * ⚠️ **全选与全不选都视为「不过滤」**（luchao 确认）：全不选若真的返回空集，
 *    用户会以为"账本没数据"，而实际是筛掉了自己 —— 与"取消筛选"的直觉不符。
 */
import { ref, reactive, computed, watch } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';

export interface FlowTypeOption {
  value: string;
  label: string;
}

/** 当前支持的流水类型（后端 ENUM('income','expense')）；将来扩展只改这一处 */
const options: FlowTypeOption[] = [
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
];

/** 视口高度（uni-app 下 scroll-view 需要确定高度，不能靠 flex 推导） */
const windowHeight = ref(812);
try {
  const info = uni.getSystemInfoSync();
  windowHeight.value = info.windowHeight || 812;
} catch {
  windowHeight.value = 812;
}

/**
 * 列表区高度**由 JS 算出**。
 * 取值 = 视口高 × 72%（与 .sheet 的 max-height 一致）− header − footer。
 * header / footer 各 = 44（按钮高）+ 16×2（padding）= 76，合计 152；下限 160。
 */
const bodyHeight = computed(() => {
  const vh = windowHeight.value || 812;
  return Math.max(160, Math.round(vh * 0.72) - 152);
});

const props = defineProps<{
  visible: boolean;
  model: string[];
}>();

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  (e: 'apply', value: string[]): void;
}>();

/** 草稿：改完点「确定」才生效，中途关闭不污染已应用的筛选 */
const draft = reactive<string[]>([...props.model]);

watch(
  () => props.visible,
  (v) => {
    if (v) draft.splice(0, draft.length, ...props.model);
  }
);

const allSelected = computed(
  () => draft.length === options.length
);

function toggle(value: string) {
  const i = draft.indexOf(value);
  if (i >= 0) draft.splice(i, 1);
  else draft.push(value);
}

function toggleAll() {
  if (allSelected.value) draft.splice(0, draft.length);
  else draft.splice(0, draft.length, ...options.map((o) => o.value));
}

function confirm() {
  emit('apply', [...draft]);
  close();
}

function close() {
  emit('update:visible', false);
}
</script>

<style scoped lang="scss">
/* 叠在筛选面板（z-index 1000）之上 */
.mask {
  position: fixed;
  inset: 0;
  background: $bg-mask;
  z-index: 1100;
  display: flex;
  align-items: flex-end;
  padding-bottom: env(safe-area-inset-bottom);
}

.sheet {
  width: 100%;
  max-height: 72vh;
  background: $v11-bg-card;
  border-radius: $v11-radius-sheet-top $v11-radius-sheet-top 0 0;
  display: flex;
  flex-direction: column;
  /* ⚠️ 不能省：只写 max-height 时它**约束不住 flex 子项**，内容超长会溢出
     （footer 落到屏幕外 / 内容盖住按钮并拦截点击）。 */
  overflow: hidden;
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
  color: $v11-text-primary;
}

.header-btn {
  position: absolute;
  left: $space-2;
  width: $touch-target-min;
  height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $v11-text-secondary;
}

/* 右侧「取消全选 / 全选」——用品牌橙文字色，白卡 4.95:1 ✅ */
.header-action {
  left: auto;
  right: $space-2;
  width: auto;
  padding: 0 $space-2;
}

.header-action-text {
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-gold;
}

/* 高度由 JS 算出（模板上的 :style），这里只负责不参与 flex 拉伸 */
.body {
  flex: none;
}

.row {
  display: flex;
  align-items: center;
  min-height: $touch-target-min;
  padding: $space-3 $space-4;
  border-bottom: 1px solid $v11-line;
}

.row-label {
  flex: 1;
  min-width: 0;
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-primary;
  @include text-safe;
}

/* 勾选框：未选 = 描边空框；选中 = brand-600 实心 + 白勾（形状与底色同时变，不只变颜色） */
.checkbox {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1.5px solid $v11-line-strong;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $text-inverse;
}

.checkbox.checked {
  background: $v11-gold;
  border-color: $v11-gold;
}

.footer {
  display: flex;
  padding: $space-4;
}

.btn {
  flex: 1;
  min-height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-md;
}

.btn-confirm {
  background: $v11-gold;
}

.btn-text {
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  font-weight: $weight-medium;
}

.confirm-text {
  color: $text-inverse;
}
</style>
