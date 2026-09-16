<template>
  <view class="page">
    <!-- ── 视图一：账本选择（本页默认视图） ── -->
    <scroll-view v-show="activeView === 'select'" class="list" scroll-y>
      <!-- 加载中 -->
      <view v-if="loading" class="tip">加载中...</view>

      <!-- 加载失败 -->
      <view v-else-if="failed" class="state-box">
        <SvgIcon name="icon-alert" :size="48" class="state-icon" />
        <text class="state-text">账本加载失败，请检查网络后重试</text>
        <view class="retry-btn" @click="load">重试</view>
      </view>

      <!-- 空列表 -->
      <EmptyState
        v-else-if="!accounts.length"
        icon="icon-inbox"
        text="还没有账本，先建一个吧"
        button-text="去新建账本"
        @action="goManage"
      />

      <!-- 列表 -->
      <template v-else>
        <view
          v-for="item in accounts"
          :key="item.id"
          class="account-item"
          :class="{ selected: item.id === rememberedId }"
          @click="choose(item)"
        >
          <view class="item-icon">
            <SvgIcon name="icon-wallet" :size="22" />
          </view>
          <view class="item-main">
            <view class="item-title">
              <text class="item-name">{{ item.name }}</text>
              <text v-if="item.isDefault" class="badge">默认</text>
            </view>
            <text class="item-meta">创建于 {{ formatDate(item.createdAt) }}</text>
          </view>
          <!-- 选中态：右侧对勾 -->
          <view v-if="item.id === rememberedId" class="item-check">
            <SvgIcon name="icon-check" :size="18" />
          </view>
        </view>

        <!-- 复用现有账本管理页：新建 / 改名 / 删除都在那里 -->
        <view class="manage-entry" @click="goManage">
          <SvgIcon name="icon-plus" :size="16" />
          <text class="manage-text">新建 / 管理账本</text>
        </view>
      </template>
    </scroll-view>

    <!--
      ── 视图二：我的 ──
      复用的是主容器的 `MineView` 组件（同一份实现，不是复制一份页面），
      在本页内用 v-show/v-if 切换 —— **不压页面栈、不出现返回箭头**。
      用 v-if 而不是 v-show：离开即销毁，避免和主容器里的那份同时常驻。
    -->
    <view v-if="activeView === 'mine'" class="mine-slot">
      <MineView />
    </view>

    <!--
      底栏：**受控模式**（传 current）——点击只切本页视图，不做任何页面跳转。
      没有 current 时它才是导航模式（按 url 跳转），本页不用那种模式。
    -->
    <TabBar :items="navItems" :current="activeView" @change="onNavChange" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import EmptyState from '@/components/EmptyState.vue';
import SvgIcon from '@/components/SvgIcon.vue';
import TabBar from '@/components/TabBar.vue';
import MineView from '@/components/views/MineView.vue';
import { useUserStore } from '@/store/user';
import { useAccountStore } from '@/store/account';

const userStore = useUserStore();
const accountStore = useAccountStore();

const loading = ref(false);
const failed = ref(false);

const accounts = computed(() => accountStore.list);

/**
 * 本页的两个视图。
 *
 * 为什么本页要自己管视图：底栏「我的」要求**就地切换、不压页面栈**（不出现返回箭头），
 * 而"选账本后进首页"又必须是 navigateTo（上一轮明确要求首页左上角有返回按钮）。
 * 两个诉求无法用同一种跳转方式满足 —— 跨页面跳转一定会压栈。
 * 所以把「我的」收进本页做视图切换，页面本身仍是独立启动页。
 */
const activeView = ref<'select' | 'mine'>('select');

/** 底栏两项：home = 本页的账本选择视图；mine = 本页的「我的」视图 */
const navItems = [
  { key: 'select', text: '首页', icon: 'icon-home' },
  { key: 'mine', text: '我的', icon: 'icon-user' },
];

/** 底栏点击：只切本页视图，**不做任何页面跳转** */
function onNavChange(key: string) {
  const next = key === 'mine' ? 'mine' : 'select';
  if (next === activeView.value) return;
  activeView.value = next;
  uni.setNavigationBarTitle({ title: next === 'mine' ? '我的' : '选择账本' });

  if (next === 'select') {
    // 可能刚在「我的 → 账本管理」里改过账本，回来重新读一次并刷新列表
    rememberedId.value = (uni.getStorageSync('currentAccountId') || '') as string;
    load();
  }
}

/**
 * 「上次选择的账本」直接读现有的本地持久化键（store/account.ts 的
 * `uni.setStorageSync('currentAccountId')`），不新增存储方案。
 *
 * ⚠️ 判断失效必须用**原始存储值**，不能用 `accountStore.currentId`：
 *    `accountStore.load()` 发现记录的账本已不存在时会自动回落到默认账本（现有逻辑，
 *    不能改），回落之后 currentId 永远"有效"，失效场景就永远检测不到了。
 *    用原始值判断：在列表里 → 高亮；不在/为空 → 无高亮，等用户手动点。
 */
