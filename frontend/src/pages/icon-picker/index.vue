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
            <!-- image-scale=2：图片图标是位图插画，同尺寸下观感偏小（2026-09-19 luchao 要求翻倍） -->
            <CategoryIcon :name="key" :size="28" :image-scale="2" />
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
 * 数据来源三处：
 *   - 图片图标：`constants/cat-icons.ts` 的名字清单（94 张静态 PNG，`img:` key）
 *   - 彩色图标：`utils/colorIcon.ts`（由 `constants/color-icons.ts` 建索引）
 *   - 标准图标：`constants/icons.ts` 的 `CATEGORY_ICONS`（项目原有的单色分类图标）
 *
 * 选中即回传并返回（与参考图一致，没有额外的「确定」按钮）：
 *   发一个全局事件给上一页，然后 `navigateBack`。
 *   延后 120ms 是为了让选中态闪一下 —— 立刻返回的话用户看不到自己点了哪个。
 */
import { ref, computed, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import CategoryIcon from '@/components/CategoryIcon.vue';
import { CATEGORY_ICONS } from '@/constants/icons';
import { CAT_ICON_NAMES } from '@/constants/cat-icons';
import { COLOR_ICON_SET_META } from '@/constants/color-icon-meta';
import { colorIconKeysOf, colorIconsReady, loadColorIcons } from '@/utils/colorIcon';
import { CAT_ICON_SET, catIconKey } from '@/utils/catIcon';
import { EVENT_ICON_PICKED } from '@/constants/events';

/**
 * 底部 Tab。
 *
 * ⚠️ 彩色图标集的 Tab **从元数据派生**，不再手写 —— 手写一份就等于埋了
 *    一个"加了新图标集但忘了加 Tab"的坑，而且它不会报错，只会安静地少一个入口。
 *    「图片」（`img:` 分类图片图标）与「标准」（单色分类图标）不在彩色图标元数据里，
 *    各自单独补一个。
 *
 * 「图片」放第一个并作为默认 Tab（2026-09-19）：它现在承担**分类默认图标**的角色
 * （预置分类的 icon 就是 `img:` key），进选择器先看到它是最高频的路径。
 * ⚠️ 默认 Tab 变了不影响"带着已选图标进来"的场景 —— 下面的 onLoad 会按
 *    `picked` 的集合前缀自动切到对应 Tab。
 */
const TABS = [
  { key: CAT_ICON_SET, label: '图片' },
  ...COLOR_ICON_SET_META.map((s) => ({ key: s.key, label: s.label })),
  { key: 'standard', label: '标准' },
];

type TabKey = string;

const activeSet = ref<TabKey>(CAT_ICON_SET);

onMounted(() => {
  // 本页要的是"某个集合下的**全部** key"，不能等子组件来触发加载
  void loadColorIcons();
});

/**
 * 当前 Tab 下可选的图标 key。
 * ⚠️ 必须依赖 `colorIconsReady` —— 图标正文是动态 import 分包，
 *    数据到达后要重新铺一遍网格，否则这一页永远是空的。
 *    （「图片」与「标准」是同步数据，不受此影响。）
 */
const visibleKeys = computed(() => {
  if (activeSet.value === CAT_ICON_SET) return CAT_ICON_NAMES.map((n) => catIconKey(n));
  if (activeSet.value === 'standard') return Object.keys(CATEGORY_ICONS);
  if (!colorIconsReady.value) return [];
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

/*
 * 格子高度按最大图标留量：图片图标放大到 28×2 = 56px（见模板的 image-scale），
 * 盒子 64px 给它四周各 4px 余量 —— 盒子若还停在 52px，放大的图标会顶出来。
 */
.cell {
  width: 25%;
  height: 88px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 选中态：浅底 + 品牌色描边 + 圆角方块，不依赖单一颜色 */
.cell-box {
  width: 64px;
  height: 64px;
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
