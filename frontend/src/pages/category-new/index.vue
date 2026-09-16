<template>
  <view class="page">
    <view class="form">
      <!-- 分类名称：标签独立一行，输入框下带字数计数 -->
      <view class="field">
        <text class="label">分类名称</text>
        <view class="input-row">
          <input
            v-model="name"
            class="input"
            placeholder="请输入分类名称"
            :maxlength="NAME_MAX"
            placeholder-class="ph"
          />
          <text class="counter">{{ name.length }}/{{ NAME_MAX }}</text>
        </view>
      </view>

      <!-- 分类图标：点整行进选择页 -->
      <view class="field field-row" @click="goPickIcon">
        <text class="label label-inline">分类图标</text>
        <view class="icon-slot">
          <CategoryIcon :name="icon" :size="24" />
        </view>
        <SvgIcon class="arrow" name="icon-chevron-right" :size="16" />
      </view>

      <!-- 层级说明：编辑态不显示（层级不可改，见下方注释） -->
      <view v-if="!isEdit" class="field">
        <text class="label">层级</text>
        <text class="level">{{ levelText }}</text>
      </view>
    </view>

    <view class="submit-box">
      <button class="submit" :loading="submitting" @click="save">保存</button>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 新建 / 编辑分类（独立页）。
 *
 * 一个页面承担三种用途，靠 query 区分：
 *   `?type=expense`                      → 新建一级分类
 *   `?type=expense&parentId=xxx`         → 新建二级分类
 *   `?id=xxx`                            → 编辑（名称 + 图标）
 *
 * 为什么合成一个页面而不是各写一个：三者的表单**完全一样**（名称 + 图标），
 * 差别只是标题、保存时调 create 还是 update、以及是否显示层级说明。
 * 拆成三个页面等于把同一份表单抄三遍，改一处漏两处是迟早的事。
 *
 * 图标由「图标选择页」通过全局事件回传 —— 两页之间不适合用 URL 回传
 * （用户可能反复改图标），事件更贴合"一次 UI 交互"的语义。
 * 一级与二级**共用同一个图标选择页**，保证两处体验完全一致。
 *
 * ⚠️ `uni.$on` 必须与 `uni.$off` 成对：页面栈里本页可能被多次进入，
 *    漏了 off 会累积监听器，表现为"选一次图标，回调执行多次"。
 *
 * ⚠️ 编辑态**不允许改层级与收支类型**：改层级会牵动"二级的 type 必须与父一致"
 *    这条约束，改 type 还会让已挂在它下面的交易统计口径变化。
 *    这两件事都要单独的确认流程，不属于"改个名字/换个图标"的顺手操作。
 */
import { ref, computed } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import CategoryIcon from '@/components/CategoryIcon.vue';
import SvgIcon from '@/components/SvgIcon.vue';
import { useCategoryStore } from '@/store/category';
import { FALLBACK_ICON } from '@/constants/icons';
import { EVENT_ICON_PICKED, EVENT_CATEGORY_CREATED } from '@/constants/events';

/** 与后端分类名长度上限保持一致 */
const NAME_MAX = 20;

const categoryStore = useCategoryStore();

const name = ref('');
const icon = ref<string>(FALLBACK_ICON);
const submitting = ref(false);

let editId = '';
let parentId = '';
let type: 'income' | 'expense' = 'expense';

const isEdit = computed(() => !!editId);

const levelText = computed(() =>
  parentId ? '二级分类（挂在某个一级分类下）' : '一级分类（顶层分组）'
);

function onIconPicked(key: string) {
  icon.value = key;
}