const rememberedId = ref('');

const rememberedValid = computed(() =>
  accounts.value.some((a) => a.id === rememberedId.value),
);

// 模板里直接用 rememberedId 判断高亮即可（空串不会匹配任何 id）；
// rememberedValid 留给将来需要"提示已失效"时用
void rememberedValid;

function formatDate(iso: string): string {
  return iso ? iso.slice(0, 10) : '-';
}

async function load() {
  loading.value = true;
  failed.value = false;
  try {
    await accountStore.load();
  } catch (err) {
    console.error('[account-select] 账本加载失败', err);
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

/** 选中：设为当前账本（沿用现有 store 动作），再进首页 */
function choose(item: { id: string }) {
  accountStore.switchTo(item.id);
  /*
   * 用 navigateTo（**不是** redirectTo / reLaunch）：
   *   - 保留页面栈，首页左上角才会出现返回按钮
   *   - 点返回即回到本页，符合"选择账本 → 进首页 → 可退回"的路径
   */
  uni.navigateTo({ url: '/pages/main/index' });
}

function goManage() {
  uni.navigateTo({ url: '/pages/account/index' });
}

onShow(async () => {
  if (!userStore.isLogin) {
    uni.reLaunch({ url: '/pages/login/index' });
    return;
  }
  // 先取原始存储值再 load —— load 可能触发回落，不能放在它后面读
  rememberedId.value = (uni.getStorageSync('currentAccountId') || '') as string;
  await load();
});
</script>

<style scoped lang="scss">
/* ============================================================
   账本选择 · 启动入口页（FL-1 通栏扁平）
   底栏为页面内自绘（仅两项）；进入首页后由现有原生 tabBar 接管
   ============================================================ */
.page {
  min-height: $page-min-height;
  background: $bg-canvas;
  display: flex;
  flex-direction: column;
}

/*
 * 「我的」视图容器。
 *
 * ⚠️ 2026-09-16 v1.1：底栏 56 → **76**。本页**不再覆盖** `--view-bottom-gap` ——
 *    MineView 的默认值 76 恰好就是本页的正确值（本页底栏 2 项、无凸起按钮）。
 *    此前那个 `52px` 覆盖值是按旧的 56px 底栏算的，已失效并删除。
 */
.mine-slot {
  flex: 1;
  min-height: 0;
}

.list {
  flex: 1;
  /* 底栏高 76 + 安全区（底栏是 fixed，不留白会遮住最后一个账本） */
  padding-bottom: calc(76px + env(safe-area-inset-bottom));
}

.tip {
  text-align: center;
  padding: $space-8 0;
  color: $text-secondary;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
}

/* ── 失败 / 空状态兜底 ── */
.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: $space-8 $space-4;
}

.state-icon {
  color: $text-disabled;
}

.state-text {
  margin-top: $space-3;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $text-secondary;
}

.retry-btn {
  margin-top: $space-4;
  padding: $space-2 $space-5;
  border: 1px solid $brand-700;
  border-radius: $radius-md;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
  color: $brand-700;
}

/* ── 账本行 ── */
.account-item {
  display: flex;
  align-items: center;
  min-height: 64px;
  padding: $space-3 $space-4;
  background: $bg-canvas;
  border-bottom: 1px solid $line;
}

/* 选中态：底色 + 左侧竖条 + 右侧对勾（形状/底色/图标三处同时变化，不依赖单一颜色） */
.account-item.selected {
  background: $brand-50;
  box-shadow: inset 3px 0 0 $brand-600;
}

.item-icon {
  width: 40px;
  height: 40px;
  border-radius: $radius-md;
  background: $bg-sunken;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: $text-primary;
}

.item-main {
  flex: 1;
  margin-left: $space-3;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.item-title {
  display: flex;
  align-items: center;
  min-width: 0;
}

.item-name {
  font-size: $font-body;
  line-height: $lh-body;
  color: $text-primary;
  font-weight: $weight-medium;
  @include text-safe;
}

.badge {
  margin-left: $space-2;
  padding: 0 $space-2;
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $badge-brand-text;
  background: $badge-brand-bg;
  border-radius: $radius-pill;
  flex-shrink: 0;
}

.item-meta {
  font-size: $font-caption;
  line-height: $lh-caption;
  color: $text-tertiary;
  margin-top: 2px;
}

.item-check {
  flex-shrink: 0;
  margin-left: $space-2;
  color: $brand-700;
}

/* ── 管理入口 ── */
.manage-entry {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $space-1;
  margin: $space-4 $space-4 0;
  padding: $space-3 0;
  border: 1px solid $line-strong;
  border-radius: $radius-md;
  color: $brand-700;
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
}
</style>
