<template>
  <view class="page">
    <!-- 收支切换 -->
    <view class="type-switch">
      <view class="type-btn" :class="{ active: type === 'expense' }" @click="switchType('expense')">
        支出
      </view>
      <view class="type-btn" :class="{ active: type === 'income' }" @click="switchType('income')">
        收入
      </view>
    </view>

    <!-- 金额展示 -->
    <view class="amount-box">
      <text class="currency">¥</text>
      <text class="amount">{{ amount || '0.00' }}</text>
    </view>

    <!-- 分类：点击从底部弹出选择 -->
    <view class="panel">
      <view class="row" @click="openPicker">
        <text class="row-label">分类</text>
        <text class="row-value" :class="{ placeholder: !categoryId }">
          {{ categoryId ? categoryStore.fullNameOf(categoryId) : '请选择二级分类' }}
        </text>
        <SvgIcon class="row-arrow" name="icon-chevron-right" :size="16" />
      </view>
    </view>

    <!-- 日期（含时刻）与备注 -->
    <view class="panel">
      <view class="row" @click="showDatePicker = true">
        <text class="row-label">日期</text>
        <text class="row-value" :class="{ placeholder: !recordDate }">
          {{ recordDate }}{{ recordTime ? ' ' + recordTime : '' }}
        </text>
        <SvgIcon class="row-arrow" name="icon-chevron-right" :size="16" />
      </view>
      <view class="row">
        <text class="row-label">备注</text>
        <input class="note-input" v-model="note" placeholder="写点什么（选填）" maxlength="255" />
      </view>
    </view>

    <!-- 编辑模式下可删除 -->
    <view v-if="isEdit" class="delete-box" @click="onDelete">
      <text class="delete-text">删除这笔记录</text>
    </view>

    <!-- 底部分类选择器 -->
    <CategoryPicker
      v-model:visible="showPicker"
      v-model="categoryId"
      :type="type"
    />

    <!-- 底部日期时间选择器 -->
    <DateTimePicker
      v-model:visible="showDatePicker"
      :date="recordDate"
      :time="recordTime"
      @confirm="onDateConfirm"
    />

    <!-- 键盘 -->
    <view class="keyboard-fixed">
      <AmountKeyboard v-model="amount" @confirm="save" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import AmountKeyboard from '@/components/AmountKeyboard.vue';
import CategoryPicker from '@/components/CategoryPicker.vue';
import DateTimePicker from '@/components/DateTimePicker.vue';
import SvgIcon from '@/components/SvgIcon.vue';
import { useCategoryStore } from '@/store/category';
import { useAccountStore } from '@/store/account';
import {
  createTransaction,
  getTransaction,
  updateTransaction,
  deleteTransaction,
} from '@/api/transaction';

const categoryStore = useCategoryStore();
const accountStore = useAccountStore();

/** 编辑模式下的账单 ID，新增时为空 */
const editId = ref('');
const isEdit = computed(() => !!editId.value);

/**
 * 复制态：从流水页左滑「复制」进来（`?copyFrom=<id>`）。
 *
 * ⚠️ 与编辑态**互斥**且语义不同：
 *   · 编辑 → `editId` 有值、`isEdit` 为 true、保存走 PUT 改原单
 *   · 复制 → `editId` **为空**、`isEdit` 为 false、保存走 POST 新建
 *   两者都从"加载原单详情回填"开始，但落点完全不同。
 */
const isCopy = ref(false);

const type = ref<'income' | 'expense'>('expense');
const amount = ref('');
/** 只能选二级分类，所以这里必然是一个二级分类的 id */
const categoryId = ref<string | null>(null);
const recordDate = ref(today());
/**
 * HH:mm；null 表示不记录时刻。
 *
 * ⚠️ 新增时**用户没主动选时间也不传 null** —— 见 save() 里"提交时取当前时刻"的处理：
 *    实际提交的那一刻才用 `new Date()` 算时刻，而不是进页面时就算好。
 *    这样"打开页面 14:00、14:30 才保存"记的是 **14:30**，语义更准。
 *    编辑已有账单时沿用库里的原值（改旧账不该悄悄改掉它的时间）。
 */
