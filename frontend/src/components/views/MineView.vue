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

    <!-- 分组标题：说明下面这一组是什么 -->
    <view class="group-title">账本与分类</view>

    <view class="menu">
      <view class="menu-item" @click="goAccount">
        <SvgIcon class="menu-icon" name="icon-wallet" :size="28" />
        <text class="menu-text">账本管理</text>
        <text class="menu-hint">{{ accountStore.count }} 个</text>
        <SvgIcon class="menu-arrow" name="icon-chevron-right" :size="16" />
      </view>
      <!-- 分类管理分收支两个入口：管理页的收支类型是**页面级参数**
           （标题就是「支出分类管理」），页内不再放支出/收入开关 -->
      <view class="menu-item" @click="goCategory('expense')">
        <SvgIcon class="menu-icon" name="icon-tag" :size="28" />
        <text class="menu-text">支出分类管理</text>
        <SvgIcon class="menu-arrow" name="icon-chevron-right" :size="16" />
      </view>
      <view class="menu-item" @click="goCategory('income')">
        <SvgIcon class="menu-icon" name="icon-income" :size="28" />
        <text class="menu-text">收入分类管理</text>
        <SvgIcon class="menu-arrow" name="icon-chevron-right" :size="16" />
      </view>
      <!--
        流水回收站：删除的流水保留 7 天，超期由后端惰性真删。
        ⚠️ 放「账本与分类」这组：它是数据管理类入口，与账本/分类同性质。
      -->
      <view class="menu-item" @click="goRecycle">
        <SvgIcon class="menu-icon" name="icon-inbox" :size="28" />
        <text class="menu-text">流水回收站</text>
        <SvgIcon class="menu-arrow" name="icon-chevron-right" :size="16" />
      </view>
      <view class="menu-item" @click="goExport">
        <SvgIcon class="menu-icon" name="icon-receipt" :size="28" />
        <text class="menu-text">数据导出</text>
        <SvgIcon class="menu-arrow" name="icon-chevron-right" :size="16" />
      </view>
    </view>

    <view class="logout-box">
      <button class="logout" @click="onLogout">退出登录</button>
    </view>

    <!-- 底栏由容器统一承载 -->
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import SvgIcon from '@/components/SvgIcon.vue';
import { useUserStore } from '@/store/user';
import { useCategoryStore } from '@/store/category';
import { useAccountStore } from '@/store/account';

const userStore = useUserStore();
const categoryStore = useCategoryStore();
const accountStore = useAccountStore();

const initial = computed(() => (userStore.username || 'U').charAt(0).toUpperCase());

/** 由容器在「切到本视图」或「容器页重新显示」时调用 */
async function activate() {
  if (!userStore.isLogin) {
    uni.reLaunch({ url: '/pages/login/index' });
    return;
  }
  await accountStore.load();
}

onMounted(activate);

defineExpose({ activate });

function goAccount() {
  uni.navigateTo({ url: '/pages/account/index' });
}

function goCategory(type: 'income' | 'expense') {
  uni.navigateTo({ url: `/pages/category/index?type=${type}` });
}

function goRecycle() {
  uni.navigateTo({ url: '/pages/recycle/index' });
}

