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
        <text class="row-arrow">›</text>
      </view>
    </view>

    <!-- 日期（含时刻）与备注 -->
    <view class="panel">
      <view class="row" @click="showDatePicker = true">
        <text class="row-label">日期</text>
        <text class="row-value" :class="{ placeholder: !recordDate }">
          {{ recordDate }}{{ recordTime ? ' ' + recordTime : '' }}
        </text>
        <text class="row-arrow">›</text>
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

const type = ref<'income' | 'expense'>('expense');
const amount = ref('');
/** 只能选二级分类，所以这里必然是一个二级分类的 id */
const categoryId = ref<string | null>(null);
const recordDate = ref(today());
/** HH:mm；null 表示不记录时刻 */
const recordTime = ref<string | null>(null);
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

onLoad(async (options?: { id?: string }) => {
  await accountStore.load();
  await categoryStore.load();

  // 带 id 进入 = 编辑已有账单
  if (options?.id) {
    editId.value = options.id;
    uni.setNavigationBarTitle({ title: '编辑账单' });
    await loadDetail(options.id);
  } else {
    uni.setNavigationBarTitle({ title: `记一笔 · ${accountStore.currentName}` });
  }
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
    // 时刻：开启开关时为 HH:mm，关闭时为空串（后端存 NULL）
    recordTime: recordTime.value || '',
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
      uni.showToast({ title: '已记录', icon: 'success' });
    }
    setTimeout(() => {
      uni.navigateBack({
        fail: () => uni.switchTab({ url: '/pages/home/index' }),
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
          uni.navigateBack({
            fail: () => uni.switchTab({ url: '/pages/home/index' }),
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
  min-height: 100vh;
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
  font-size: 15px;
  color: $text-secondary;
  border-radius: 8px;
}

.type-btn.active {
  background: $brand-600;
  color: $text-inverse;
  font-weight: 500;
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
  font-size: 20px;
  color: $text-primary;
  margin-right: 4px;
}

.amount {
  font-size: 36px;
  font-weight: 600;
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
  border-bottom: 1px solid $divider;
}

.row:last-child {
  border-bottom: none;
}

.row-label {
  width: 56px;
  font-size: 15px;
  color: $text-primary;
  flex-shrink: 0;
}

.row-value {
  flex: 1;
  font-size: 15px;
  color: $text-primary;
}

.placeholder {
  color: $text-tertiary;
}

.row-arrow {
  color: $text-tertiary;
  font-size: 18px;
  margin-left: 6px;
}

.picker {
  font-size: 15px;
  color: $info;
}

.note-input {
  flex: 1;
  font-size: 15px;
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
  font-size: 15px;
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
