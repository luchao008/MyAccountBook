<template>
  <view class="check-tree">
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
  </view>
</template>

<script setup lang="ts">
/**
 * 分类勾选树（受控组件）。
 *
 * 用于「新建账本选分类」与「账本分类设置」两处（设计 D4/D13），
 * 交互与 FlowCategoryPicker 一致（D9）：
 *   · 一级在前、二级缩进；收入一级在前、支出一级在后，段内各按 sort
 *   · **勾一级 = 连带其下全部二级**；部分子被选中时一级显示半选态
 *   · 只勾二级会自动带上其父（由调用方保证 —— 本组件对外暴露的 draft
 *     已包含"二级 → 父"的补全，见 emit）
 *   · 默认全展开；折叠状态记忆在组件内
 *
 * **不变量**：`root.id ∈ draft` ⟺ 该一级的**全部二级**也都在 draft 里。
 */
import { ref, computed, watch } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';
import CategoryIcon from '@/components/CategoryIcon.vue';
import type { CategoryItem } from '@/api/category';

const props = defineProps<{
  /** 候选分类（母本的全量分类） */
  categories: CategoryItem[];
  /** 已选 id（受控） */
  modelValue: string[];
  /** body 高度（px），由调用方按视口算 —— uni scroll-view 不吃 flex 推导 */
  bodyHeight: number;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: string[]): void;
}>();

const draft = computed(() => props.modelValue);

/** 收入一级在前、支出在后；段内按 sort（与 FlowCategoryPicker 一致） */
const roots = computed(() => {
  const income = props.categories.filter((c) => c.type === 'income' && !c.parentId);
  const expense = props.categories.filter((c) => c.type === 'expense' && !c.parentId);
  return [...income, ...expense];
});

function childrenOf(parentId: string): CategoryItem[] {
  return props.categories.filter((c) => c.parentId === parentId);
}

// 折叠状态记「被折叠的」，新增分类自动展开
const collapsed = ref<Set<string>>(new Set());
function isExpanded(id: string): boolean {
  return !collapsed.value.has(id);
}
function toggleExpand(id: string) {
  const next = new Set(collapsed.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsed.value = next;
}

function isRootChecked(root: CategoryItem): boolean {
  const kids = childrenOf(root.id);
  if (!kids.length) return draft.value.includes(root.id);
  return kids.every((k) => draft.value.includes(k.id));
}
function isRootIndeterminate(root: CategoryItem): boolean {
  const kids = childrenOf(root.id);
  if (!kids.length) return false;
  const picked = kids.filter((k) => draft.value.includes(k.id)).length;
  return picked > 0 && picked < kids.length;
}

/** 提交：输出「含父级补全」的 id 列表 */
function emitDraft(ids: string[]) {
  emit('update:modelValue', ids);
}

function toggleRoot(root: CategoryItem) {
  const kids = childrenOf(root.id);
  const ids = kids.length ? kids.map((k) => k.id) : [root.id];
  const allIn = ids.every((id) => draft.value.includes(id));
  let next = new Set(draft.value);
  if (allIn) {
    ids.forEach((id) => next.delete(id));
    next.delete(root.id);
  } else {
    ids.forEach((id) => next.add(id));
    next.add(root.id);
  }
  emitDraft([...next]);
}

function toggleChild(root: CategoryItem, childId: string) {
  const next = new Set(draft.value);
  if (next.has(childId)) {
    next.delete(childId);
    next.delete(root.id); // 有子被取消 → 父不能保持全选
  } else {
    next.add(childId);
    // 全部子都被选中时，父也勾上
    const kids = childrenOf(root.id);
    if (kids.every((k) => next.has(k.id))) next.add(root.id);
  }
  emitDraft([...next]);
}

/** 外部重置：展开全部 */
watch(
  () => props.categories,
  () => {
    collapsed.value = new Set();
  }
);
</script>

<style scoped lang="scss">
.body {
  /* 高度由调用方通过 :style 传入 */
  background: $bg-card;
}

.row {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid $line;
}
.row-child {
  padding-left: 44px;
}

.row-caret {
  margin-right: 8px;
  flex: none;
}
.row-icon {
  margin-right: 10px;
  flex: none;
}
.row-label {
  flex: 1 1 auto;
  min-width: 0;
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-primary;
}

.checkbox {
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1.5px solid $border-input;
  display: flex;
  align-items: center;
  justify-content: center;
}
.checkbox.checked {
  background: $brand-600;
  border-color: $brand-600;
}
.checkbox.indeterminate {
  background: $brand-600;
  border-color: $brand-600;
}
.checkbox-dash {
  width: 10px;
  height: 2px;
  background: #fff;
}
</style>