function goExport() {
  uni.navigateTo({ url: '/pages/export/index' });
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
/* ============================================================
   我的 · FL-1「通栏扁平」
   用户卡去渐变（信息不需要装饰衬托）、菜单通栏、危险操作降权为描边
   ============================================================ */
.page {
  min-height: $page-min-height;
  background: $bg-canvas;
  padding: 0;
  /*
   * 底部留白 = 底栏高度（若宿主底栏有凸起按钮，还要加上圆的越出量）。
   *
   * ⚠️ 2026-09-16 v1.1：底栏 56 → **76**，故默认值 88 → **76**。
   *    本组件当前**唯一**的宿主是账本选择页（`pages/account-select`），
   *    那一页底栏只有 2 项、**没有凸起按钮** → 无需为凸起圆额外留白。
   *
   * 保留 CSS 变量而非写死，是为留住「同一组件、两种宿主」的能力：
   * 若将来把它放回主容器（`pages/main`，底栏带凸起「记一笔」），
   * 宿主必须把 `--view-bottom-gap` 覆盖为 **98px**
   * （= 底栏 76 + 凸起圆越出 12 + 10px 呼吸位），否则圆会压住最后一行。
   *
   * 默认取 76 而不是 98，遵循「默认值写最常见情形」的约定：
   * 忘记覆盖时表现为「内容贴着底栏」（一眼可见），而不是「页底一片空白」（容易被忽略）。
   */
  padding-bottom: calc(var(--view-bottom-gap, 76px) + env(safe-area-inset-bottom));
}

/* ── 身份区：白底（原渐变）+ 品牌色头像块 ── */
.user-card {
  background: $bg-canvas;
  padding: $space-5 $space-4;
  display: flex;
  align-items: center;
  border-bottom: 1px solid $line;
}

.avatar {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: 50%;
  /* 品牌底 + 白字首字母：4.52:1 ✅ */
  background: $brand-600;
  color: $text-inverse;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-text {
  font-size: $icon-xl;
  line-height: $lh-h1;
  font-weight: $weight-semibold;
}

.user-info {
  /* 没有 min-width:0 时这一栏宽度 = max-content。
     用户名或 ID 一长（ID 是 13 位 BIGINT，天然长）就整块顶出卡片：
     ×2 实测 R=738 > 视口 320。 */
  flex: 1;
  min-width: 0;
  margin-left: $space-4;
  display: flex;
  flex-direction: column;
}

.username {
  font-size: $font-h2;
  line-height: $lh-h2;
  font-weight: $weight-semibold;
  color: $text-primary;
  /* 用户名是标识符，可能无空格无断点；用 anywhere 折行而不是 ellipsis ——
     截断等于把用户身份信息吃掉一半（WCAG 1.4.4） */
  overflow-wrap: anywhere;
}

.user-id {
  font-size: $font-caption;
  line-height: $lh-caption;
  margin-top: $space-1;
  /* 压白底 4.51:1 ✅（tertiary 只能用于白底） */
  color: $text-tertiary;
  overflow-wrap: anywhere;
}

/* ── 分组标题 ── */
.group-title {
  padding: $space-4 $space-4 $space-2;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-tertiary;
}

/* ── 设置行：通栏 + 发丝线，行高 56 ── */
.menu {
  background: $bg-canvas;
  border-top: 1px solid $line;
}

.menu-item {
  display: flex;
  align-items: center;
  min-height: 56px;
  padding: $space-2 $space-4;
  border-bottom: 1px solid $line;
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-icon {
  /* 图标不是「字」：颜色显式声明（压白底 15.78:1），尺寸走图标阶梯 */
  color: $text-primary;
  flex-shrink: 0;
}

.menu-text {
  flex: 1;
  margin-left: $space-3;
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-primary;
  min-width: 0;
}

.menu-hint {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-tertiary;
  margin-right: $space-2;
  flex-shrink: 0;
}

.menu-arrow {
  color: $text-tertiary;
  flex-shrink: 0;
}

/*
 * 退出登录：描边 + 危险色文字，**不做红色实心大按钮**。
 * 实心红看起来像主操作，会与"记一笔"抢注意力；
 * 描边让它与"删除"类操作保持同一档视觉权重。
 */
.logout-box {
  margin-top: $space-8;
  padding: 0 $space-4;
}

.logout {
  background: $bg-canvas;
  color: $danger;
  font-size: $font-body-lg;
  line-height: $lh-body-lg;
  border: 1px solid $danger;
  border-radius: $radius-md;
  height: 44px;
}

.logout::after {
  border: none;
}
</style>
