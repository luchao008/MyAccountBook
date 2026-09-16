<template>
  <view v-if="visible" class="mask" @click="close">
    <view class="sheet" @click.stop>
      <view class="header">
        <view class="header-btn" @click="close"><SvgIcon name="icon-close" :size="20" /></view>
        <text class="header-title">{{ title || '选择分类' }}</text>
        <view class="header-btn header-action" @click="toggleAll">
          <text class="header-action-text">{{ allSelected ? '取消全选' : '全选' }}</text>
        </view>
      </view>

      <!--
        高度**由 JS 算出**（见 bodyHeight），不依赖 flex 推导。
        ⚠️ uni-app 的 scroll-view 不吃 flex：`flex:1 + min-height:0` 会按内容撑开，
           溢出并**盖住底部「确定」按钮**（用户实测报过）；`flex:1 + height:0` 会把
           footer 挤出容器。项目里时间弹层踩过同样三轮，最终都是 JS 算高度。
      -->
      <scroll-view class="body" scroll-y :style="{ height: bodyHeight + 'px' }">
        <template v-for="root in roots" :key="root.id">
          <!-- 一级：点整行 = 勾选/取消（连带其下全部二级）；点箭头 = 折叠 -->
          <view class="row" @click="toggleRoot(root)">
            <SvgIcon
              class="row-caret"
              :name="isExpanded(root.id) ? 'icon-chevron-up' : 'icon-chevron-down'"
              :size="14"
              @click.stop="toggleExpand(root.id)"
            />
            <CategoryIcon class="row-icon" :name="root.icon" :size="28" />
            <text class="row-label">{{ root.name }}</text>
            <view
              class="checkbox"
              :class="{ checked: isRootChecked(root), indeterminate: isRootIndeterminate(root) }"
            >
              <SvgIcon v-if="isRootChecked(root)" name="icon-check" :size="14" />
              <view v-else-if="isRootIndeterminate(root)" class="checkbox-dash" />
            </view>
          </view>

          <!-- 二级（缩进） -->
          <view
            v-for="child in isExpanded(root.id) ? childrenOf(root.id) : []"
            :key="child.id"
            class="row row-child"
            @click="toggleChild(root, child.id)"
          >
            <CategoryIcon class="row-icon" :name="child.icon" :size="24" />
            <text class="row-label">{{ child.name }}</text>
            <view class="checkbox" :class="{ checked: draft.includes(child.id) }">
              <SvgIcon v-if="draft.includes(child.id)" name="icon-check" :size="14" />
            </view>
          </view>
        </template>
      </scroll-view>

      <view class="footer">
        <view class="btn btn-confirm" @click="confirm"><text class="btn-text confirm-text">确定</text></view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 分类多选弹层（参考图形态：一级 + 缩进的二级，每行右侧橙色圆形勾选框）。
 *
 * ⚠️ **叠在筛选面板之上**（z-index 1100 > 1000），与 FlowTypePicker 同级。
 *
 * 语义（用户逐条确认）：
 *  · 一级在前、二级缩进；**收入一级在前、支出一级在后**，段内各按 sort
 *  · **勾一级 = 连带其下全部二级**；部分子被选中时一级显示**半选态**（横线）
 *  · 默认**全展开**；折叠状态记忆在组件内（`collapsed` 记"被折叠的"，
 *    这样新增分类会自动展开，不需要 watch 列表变化）
 *  · **空数组 = 全选 = 不过滤**；「全不选」也按不过滤处理（与类型筛选同口径，
 *    否则用户清空后会看到一片空白，误以为"账本没数据"）
 *  · 不加搜索框、不加「未分类」项（照参考图；未分类流水在全选时本来就在结果里）
 *  · 列表**不按其它筛选条件联动过滤**（恒显示全部 88 个分类）—— 简单、可预测
 *
 * **不变量**：`root.id ∈ draft` ⟺ 该一级的**全部二级**也都在 draft 里。
 * 之所以要这个不变量：后端「传一级会连带其下全部二级」，若 root.id 在 draft 里
 * 而某个二级被用户取消，那个取消动作会被后端的连带逻辑吃掉。
 */
