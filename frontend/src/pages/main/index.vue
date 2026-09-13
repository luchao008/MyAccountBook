<template>
  <view class="main">
    <!--
      单页多视图容器。
      用 v-if + visited 做**懒挂载**：没访问过的视图不渲染，避免一次性打 4 个接口。
      v-show（display:none）保证非激活视图不占高度，因此页面滚动语义与原来一致，
      且组件实例与已加载数据都被保留 —— 反复切换不会重新请求。
    -->
    <HomeView v-if="visited.home" v-show="current === 'home'" ref="homeRef" />
    <DetailView v-if="visited.detail" v-show="current === 'detail'" ref="detailRef" />
    <StatisticsView
      v-if="visited.statistics"
      v-show="current === 'statistics'"
      ref="statisticsRef"
    />
    <MineView v-if="visited.mine" v-show="current === 'mine'" ref="mineRef" />

    <!--
      底栏只实例化一次，这是"零滑动感"的关键。
      「记一笔」不再是悬浮按钮（RecordFab 已删除），而是底栏中间那个凸起项 ——
      它由 TabBar 自己渲染，点击时 emit('change', 'record')，由下面的 switchTo 兜住。
    -->
    <TabBar :current="current" @change="switchTo" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import { onLoad, onShow, onPageScroll, onReachBottom, onPullDownRefresh } from '@dcloudio/uni-app';
import HomeView from '@/components/views/HomeView.vue';
import DetailView from '@/components/views/DetailView.vue';
import StatisticsView from '@/components/views/StatisticsView.vue';
import MineView from '@/components/views/MineView.vue';
import TabBar from '@/components/TabBar.vue';

type ViewKey = 'home' | 'detail' | 'statistics' | 'mine';

const VALID_KEYS: ViewKey[] = ['home', 'detail', 'statistics', 'mine'];

/** 视图 → 导航栏标题（单页容器里标题需要自己切） */
const TITLES: Record<ViewKey, string> = {
  home: '记账',
  detail: '明细',
  statistics: '统计',
  mine: '我的',
};

const current = ref<ViewKey>('home');
/** 已访问过的视图（懒挂载） */
const visited = ref<Record<ViewKey, boolean>>({
  home: true,
  detail: false,
  statistics: false,
  mine: false,
});

const homeRef = ref();
const detailRef = ref();
const statisticsRef = ref();
const mineRef = ref();

const refMap = computed<Record<ViewKey, any>>(() => ({
  home: homeRef.value,
  detail: detailRef.value,
  statistics: statisticsRef.value,
  mine: mineRef.value,
}));

/** 当前激活视图的实例 */
const activeRef = computed(() => refMap.value[current.value]);

/**
 * 各视图各自的滚动位置。
 *
 * 用**普通对象**而不是 ref：onPageScroll 触发极频繁，
 * 走响应式会让每次滚动都触发依赖更新，白白开销（这里根本不需要响应式）。
 */
const scrollPositions: Record<ViewKey, number> = {
  home: 0,
  detail: 0,
  statistics: 0,
  mine: 0,
};

/**
 * 是否正在恢复滚动位置。
 *
 * 为什么要这个标志：切换视图时页面总高会从"旧视图高度"突变成"新视图高度"，
 * 浏览器会立刻把 scrollTop 调整到新高度范围内 —— 这个中间态同样会触发 onPageScroll。
 * 若不禁用记录，它会被写进**新视图**的位置表里，把用户真正的记忆位置污染掉。
 */
let restoring = false;

onPageScroll((e) => {
  if (restoring) return;
  scrollPositions[current.value] = e.scrollTop ?? 0;
});

/** 底栏中间凸起项的 key：「记一笔」是动作，不是视图 */
const RECORD_KEY = 'record';

/** 切换视图：挂载（若首次）→ 激活 → 恢复该视图上次的滚动位置 */
function switchTo(key: string) {
  /*
   * 凸起项「记一笔」：不是视图，直接去记账页。
   * 用 navigateTo 保留页面栈 —— 记完返回时当前视图与它的滚动位置都还在。
   */
  if (key === RECORD_KEY) {
    uni.navigateTo({ url: '/pages/record/index' });
    return;
  }

  if (!VALID_KEYS.includes(key as ViewKey)) return;
  const next = key as ViewKey;
  if (next === current.value) return;

  visited.value[next] = true;
  current.value = next;
  uni.setNavigationBarTitle({ title: TITLES[next] });

  restoring = true;

  nextTick(() => {
    activeRef.value?.activate?.();

    // 再等一帧：v-show 切换后页面高度由新视图决定，
    // 若在高度更新前滚动，恢复值会被旧高度截断
    setTimeout(() => {
      uni.pageScrollTo({
        scrollTop: scrollPositions[next],
        duration: 0,
        complete: () => {
          restoring = false;
        },
      });
      // 兜底：complete 在部分端不回调，避免 restoring 永久卡住
      setTimeout(() => {
        restoring = false;
      }, 120);
    }, 0);
  });
}

onLoad((options?: Record<string, string>) => {
  // 支持 /pages/main/index?tab=mine 直接落到指定视图
  const tab = options?.tab as ViewKey | undefined;
  if (tab && VALID_KEYS.includes(tab)) {
    visited.value[tab] = true;
    current.value = tab;
    uni.setNavigationBarTitle({ title: TITLES[tab] });
  }
});

/** 首次显示由视图自身的 onMounted 负责，避免重复请求 */
let firstShow = true;

onShow(() => {
  if (firstShow) {
    firstShow = false;
    return;
  }
  // 从记一笔/编辑页返回时，让当前视图刷新
  nextTick(() => {
    activeRef.value?.activate?.();
  });
});

/*
 * 页面级事件由容器统一接收，再转发给当前激活视图。
 * 视图变成组件后拿不到 onReachBottom / onPullDownRefresh，
 * 这是单页架构必须补的一环（明细页的分页加载依赖它）。
 */
onReachBottom(() => {
  activeRef.value?.onReachBottom?.();
});

onPullDownRefresh(() => {
  activeRef.value?.onPullDownRefresh?.();
});
</script>

<style scoped lang="scss">
.main {
  min-height: $page-min-height;
  background: $bg-canvas;
}
</style>