const recordTime = ref<string | null>(null);

/**
 * 用户是否**主动清掉**过时刻（在日期选择器里关掉时刻开关、或手动清空）。
 *
 * 为什么要单独记这个：新增时"没选过"要默认当前时刻，但"主动关掉"是明确的
 * 用户意图 —— 两者都是 `recordTime === null`，靠值本身分不开。
 */
const userClearedTime = ref(false);
const note = ref('');
const showPicker = ref(false);
const showDatePicker = ref(false);
const submitting = ref(false);

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

onLoad(async (options?: { id?: string; copyFrom?: string }) => {
  await accountStore.load();
  await categoryStore.load();

  // 带 id 进入 = 编辑已有账单
  if (options?.id) {
    editId.value = options.id;
    uni.setNavigationBarTitle({ title: '编辑账单' });
    await loadDetail(options.id);
    return;
  }

  /*
   * 带 copyFrom 进入 = **复制态**（流水页左滑「复制」）。
   *
   * ⚠️ **不是编辑**：`isEdit` 仍为 false，保存走 POST 新建一条，原单不动。
   *    所以这里**不设 editId**，只回填表单。
   *
   * ⚠️ **时间保留原单**（用户确认选 B）：复制常用来补录同日多笔，
   *    把时间重置成"现在"反而要多改一步。注意 recordTime 的默认值逻辑里，
   *    非编辑态且用户没动过开关时会填"当前时刻"（见 save 里的 nowTime()），
   *    这里回填原单时刻后它就变成"用户选过的值"，不会被覆盖。
   */
  if (options?.copyFrom) {
    isCopy.value = true;
    await loadDetail(options.copyFrom);
    uni.setNavigationBarTitle({
      title: type.value === 'income' ? '复制收入' : '复制支出',
    });
    return;
  }

  uni.setNavigationBarTitle({ title: `记一笔 · ${accountStore.currentName}` });
});

async function loadDetail(id: string) {
  try {
    const detail = await getTransaction(id);
    type.value = detail.type;
    amount.value = detail.amount;
    categoryId.value = detail.categoryId;
    recordDate.value = detail.recordDate;
    // 后端返回 HH:mm:ss，展示与提交都只需要 HH:mm
    recordTime.value = detail.recordTime ? detail.recordTime.slice(0, 5) : null;
    note.value = detail.note || '';
  } catch (err) {
    console.error('[record] 详情加载失败', err);
    uni.showToast({ title: '加载失败', icon: 'none' });
    setTimeout(() => uni.navigateBack(), 800);
  }
}

function switchType(next: 'income' | 'expense') {
  if (type.value === next) return;
  type.value = next;
  // 切换收支类型后，原分类一定不匹配，必须清空
  categoryId.value = null;
}

function onDateConfirm(payload: { date: string; time: string | null }) {
  recordDate.value = payload.date;
  recordTime.value = payload.time;
  // 用户这次明确选了（或明确清空了）时刻 —— 之后不再自动补默认值
  userClearedTime.value = payload.time === null;
}

/** 当前时刻 HH:mm */
function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function openPicker() {
  if (!categoryStore.loaded) {
    uni.showToast({ title: '分类加载中，请稍后', icon: 'none' });
    return;
  }
  showPicker.value = true;
}

