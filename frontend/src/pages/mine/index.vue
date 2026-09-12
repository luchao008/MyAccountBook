<template>
  <view class="page">
    <view class="user-card">
      <view class="avatar">
        <text class="avatar-text">{{ initial }}</text>
      </view>
      <view class="user-info">
        <text class="username">{{ userStore.username || '未登录' }}</text>
        <text class="user-id">ID {{ userStore.userInfo?.id || '-' }}</text>
      </view>
    </view>

    <view class="menu">
      <view class="menu-item" @click="goAccount">
        <text class="menu-icon">📁</text>
        <text class="menu-text">账本管理</text>
        <text class="menu-hint">{{ accountStore.count }} 个</text>
        <text class="menu-arrow">›</text>
      </view>
      <view class="menu-item" @click="goCategory">
        <text class="menu-icon">🏷️</text>
        <text class="menu-text">分类管理</text>
        <text class="menu-arrow">›</text>
      </view>
    </view>

    <view class="logout-box">
      <button class="logout" @click="onLogout">退出登录</button>
    </view>

    <RecordFab />
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import RecordFab from '@/components/RecordFab.vue';
import { useUserStore } from '@/store/user';
import { useCategoryStore } from '@/store/category';
import { useAccountStore } from '@/store/account';

const userStore = useUserStore();
const categoryStore = useCategoryStore();
const accountStore = useAccountStore();

const initial = computed(() => (userStore.username || 'U').charAt(0).toUpperCase());

onShow(async () => {
  if (!userStore.isLogin) {
    uni.reLaunch({ url: '/pages/login/index' });
    return;
  }
  await accountStore.load();
});

function goAccount() {
  uni.navigateTo({ url: '/pages/account/index' });
}

function goCategory() {
  uni.navigateTo({ url: '/pages/category/index' });
}

function onLogout() {
  uni.showModal({
    title: '退出登录',
    content: '确定要退出吗？',
    success: (res) => {
      if (!res.confirm) return;
      categoryStore.reset();
      accountStore.reset();
      userStore.logout();
    },
  });
}
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
  background: $bg-page;
  padding: 16px;
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}

.user-card {
  background: $gradient-banner;
  border-radius: 16px;
  padding: 24px 20px;
  display: flex;
  align-items: center;
  color: $text-inverse;
}

.avatar {
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-text {
  font-size: $icon-xl;
  font-weight: $weight-semibold;
}

.user-info {
  /* 没有 min-width:0 时这一栏宽度 = max-content。
     用户名或 ID 一长（ID 是 13 位 BIGINT，天然长）就整块顶出卡片：
     ×2 实测 R=738 > 视口 320。 */
  flex: 1;
  min-width: 0;
  margin-left: 16px;
  display: flex;
  flex-direction: column;
}

.username {
  font-size: $font-h2;
  line-height: $lh-h2;
  font-weight: $weight-semibold;
  /* 用户名是标识符，可能无空格无断点；用 anywhere 折行而不是 ellipsis ——
     截断等于把用户身份信息吃掉一半（WCAG 1.4.4） */
  overflow-wrap: anywhere;
}

.user-id {
  font-size: $font-caption;
  line-height: $lh-caption;
  margin-top: 4px;
  overflow-wrap: anywhere;
}

.menu {
  margin-top: 16px;
  background: $bg-card;
  border-radius: 12px;
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid $divider;
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-icon {
  font-size: $icon-lg;
}

.menu-text {
  flex: 1;
  margin-left: 12px;
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-primary;
}

.menu-hint {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-tertiary;
  margin-right: 6px;
}

.menu-arrow {
  color: $text-tertiary;
  font-size: $icon-lg;
}

.logout-box {
  margin-top: 32px;
}

.logout {
  background: $bg-card;
  color: $expense;
  font-size: $font-body-lg;
  border-radius: 24px;
  height: 48px;
  line-height: 48px;
}

.logout::after {
  border: none;
}
</style>