onLoad(async (opts?: Record<string, string>) => {
  editId = opts?.id || '';
  parentId = opts?.parentId || '';
  type = opts?.type === 'income' ? 'income' : 'expense';

  if (editId) {
    // 编辑态：数据从 store 取（进本页前分类管理页已加载过；这里再兜一次底）
    await categoryStore.load();
    const current = categoryStore.byId(editId);
    if (current) {
      name.value = current.name;
      icon.value = current.icon || FALLBACK_ICON;
      type = current.type;
      parentId = current.parentId || '';
    }
  }

  uni.setNavigationBarTitle({ title: pageTitle() });
  uni.$on(EVENT_ICON_PICKED, onIconPicked);
});

onUnload(() => {
  uni.$off(EVENT_ICON_PICKED, onIconPicked);
});

function pageTitle(): string {
  if (isEdit.value) return '编辑分类';
  const kind = parentId ? '新建二级' : '新建一级';
  return `${kind}${type === 'income' ? '收入' : '支出'}分类`;
}

function goPickIcon() {
  uni.navigateTo({
    url: `/pages/icon-picker/index?current=${encodeURIComponent(icon.value)}`,
  });
}

async function save() {
  if (submitting.value) return;

  const trimmed = name.value.trim();
  if (!trimmed) {
    uni.showToast({ title: '请输入分类名称', icon: 'none' });
    return;
  }

  submitting.value = true;
  try {
    if (editId) {
      // 只提交名称与图标：层级 / 收支类型的变更不在这里做（见文件头注释）
      await categoryStore.update(editId, { name: trimmed, icon: icon.value });
      uni.showToast({ title: '已保存', icon: 'success' });
    } else {
      await categoryStore.add({
        name: trimmed,
        type,
        icon: icon.value,
        // 不传 parentId 就是创建一级分类（后端按 undefined 处理）
        parentId: parentId || undefined,
      });
      // 通知分类管理页展开这个父分组，否则用户返回后看不到刚建的二级分类
      uni.$emit(EVENT_CATEGORY_CREATED, parentId);
      uni.showToast({ title: '已添加', icon: 'success' });
    }
    setTimeout(() => uni.navigateBack(), 600);
  } catch (err) {
    console.error('[category-new] 保存失败', err);
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped lang="scss">
.page {
  /* 同 icon-picker：flex 容器要固定高度，否则「保存」按钮不会被推到页面底部 */
  height: $page-min-height;
  background: $v11-bg-page;
  display: flex;
  flex-direction: column;
}

.form {
  flex: 1;
  min-height: 0;
}

.field {
  padding: $space-3 $space-4;
  border-bottom: 1px solid $v11-line;
}

.field-row {
  display: flex;
  align-items: center;
  min-height: 56px;
  padding-top: 0;
  padding-bottom: 0;
}

.label {
  display: block;
  font-size: $font-caption;
  line-height: $lh-caption;
  /* 压白底 4.51:1 ✅（tertiary 只能用于白底） */
  color: $v11-text-secondary;
}

.label-inline {
  flex: 1;
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-primary;
}

.level {
  display: block;
  margin-top: $space-2;
  font-size: $font-body;
  line-height: $lh-body;
  color: $v11-text-primary;
}

.input-row {
  display: flex;
  align-items: center;
  margin-top: $space-2;
}

.input {
  flex: 1;
  min-width: 0;
  font-size: $font-h2;
  line-height: $lh-h2;
  color: $v11-text-primary;
}

.counter {
  flex: none;
  margin-left: $space-3;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $v11-text-secondary;
  @include tabular-nums;
}

.icon-slot {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: $radius-md;
  background: $v11-bg-inset;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $v11-text-primary;
}

.arrow {
  flex: none;
  margin-left: $space-2;
  color: $v11-text-secondary;
}

.submit-box {
  flex: none;
  padding: $space-4;
  padding-bottom: calc(#{$space-4} + env(safe-area-inset-bottom));
}

.submit {
  height: 48px;
  line-height: 48px;
  border-radius: $radius-pill;
  /* 白字压 brand-600 = 4.52:1 ✅ */
  background: $v11-gold;
  color: $text-inverse;
  font-size: $font-body-lg;
}

.submit::after {
  border: none;
}
</style>
