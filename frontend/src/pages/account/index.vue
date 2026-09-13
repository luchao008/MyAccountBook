<template>
  <view class="page">
    <!-- 账本列表 -->
    <view class="list">
      <view v-for="item in list" :key="item.id" class="list-item">
        <view class="item-main">
          <view class="item-title">
            <text class="item-name">{{ item.name }}</text>
            <text v-if="item.isDefault" class="badge">默认</text>
          </view>
          <text class="item-meta">创建于 {{ formatDate(item.createdAt) }}</text>
        </view>

        <view class="item-actions">
          <text
            v-if="!item.isDefault"
            class="action"
            @click="onSetDefault(item)"
          >
            设为默认
          </text>
          <text class="action" @click="onRename(item)">改名</text>
          <text
            v-if="list.length > 1"
            class="action"
            @click="onMerge(item)"
          >
            合并
          </text>
          <text
            v-if="list.length > 1"
            class="action danger"
            @click="onDelete(item)"
          >
            删除
          </text>
        </view>
      </view>

      <EmptyState v-if="!list.length" icon="icon-wallet" text="还没有账本" />
    </view>

    <!-- 新建 -->
    <view class="add-box">
      <view class="add-row">
        <input v-model="newName" class="input" placeholder="新账本名称" maxlength="64" />
        <view class="add-btn" @click="onAdd">新建账本</view>
      </view>
      <text class="hint">
        账本名不可重复。新建的账本不会自动成为默认账本，可在列表里手动设置。
      </text>
    </view>

    <!-- 规则说明 -->
    <view class="rules">
      <text class="rules-title">关于删除与合并</text>
      <text class="rules-item">· 删除账本会一并删除其中的全部交易，且不可恢复；需输入账本名确认。</text>
      <text class="rules-item">· 至少保留一个账本，最后一个不能被删除。</text>
      <text class="rules-item">· 合并会把源账本的数据并入目标账本，然后删除源账本。</text>
      <text class="rules-item">
        · 合并去重口径：金额、日期、收支类型、分类、备注全部相同才算重复，重复时保留目标账本那条。
      </text>
      <text class="rules-item">· 只要有一个字段不同，就视为两笔不同的交易，都会被保留。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import EmptyState from '@/components/EmptyState.vue';
import { useAccountStore } from '@/store/account';
import {
  createAccount,
  updateAccount,
  deleteAccount,
  getDeletePreview,
  previewMerge,
  mergeAccounts,
  type AccountItem,
} from '@/api/account';

const accountStore = useAccountStore();
const newName = ref('');

const list = computed(() => accountStore.list);

function formatDate(iso: string): string {
  if (!iso) return '-';
  // createdAt 是 UTC，这里只取日期部分
  return iso.slice(0, 10);
}

onLoad(async () => {
  await accountStore.refresh();
});

async function onAdd() {
  const name = newName.value.trim();
  if (!name) {
    uni.showToast({ title: '请输入账本名称', icon: 'none' });
    return;
  }
  try {
    await createAccount({ name, icon: 'wallet' });
    newName.value = '';
    await accountStore.refresh();
    uni.showToast({ title: '已创建', icon: 'success' });
  } catch (err) {
    console.error('[account] 创建失败', err);
  }
}

function onRename(item: AccountItem) {
  uni.showModal({
    title: '重命名账本',
    editable: true,
    placeholderText: '输入新的账本名',
    content: item.name,
    success: async (res) => {
      if (!res.confirm) return;
      const name = (res.content || '').trim();
      if (!name || name === item.name) return;
      try {
        await updateAccount(item.id, { name });
        await accountStore.refresh();
        uni.showToast({ title: '已改名', icon: 'success' });
      } catch (err) {
        console.error('[account] 改名失败', err);
      }
    },
  });
}

async function onSetDefault(item: AccountItem) {
  try {
    await updateAccount(item.id, { isDefault: true });
    await accountStore.refresh();
    uni.showToast({ title: `已设为默认`, icon: 'success' });
  } catch (err) {
    console.error('[account] 设置默认失败', err);
  }
}

/**
 * 删除账本：两道确认
 *   1. 先向后端查预检，在弹窗里明确告知"会连带删除多少笔交易"
 *   2. 要求原样输入账本名，与后端 confirmName 校验呼应
 */
