<template>
  <view class="page">
    <!-- 图标网格：按当前 Tab 的图标集铺开 -->
    <scroll-view class="grid" scroll-y>
      <view class="grid-inner">
        <view
          v-for="key in visibleKeys"
          :key="key"
          class="cell"
          :class="{ picked: key === picked }"
          @click="pick(key)"
        >
          <view class="cell-box">
            <CategoryIcon :name="key" :size="28" />
          </view>
        </view>
      </view>
    </scroll-view>

    <!-- 底部图标集切换：选中项用品牌色 + 短下划线（颜色之外还有形状，不靠单一颜色区分） -->
    <view class="tabs">
      <view
        v-for="tab in TABS"
        :key="tab.key"
        class="tab"
        :class="{ active: tab.key === activeSet }"
        @click="activeSet = tab.key"
      >
        <text class="tab-text">{{ tab.label }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 图标选择页。
 *
 * 数据来源两处：
 *   - 彩色图标：`utils/colorIcon.ts`（由 `constants/color-icons.ts` 建索引）
 *   - 标准图标：`constants/icons.ts` 的 `CATEGORY_ICONS`（项目原有的单色分类图标）
 *
 * 选中即回传并返回（与参考图一致，没有额外的「确定」按钮）：
 *   发一个全局事件给上一页，然后 `navigateBack`。
 *   延后 120ms 是为了让选中态闪一下 —— 立刻返回的话用户看不到自己点了哪个。
 */
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import CategoryIcon from '@/components/CategoryIcon.vue';
import { CATEGORY_ICONS } from '@/constants/icons';
import { colorIconKeysOf } from '@/utils/colorIcon';
import { EVENT_ICON_PICKED } from '@/constants/events';

const TABS = [
  { key: 'colorful', label: '多彩' },
  { key: 'life', label: '生活' },
  { key: 'standard', label: '标准' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const activeSet = ref<TabKey>('colorful');

/** 当前 Tab 下可选的图标 key */
const visibleKeys = computed(() => {
  if (activeSet.value === 'standard') return Object.keys(CATEGORY_ICONS);
  return colorIconKeysOf(activeSet.value);
});

/** 已选（用于高亮），由上一页用 query 带进来 */
const picked = ref('');

onLoad((opts?: Record<string, string>) => {
  picked.value = decodeURIComponent(opts?.current || '');
  // 让高亮项所在的图标集成为默认 Tab，否则用户进来会"看不到自己当前选的图标"
  const setKey = picked.value.split(':')[0];
  if (TABS.some((t) => t.key === setKey)) {
    activeSet.value = setKey as TabKey;
  }
});

function pick(key: string) {
  picked.value = key;
  uni.$emit(EVENT_ICON_PICKED, key);
  // 让选中态可见一瞬再返回
  setTimeout(() => uni.navigateBack(), 120);
}
</script>

<style scoped lang="scss">
.page {
  /*
   * 用 height 而不是 min-height。
   *
   * 踩过：写成 min-height 时容器高度是 auto，`flex: 1` 的网格会按**内容高度**撑开，
   * 把底部 Tab 顶到屏幕外（截图里 Tab 直接不见了）。
   * 本页靠内部 scroll-view 滚动，容器需要一个**确定高度**才能把
   * 「网格占满剩余空间、Tab 钉在底部」分对。
   */
  height: $page-min-height;
  background: $v11-bg-page;
  display: flex;
  flex-direction: column;
}

.grid {
  flex: 1;
  /* flex 项默认 min-height:auto，会顶破容器导致底部 Tab 被挤出屏幕 */
  min-height: 0;
}

.grid-inner {
  display: flex;
  flex-wrap: wrap;
  padding: $space-2 0 $space-4;
}

.cell {
  width: 25%;
  height: 76px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 选中态：浅底 + 品牌色描边 + 圆角方块，不依赖单一颜色 */
.cell-box {
  width: 52px;
  height: 52px;
  border-radius: $radius-md;
  border: 1px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 单色图标（标准 Tab）跟随这个颜色；彩色图标自带颜色，不受影响 */
  color: $v11-text-primary;
}

.cell.picked .cell-box {
  background: $v11-gold-soft;
  border-color: $v11-gold;
}

/* ── 底部图标集切换 ── */
.tabs {
  flex: none;
  display: flex;
  background: $v11-bg-page;
  border-top: 1px solid $v11-line;
  padding-bottom: env(safe-area-inset-bottom);
}

.tab {
  flex: 1;
  position: relative;
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $v11-text-secondary;
}

.tab-text {
  font-size: $font-body-sm;
  line-height: $lh-body-sm;
}

.tab.active {
  color: $v11-gold;
  font-weight: $weight-medium;
}

.tab.active::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 8px;
  transform: translateX(-50%);
  width: 24px;
  height: 2px;
  border-radius: 1px;
  background: $v11-gold;
}
</style>