import { ref, computed, watch } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';
import CategoryIcon from '@/components/CategoryIcon.vue';
import { useCategoryStore } from '@/store/category';
import type { CategoryItem } from '@/api/category';

const props = defineProps<{
  visible: boolean;
  /** 已选分类 id；**空数组 = 不过滤（全选）** */
  model: string[];
  /**
   * 只列某一收支类型的分类（可选）。
   *
   * 用于「数据导出」页 —— 那里把「支出分类」「收入分类」拆成两行分别选，
   * 点哪行就只列哪一类。不传时（流水页筛选面板）仍列全部。
   */
  type?: 'income' | 'expense';
  /** 弹层标题。不传时默认「选择分类」 */
  title?: string;
}>();

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  (e: 'apply', value: string[]): void;
}>();

const categoryStore = useCategoryStore();
const draft = ref<string[]>([]);

/** 弹层标题（不传时「选择分类」） */
const title = computed(() => props.title);

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
 *
 * ⚠️ **不要让 scroll-view 走 flex**（项目已踩三轮）：
 *    `flex: 1; min-height: 0` → 它按内容撑开，溢出并**盖住底部「确定」**（用户实测报过）；
 *    `flex: 1; height: 0` → footer 被挤出容器。
 *    取值 = 视口高 × 72%（与 .sheet 的 max-height 一致）− header − footer。
 *    header ≈ 44（按钮高）+ 16×2（padding）= 76；footer 同理 = 76，合计 152。
 *    下限 160 保证极端窄屏下仍能滚动。
 */
const bodyHeight = computed(() => {
  const vh = windowHeight.value || 812;
  return Math.max(160, Math.round(vh * 0.72) - 152);
});

/** 折叠状态：记"被折叠的"，未记录 = 展开（默认全展开，新分类也自动展开） */
const collapsed = ref<Set<string>>(new Set());

/**
 * 一级分类列表。
 *
 * · 不传 `type`（流水页筛选面板）→ **收入在前、支出在后**（用户确认的顺序）
 * · 传了 `type`（数据导出页）→ 只列该类型
 *
 * 段内各按 sort，store 的 getter 已排好。
 */
const roots = computed<CategoryItem[]>(() => {
  if (props.type === 'income') return categoryStore.incomeRoots;
  if (props.type === 'expense') return categoryStore.expenseRoots;
  return [...categoryStore.incomeRoots, ...categoryStore.expenseRoots];
});

function childrenOf(parentId: string): CategoryItem[] {
  return categoryStore.childrenOf(parentId);
}