async function onDelete(item: AccountItem) {
  let transactionCount = 0;
  try {
    const preview = await getDeletePreview(item.id);
    transactionCount = preview.transactionCount;
  } catch (err) {
    // 预检失败通常是"只剩一个账本"，拦截器已 toast
    return;
  }

  const warning =
    transactionCount > 0
      ? `该账本下有 ${transactionCount} 笔交易，将一并删除且不可恢复。`
      : '该账本下没有交易。';

  uni.showModal({
    title: '删除账本',
    editable: true,
    placeholderText: `请输入「${item.name}」以确认`,
    content: '',
    success: async (res) => {
      if (!res.confirm) return;
      const input = (res.content || '').trim();
      if (!input) {
        uni.showToast({ title: '需要输入账本名确认', icon: 'none' });
        return;
      }
      try {
        const result = await deleteAccount(item.id, input);
        await accountStore.load(); // 可能触发当前账本回退，用 load 而非 refresh
        uni.showToast({
          title: `已删除（连带 ${result.deletedTransactions} 笔）`,
          icon: 'none',
        });
      } catch (err) {
        console.error('[account] 删除失败', err);
      }
    },
  });

  // 弹窗正文无法同时承载说明与输入，这里用 toast 补充风险提示
  uni.showToast({ title: warning, icon: 'none', duration: 2500 });
}

/**
 * 合并账本：当前项作为「源」（会被删除），选择一个「目标」接收数据。
 * 先预检拿到报告（迁多少、去重多少），用户确认后才执行。
 */
function onMerge(source: AccountItem) {
  const candidates = list.value.filter((a) => a.id !== source.id);
  if (!candidates.length) {
    uni.showToast({ title: '没有可合并的目标账本', icon: 'none' });
    return;
  }

  uni.showActionSheet({
    itemList: candidates.map((a) => `并入「${a.name}」`),
    success: async (res) => {
      const target = candidates[res.tapIndex];
      if (!target) return;
      await doMerge(source, target);
    },
  });
}

async function doMerge(source: AccountItem, target: AccountItem) {
  let preview;
  try {
    preview = await previewMerge(target.id, source.id);
  } catch (err) {
    console.error('[account] 合并预检失败', err);
    return;
  }

  if (preview.sourceTotal === 0) {
    uni.showModal({
      title: '合并账本',
      content: `「${source.name}」里没有交易，合并后该账本会被删除。确定继续吗？`,
      success: (res) => {
        if (res.confirm) execMerge(source, target);
      },
    });
    return;
  }

  const content =
    `把「${source.name}」并入「${target.name}」：\n` +
    `· 共 ${preview.sourceTotal} 笔\n` +
    `· 迁入 ${preview.willMove} 笔\n` +
    `· 因完全重复丢弃 ${preview.willSkip} 笔\n` +
    `合并后「${source.name}」会被删除。`;

  uni.showModal({
    title: '确认合并',
    content,
    confirmText: '确认合并',
    success: (res) => {
      if (res.confirm) execMerge(source, target);
    },
  });
}

async function execMerge(source: AccountItem, target: AccountItem) {
  try {
    const result = await mergeAccounts(target.id, source.id);
    await accountStore.load();
    uni.showModal({
      title: '合并完成',
      content: `已把「${result.sourceName}」并入目标账本：迁入 ${result.willMove} 笔，去重 ${result.willSkip} 笔。`,
      showCancel: false,
    });
  } catch (err) {
    console.error('[account] 合并失败', err);
  }
}
</script>

<style scoped lang="scss">
.page {
  min-height: $page-min-height;
  background: $bg-page;
  padding: 16px;
}

.list {
  background: $bg-card;
  border-radius: 12px;
  overflow: hidden;
}

.list-item {
  padding: 14px 16px;
  border-bottom: 1px solid $line;
}

.list-item:last-child {
  border-bottom: none;
}

.item-title {
  display: flex;
  align-items: center;
}

.item-name {
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  color: $text-primary;
  font-weight: $weight-medium;
}

.badge {
  margin-left: 8px;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $badge-brand-text;
  background: $badge-brand-bg;
  border-radius: 8px;
  padding: 1px 8px;
}

.item-meta {
  display: block;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-tertiary;
  margin-top: 4px;
}

.item-actions {
  display: flex;
  flex-wrap: wrap;
  margin-top: 8px;
}

.action {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $info;
  margin-right: 16px;
  /* 22px 行盒 + 上下各 8px = 38（原 padding: 2px 0 只有 26） */
  padding: 8px 0;
}

.danger {
  color: $expense;
}

.add-box {
  margin-top: 16px;
  background: $bg-card;
  border-radius: 12px;
  padding: 16px;
}

.add-row {
  display: flex;
  align-items: center;
}

.input {
  flex: 1;
  height: 40px;
  background: $bg-subtle;
  border-radius: 8px;
  padding: 0 12px;
  font-size: $font-body;
  line-height: $lh-body;
}

.add-btn {
  margin-left: 12px;
  padding: 0 16px;
  height: 40px;
  line-height: 40px;
  background: $brand-600;
  color: $text-inverse;
  border-radius: 8px;
  font-size: $font-body-sm;
}

.hint {
  display: block;
  margin-top: 12px;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-tertiary;
  line-height: $lh-caption;
}

.rules {
  margin-top: 16px;
  background: $bg-card;
  border-radius: 12px;
  padding: 16px;
}

.rules-title {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-primary;
  font-weight: $weight-medium;
}

.rules-item {
  display: block;
  margin-top: 8px;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-tertiary;
  line-height: $lh-caption;
}
</style>