async function save() {
  if (submitting.value) return;

  if (!categoryId.value) {
    uni.showToast({ title: '请选择分类', icon: 'none' });
    showPicker.value = true;
    return;
  }

  const value = Number(amount.value);
  if (!amount.value || value <= 0) {
    uni.showToast({ title: '请输入有效金额', icon: 'none' });
    return;
  }

  const payload = {
    type: type.value,
    amount: value.toFixed(2),
    recordDate: recordDate.value,
    categoryId: categoryId.value,
    note: note.value.trim(),
    /*
     * 时刻：
     *   · 用户主动选过 → 用他选的
     *   · 新增且没选过 → **提交这一刻**的当前时刻（不是进页面时算好的）
     *   · 编辑且库里原本为空 → 保持空（不擅自补时刻，改旧账不该动它的时间语义）
     */
    recordTime:
      recordTime.value ||
      (!isEdit.value && !isCopy.value && !userClearedTime.value ? nowTime() : ''),
    // 新增时记入当前账本；编辑时不传，保持原账本不变
    ...(isEdit.value ? {} : { accountId: accountStore.currentId }),
  };

  submitting.value = true;
  try {
    if (isEdit.value) {
      await updateTransaction(editId.value, payload);
      uni.showToast({ title: '已更新', icon: 'success' });
    } else {
      await createTransaction(payload);
      // 复制态与新增共用这一支：都是 POST 新建（见 onLoad 的 copyFrom 注释）
      uni.showToast({ title: isCopy.value ? '已复制' : '已记录', icon: 'success' });
    }
    setTimeout(() => {
      // 兜底用 reLaunch 而不是 switchTab：原生 tabBar 已移除，switchTab 会失败
      uni.navigateBack({
        fail: () => uni.reLaunch({ url: '/pages/main/index' }),
      });
    }, 600);
  } catch (err) {
    console.error('[record] 保存失败', err);
  } finally {
    submitting.value = false;
  }
}

function onDelete() {
  uni.showModal({
    title: '删除记录',
    content: '删除后不可恢复，确定吗？',
    success: async (res) => {
      if (!res.confirm) return;
      try {
        await deleteTransaction(editId.value);
        uni.showToast({ title: '已删除', icon: 'success' });
        setTimeout(() => {
          // 同上：原生 tabBar 已移除
          uni.navigateBack({
            fail: () => uni.reLaunch({ url: '/pages/main/index' }),
          });
        }, 600);
      } catch (err) {
        console.error('[record] 删除失败', err);
      }
    },
  });
}
</script>

<style scoped lang="scss">
.page {
  min-height: $page-min-height;
  background: $bg-page;
  padding: 16px 16px 280px;
}

.type-switch {
  display: flex;
  background: $bg-card;
  border-radius: 12px;
  padding: 4px;
  margin-bottom: 16px;
}

.type-btn {
  flex: 1;
  text-align: center;
  padding: 10px 0;
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-secondary;
  border-radius: 8px;
}

.type-btn.active {
  background: $brand-600;
  color: $text-inverse;
  font-weight: $weight-medium;
}

.amount-box {
  background: $bg-card;
  border-radius: 12px;
  padding: 24px 20px;
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
}

.currency {
  font-size: $font-h1;
  line-height: $lh-h1;
  color: $text-primary;
  margin-right: 4px;
}

.amount {
  @include tabular-nums;
  font-size: $font-display-lg;
  line-height: $lh-display-lg;
  font-weight: $weight-semibold;
  color: $text-primary;
}

.panel {
  background: $bg-card;
  border-radius: 12px;
  padding: 4px 16px;
  margin-top: 16px;
}

.row {
  display: flex;
  align-items: center;
  padding: 14px 0;
  border-bottom: 1px solid $line;
}

.row:last-child {
  border-bottom: none;
}

.row-label {
  width: 56px;
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-primary;
  flex-shrink: 0;
}

.row-value {
  flex: 1;
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-primary;
}

.placeholder {
  color: $text-tertiary;
}

.row-arrow {
  color: $text-tertiary;
  margin-left: 6px;
}

.picker {
  font-size: $font-body;
  line-height: $lh-body;
  color: $info;
}

.note-input {
  flex: 1;
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-primary;
}

.delete-box {
  margin-top: 16px;
  background: $bg-card;
  border-radius: 12px;
  padding: 16px;
  text-align: center;
}

.delete-text {
  font-size: $font-body;
  line-height: $lh-body;
  color: $expense;
}

.keyboard-fixed {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