function isExpanded(id: string): boolean {
  return !collapsed.value.has(id);
}
function toggleExpand(id: string) {
  const next = new Set(collapsed.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsed.value = next;
}

/** 全部 id（一级 + 其全部二级），用于"全选" */
function allIds(): string[] {
  const out: string[] = [];
  for (const r of roots.value) {
    out.push(r.id);
    childrenOf(r.id).forEach((c) => out.push(c.id));
  }
  return out;
}

/** 把"含一级 id"的模型展开成"一级 + 其全部二级"，让 UI 勾选态与语义一致 */
function expandModel(model: string[]): string[] {
  const set = new Set(model);
  for (const id of model) {
    childrenOf(id).forEach((c) => set.add(c.id));
  }
  return [...set];
}

watch(
  () => props.visible,
  (v) => {
    if (!v) return;
    // 空数组 = 不过滤 = 全选
    draft.value = props.model.length ? expandModel(props.model) : allIds();
  },
  { immediate: true }
);

/** 全选 = 所有一级都被选中（不变量保证其二级也都在） */
const allSelected = computed(
  () => roots.value.length > 0 && roots.value.every((r) => draft.value.includes(r.id))
);

function isRootChecked(root: CategoryItem): boolean {
  return draft.value.includes(root.id);
}
/** 半选：一级自身没勾，但其下有二级被勾 */
function isRootIndeterminate(root: CategoryItem): boolean {
  if (isRootChecked(root)) return false;
  return childrenOf(root.id).some((c) => draft.value.includes(c.id));
}

/** 勾/取消一级：连带其下全部二级 */
function toggleRoot(root: CategoryItem) {
  const ids = [root.id, ...childrenOf(root.id).map((c) => c.id)];
  if (isRootChecked(root)) {
    draft.value = draft.value.filter((id) => !ids.includes(id));
  } else {
    const set = new Set(draft.value);
    ids.forEach((id) => set.add(id));
    draft.value = [...set];
  }
}

/**
 * 勾/取消二级，随后**重算一级 id 是否该留在 draft 里**（维护不变量）。
 * 不做这一步的话：用户取消了一个二级，而 root.id 仍在 draft 里，
 * 后端「传一级连带二级」会把那个取消动作吃掉。
 */
function toggleChild(root: CategoryItem, childId: string) {
  const next = new Set(draft.value);
  if (next.has(childId)) next.delete(childId);
  else next.add(childId);

  const kids = childrenOf(root.id);
  const allKids = kids.length > 0 && kids.every((k) => next.has(k.id));
  if (allKids) next.add(root.id);
  else next.delete(root.id);

  draft.value = [...next];
}

function toggleAll() {
  draft.value = allSelected.value ? [] : allIds();
}

/** 提交时压缩：一级已勾 → 只发一级（后端会连带其二级）；否则逐个发二级 */
function compress(ids: string[]): string[] {
  const set = new Set(ids);
  const out: string[] = [];
  for (const r of roots.value) {
    if (set.has(r.id)) {
      out.push(r.id);
    } else {
      childrenOf(r.id).forEach((c) => {
        if (set.has(c.id)) out.push(c.id);
      });
    }
  }
  return out;
}

function confirm() {
  // 全选 → 空数组（不过滤）；全不选同理（防止用户清空后看到一片空白）
  const none = draft.value.length === 0;
  emit('apply', allSelected.value || none ? [] : compress(draft.value));
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
  background: $bg-card;
  border-radius: $radius-lg $radius-lg 0 0;
  display: flex;
  flex-direction: column;
  /* ⚠️ 不能省：只写 max-height 时它**约束不住 flex 子项**，
     内容超长会直接溢出（footer 落到屏幕外 / 内容盖住按钮并拦截点击）。
     加上它 max-height 才真正生效，配合 JS 算出的 body 高度让中间区滚动。 */
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
  color: $text-primary;
}

.header-btn {
  position: absolute;
  left: $space-2;
  width: $touch-target-min;
  height: $touch-target-min;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $text-secondary;
}

.header-action {
  left: auto;
  right: $space-2;
  width: auto;
  padding: 0 $space-2;
}

.header-action-text {
  font-size: $font-body;
  line-height: $lh-body;
  color: $brand-700;
}

/* 高度由 JS 算出（模板上的 :style），这里只负责不参与 flex 拉伸 */
.body {
  flex: none;
}

.row {
  display: flex;
  align-items: center;
  min-height: $touch-target-min;
  padding: $space-2 $space-4;
  border-bottom: 1px solid $line;
}

/* 二级缩进：与一级的文字左边缘对齐（折叠箭头 14 + 间距 6 = 20） */
.row-child {
  padding-left: 48px;
}

.row-caret {
  flex-shrink: 0;
  margin-right: $space-1;
  color: $text-tertiary;
}

.row-icon {
  flex-shrink: 0;
  margin-right: $space-2;
}

.row-label {
  flex: 1;
  min-width: 0;
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-primary;
  @include text-safe;
}

/* 勾选框：未选 = 描边空框；选中 = brand-600 实心 + 白勾；半选 = 描边 + 横线 */
.checkbox {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1.5px solid $line-strong;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $text-inverse;
}

.checkbox.checked {
  background: $brand-600;
  border-color: $brand-600;
}

/* 半选态：形状（横线）与底色同时区别于"已选"和"未选" */
.checkbox.indeterminate {
  background: $brand-50;
  border-color: $brand-600;
}

.checkbox-dash {
  width: 10px;
  height: 2px;
  border-radius: 1px;
  background: $brand-600;
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
  background: $brand-600;
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
